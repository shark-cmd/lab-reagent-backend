"""
LabStock — Barcode-driven Lab Reagent & QC Inventory Management
FastAPI + MongoDB backend
"""
import os
import io
import csv
import re
import math
import uuid
import json
import calendar
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from datetime import datetime, timezone, timedelta, date
from typing import List, Optional

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, field_validator
import jwt
import bcrypt

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# ----------------------- Config -----------------------
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

DEFAULT_JWT_SECRET = "labstock-dev-secret-change-me-please"
JWT_SECRET = os.environ.get("JWT_SECRET", DEFAULT_JWT_SECRET)
JWT_ALG = "HS256"
JWT_EXPIRE_HOURS = int(os.environ.get("JWT_EXPIRE_HOURS", "8"))

FAR_FUTURE = "9999-12-31"  # blank expiry sorts LAST under FEFO

# Brute-force protection for /auth/login (process-local, resets on restart)
LOGIN_MAX_FAILURES = int(os.environ.get("LOGIN_MAX_FAILURES", "5"))
LOGIN_LOCKOUT_SECONDS = int(os.environ.get("LOGIN_LOCKOUT_SECONDS", "300"))
_login_failures: dict = {}

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("labstock")


async def lifespan(app: FastAPI):
    if JWT_SECRET == DEFAULT_JWT_SECRET:
        logger.warning("JWT_SECRET is set to the insecure default - set a strong JWT_SECRET before production.")
    try:
        await db.items.create_index("barcode", unique=True)
        await db.lots.create_index([("item_id", 1), ("expiry", 1)])
        await db.log.create_index([("ts", -1)])
        await db.users.create_index("username", unique=True)
    except Exception as e:
        logger.warning(f"Index creation: {e}")
    if not await db.users.find_one({"username": "admin"}):
        await db.users.insert_one({
            "id": new_id(), "username": "admin", "name": "Lab Admin",
            "password_hash": hash_password("admin123"),
            "pin_hash": hash_password("1234"),
            "role": "admin", "active": True, "created_at": now_iso(),
        })
        logger.info("Seeded default admin user (admin/admin123, PIN 1234)")
    if not await db.users.find_one({"username": "tech"}):
        await db.users.insert_one({
            "id": new_id(), "username": "tech", "name": "Jane Tech",
            "password_hash": hash_password("tech123"),
            "pin_hash": hash_password("5678"),
            "role": "technician", "active": True, "created_at": now_iso(),
        })
    await _seed_inventory()
    if os.environ.get("FORCE_SEED", "").lower() in ("1", "true", "yes"):
        await _seed_inventory(force=True)
        logger.info("FORCE_SEED is enabled - inventory re-seeded.")
    yield
    client.close()


app = FastAPI(title="LabStock API", lifespan=lifespan)
api = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)


# ----------------------- Helpers -----------------------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def today_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def new_id() -> str:
    return str(uuid.uuid4())


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def make_token(user: dict) -> str:
    payload = {
        "sub": user["id"],
        "username": user["username"],
        "name": user.get("name", user["username"]),
        "role": user.get("role", "technician"),
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


async def get_current_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> dict:
    if creds is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALG])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0, "pin_hash": 0})
    if not user or not user.get("active", True):
        raise HTTPException(status_code=401, detail="User not found or disabled")
    return user


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin privileges required")
    return user


_EXPIRY_FORMATS = ("%Y-%m-%d", "%d.%m.%Y", "%d/%m/%Y", "%d-%m-%Y")


def normalize_expiry(expiry: str) -> str:
    """Return a canonical ISO YYYY-MM-DD expiry, or "" when it cannot be understood.

    Accepts ISO plus the DD.MM.YYYY / DD/MM/YYYY / DD-MM-YYYY formats used in the source
    inventory reports. Invalid calendar days (e.g. 31.06.2027) are clamped to the last valid
    day of the month so the lot still sorts and raises expiry alerts.
    """
    if not expiry:
        return ""
    s = str(expiry).strip()
    if not s:
        return ""
    for fmt in _EXPIRY_FORMATS:
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    m = re.match(r"^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$", s)
    if m:
        day, month, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
        month = min(max(month, 1), 12)
        day = min(max(day, 1), calendar.monthrange(year, month)[1])
        return f"{year:04d}-{month:02d}-{day:02d}"
    return ""


def expiry_sort_key(expiry: str) -> str:
    return normalize_expiry(expiry) or FAR_FUTURE


def days_until(expiry: str) -> Optional[int]:
    iso = normalize_expiry(expiry)
    if not iso:
        return None
    try:
        d = datetime.strptime(iso, "%Y-%m-%d").date()
        return (d - date.today()).days
    except Exception:
        return None


def _throttle_key(req: "Request", username: str) -> str:
    host = req.client.host if req.client else "unknown"
    return f"{host}:{username.strip().lower()}"


def _is_locked_out(key: str) -> bool:
    rec = _login_failures.get(key)
    if not rec:
        return False
    count, last = rec
    if count < LOGIN_MAX_FAILURES:
        return False
    if (datetime.now(timezone.utc) - last).total_seconds() > LOGIN_LOCKOUT_SECONDS:
        _login_failures.pop(key, None)
        return False
    return True


def _record_login_failure(key: str) -> None:
    count, _ = _login_failures.get(key, (0, None))
    _login_failures[key] = (count + 1, datetime.now(timezone.utc))


def _clear_login_failures(key: str) -> None:
    _login_failures.pop(key, None)


async def log_action(action: str, item_id: str, qty: float, lot: str = "", technician: str = "", detail: str = ""):
    await db.log.insert_one({
        "id": new_id(),
        "ts": now_iso(),
        "action": action,
        "item_id": item_id,
        "lot": lot,
        "qty": qty,
        "technician": technician,
        "detail": detail,
    })


async def item_total(item_id: str) -> float:
    lots = await db.lots.find({"item_id": item_id}, {"_id": 0, "qty": 1}).to_list(10000)
    return sum(l.get("qty", 0) for l in lots)


