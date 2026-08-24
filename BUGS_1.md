# BUGS_1.md — LabStock Bug Report

Generated from full codebase audit of backend (`server.py`, `run_backend_fixed.py`, `mock_mongo.py`, route files) and frontend (`ScanPage.js`, `Dashboard.js`, `Login.js`, `CameraScanner.js`, `api.js`, etc.).

---

## Critical Bugs

### BUG-001: Mock `matched_count` reports wrong value — causes false 404s ✅ FIXED

- **File:** `backend/run_backend_fixed.py:50-52`
- **Severity:** Critical
- **Description:** The `MockAsyncCollection.update_one()` wrapper set `matched_count = result.modified_count`. When an update matches a document but changes nothing (same values), MongoDB returns `modified_count=0` while `matched_count=1`. The mock conflated the two, causing endpoints to return false "not found" errors.
- **Affected endpoints:** `item-update` (`server.py:469`), `update_user` (`server.py:358`), `update_settings` (`server.py:1098`)
- **Fix:** Changed `matched_count = result.modified_count` to `matched_count = result.matched_count` (line 52). mongomock's `update_one` result exposes the correct `matched_count`.

---

### BUG-002: Mock cursor `sort()` is a no-op — history and exports are unordered ✅ FIXED

- **File:** `backend/run_backend_fixed.py:24-26`
- **Severity:** Critical
- **Description:** `MockAsyncCursor.sort()` returned `self` without sorting. The history endpoint (`server.py:567`) relies on `.sort("ts", -1)` for reverse-chronological order. In mock mode, log entries were returned in insertion order, breaking history display and CSV export ordering.
- **Affected endpoints:** `GET /api/history`, `GET /api/export/history.csv`, `GET /api/backup`
- **Fix:** `sort()` now stores the sort key and direction. `to_list()` applies the sort before truncating. Supports both string keys and list-of-tuples format used by Motor.

---

### BUG-003: Export/backup/PDF endpoints accept JWT as URL query parameter — token leaked in logs ✅ FIXED

- **File:** `backend/server.py:645-651`
- **Severity:** Critical (Security)
- **Description:** The `_verify_query_token(token)` function took the JWT from a query parameter (`?token=eyJ...`). The frontend (`Dashboard.js:90`, `PurchaseOrders.js:154`) passed it this way. Tokens in URLs are logged in server access logs, browser history, referrer headers, and proxy logs.
- **Affected endpoints:** `GET /api/export/items.csv`, `GET /api/export/history.csv`, `GET /api/backup`, `GET /api/purchase-orders/{po_id}/pdf`
- **Fix:**
  - Backend: Replaced `token: Optional[str]` query param with `user: dict = Depends(get_current_user)` on all four endpoints. Removed `_verify_query_token` function entirely.
  - Frontend: Removed `{ params: { token: getToken() } }` from `Dashboard.js` download calls and `PurchaseOrders.js` PDF download. The axios interceptor already attaches `Authorization: Bearer` via the request header.

---

### BUG-004: PIN is effectively optional even when configured — two-factor auth is bypassable

- **File:** `backend/server.py:307-309`
- **Severity:** Critical (Security)
- **Description:** The login endpoint only checks the PIN when `req.pin is not None and req.pin != ""`. A user with a configured PIN can log in without providing one. The frontend (`Login.js:75`) labels the PIN field as "(optional)", reinforcing this bypass.
- **Reproduction:** Create a user with a PIN. Log in with username/password only, leaving PIN empty. Login succeeds.
- **Fix:** If the user has a `pin_hash` set, the PIN must be provided and validated. Return 401 "PIN required" when PIN is missing for a user that has one.

---

## Medium Bugs

### BUG-005: Hardcoded Linux paths in mock scripts break on Windows ✅ FIXED

- **Files:** `backend/run_backend_fixed.py:4`, `backend/mock_mongo.py:3`
- **Severity:** Medium
- **Description:** Both files contained `sys.path.insert(0, '/workspaces/lab_inventory_github/lab-reagent-trackerX/backend')`. This was a Linux/WSL path that failed on native Windows (the current platform is `win32`).
- **Fix:** Changed to `sys.path.insert(0, str(Path(__file__).parent))` using `pathlib.Path`.

