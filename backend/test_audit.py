#!/usr/bin/env python3
"""AUDIT_01 regression suite — verifies the fixes applied in this audit.

Run the dev backend first:  python run_backend_fixed.py
Then:                       python test_audit.py
"""
import sys
import requests
from datetime import datetime

BASE = "http://localhost:8003/api"

passed = 0
failed = 0


def check(name, cond, detail=""):
    global passed, failed
    if cond:
        passed += 1
        print(f"  PASS  {name}")
    else:
        failed += 1
        print(f"  FAIL  {name}  {detail}")


def login(username, password, pin=None):
    body = {"username": username, "password": password}
    if pin is not None:
        body["pin"] = pin
    return requests.post(f"{BASE}/auth/login", json=body, timeout=10)


def main():
    print("AUDIT_01 regression suite\n")

    # --- AUD-004: PIN enforcement -------------------------------------------------
    print("[AUD-004] PIN is mandatory when configured")
    r = login("admin", "admin123")                 # no PIN
    check("login without PIN is rejected", r.status_code == 401, f"status={r.status_code}")
    r = login("admin", "admin123", "9999")         # wrong PIN
    check("login with wrong PIN is rejected", r.status_code == 401, f"status={r.status_code}")
    r = login("admin", "admin123", "1234")         # correct
    check("login with correct PIN succeeds", r.status_code == 200, f"status={r.status_code}")
    if r.status_code != 200:
        print("\nCannot continue without a token.")
        return 1
    token = r.json()["token"]
    H = {"Authorization": f"Bearer {token}"}

    # --- AUD-003: aggregate() works ----------------------------------------------
    print("\n[AUD-003] /items aggregation pipeline")
    r = requests.get(f"{BASE}/items", headers=H, timeout=10)
    check("GET /items returns 200", r.status_code == 200, f"status={r.status_code}")
    items = r.json() if r.status_code == 200 else []
    check("seeded items present (>=72)", len(items) >= 72, f"count={len(items)}")

    # --- AUD-001/AUD-002: server is up at all (implicit) --------------------------
    print("\n[AUD-001/AUD-002] dev backend boots")
    check("openapi reachable", requests.get("http://localhost:8003/openapi.json", timeout=10).status_code == 200)

    # --- AUD-009: expiry formats & FEFO ------------------------------------------
    print("\n[AUD-009] mixed expiry formats recognised")
    r = requests.post(f"{BASE}/resolve", json={"barcode": "I0000727"}, headers=H, timeout=10)
    data = r.json()
    check("seeded item resolves", data.get("found") is True, str(data)[:120])
    lots = data.get("lots", [])
    check("seeded expiry normalised to ISO", lots and lots[0]["expiry"] == "2028-02-01", str(lots))
    check("seeded remaining qty = 22", data.get("total") == 22, f"total={data.get('total')}")

    r = requests.get(f"{BASE}/dashboard", headers=H, timeout=20)
    dash = r.json()
    check("dashboard 200", r.status_code == 200)
    check("dashboard sees seeded items (>=72)", dash["kpis"]["total_items"] >= 72, str(dash["kpis"]))
    check("expiry alerts now fire for seeded stock", len(dash["expiring"]) > 0,
          f"expiring={len(dash['expiring'])}")
    buckets = dash["kpis"]["expiring_buckets"]
    check("expiry buckets populated", sum(buckets.values()) > 0, str(buckets))

    # FEFO ordering with mixed formats + blank expiry
    print("\n[AUD-009] FEFO ordering (mixed formats, blank last)")
    bc = f"AUD-FEFO-{datetime.now().strftime('%Y%m%d%H%M%S%f')}"
    for lot, exp, qty in [("A", "2027-01-01", 10), ("B", "01.12.2026", 10), ("C", "", 10)]:
        requests.post(f"{BASE}/stock-in", headers=H, timeout=10,
                      json={"barcode": bc, "qty": qty, "lot": lot, "expiry": exp, "name": "FEFO Test"})
    r = requests.post(f"{BASE}/use", json={"barcode": bc, "qty": 12}, headers=H, timeout=10)
    res = r.json()
    check("use returns 200", r.status_code == 200, f"status={r.status_code}")
    order = [c["lot"] for c in res.get("consumed", [])]
    check("FEFO consumes earliest expiry first (B then A)",
          order == ["B", "A"], f"order={order}")
    check("blank-expiry lot untouched", res.get("total") == 18, f"total={res.get('total')}")

    # --- AUD-010: quantity validation --------------------------------------------
    print("\n[AUD-010] quantity validation")
    r = requests.post(f"{BASE}/use", json={"barcode": bc, "qty": -5}, headers=H, timeout=10)
    check("negative use qty rejected (422)", r.status_code == 422, f"status={r.status_code}")
    r = requests.post(f"{BASE}/use", json={"barcode": bc, "qty": 0}, headers=H, timeout=10)
    check("zero use qty rejected (422)", r.status_code == 422, f"status={r.status_code}")
    r = requests.post(f"{BASE}/stocktake", json={"barcode": bc, "counted": -1}, headers=H, timeout=10)
    check("negative stocktake rejected (422)", r.status_code == 422, f"status={r.status_code}")

    # --- AUD-012: expiry forecast works (batched) --------------------------------
    print("\n[AUD-012] expiry forecast")
    r = requests.get(f"{BASE}/expiry-forecast", headers=H, timeout=20)
    check("GET /expiry-forecast 200", r.status_code == 200, f"status={r.status_code}")
    if r.status_code == 200:
        check("forecast returns summary", "summary" in r.json())

    # --- AUD-018: RBAC on item edits / import ------------------------------------
    print("\n[AUD-018] item edits/import are admin-only")
    r = login("tech", "tech123", "5678")
    check("technician login succeeds", r.status_code == 200, f"status={r.status_code}")
    if r.status_code == 200:
        TH = {"Authorization": f"Bearer {r.json()['token']}"}
        check("technician can read items", requests.get(f"{BASE}/items", headers=TH, timeout=10).status_code == 200)
        r2 = requests.post(f"{BASE}/item-update", json={"id": "nope", "name": "x"}, headers=TH, timeout=10)
        check("technician blocked from /item-update (403)", r2.status_code == 403, f"status={r2.status_code}")
        r2 = requests.post(f"{BASE}/import", json={"text": "barcode,name\nRBAC-X,Test"}, headers=TH, timeout=10)
        check("technician blocked from /import (403)", r2.status_code == 403, f"status={r2.status_code}")
        r2 = requests.post(f"{BASE}/stock-in", headers=TH, timeout=10,
                           json={"barcode": "RBAC-TECH-OK", "qty": 1, "name": "Tech Receive"})
        check("technician can still receive stock", r2.status_code == 200, f"status={r2.status_code}")
        check("admin can still import", requests.post(f"{BASE}/import", headers=H, timeout=10,
              json={"text": "barcode,name,qty\nRBAC-ADMIN-OK,Admin Import,1"}).status_code == 200)

    # --- AUD-014: seeded min_stock -----------------------------------------------
    print("\n[AUD-014] seeded min_stock derived from monthly usage")
    glucose = next((i for i in items if i["barcode"] == "I0000727"), None)
    check("Glucose min_stock = monthly usage (33)", bool(glucose) and glucose["min_stock"] == 33,
          str(glucose and glucose.get("min_stock")))
    check("reorder alerts now populated", len(dash["reorder"]) > 0, f"reorder={len(dash['reorder'])}")

    # --- AUD-006: login throttling ------------------------------------------------
    print("\n[AUD-006] login throttling")
    codes = [login("locktest", "nope", "0000").status_code for _ in range(6)]
    check("repeated failures eventually rate-limited (429)", 429 in codes, f"codes={codes}")

    print(f"\n{'='*50}\n{passed} passed, {failed} failed\n{'='*50}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
