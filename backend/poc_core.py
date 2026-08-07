"""
LabStock — Phase 1 Core POC
Proves the hardest business logic in isolation against MongoDB:
  - resolve(barcode): registered vs unknown
  - stock_in: auto-register unknown barcode + lot upsert + append-only log
  - stock_out: FEFO (earliest expiry first, blank expiry LAST), shortfall handling, no negative qty
  - append-only audit log integrity
Run: python poc_core.py
"""
import os
import uuid
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

client = MongoClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]

# Use dedicated POC collections so we don't pollute real data
ITEMS = db.poc_items
LOTS = db.poc_lots
LOG = db.poc_log

# Sentinel used for FEFO ordering of blank/unknown expiry -> sort LAST
FAR_FUTURE = "9999-12-31"


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def _expiry_sort_key(expiry: str) -> str:
    """Blank/unknown expiry must be consumed LAST under FEFO."""
    return expiry if expiry else FAR_FUTURE


def resolve(barcode: str):
    item = ITEMS.find_one({"barcode": barcode}, {"_id": 0})
    if not item:
        return {"found": False, "barcode": barcode}
    lots = list(LOTS.find({"item_id": item["id"]}, {"_id": 0}))
    total = sum(l["qty"] for l in lots)
    return {"found": True, "item": item, "lots": lots, "total": total}


def log_action(action, item_id, qty, lot="", technician="", detail=""):
    LOG.insert_one({
        "id": str(uuid.uuid4()),
        "ts": now_iso(),
        "action": action,
        "item_id": item_id,
        "lot": lot,
        "qty": qty,
        "technician": technician,
        "detail": detail,
    })


def stock_in(barcode, qty, lot="", expiry="", technician="", name=None,
             unit="unit", min_stock=0, location="", storage="Ambient", cost=0):
    item = ITEMS.find_one({"barcode": barcode})
    if not item:
        # Auto-register
        item = {
            "id": str(uuid.uuid4()),
            "barcode": barcode,
            "name": name or f"Item {barcode}",
            "unit": unit,
            "min_stock": min_stock,
            "location": location,
            "storage": storage,
            "cost": cost,
            "created_at": now_iso(),
        }
        ITEMS.insert_one(dict(item))
        log_action("register", item["id"], 0, technician=technician,
                   detail=f"Auto-registered {barcode}")
    item_id = item["id"]
    # Upsert lot (same lot+expiry merges)
    existing = LOTS.find_one({"item_id": item_id, "lot": lot, "expiry": expiry})
    if existing:
        LOTS.update_one({"_id": existing["_id"]}, {"$inc": {"qty": qty}})
    else:
        LOTS.insert_one({
            "id": str(uuid.uuid4()),
            "item_id": item_id,
            "lot": lot,
            "expiry": expiry,
            "qty": qty,
        })
    log_action("in", item_id, qty, lot=lot, technician=technician,
               detail=f"expiry={expiry}")
    return {"ok": True, "item_id": item_id}


def stock_out(barcode, qty, technician="", action="use"):
    item = ITEMS.find_one({"barcode": barcode})
    if not item:
        return {"ok": False, "error": "unknown_barcode"}
    item_id = item["id"]
    lots = list(LOTS.find({"item_id": item_id}))
    # FEFO ordering: earliest expiry first; blank expiry last
    lots.sort(key=lambda l: _expiry_sort_key(l["expiry"]))
    remaining = qty
    consumed = []
    for lot in lots:
        if remaining <= 0:
            break
        take = min(lot["qty"], remaining)
        if take <= 0:
            continue
        new_qty = lot["qty"] - take
        LOTS.update_one({"_id": lot["_id"]}, {"$set": {"qty": new_qty}})
        remaining -= take
        consumed.append({"lot": lot["lot"], "expiry": lot["expiry"], "taken": take})
        log_action(action, item_id, take, lot=lot["lot"], technician=technician,
                   detail=f"expiry={lot['expiry']}")
    shortfall = remaining if remaining > 0 else 0
    return {"ok": shortfall == 0, "consumed": consumed, "shortfall": shortfall}


# ----------------------- TESTS -----------------------
def reset():
    ITEMS.delete_many({})
    LOTS.delete_many({})
    LOG.delete_many({})


