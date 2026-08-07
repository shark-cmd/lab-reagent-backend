"""
LabStock — Barcode-driven Lab Reagent & QC Inventory Management
FastAPI + MongoDB backend
"""
import os
import io
import csv
import uuid
import json
import logging
from pathlib import Path
from datetime import datetime, timezone, timedelta, date
from typing import List, Optional

from fastapi import FastAPI, APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel
import jwt
import bcrypt

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# ----------------------- Config -----------------------
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

JWT_SECRET = os.environ.get("JWT_SECRET", "labstock-dev-secret-change-me")
JWT_ALG = "HS256"
JWT_EXPIRE_HOURS = 12

FAR_FUTURE = "9999-12-31"  # blank expiry sorts LAST under FEFO

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("labstock")

app = FastAPI(title="LabStock API")
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


def expiry_sort_key(expiry: str) -> str:
    return expiry if expiry else FAR_FUTURE


def days_until(expiry: str) -> Optional[int]:
    if not expiry:
        return None
    try:
        d = datetime.strptime(expiry, "%Y-%m-%d").date()
        return (d - date.today()).days
    except Exception:
        return None


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


# ----------------------- Models -----------------------
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
    action: str = "in"


class UseReq(BaseModel):
    barcode: str
    qty: float


class StocktakeReq(BaseModel):
    barcode: str
    counted: float
    location: Optional[str] = None


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
    qty: float
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
async def login(req: LoginReq):
    user = await db.users.find_one({"username": req.username.strip().lower()})
    if not user or not user.get("active", True):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not verify_password(req.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if user.get("pin_hash") and req.pin is not None and req.pin != "":
        if not verify_password(req.pin, user["pin_hash"]):
            raise HTTPException(status_code=401, detail="Invalid PIN")
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
    results = []
    for it in req.items:
        r = await do_stock_in(StockInReq(**it.model_dump()), technician=user["name"])
        results.append(r)
    return {"ok": True, "count": len(results), "results": results}


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
async def item_update(req: ItemUpdateReq, user: dict = Depends(get_current_user)):
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
    await log_action("edit", req.id, 0, technician=user["name"], detail=f"updated {list(upd.keys())}")
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


# ----------------------- Dashboard -----------------------
@api.get("/dashboard")
async def dashboard(user: dict = Depends(get_current_user)):
    items = await db.items.find({}, {"_id": 0}).to_list(100000)
    all_lots = await db.lots.find({}, {"_id": 0}).to_list(1000000)
    lots_by_item = {}
    for l in all_lots:
        lots_by_item.setdefault(l["item_id"], []).append(l)

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
        rate = await usage_rate_per_day(it["id"])
        days_left = round(total / rate, 1) if rate > 0 else None

        items_out.append({
            **it, "total": total, "value": round(value, 2),
            "usage_rate": round(rate, 3), "days_left": days_left,
            "low_stock": it.get("min_stock", 0) > 0 and total < it.get("min_stock", 0),
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
async def import_csv(req: ImportReq, user: dict = Depends(get_current_user)):
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
            await do_stock_in(sreq, technician=user["name"])
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


async def _verify_query_token(token: Optional[str]):
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")


@api.get("/export/items.csv")
async def export_items(token: Optional[str] = None):
    await _verify_query_token(token)
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
async def export_history(token: Optional[str] = None):
    await _verify_query_token(token)
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
async def backup(token: Optional[str] = None):
    await _verify_query_token(token)
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


# ----------------------- Startup: seed + indexes -----------------------
@app.on_event("startup")
async def startup():
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


@app.on_event("shutdown")
async def shutdown():
    client.close()


app.include_router(api)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