async def usage_rate_per_day(item_id: str, window_days: int = 30) -> float:
    """Average daily usage over the last window_days based on 'use' log entries."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=window_days)).isoformat()
    cur = db.log.find({"item_id": item_id, "action": "use", "ts": {"$gte": cutoff}}, {"_id": 0, "qty": 1})
    entries = await cur.to_list(100000)
    total = sum(e.get("qty", 0) for e in entries)
    return total / window_days if total > 0 else 0.0


async def usage_rates_batch(item_ids: list, window_days: int = 30) -> dict:
    """Average daily usage for multiple items in a single query. Returns {item_id: rate}."""
    if not item_ids:
        return {}
    cutoff = (datetime.now(timezone.utc) - timedelta(days=window_days)).isoformat()
    cur = db.log.find(
        {"item_id": {"$in": item_ids}, "action": "use", "ts": {"$gte": cutoff}},
        {"_id": 0, "item_id": 1, "qty": 1},
    )
    entries = await cur.to_list(1000000)
    totals = {}
    for e in entries:
        iid = e.get("item_id")
        if iid:
            totals[iid] = totals.get(iid, 0) + (e.get("qty", 0) or 0)
    return {iid: (totals.get(iid, 0) / window_days if totals.get(iid, 0) > 0 else 0.0) for iid in item_ids}


# ----------------------- Models -----------------------
MAX_QTY = 1_000_000_000.0


def _finite_quantity(v: float, *, allow_zero: bool = True) -> float:
    if v is None:
        return v
    if not math.isfinite(v):
        raise ValueError("quantity must be a finite number")
    if v < 0 or (v == 0 and not allow_zero):
        raise ValueError("quantity must be greater than 0")
    if v > MAX_QTY:
        raise ValueError("quantity is unreasonably large")
    return v


class LoginReq(BaseModel):
    username: str
    password: str
    pin: Optional[str] = None


class UserCreate(BaseModel):
    username: str
    password: str
    pin: str
    name: str
    role: str = "technician"


class UserUpdate(BaseModel):
    name: Optional[str] = None
    password: Optional[str] = None
    pin: Optional[str] = None
    role: Optional[str] = None
    active: Optional[bool] = None


class ResolveReq(BaseModel):
    barcode: str


class StockInReq(BaseModel):
    barcode: str
    qty: float
    lot: str = ""
    expiry: str = ""
    name: Optional[str] = None
    unit: str = "unit"
    min_stock: float = 0
    location: str = ""
    storage: str = "Ambient"
    cost: float = 0

    @field_validator("qty")
    @classmethod
    def _v_qty(cls, v: float) -> float:
        return _finite_quantity(v)


class UseReq(BaseModel):
    barcode: str
    qty: float

    @field_validator("qty")
    @classmethod
    def _v_qty(cls, v: float) -> float:
        return _finite_quantity(v, allow_zero=False)


class StocktakeReq(BaseModel):
    barcode: str
    counted: float
    location: Optional[str] = None

    @field_validator("counted")
    @classmethod
    def _v_counted(cls, v: float) -> float:
        return _finite_quantity(v)


class MoveReq(BaseModel):
    barcode: str
    location: str


class ItemUpdateReq(BaseModel):
    id: str
    name: Optional[str] = None
    unit: Optional[str] = None
    min_stock: Optional[float] = None
    location: Optional[str] = None
    storage: Optional[str] = None
    cost: Optional[float] = None


class ImportReq(BaseModel):
    text: str


class ReceiveItem(BaseModel):
    barcode: str
    qty: float = 0
    lot: str = ""
    expiry: str = ""
    name: Optional[str] = None
    unit: str = "unit"
    min_stock: float = 0
    location: str = ""
    storage: str = "Ambient"
    cost: float = 0


class ReceiveCommitReq(BaseModel):
    items: List[ReceiveItem]


# ----------------------- Core service -----------------------
async def do_stock_in(req: "StockInReq", technician: str):
    item = await db.items.find_one({"barcode": req.barcode})
    registered = False
    if not item:
        item = {
            "id": new_id(),
            "barcode": req.barcode,
            "name": req.name or f"Item {req.barcode}",
            "unit": req.unit or "unit",
            "min_stock": req.min_stock or 0,
            "location": req.location or "",
            "storage": req.storage or "Ambient",
            "cost": req.cost or 0,
            "created_at": now_iso(),
        }
        await db.items.insert_one(dict(item))
        await log_action("register", item["id"], 0, technician=technician,
                         detail=f"Auto-registered {req.barcode} ({item['name']})")
        registered = True
    item_id = item["id"]
    if req.location and req.location != item.get("location"):
        await db.items.update_one({"id": item_id}, {"$set": {"location": req.location}})

    if req.qty and req.qty > 0:
        existing = await db.lots.find_one({"item_id": item_id, "lot": req.lot, "expiry": req.expiry})
        if existing:
            await db.lots.update_one({"_id": existing["_id"]}, {"$inc": {"qty": req.qty}})
        else:
            await db.lots.insert_one({
                "id": new_id(), "item_id": item_id, "lot": req.lot,
                "expiry": req.expiry, "qty": req.qty,
            })
        await log_action("in", item_id, req.qty, lot=req.lot, technician=technician,
                         detail=f"expiry={req.expiry or 'n/a'}")
    total = await item_total(item_id)
    return {"ok": True, "item_id": item_id, "registered": registered, "total": total,
            "item_name": item.get("name")}


async def do_stock_out(barcode: str, qty: float, technician: str, action: str = "use"):
    item = await db.items.find_one({"barcode": barcode})
    if not item:
        return {"ok": False, "error": "unknown_barcode"}
    item_id = item["id"]
    lots = await db.lots.find({"item_id": item_id}).to_list(10000)
    lots.sort(key=lambda l: expiry_sort_key(l.get("expiry", "")))
    remaining = qty
    consumed = []
    for lot in lots:
        if remaining <= 0:
            break
        avail = lot.get("qty", 0)
        take = min(avail, remaining)
        if take <= 0:
            continue
        await db.lots.update_one({"_id": lot["_id"]}, {"$set": {"qty": avail - take}})
        remaining -= take
        consumed.append({"lot": lot.get("lot", ""), "expiry": lot.get("expiry", ""), "taken": take})
        await log_action(action, item_id, take, lot=lot.get("lot", ""), technician=technician,
                         detail=f"expiry={lot.get('expiry') or 'n/a'}")
    shortfall = remaining if remaining > 0 else 0
    total = await item_total(item_id)
    return {"ok": shortfall == 0, "consumed": consumed, "shortfall": shortfall,
            "total": total, "item_name": item.get("name")}


# ----------------------- Auth routes -----------------------
@api.post("/auth/login")
async def login(req: LoginReq, request: Request):
    key = _throttle_key(request, req.username)
    if _is_locked_out(key):
        raise HTTPException(status_code=429, detail="Too many failed login attempts. Try again later.")
    user = await db.users.find_one({"username": req.username.strip().lower()})
    if not user or not user.get("active", True) or not verify_password(req.password, user.get("password_hash", "")):
        _record_login_failure(key)
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if user.get("pin_hash"):
        if not req.pin:
            _record_login_failure(key)
            raise HTTPException(status_code=401, detail="PIN required")
        if not verify_password(req.pin, user["pin_hash"]):
            _record_login_failure(key)
            raise HTTPException(status_code=401, detail="Invalid PIN")
    _clear_login_failures(key)
    token = make_token(user)
    return {"token": token, "user": {"id": user["id"], "username": user["username"],
            "name": user.get("name"), "role": user.get("role", "technician")}}


@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


# ----------------------- User management (admin) -----------------------
@api.get("/users")
async def list_users(admin: dict = Depends(require_admin)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0, "pin_hash": 0}).to_list(1000)
    return users


@api.post("/users")
async def create_user(req: UserCreate, admin: dict = Depends(require_admin)):
    uname = req.username.strip().lower()
    if await db.users.find_one({"username": uname}):
        raise HTTPException(status_code=400, detail="Username already exists")
    doc = {
        "id": new_id(), "username": uname, "name": req.name,
        "password_hash": hash_password(req.password),
        "pin_hash": hash_password(req.pin) if req.pin else "",
        "role": req.role, "active": True, "created_at": now_iso(),
    }
    await db.users.insert_one(dict(doc))
    return {"id": doc["id"], "username": uname, "name": req.name, "role": req.role, "active": True}


@api.put("/users/{user_id}")
async def update_user(user_id: str, req: UserUpdate, admin: dict = Depends(require_admin)):
    upd = {}
    if req.name is not None:
        upd["name"] = req.name
    if req.role is not None:
        upd["role"] = req.role
    if req.active is not None:
        upd["active"] = req.active
    if req.password:
        upd["password_hash"] = hash_password(req.password)
    if req.pin:
        upd["pin_hash"] = hash_password(req.pin)
    if not upd:
        raise HTTPException(status_code=400, detail="Nothing to update")
    res = await db.users.update_one({"id": user_id}, {"$set": upd})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True}


@api.delete("/users/{user_id}")
async def delete_user(user_id: str, admin: dict = Depends(require_admin)):
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    await db.users.delete_one({"id": user_id})
    return {"ok": True}


# ----------------------- Inventory routes -----------------------
@api.post("/resolve")
async def resolve(req: ResolveReq, user: dict = Depends(get_current_user)):
    barcode = req.barcode.strip()
    if barcode.upper().startswith("LOC:"):
        return {"type": "location", "location": barcode[4:].replace("_", " ").strip(), "raw": barcode}
    item = await db.items.find_one({"barcode": barcode}, {"_id": 0})
    if not item:
        return {"type": "item", "found": False, "barcode": barcode}
    lots = await db.lots.find({"item_id": item["id"]}, {"_id": 0}).to_list(10000)
    lots.sort(key=lambda l: expiry_sort_key(l.get("expiry", "")))
    total = sum(l.get("qty", 0) for l in lots)
    return {"type": "item", "found": True, "item": item, "lots": lots, "total": total}


@api.post("/stock-in")
async def stock_in_route(req: StockInReq, user: dict = Depends(get_current_user)):
    return await do_stock_in(req, technician=user["name"])


@api.post("/receive-commit")
async def receive_commit(req: ReceiveCommitReq, user: dict = Depends(get_current_user)):
    imported = 0
    registered = 0
    errors = []
    for idx, it in enumerate(req.items, start=1):
        try:
            if not (it.barcode or "").strip():
                errors.append(f"Row {idx}: missing barcode")
                continue
            r = await do_stock_in(StockInReq(**it.model_dump()), technician=user["name"])
            imported += 1
            if r.get("registered"):
                registered += 1
        except Exception as e:
            errors.append(f"Row {idx}: {str(e)}")
    return {"ok": True, "imported": imported, "registered": registered,
            "count": imported, "errors": errors}


@api.post("/use")
async def use_route(req: UseReq, user: dict = Depends(get_current_user)):
    res = await do_stock_out(req.barcode.strip(), req.qty, technician=user["name"], action="use")
    if res.get("error") == "unknown_barcode":
        raise HTTPException(status_code=404, detail="Barcode not registered")
    return res


@api.post("/stocktake")
async def stocktake_route(req: StocktakeReq, user: dict = Depends(get_current_user)):
    item = await db.items.find_one({"barcode": req.barcode.strip()})
    if not item:
        raise HTTPException(status_code=404, detail="Barcode not registered")
    item_id = item["id"]
    current = await item_total(item_id)
    diff = req.counted - current
    if diff > 0:
        existing = await db.lots.find_one({"item_id": item_id, "lot": "STOCKTAKE", "expiry": ""})
        if existing:
            await db.lots.update_one({"_id": existing["_id"]}, {"$inc": {"qty": diff}})
        else:
            await db.lots.insert_one({"id": new_id(), "item_id": item_id, "lot": "STOCKTAKE", "expiry": "", "qty": diff})
    elif diff < 0:
        await do_stock_out(req.barcode.strip(), -diff, technician=user["name"], action="adjust_out")
    if req.location:
        await db.items.update_one({"id": item_id}, {"$set": {"location": req.location}})
    await log_action("adjust", item_id, diff, technician=user["name"],
                     detail=f"stocktake counted={req.counted} was={current}")
    new_total = await item_total(item_id)
    return {"ok": True, "counted": req.counted, "previous": current, "adjustment": diff, "total": new_total,
            "item_name": item.get("name")}


@api.post("/move")
async def move_route(req: MoveReq, user: dict = Depends(get_current_user)):
    item = await db.items.find_one({"barcode": req.barcode.strip()})
    if not item:
        raise HTTPException(status_code=404, detail="Barcode not registered")
    loc = req.location.strip()
    if loc.upper().startswith("LOC:"):
        loc = loc[4:].replace("_", " ").strip()
    prev = item.get("location", "")
    await db.items.update_one({"id": item["id"]}, {"$set": {"location": loc}})
    await log_action("move", item["id"], 0, technician=user["name"],
                     detail=f"{prev or 'unset'} -> {loc}")
    return {"ok": True, "location": loc, "item_name": item.get("name")}


@api.post("/item-update")
async def item_update(req: ItemUpdateReq, admin: dict = Depends(require_admin)):
    upd = {}
    for f in ["name", "unit", "min_stock", "location", "storage", "cost"]:
        v = getattr(req, f)
        if v is not None:
            upd[f] = v
    if not upd:
        raise HTTPException(status_code=400, detail="Nothing to update")
    res = await db.items.update_one({"id": req.id}, {"$set": upd})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    await log_action("edit", req.id, 0, technician=admin["name"], detail=f"updated {list(upd.keys())}")
    return {"ok": True}


@api.delete("/items/{item_id}")
async def delete_item(item_id: str, admin: dict = Depends(require_admin)):
    item = await db.items.find_one({"id": item_id})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    await db.lots.delete_many({"item_id": item_id})
    await db.items.delete_one({"id": item_id})
    await log_action("delete", item_id, 0, technician=admin["name"], detail=f"deleted {item.get('name')}")
    return {"ok": True}


# ----------------------- Items (lightweight list) -----------------------
@api.get("/items")
async def list_items(user: dict = Depends(get_current_user)):
    pipeline = [
        {"$lookup": {
            "from": "lots",
            "localField": "id",
            "foreignField": "item_id",
            "as": "_lots",
        }},
        {"$addFields": {
            "total": {"$sum": "$_lots.qty"},
        }},
        {"$project": {
            "_id": 0, "id": 1, "barcode": 1, "name": 1, "unit": 1,
            "min_stock": 1, "location": 1, "storage": 1, "cost": 1, "total": 1,
        }},
        {"$sort": {"name": 1}},
    ]
    return await db.items.aggregate(pipeline).to_list(100000)


# ----------------------- Dashboard -----------------------
@api.get("/dashboard")
async def dashboard(user: dict = Depends(get_current_user)):
    items = await db.items.find({}, {"_id": 0}).to_list(100000)
    all_lots = await db.lots.find({}, {"_id": 0}).to_list(1000000)
    lots_by_item = {}
    for l in all_lots:
        lots_by_item.setdefault(l["item_id"], []).append(l)

    item_ids = [it["id"] for it in items]
    usage_rates = await usage_rates_batch(item_ids)

    # Fetch last-used, used-today, last-added, 30d usage, and total consumed for all items in batch
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    cutoff_30d = (now - timedelta(days=30)).isoformat()

    last_used_map = {}
    used_today_map = {}
    last_added_map = {}
    used_30d_map = {}
    total_consumed_map = {}

    if item_ids:
        last_used_pipeline = [
            {"$match": {"item_id": {"$in": item_ids}, "action": "use"}},
            {"$sort": {"ts": -1}},
            {"$group": {"_id": "$item_id", "last_used": {"$first": "$ts"}}},
        ]
        for doc in await db.log.aggregate(last_used_pipeline).to_list(100000):
            last_used_map[doc["_id"]] = doc["last_used"]

        used_today_pipeline = [
            {"$match": {"item_id": {"$in": item_ids}, "action": "use", "ts": {"$gte": today_start}}},
            {"$group": {"_id": "$item_id", "total": {"$sum": "$qty"}}},
        ]
        for doc in await db.log.aggregate(used_today_pipeline).to_list(100000):
            used_today_map[doc["_id"]] = doc["total"]

        last_added_pipeline = [
            {"$match": {"item_id": {"$in": item_ids}, "action": "in"}},
            {"$sort": {"ts": -1}},
            {"$group": {"_id": "$item_id", "last_added": {"$first": "$ts"}}},
        ]
        for doc in await db.log.aggregate(last_added_pipeline).to_list(100000):
            last_added_map[doc["_id"]] = doc["last_added"]

        used_30d_pipeline = [
            {"$match": {"item_id": {"$in": item_ids}, "action": "use", "ts": {"$gte": cutoff_30d}}},
            {"$group": {"_id": "$item_id", "total": {"$sum": "$qty"}}},
        ]
        for doc in await db.log.aggregate(used_30d_pipeline).to_list(100000):
            used_30d_map[doc["_id"]] = doc["total"]

        total_consumed_pipeline = [
            {"$match": {"item_id": {"$in": item_ids}, "action": "use"}},
            {"$group": {"_id": "$item_id", "total": {"$sum": "$qty"}}},
        ]
        for doc in await db.log.aggregate(total_consumed_pipeline).to_list(100000):
            total_consumed_map[doc["_id"]] = doc["total"]

    total_value = 0.0
    reorder = []
    expiring = []
    items_out = []
    b30 = b60 = b90 = 0

    for it in items:
        lots = lots_by_item.get(it["id"], [])
        total = sum(l.get("qty", 0) for l in lots)
        value = total * it.get("cost", 0)
        total_value += value
        rate = usage_rates.get(it["id"], 0.0)
        days_left = round(total / rate, 1) if rate > 0 else None

        # Days in inventory
        created = it.get("created_at", "")
        if created:
            try:
                created_dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
                days_in_inventory = (now - created_dt).days
            except:
                days_in_inventory = None
        else:
            days_in_inventory = None

        # Nearest expiry lot
        nearest_expiry_lot = None
        nearest_expiry_days = None
        for l in lots:
            if l.get("qty", 0) <= 0:
                continue
            exp = l.get("expiry", "")
            if not exp:
                continue
            d = days_until(exp)
            if d is not None:
                if nearest_expiry_days is None or d < nearest_expiry_days:
                    nearest_expiry_days = d
                    nearest_expiry_lot = l.get("lot", "")

        # Lot count (distinct lots with qty > 0)
        lot_count = sum(1 for l in lots if l.get("qty", 0) > 0)

        # 30d usage and total consumed
        used_30d = used_30d_map.get(it["id"], 0)
        total_consumed = total_consumed_map.get(it["id"], 0)

        # Stock turnover: daily usage rate as % of on-hand stock
        turnover = round((rate / total * 100), 2) if total > 0 and rate > 0 else None

        items_out.append({
            **it, "total": total, "value": round(value, 2),
            "usage_rate": round(rate, 3), "days_left": days_left,
            "low_stock": it.get("min_stock", 0) > 0 and total < it.get("min_stock", 0),
            "days_in_inventory": days_in_inventory,
            "last_used_on": last_used_map.get(it["id"]),
            "used_today": used_today_map.get(it["id"], 0),
            "last_added_on": last_added_map.get(it["id"]),
            "nearest_expiry_lot": nearest_expiry_lot,
            "nearest_expiry_days": nearest_expiry_days,
            "lot_count": lot_count,
            "used_30d": used_30d,
            "total_consumed": total_consumed,
            "turnover": turnover,
        })

        if it.get("min_stock", 0) > 0 and total < it["min_stock"]:
            reorder.append({
                "id": it["id"], "barcode": it["barcode"], "name": it["name"],
                "total": total, "min_stock": it["min_stock"], "unit": it.get("unit", "unit"),
                "location": it.get("location", ""), "days_left": days_left,
                "shortfall": round(it["min_stock"] - total, 3),
            })

        for l in lots:
            d = days_until(l.get("expiry", ""))
            if d is not None and d <= 90 and l.get("qty", 0) > 0:
                bucket = "expired" if d < 0 else ("30" if d <= 30 else ("60" if d <= 60 else "90"))
                if d >= 0:
                    if d <= 30:
                        b30 += 1
                    elif d <= 60:
                        b60 += 1
                    else:
                        b90 += 1
                expiring.append({
                    "item_id": it["id"], "name": it["name"], "barcode": it["barcode"],
                    "lot": l.get("lot", ""), "expiry": l.get("expiry", ""), "days_left": d,
                    "qty": l.get("qty", 0), "location": it.get("location", ""),
                    "unit": it.get("unit", "unit"), "bucket": bucket,
                })

    reorder.sort(key=lambda r: (r["days_left"] if r["days_left"] is not None else 1e9))
    expiring.sort(key=lambda e: e["days_left"])
    items_out.sort(key=lambda i: i["name"].lower())

    return {
        "kpis": {
            "total_value": round(total_value, 2),
            "total_items": len(items),
            "low_stock_count": len(reorder),
            "expiring_count": len(expiring),
            "expiring_buckets": {"d30": b30, "d60": b60, "d90": b90},
        },
        "reorder": reorder,
        "expiring": expiring,
        "items": items_out,
    }


@api.get("/history")
async def history(limit: int = 500, action: Optional[str] = None,
                  technician: Optional[str] = None, user: dict = Depends(get_current_user)):
    q = {}
    if action:
        q["action"] = action
    if technician:
        q["technician"] = technician
    logs = await db.log.find(q, {"_id": 0}).sort("ts", -1).to_list(limit)
    ids = list({l["item_id"] for l in logs if l.get("item_id")})
    items = await db.items.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "name": 1, "barcode": 1}).to_list(100000)
    name_map = {i["id"]: i for i in items}
    for l in logs:
        info = name_map.get(l.get("item_id"), {})
        l["item_name"] = info.get("name", "—")
        l["item_barcode"] = info.get("barcode", "")
    return {"logs": logs, "count": len(logs)}


@api.get("/recent-scans")
async def recent_scans(limit: int = 12, user: dict = Depends(get_current_user)):
    logs = await db.log.find(
        {"action": {"$in": ["use", "in", "adjust", "adjust_out", "move"]}},
        {"_id": 0}
    ).sort("ts", -1).to_list(limit)
    ids = list({l["item_id"] for l in logs if l.get("item_id")})
    items = await db.items.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "name": 1, "barcode": 1}).to_list(100000)
    name_map = {i["id"]: i for i in items}
    result = []
    for l in logs:
        info = name_map.get(l.get("item_id"), {})
        action = l.get("action", "")
        qty = l.get("qty", 0)
        if action == "use":
            detail = f"-{qty} → {l.get('detail', '')}"
            ok = True
            mode = "use"
        elif action == "in":
            detail = f"+{qty} {l.get('detail', '')}"
            ok = True
            mode = "receive"
        elif action in ("adjust", "adjust_out"):
            sign = "+" if qty > 0 else ""
            detail = f"adj {sign}{qty} {l.get('detail', '')}"
            ok = True
            mode = "count"
        elif action == "move":
            detail = l.get("detail", "")
            ok = True
            mode = "move"
        else:
            detail = l.get("detail", "")
            ok = True
            mode = action
        result.append({
            "mode": mode,
            "name": info.get("name", "—"),
            "barcode": info.get("barcode", ""),
            "detail": detail,
            "ok": ok,
            "ts": l.get("ts", ""),
        })
    return {"scans": result}


@api.get("/technicians")
async def technicians(user: dict = Depends(get_current_user)):
    names = await db.log.distinct("technician")
    return {"technicians": [n for n in names if n]}


@api.get("/locations")
async def locations(user: dict = Depends(get_current_user)):
    locs = await db.items.distinct("location")
    return {"locations": [l for l in locs if l]}


# ----------------------- CSV import / export -----------------------
@api.post("/import")
async def import_csv(req: ImportReq, admin: dict = Depends(require_admin)):
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="No data provided")
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="Could not parse CSV header")
    field_map = {f.strip().lower(): f for f in reader.fieldnames}
    imported = 0
    errors = []
    row_num = 1
    for row in reader:
        row_num += 1
        try:
            def g(key, default=""):
                col = field_map.get(key)
                return (row.get(col, default) if col else default) or default
            barcode = g("barcode").strip()
            if not barcode:
                errors.append(f"Row {row_num}: missing barcode")
                continue
            sreq = StockInReq(
                barcode=barcode,
                qty=float(g("qty", "0") or 0),
                lot=g("lot").strip(),
                expiry=g("expiry").strip(),
                name=g("name").strip() or None,
                unit=g("unit").strip() or "unit",
                min_stock=float(g("min_stock", "0") or 0),
                location=g("location").strip(),
                storage=g("storage").strip() or "Ambient",
                cost=float(g("cost", "0") or 0),
            )
            await do_stock_in(sreq, technician=admin["name"])
            imported += 1
        except Exception as e:
            errors.append(f"Row {row_num}: {str(e)}")
    return {"ok": True, "imported": imported, "errors": errors}


def _csv_response(rows: List[list], filename: str):
    buf = io.StringIO()
    writer = csv.writer(buf)
    for r in rows:
        writer.writerow(r)
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@api.get("/export/items.csv")
async def export_items(user: dict = Depends(get_current_user)):
    items = await db.items.find({}, {"_id": 0}).to_list(100000)
    all_lots = await db.lots.find({}, {"_id": 0}).to_list(1000000)
    lots_by_item = {}
    for l in all_lots:
        lots_by_item.setdefault(l["item_id"], []).append(l)
    rows = [["barcode", "name", "qty", "lot", "expiry", "min_stock", "location", "storage", "cost", "unit"]]
    for it in items:
        lots = lots_by_item.get(it["id"], [])
        if not lots:
            rows.append([it["barcode"], it["name"], 0, "", "", it.get("min_stock", 0),
                         it.get("location", ""), it.get("storage", ""), it.get("cost", 0), it.get("unit", "unit")])
        for l in lots:
            rows.append([it["barcode"], it["name"], l.get("qty", 0), l.get("lot", ""), l.get("expiry", ""),
                         it.get("min_stock", 0), it.get("location", ""), it.get("storage", ""),
                         it.get("cost", 0), it.get("unit", "unit")])
    return _csv_response(rows, "labstock_items.csv")


@api.get("/export/history.csv")
async def export_history(user: dict = Depends(get_current_user)):
    logs = await db.log.find({}, {"_id": 0}).sort("ts", -1).to_list(100000)
    ids = list({l["item_id"] for l in logs if l.get("item_id")})
    items = await db.items.find({"id": {"$in": ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(100000)
    name_map = {i["id"]: i["name"] for i in items}
    rows = [["timestamp", "action", "item", "lot", "qty", "technician", "detail"]]
    for l in logs:
        rows.append([l.get("ts", ""), l.get("action", ""), name_map.get(l.get("item_id"), ""),
                     l.get("lot", ""), l.get("qty", 0), l.get("technician", ""), l.get("detail", "")])
    return _csv_response(rows, "labstock_history.csv")


# ----------------------- Backups / snapshot -----------------------
@api.get("/backup")
async def backup(user: dict = Depends(get_current_user)):
    items = await db.items.find({}, {"_id": 0}).to_list(1000000)
    lots = await db.lots.find({}, {"_id": 0}).to_list(1000000)
    logs = await db.log.find({}, {"_id": 0}).to_list(1000000)
    snapshot = {
        "created_at": now_iso(),
        "counts": {"items": len(items), "lots": len(lots), "log": len(logs)},
        "items": items, "lots": lots, "log": logs,
    }
    data = json.dumps(snapshot, indent=2)
    return StreamingResponse(
        iter([data]),
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename=labstock_backup_{today_str()}.json"},
    )


# ----------------------- Usage trends -----------------------
@api.get("/usage-trends")
async def usage_trends(days: int = 30, user: dict = Depends(get_current_user)):
    cutoff_dt = datetime.now(timezone.utc) - timedelta(days=days)
    cutoff = cutoff_dt.isoformat()
    logs = await db.log.find(
        {"action": "use", "ts": {"$gte": cutoff}}, {"_id": 0}
    ).to_list(1000000)
    items = await db.items.find({}, {"_id": 0, "id": 1, "name": 1, "unit": 1}).to_list(100000)
    name_map = {i["id"]: i for i in items}

    # daily totals
    daily = {}
    by_item = {}
    for l in logs:
        ts = l.get("ts", "")
        day = ts[:10] if ts else ""
        qty = l.get("qty", 0) or 0
        if day:
            daily[day] = daily.get(day, 0) + qty
        iid = l.get("item_id")
        if iid:
            by_item[iid] = by_item.get(iid, 0) + qty

    # build continuous date axis
    daily_series = []
    for i in range(days, -1, -1):
        d = (datetime.now(timezone.utc) - timedelta(days=i)).strftime("%Y-%m-%d")
        daily_series.append({"date": d, "qty": round(daily.get(d, 0), 3)})

    top = []
    for iid, qty in by_item.items():
        info = name_map.get(iid, {})
        top.append({
            "item_id": iid, "name": info.get("name", "—"),
            "unit": info.get("unit", "unit"), "qty": round(qty, 3),
        })
    top.sort(key=lambda x: x["qty"], reverse=True)

    total_used = round(sum(daily.values()), 3)
    return {
        "days": days,
        "daily": daily_series,
        "by_item": top[:15],
        "total_used": total_used,
        "active_reagents": len([t for t in top if t["qty"] > 0]),
    }


# ----------------------- Purchase Orders -----------------------
class POLine(BaseModel):
    item_id: str = ""
    barcode: str = ""
    name: str
    unit: str = "unit"
    on_hand: float = 0
    min_stock: float = 0
    order_qty: float = 0
    cost: float = 0


class POCreate(BaseModel):
    supplier: str = ""
    supplier_email: str = ""
    notes: str = ""
    lines: List[POLine]


class POUpdate(BaseModel):
    supplier: Optional[str] = None
    supplier_email: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    lines: Optional[List[POLine]] = None


async def _next_po_number() -> str:
    ym = datetime.now(timezone.utc).strftime('%Y%m')
    counter = await db.po_counters.find_one_and_update(
        {"_id": ym}, {"$inc": {"seq": 1}}, upsert=True, return_document=True
    )
    return f"PO-{ym}-{counter['seq']:04d}"


@api.post("/purchase-orders")
async def create_po(req: POCreate, user: dict = Depends(get_current_user)):
    lines = [l.model_dump() for l in req.lines]
    doc = {
        "id": new_id(),
        "po_number": await _next_po_number(),
        "supplier": req.supplier,
        "supplier_email": req.supplier_email,
        "notes": req.notes,
        "status": "draft",
        "lines": lines,
        "total_cost": round(sum((l.get("order_qty", 0) or 0) * (l.get("cost", 0) or 0) for l in lines), 2),
        "created_by": user["name"],
        "created_at": now_iso(),
        "ordered_at": "",
        "received_at": "",
    }
    await db.purchase_orders.insert_one(dict(doc))
    return doc


@api.get("/purchase-orders")
async def list_pos(user: dict = Depends(get_current_user)):
    pos = await db.purchase_orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return {"purchase_orders": pos}


@api.get("/purchase-orders/{po_id}")
async def get_po(po_id: str, user: dict = Depends(get_current_user)):
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    if not po:
        raise HTTPException(status_code=404, detail="PO not found")
    return po


@api.put("/purchase-orders/{po_id}")
async def update_po(po_id: str, req: POUpdate, user: dict = Depends(get_current_user)):
    po = await db.purchase_orders.find_one({"id": po_id})
    if not po:
        raise HTTPException(status_code=404, detail="PO not found")
    upd = {}
    if req.supplier is not None:
        upd["supplier"] = req.supplier
    if req.supplier_email is not None:
        upd["supplier_email"] = req.supplier_email
    if req.notes is not None:
        upd["notes"] = req.notes
    if req.lines is not None:
        lines = [l.model_dump() for l in req.lines]
        upd["lines"] = lines
        upd["total_cost"] = round(sum((l.get("order_qty", 0) or 0) * (l.get("cost", 0) or 0) for l in lines), 2)
    if req.status is not None:
        if req.status not in ("draft", "ordered", "received", "cancelled"):
            raise HTTPException(status_code=400, detail="Invalid status")
        upd["status"] = req.status
        if req.status == "ordered":
            upd["ordered_at"] = now_iso()
        if req.status == "received":
            upd["received_at"] = now_iso()
    await db.purchase_orders.update_one({"id": po_id}, {"$set": upd})
    updated = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    return updated


@api.post("/purchase-orders/{po_id}/receive")
async def receive_po(po_id: str, user: dict = Depends(get_current_user)):
    """Mark a PO as received and add its ordered quantities into stock."""
    po = await db.purchase_orders.find_one({"id": po_id})
    if not po:
        raise HTTPException(status_code=404, detail="PO not found")
    if po.get("status") == "received":
        raise HTTPException(status_code=400, detail="PO already received")
    for l in po.get("lines", []):
        qty = l.get("order_qty", 0) or 0
        if qty <= 0 or not l.get("barcode"):
            continue
        await do_stock_in(
            StockInReq(barcode=l["barcode"], qty=qty, name=l.get("name"),
                       unit=l.get("unit", "unit"), cost=l.get("cost", 0)),
            technician=user["name"],
        )
    await db.purchase_orders.update_one(
        {"id": po_id}, {"$set": {"status": "received", "received_at": now_iso()}}
    )
    updated = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    return updated


@api.delete("/purchase-orders/{po_id}")
async def delete_po(po_id: str, admin: dict = Depends(require_admin)):
    await db.purchase_orders.delete_one({"id": po_id})
    return {"ok": True}


def _build_po_pdf(po: dict) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from reportlab.platypus import (SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer)
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, topMargin=18 * mm, bottomMargin=18 * mm,
                            leftMargin=16 * mm, rightMargin=16 * mm, title=po.get("po_number", "PO"))
    styles = getSampleStyleSheet()
    teal = colors.HexColor("#0E7490")
    h = ParagraphStyle("h", parent=styles["Title"], textColor=teal, fontSize=20, spaceAfter=2)
    sub = ParagraphStyle("sub", parent=styles["Normal"], fontSize=9, textColor=colors.HexColor("#4B5563"))
    lbl = ParagraphStyle("lbl", parent=styles["Normal"], fontSize=9, textColor=colors.HexColor("#4B5563"))
    val = ParagraphStyle("val", parent=styles["Normal"], fontSize=10, textColor=colors.HexColor("#0B1220"))

    elems = []
    elems.append(Paragraph("LabStock — Purchase Order", h))
    elems.append(Paragraph(f"{po.get('po_number','')} &nbsp;·&nbsp; Status: {po.get('status','').upper()}", sub))
    elems.append(Spacer(1, 10))

    def dfmt(ts):
        return (ts or "")[:10] or "—"

    meta = [
        [Paragraph("Supplier", lbl), Paragraph(po.get("supplier") or "—", val),
         Paragraph("Created", lbl), Paragraph(f"{dfmt(po.get('created_at'))} by {po.get('created_by','')}", val)],
        [Paragraph("Supplier email", lbl), Paragraph(po.get("supplier_email") or "—", val),
         Paragraph("Ordered", lbl), Paragraph(dfmt(po.get("ordered_at")), val)],
    ]
    mt = Table(meta, colWidths=[70, 180, 70, 160])
    mt.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    elems.append(mt)
    if po.get("notes"):
        elems.append(Spacer(1, 6))
        elems.append(Paragraph(f"Notes: {po['notes']}", sub))
    elems.append(Spacer(1, 12))

    header = ["Item", "Barcode", "Qty", "Unit cost", "Line total"]
    rows = [header]
    for l in po.get("lines", []):
        line_total = (l.get("order_qty", 0) or 0) * (l.get("cost", 0) or 0)
        rows.append([
            l.get("name", ""), l.get("barcode", "") or "—",
            f"{l.get('order_qty', 0)} {l.get('unit','')}",
            f"${l.get('cost', 0):.2f}", f"${line_total:.2f}",
        ])
    rows.append(["", "", "", "Total", f"${po.get('total_cost', 0):.2f}"])
    tbl = Table(rows, colWidths=[170, 110, 70, 70, 80])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), teal),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
        ("ALIGN", (0, 0), (1, -1), "LEFT"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -2), [colors.white, colors.HexColor("#F1F6FA")]),
        ("LINEABOVE", (0, -1), (-1, -1), 0.8, colors.HexColor("#D7E2EC")),
        ("FONTNAME", (3, -1), (-1, -1), "Helvetica-Bold"),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("GRID", (0, 0), (-1, -2), 0.4, colors.HexColor("#E2E8F0")),
    ]))
    elems.append(tbl)
    elems.append(Spacer(1, 16))
    elems.append(Paragraph("Generated by LabStock — barcode-driven reagent & QC inventory.", sub))
    doc.build(elems)
    buf.seek(0)
    return buf.getvalue()


@api.get("/purchase-orders/{po_id}/pdf")
async def po_pdf(po_id: str, user: dict = Depends(get_current_user)):
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    if not po:
        raise HTTPException(status_code=404, detail="PO not found")
    pdf = _build_po_pdf(po)
    return StreamingResponse(
        iter([pdf]),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={po.get('po_number','purchase_order')}.pdf"},
    )


@api.post("/purchase-orders/{po_id}/email")
async def po_email(po_id: str, user: dict = Depends(get_current_user)):
    """Preview-only email of a PO to the supplier. Email provider not configured yet."""
    po = await db.purchase_orders.find_one({"id": po_id}, {"_id": 0})
    if not po:
        raise HTTPException(status_code=404, detail="PO not found")
    settings = await _get_settings()
    to = po.get("supplier_email", "")
    await db.digest_log.insert_one({
        "id": new_id(), "ts": now_iso(), "type": "po_email",
        "po_number": po.get("po_number"), "recipient": to, "sent_by": user["name"],
        "status": "queued_no_provider" if not settings.get("email_provider") else "sent",
    })
    if not to:
        return {"ok": False, "provider_configured": bool(settings.get("email_provider")),
                "message": "No supplier email set on this PO. Add one first, then try again."}
    if not settings.get("email_provider"):
        return {"ok": False, "provider_configured": False, "recipient": to,
                "message": f"Email provider not configured yet — this would send {po.get('po_number')} to {to}. Wire SendGrid/SMTP to enable real sending."}
    return {"ok": True, "provider_configured": True, "recipient": to}


# ----------------------- Expiry Forecast -----------------------
@api.get("/expiry-forecast")
async def expiry_forecast(user: dict = Depends(get_current_user)):
    """Project FEFO consumption against usage rate to flag stock that will expire unused (waste risk)."""
    items = await db.items.find({}, {"_id": 0}).to_list(100000)
    all_lots = await db.lots.find({}, {"_id": 0}).to_list(1000000)
    lots_by_item = {}
    for l in all_lots:
        lots_by_item.setdefault(l["item_id"], []).append(l)

    rows = []
    total_waste_value = 0.0
    at_risk = 0
    usage_rates = await usage_rates_batch([it["id"] for it in items])
    for it in items:
        lots = [l for l in lots_by_item.get(it["id"], []) if l.get("qty", 0) > 0]
        if not lots:
            continue
        rate = usage_rates.get(it["id"], 0.0)  # units/day
        cost = it.get("cost", 0) or 0
        # FEFO order: earliest expiry first, blank last
        lots.sort(key=lambda l: expiry_sort_key(l.get("expiry", "")))
        cumulative_before = 0.0
        for l in lots:
            qty = l.get("qty", 0)
            d = days_until(l.get("expiry", ""))
            if d is None:
                # no expiry -> cannot expire; still advance FEFO position
                cumulative_before += qty
                continue
            if rate > 0:
                consumable_before_expiry = rate * max(d, 0) - cumulative_before
                consumable = min(max(consumable_before_expiry, 0), qty)
            else:
                consumable = 0  # no usage history -> assume nothing consumed
            waste = round(qty - consumable, 3)
            days_to_finish = round((cumulative_before + qty) / rate, 1) if rate > 0 else None
            risk = "none"
            if waste > 0:
                if d < 0:
                    risk = "expired"
                elif rate == 0:
                    risk = "no_usage"
                elif d <= 30:
                    risk = "high"
                elif d <= 60:
                    risk = "medium"
                else:
                    risk = "low"
            if waste > 0:
                at_risk += 1
                total_waste_value += waste * cost
                rows.append({
                    "item_id": it["id"], "name": it["name"], "barcode": it["barcode"],
                    "unit": it.get("unit", "unit"), "lot": l.get("lot", ""),
                    "expiry": l.get("expiry", ""), "days_to_expiry": d,
                    "qty": qty, "usage_rate": round(rate, 3),
                    "days_to_finish_stock": days_to_finish,
                    "projected_waste": waste, "waste_value": round(waste * cost, 2),
                    "risk": risk, "location": it.get("location", ""),
                })
            cumulative_before += qty

    rank = {"expired": 0, "high": 1, "medium": 2, "no_usage": 3, "low": 4, "none": 5}
    rows.sort(key=lambda r: (rank.get(r["risk"], 9), -r["waste_value"]))
    return {
        "rows": rows,
        "summary": {
            "at_risk_lots": at_risk,
            "total_waste_value": round(total_waste_value, 2),
            "high_or_expired": len([r for r in rows if r["risk"] in ("high", "expired")]),
        },
    }


# ----------------------- Settings + Email Digest -----------------------
DEFAULT_SETTINGS = {
    "id": "app",
    "digest_recipient": "supervisor@lab.com",
    "digest_time": "09:00",
    "digest_timezone": "Asia/Kolkata (IST)",
    "email_provider": "",  # empty = not configured
}


class SettingsReq(BaseModel):
    digest_recipient: Optional[str] = None
    digest_time: Optional[str] = None
    digest_timezone: Optional[str] = None


async def _get_settings() -> dict:
    s = await db.settings.find_one({"id": "app"}, {"_id": 0})
    if not s:
        await db.settings.insert_one(dict(DEFAULT_SETTINGS))
        return dict(DEFAULT_SETTINGS)
    merged = {**DEFAULT_SETTINGS, **s}
    return merged


@api.get("/settings")
async def get_settings(user: dict = Depends(get_current_user)):
    return await _get_settings()


@api.put("/settings")
async def update_settings(req: SettingsReq, admin: dict = Depends(require_admin)):
    upd = {k: v for k, v in req.model_dump().items() if v is not None}
    if upd:
        await db.settings.update_one({"id": "app"}, {"$set": upd}, upsert=True)
    return await _get_settings()


async def _build_digest() -> dict:
    """Compose the daily digest payload (low stock + expiring)."""
    items = await db.items.find({}, {"_id": 0}).to_list(100000)
    all_lots = await db.lots.find({}, {"_id": 0}).to_list(1000000)
    lots_by_item = {}
    for l in all_lots:
        lots_by_item.setdefault(l["item_id"], []).append(l)

    low_stock = []
    expiring = []
    for it in items:
        lots = lots_by_item.get(it["id"], [])
        total = sum(l.get("qty", 0) for l in lots)
        if it.get("min_stock", 0) > 0 and total < it["min_stock"]:
            low_stock.append({
                "name": it["name"], "barcode": it["barcode"], "on_hand": total,
                "min_stock": it["min_stock"], "unit": it.get("unit", "unit"),
                "location": it.get("location", ""),
                "shortfall": round(it["min_stock"] - total, 3),
            })
        for l in lots:
            d = days_until(l.get("expiry", ""))
            if d is not None and d <= 90 and l.get("qty", 0) > 0:
                expiring.append({
                    "name": it["name"], "barcode": it["barcode"], "lot": l.get("lot", ""),
                    "expiry": l.get("expiry", ""), "days_left": d, "qty": l.get("qty", 0),
                    "unit": it.get("unit", "unit"), "location": it.get("location", ""),
                })
    low_stock.sort(key=lambda x: x["shortfall"], reverse=True)
    expiring.sort(key=lambda x: x["days_left"])
    settings = await _get_settings()
    return {
        "generated_at": now_iso(),
        "recipient": settings.get("digest_recipient"),
        "schedule": f"{settings.get('digest_time')} {settings.get('digest_timezone')}",
        "low_stock": low_stock,
        "expiring": expiring,
        "summary": {
            "low_stock_count": len(low_stock),
            "expiring_count": len(expiring),
            "expired_count": len([e for e in expiring if e["days_left"] < 0]),
        },
    }


@api.get("/digest")
async def get_digest(user: dict = Depends(get_current_user)):
    return await _build_digest()


@api.post("/digest/send")
async def send_digest(user: dict = Depends(get_current_user)):
    """Placeholder send. Email provider not configured yet — records the attempt only."""
    settings = await _get_settings()
    digest = await _build_digest()
    record = {
        "id": new_id(),
        "ts": now_iso(),
        "recipient": settings.get("digest_recipient"),
        "sent_by": user["name"],
        "provider_configured": bool(settings.get("email_provider")),
        "summary": digest["summary"],
        "status": "queued_no_provider" if not settings.get("email_provider") else "sent",
    }
    await db.digest_log.insert_one(dict(record))
    if not settings.get("email_provider"):
        return {
            "ok": False,
            "provider_configured": False,
            "message": "Email provider not configured yet — digest generated as a preview only. Wire SendGrid/SMTP to enable real sending.",
            "recipient": settings.get("digest_recipient"),
            "summary": digest["summary"],
        }
    return {"ok": True, "provider_configured": True, "recipient": settings.get("digest_recipient"),
            "summary": digest["summary"]}


# ----------------------- Startup: seed + indexes -----------------------
# Lab inventory data — auto-seeded on first launch if items collection is empty.
# Source: Lab Inventory Optimized.xlsx + HMNR Consumption Report August 2026
LAB_INVENTORY = [
    ("I0000727", "Glucose R1 4X53 Ml R2 4X27 Ml-(6400T)-(Osr6221)-Olumpus", "6400", "01.02.2028", 55, 33),
    ("I0000575", "CREATININE (BECKMAN)-4X51ML- R1 &51ML- R2--(4860T)--(OSR6178)-NEW", "4860", "01.04.2028", 40, 25),
    ("I0001104", "UREA (R1:4X25ML & R2:4X25ML)--(2440T) CAT-NO-OSR6134", "2440", "01.04.2027", 37, 21),
    ("I0001098", "TRIGLYCERIDES-R1-4X50ML-R2-4X12.5ML- (OLYMPUS)--(3000T)-(OSR61118)", "3000", "01.09.2027", 43, 22),
    ("I0000548", "CHOLESTROL-(BECKMAN)-(9520T)-4X45ML-R1-(OSR6216)-NEW", "9520", "01.01.2028", 15, 6),
    ("I0000752", "HDL-Cholesterol--4 X 51.3Ml R1 17.1Ml R2--(1820T)--(Osr6287)", "1820", "01.10.2027", 59, 35),
    ("I0000800", "LDL CHOLESTEROL (BECKMAN)4X27/4X9ML--960T-(CODE-OSR6183)", "960", "01.07.2027", 10, 5),
    ("I0000487", "Bilirubin Total (Backman)4X40/4X40Ml-(8080T)-Osr6212", "8080", "01.11.2026", 26, 9),
    ("I0000486", "Bilirubin Direct (Backman)4X20/4X20Ml-(4200T)--Osr6211", "4200", "01.02.2027", 34, 12),
    ("I0000366", "Alk Phosphate - (Beckman)4X30/4X30Ml--(3780T)-(Code-Osr6104)", "3780", "01.08.2027", 34, 14),
    ("I0001020", "SGPT-(BECKMAN)-4X50ML- R1-4X25ML-R2--(3920T)--(OSR6107)", "3920", "01.02.2028", 31, 15),
    ("I0001016", "SGOT (BECKMAN)R1-4X50ML-R2-4X50ML--(7740T)--(OSR6209)", "7740", "01.10.2027", 22, 8),
    ("I0001084", "Total Protein (Beckman)4X48/4X48-(7520T)--(Osr6232)", "7520", "01.04.2027", 16, 7),
    ("I0000362", "Albumin (Beckman) 4X54Ml--(5800T)-(Osr6202)", "5800", "01.07.2027", 21, 9),
    ("I0000718", "Gamma Gt (Beckman)4X18/4X18--(1300T)--(Osr6020)", "1300", "01.07.2027", 71, 40),
    ("I0000412", "ASO LATEX(4X51+4X7)--1720T-(CODE-OSR6194)", "1720", "01.07.2026", 7, 1),
    ("I0000578", "CRP LATEX (BECKMAN)2X4X30--(1200T)--(OSR6199)", "1200", "01.04.2027", 39, 21),
    ("I0000989", "RA LATEX(BECKMAN)-R1-4X24ML-4X8ML--(960T)--(OSR61105)", "960", "01.06.2027", 17, 6),
    ("I0000551", "CK - NAC (BECKMAN)4X22+4X4+4X6--(1200T)--OSR6179", "1200", "01.07.2027", 7, 2),
    ("I0000798", "LDH (BECKMAN)-R1-4X50-R2-4X25ML-(4320T)--OSR6126", "4320", "01.09.2025", 6, 2),
    ("I0000956", "Phosphorous (Beckman)4X15/4X15Ml-(3160T)-Osr6122", "3160", "01.12.2027", 10, 1),
    ("I0000354", "ACID PHOSPHATES(ACCUREX)1ML", "8x1 ml", "31.03.2027", 15, 2),
    ("I0001083", "TOTAL BILE ACID-RX:2X60ML-R2:2X20ML--800T-(REDCELL)", "800", "31.08.2027", 4, 1),
    ("I0000795", "LACTATE(RANDOX)16X6", "16x6 ml", "28.09.2026", 7, 2),
    ("I0000570", "COPPER 5 X 20ML(RANDOX)", "5x20 Ml", "26.09.2027", 5, 1),
    ("I0000355", "ADA KINETIC KIT-2X20ML,1X20ML&CALIBRATOR 1X1ML & CONTROL 2X1ML-(RED CELL)", "2x20 ml", "31.08.2027", 2, 1),
    ("I0000512", "CALCIUM (BECKMAN)4X15ML-R1--(3560T)-(OSR60117)", "3560", "01.07.2028", 19, 7),
    ("I0000380", "AMYLASE (4 X 10 ML)-(320T) - OSR 6006-(BECKMAN)", "320", "01.07.2027", 4, 3),
    ("I0000805", "Lipase (R1 4X30Ml 4Xlyo R2 4X10Ml 2Xcalibrator)-920T--Osr6230", "6230", "01.08.2027", 7, 4),
    ("I0001495", "AMMONIA WITH CAL-2X16ML & 1X3ML--186T--93CATRIDGE--BECKMAN--(CODE-OSR61154)", "186", "01.08.2027", 6, 4),
    ("I0001109", "URIC ACID (BECKMAN)4X30/4X12.5--(3200T)--(OSR6198)", "3200", "01.03.2027", 30, 16),
    ("I0000812", "MAGNESIUM (BECKMAN)4X40ML--(1000T)--(CODE-OSR6189)", "1000", "01.03.2028", 29, 16),
    ("I0000549", "CHOLINE ESTERASE ( CHE) ( OSR6114)--720T", "720", "01.10.2026", 3, 0),
    ("I0000353", "ACE-10X10ML-(RED CELL)", "10x10 ml", "30.04.2027", 27, 3),
    ("I0000713", "G6PDH QUANTITATIVE-2X18ML,2X1.5ML-(RED CELLS)", "2x18 ml", "31.06.2027", 6, 2),
    ("I0000541", "CERULOPLASMIN(BECKMAN)--(OSR6164)", "480", "01.10.2026", 5, 1),
    ("I0007759", "Zinc-fs-2x25ml-include calibrator-(Cat-No-10300295002)-300 Tests, Make: Diasys", "2x25 ml", "", 9, 9),
    ("I0001498", "BICARBONATE R1 4X25ML-2320TEST--TEST CATRIDGE-580--(CODE-OSR6190)", "2320", "01.03.2027", 8, 4),
    ("I0000779", "IRON (BECKMAN)4X15/4X15", "2000T", "01.07.2027", 20, 11),
    ("I0001103", "UIBC (BECKMAN)4X27/4X34X6-(800T)-(OSR61205)", "800", "01.01.2027", 20, 10),
    ("I0000785", "ISE Na+/K+ Selectivity Check, 2 x 25 mL-(code-66313-AU680-beckman)", "2*25 ml", "10.02.2027", 2, 0),
    ("I0000830", "Micro Albumin (Beckman)4X15/4X5--(812T)--(B38858)", "812", "01.06.2027", 28, 10),
    ("I0001116", "Urinary Protein (Beckman)4X19Mlcalibrator 1X3Ml--(660T)--(Osr6170)", "660", "01.05.2027", 23, 9),
    ("I0014998", "Total Protein UC FS 6*20ml - 840T (Cat No:102109910930) - Diasys India", "840", "", 8, 8),
    ("I0000786", "Ise Reference 4 X 1000 Ml-(Code-66318-Au680-Beckman)", "4x1000 ml", "05.07.2027", 10, 1),
    ("I0000780", "Ise Buffer 4 X 2000 Ml-(Code-66320-Au680-Beckman)", "4x2000 ml", "17.06.2027", 16, 6),
    ("I0000781", "Ise High Serum Standard 4 X 100 Ml-(Code-66316-Au680-Beckman)", "4 X 100 Ml", "16.06.2027", 5, 1),
    ("I0000784", "Ise Mid Standard 4 X 2000 Ml--(Code-66319-Au680-Beckman)", "4 X 2000 Ml", "28.09.2027", 19, 9),
    ("I0000782", "Ise Low Serum Standard 4 X 100 Ml-(Code-66317-Au680-Beckman)", "4 X 100", "31.12.2026", 5, 1),
    ("I0000783", "Ise Low/High Urine Standard 2X100 Ml Low 2X100 Ml High-(Code-66315-Au680-Beckman)", "2X100", "", 2, 2),
    ("I0000495", "Biorad Chem Control Level 1 (1X12)-(C-310-5)", "1x12", "28.02.2029", 15, 3),
    ("I0000494", "Biorad Chem Control Level 2(1X12)-(C-315-5)", "1x12", "28.02.2029", 15, 3),
    ("I0000504", "Bio-Rad--Spinal Fluid Control-L1-(Cat-No-752)-6X3Ml", "6X3Ml", "31.05.2027", 6, 2),
    ("I0000505", "Bio-Rad--Spinal Fluid Control-L2-(Cat-No-752)-6X3Ml", "6X3Ml", "31.05.2027", 6, 2),
    ("I0007120", "Ammonia Control Level-2-6X3Ml-(Code-545)", "6X3Ml", "31.05.2027", 9, 2),
    ("I0001462", "Ammonia Control Level-3-6X3Ml-(Code-546)", "6X3Ml", "31.05.2027", 9, 2),
    ("I0001122", "Urine Control 1(Bio-Rad)12X10Ml-(397)", "12x10 ML", "30.09.2027", 12, 4),
    ("I0001123", "Urine Control 2(Bio-Rad)12X10Ml-(398)", "12x10 ML", "30.09.2027", 13, 5),
    ("I0010767", "Randox-Assayed chemistry control premium plus level-2-20x5ml-(Cat-No-HN1530)", "20x5 Ml", "28.06.2028", 59, 17),
    ("I0010768", "Randox-Assayed chemistry control premium plus level-3-20x5ml-(Cat-No-HE1532)", "20x5 Ml", "28.06.2028", 57, 13),
    ("I0001075", "System Calibrator (Beckman)20X5--(Code-6630)", "20x5 Ml", "01.05.2027", 31, 6),
    ("I0015209", "Apolipo Protein-A (Beckman) - 4X13 mL-R1 & 4*13 mL-R2 - (1320T) - (OSR6142)", "4*13 mL", "01.10.2027", 3, 0),
    ("I0015210", "Apolipo Protein-B (Beckman) - 4X13 mL-R1 & 4*7 mL-R2 - (1360T) - (OSR6143)", "4*7 mL", "01.11.2027", 3, 1),
    ("I0015214", "Immunoglobulin IgA (Beckman) - 4X14 mL-R1 & 4*11 mL-R2 - (1280T) - (OSR61171)", "4*11 mL", "01.01.2028", 3, 0),
    ("I0015215", "Immunoglobulin IgG (Beckman) - 4X22 mL-R1 & 4*20 mL-R2 - (1480T) - (OSR61172)", "4*20 mL", "01.01.2028", 3, 0),
    ("I0015216", "Immunoglobulin IgM (Beckman) - 4X14 mL-R1 & 4*11 mL-R2 - (1280T) - (OSR61173)", "4*11 mL", "01.03.2028", 7, 2),
    ("I0015212", "Complement C3 (Beckman) - 4X10 mL-R1 & 4*8 mL-R2 - (1280T) - (OSR6159)", "4*8 mL", "01.02.2028", 3, 0),
    ("I0015213", "Complement C4 (Beckman) - 4X10 mL-R1 & 4*8 mL-R2 - (1280T) - (OSR6160)", "4*8 mL", "01.02.2028", 3, 0),
    ("I0015218", "Diazyme Human Lambda Free Light Chain Assay (Beckman) - (210T) - (C82710)", "210T", "31.05.2027", 1, 0),
    ("I0015217", "Diazyme Human Kappa Free Light Chain Assay (Beckman) - (210T) - (C82709)", "210T", "", 0, 0),
    ("I0015219", "Haptoglobin (Beckman) - 4X16.5 mL-R1 & 4*4.5 mL-R2 - (680T) - (OSR6165)", "680T", "01.02.2028", 4, 1),
    ("I0015221", "Cystatin C Reagent - Gentian (Beckman) - (300T) - (B08179)", "300T", "", 0, 0),
]


async def _seed_inventory(force: bool = False):
    """Seed lab inventory items and stock. Appends missing items, skips existing barcodes."""
    if force:
        await db.items.delete_many({})
        await db.lots.delete_many({})
        await db.log.delete_many({})
        logger.info("Force-seed: cleared all items, lots, and logs.")
    existing_barcodes = set()
    async for doc in db.items.find({}, {"barcode": 1, "_id": 0}):
        existing_barcodes.add(doc.get("barcode", ""))
    added = 0
    skipped = 0
    for barcode, name, unit, expiry, total_available, used in LAB_INVENTORY:
        if barcode in existing_barcodes:
            skipped += 1
            continue
        item = {
            "id": new_id(), "barcode": barcode, "name": name,
            "unit": unit, "min_stock": used, "location": "", "storage": "Ambient",
            "cost": 0, "created_at": now_iso(),
        }
        await db.items.insert_one(dict(item))
        item_id = item["id"]
        if total_available > 0:
            await db.lots.insert_one({
                "id": new_id(), "item_id": item_id,
                "lot": f"SEED-{barcode}", "expiry": normalize_expiry(expiry), "qty": total_available,
            })
        if used > 0:
            remaining = used
            lots = await db.lots.find({"item_id": item_id}).to_list(100)
            for lot in lots:
                if remaining <= 0:
                    break
                avail = lot.get("qty", 0)
                take = min(avail, remaining)
                if take > 0:
                    await db.lots.update_one({"_id": lot["_id"]}, {"$set": {"qty": avail - take}})
                    remaining -= take
            consumed = used - remaining
            if consumed > 0:
                await log_action("use", item_id, consumed, lot=f"SEED-{barcode}",
                                 technician="system", detail="Seeded consumption from HMNR Aug 2026 report")
        added += 1
    count = await db.items.count_documents({})
    logger.info("Seed complete: %d added, %d skipped (already existed), %d total.", added, skipped, count)


@api.post("/admin/seed")
async def admin_seed(admin: dict = Depends(require_admin)):
    """Append missing inventory items. Existing barcodes are skipped."""
    await _seed_inventory()
    count = await db.items.count_documents({})
    return {"ok": True, "message": f"Seed complete. {count} total items.", "item_count": count}


app.include_router(api)

# CORS: never pair a wildcard origin with credentials (invalid + over-permissive).
_cors_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "*").split(",") if o.strip()]
_allow_all_origins = "*" in _cors_origins
if _allow_all_origins and os.environ.get("CORS_ORIGINS", "*").strip() != "*":
    logger.warning("CORS_ORIGINS mixes '*' with explicit origins; '*' wins.")
if _allow_all_origins:
    logger.warning("CORS allows all origins - restrict CORS_ORIGINS before production.")
app.add_middleware(
    CORSMiddleware,
    allow_credentials=not _allow_all_origins,
    allow_origins=_cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)