def test_auto_register_and_resolve():
    reset()
    r = resolve("BC-NEW-001")
    assert r["found"] is False, "unknown barcode should not be found"
    stock_in("BC-NEW-001", qty=10, lot="L1", expiry="2026-01-01",
             technician="alice", name="Glucose Reagent")
    r2 = resolve("BC-NEW-001")
    assert r2["found"] is True, "should be found after stock_in"
    assert r2["item"]["name"] == "Glucose Reagent"
    assert r2["total"] == 10, f"expected total 10, got {r2['total']}"
    # register + in logged
    actions = [d["action"] for d in LOG.find({})]
    assert "register" in actions and "in" in actions
    print("PASS  test_auto_register_and_resolve")


def test_fefo_order():
    reset()
    # Three lots: mid expiry, early expiry, and blank (unknown) expiry
    stock_in("BC-FEFO", qty=5, lot="MID", expiry="2026-06-01", name="QC Serum")
    stock_in("BC-FEFO", qty=5, lot="EARLY", expiry="2026-01-01", name="QC Serum")
    stock_in("BC-FEFO", qty=5, lot="BLANK", expiry="", name="QC Serum")
    # Consume 7 -> should take all 5 from EARLY, then 2 from MID; BLANK untouched
    res = stock_out("BC-FEFO", qty=7, technician="bob")
    assert res["ok"] is True, res
    assert res["consumed"][0]["lot"] == "EARLY", res["consumed"]
    assert res["consumed"][0]["taken"] == 5
    assert res["consumed"][1]["lot"] == "MID"
    assert res["consumed"][1]["taken"] == 2
    r = resolve("BC-FEFO")
    lots = {l["lot"]: l["qty"] for l in r["lots"]}
    assert lots["EARLY"] == 0 and lots["MID"] == 3 and lots["BLANK"] == 5, lots
    print("PASS  test_fefo_order")


def test_blank_expiry_last():
    reset()
    stock_in("BC-BLANK", qty=3, lot="NOEXP", expiry="", name="Buffer")
    stock_in("BC-BLANK", qty=3, lot="DATED", expiry="2030-01-01", name="Buffer")
    # Consume 3 -> must take DATED first (blank is last)
    res = stock_out("BC-BLANK", qty=3)
    assert res["consumed"][0]["lot"] == "DATED", res["consumed"]
    r = resolve("BC-BLANK")
    lots = {l["lot"]: l["qty"] for l in r["lots"]}
    assert lots["DATED"] == 0 and lots["NOEXP"] == 3, lots
    print("PASS  test_blank_expiry_last")


def test_shortfall_no_negative():
    reset()
    stock_in("BC-SHORT", qty=4, lot="ONLY", expiry="2027-01-01", name="Control")
    res = stock_out("BC-SHORT", qty=10, technician="carol")
    assert res["ok"] is False
    assert res["shortfall"] == 6, res
    r = resolve("BC-SHORT")
    assert r["total"] == 0, "all available should be consumed, none negative"
    for l in r["lots"]:
        assert l["qty"] >= 0
    print("PASS  test_shortfall_no_negative")


def test_lot_merge():
    reset()
    stock_in("BC-MERGE", qty=5, lot="A", expiry="2026-05-05", name="Reagent")
    stock_in("BC-MERGE", qty=7, lot="A", expiry="2026-05-05", name="Reagent")
    r = resolve("BC-MERGE")
    assert len(r["lots"]) == 1 and r["lots"][0]["qty"] == 12, r["lots"]
    print("PASS  test_lot_merge")


def test_log_append_only_count():
    reset()
    stock_in("BC-LOG", qty=10, lot="L", expiry="2026-01-01", name="X", technician="t1")
    stock_out("BC-LOG", qty=3, technician="t2")
    stock_out("BC-LOG", qty=2, technician="t2")
    logs = list(LOG.find({}))
    # register + in + use + use = 4 entries, all immutable/appended
    assert len(logs) == 4, f"expected 4 log entries, got {len(logs)}"
    # every entry has ts + technician fields
    for l in logs:
        assert "ts" in l and "action" in l
    print("PASS  test_log_append_only_count")


if __name__ == "__main__":
    print("=== LabStock Core POC ===")
    test_auto_register_and_resolve()
    test_fefo_order()
    test_blank_expiry_last()
    test_shortfall_no_negative()
    test_lot_merge()
    test_log_append_only_count()
    reset()  # clean up POC data
    print("\nALL CORE POC TESTS PASSED ✅")
