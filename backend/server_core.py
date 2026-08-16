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