---

### BUG-006: Dashboard N+1 query — one DB query per item for usage rate ✅ FIXED

- **File:** `backend/server.py:506` (inside `dashboard()`)
- **Severity:** Medium
- **Description:** The dashboard loop called `await usage_rate_per_day(it["id"])` for each item. Each call ran a separate MongoDB query against the log collection. With N items, this produced N+2 queries.
- **Fix:** Added `usage_rates_batch()` function that fetches all usage rates in a single query with `$in` filter. Dashboard now does 3 queries total (items, lots, usage rates) regardless of item count.

---

### BUG-007: PO number generation race condition — duplicate PO numbers possible ✅ FIXED

- **File:** `backend/server.py:785-787`
- **Severity:** Medium
- **Description:** `_next_po_number()` used `count_documents({})` then incremented. Two concurrent requests could read the same count and generate identical PO numbers.
- **Fix:** Replaced with atomic counter using `find_one_and_update` with `upsert=True` on a `po_counters` collection. Each month gets its own counter document. Also added `find_one_and_update` to the mock collection class.

---

### BUG-008: Dead route files reference undefined variables — cannot be imported ✅ FIXED

- **Files:** `backend/server_routes_api.py`, `backend/server_routes_auth.py`, `backend/server_routes.py`
- **Severity:** Medium
- **Description:** These files defined route handlers but referenced variables (`db`, `api`, `datetime`, `jwt`, `new_id`, `hash_password`, etc.) that were never imported. They were dead code that could mislead future contributors.
- **Fix:** Deleted all three files.

---

### BUG-009: `mock_mongo.py` is structurally broken — never used ✅ FIXED

- **File:** `backend/mock_mongo.py`
- **Severity:** Medium
- **Description:** `MockMotorDatabase` defined collection accessors as async methods (`async def items(self)`), but the server accesses them as properties (`db.items`). This mock would fail with `AttributeError` if actually used. The working mock is in `run_backend_fixed.py`.
- **Fix:** Deleted the file.

---

### BUG-010: Delete PO endpoint has no admin check ✅ FIXED

- **File:** `backend/server.py:878-881`
- **Severity:** Medium
- **Description:** `delete_po` used `get_current_user` (any authenticated user), while `delete_item` and `delete_user` properly used `require_admin`. Any logged-in technician could delete purchase orders.
- **Fix:** Changed dependency from `get_current_user` to `require_admin`.

---

## Minor Bugs / Code Issues

### BUG-011: `StockInReq.action` field is dead code ✅ FIXED

- **File:** `backend/server.py:182`
- **Severity:** Minor
- **Description:** The `action: str = "in"` field on `StockInReq` was defined but never read by `do_stock_in`. It added confusion.
- **Fix:** Removed the field from the model.

---

### BUG-012: CameraScanner `useEffect` missing `onDetected` dependency ✅ FIXED

- **File:** `frontend/src/components/CameraScanner.js:53`
- **Severity:** Minor
- **Description:** The `useEffect` for camera start/stop depended only on `[open]` but captured `onDetected` in its closure. If `onDetected` changed identity between renders, the scanner used a stale callback.
- **Fix:** Added `onDetectedRef` to hold the latest callback. The effect reads from the ref, which is always current. Removed the `eslint-disable` comment.

---

### BUG-013: `_verify_query_token` doesn't check if user is active ✅ FIXED (moot)

- **File:** `backend/server.py:645-651`
- **Severity:** Minor (Security)
- **Description:** Unlike `get_current_user`, this function only verified JWT signature. A disabled user with a still-valid token could access exports/backup.
- **Fix:** Function removed entirely in BUG-003 fix. Export/backup/PDF endpoints now use `get_current_user` which checks active status.

---

### BUG-014: Duplicate of BUG-011 — removed

---

### BUG-015: `requirements.txt` contains many unused packages ✅ FIXED

- **File:** `backend/requirements.txt`
- **Severity:** Minor
- **Description:** Packages like `litellm`, `openai`, `google-generativeai`, `boto3`, `stripe`, `pandas`, `numpy`, `tiktoken`, `tokenizers`, etc. were not imported anywhere in the application. They bloated the install and increased attack surface.
- **Fix:** Replaced with a clean requirements.txt containing only the 11 packages actually used: fastapi, uvicorn, starlette, pydantic, motor, pymongo, mongomock, PyJWT, bcrypt, python-multipart, python-dotenv, reportlab.

---

### BUG-016: No `.env` file in backend directory ✅ FIXED

- **File:** `backend/` (missing `.env`)
- **Severity:** Minor
- **Description:** `server.py` loaded `.env` via `load_dotenv(ROOT_DIR / ".env")` and required `MONGO_URL` and `DB_NAME`. Only `run_backend_fixed.py` set these env vars. Any other startup path failed with `KeyError`.
- **Fix:** Created `backend/.env` with defaults: `MONGO_URL=mongodb://localhost:27017`, `DB_NAME=labstock`, `JWT_SECRET`, `CORS_ORIGINS=*`.

---

### BUG-017: `run_backend_fixed.py` duplicate `import os` ✅ FIXED

- **File:** `backend/run_backend_fixed.py:10,99`
- **Severity:** Minor
- **Description:** `import os` appeared twice. Harmless but sloppy.
- **Fix:** Removed the duplicate.

---

## Architecture Issues

### ARCH-001: Three versions of backend code — confusing and maintenance-prone ✅ PARTIALLY FIXED

- `server.py` — Monolithic, canonical file (1223 lines). All routes, models, and services in one file.
- `server_core.py` — Truncated copy of the first ~300 lines of `server.py`. Never imported. **Still exists.**
- `server_routes_api.py` / `server_routes_auth.py` / `server_routes.py` — Dead route fragments. **Deleted.**

**Remaining:** `server_core.py` is still present but harmless. Consider deleting it in a future cleanup.

---

### ARCH-002: Mock MongoDB layer is fragile

The mock in `run_backend_fixed.py` wraps `mongomock` with custom async classes. These classes have subtle differences from real Motor (broken sort, wrong `matched_count`, no `find_one_and_update`, etc.). Bugs in the mock can hide real issues or create false confidence.

**Recommendation:** Use `mongomock_motor` (async-native mongomock wrapper) or test against a real MongoDB instance (e.g., via Docker).

---

## Summary Table

| ID | Severity | File | Description | Status |
|----|----------|------|-------------|--------|
| BUG-001 | Critical | `run_backend_fixed.py:52` | `matched_count` = `modified_count` — false 404s | ✅ Fixed |
| BUG-002 | Critical | `run_backend_fixed.py:24` | `sort()` is no-op — unordered history | ✅ Fixed |
| BUG-003 | Critical | `server.py:645` | JWT in URL query param — token leaked | ✅ Fixed |
| BUG-004 | Critical | `server.py:307` | PIN bypassable — two-factor auth broken | Deferred |
| BUG-005 | Medium | `run_backend_fixed.py:4` | Hardcoded Linux path — Windows break |
| BUG-006 | Medium | `server.py:506` | N+1 queries in dashboard |
| BUG-007 | Medium | `server.py:785` | PO number race condition |
| BUG-008 | Medium | `server_routes_*.py` | Dead route files — undefined variables |
| BUG-009 | Medium | `mock_mongo.py` | Broken mock — never used |
| BUG-010 | Medium | `server.py:878` | Delete PO missing admin check |
| BUG-011 | Minor | `server.py:182` | Dead `action` field on StockInReq |
| BUG-012 | Minor | `CameraScanner.js:53` | Missing useEffect dependency |
| BUG-013 | Minor | `server.py:645` | Token verify skips active check |
| BUG-015 | Minor | `requirements.txt` | Unused packages bloating install |
| BUG-016 | Minor | `backend/` | Missing `.env` file |
| BUG-017 | Minor | `run_backend_fixed.py:10,99` | Duplicate `import os` |
