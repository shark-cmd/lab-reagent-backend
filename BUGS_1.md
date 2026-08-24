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

### BUG-005: Hardcoded Linux paths in mock scripts break on Windows

- **Files:** `backend/run_backend_fixed.py:4`, `backend/mock_mongo.py:3`
- **Severity:** Medium
- **Description:** Both files contain `sys.path.insert(0, '/workspaces/lab_inventory_github/lab-reagent-trackerX/backend')`. This is a Linux/WSL path that fails on native Windows (the current platform is `win32`).
- **Fix:** Use relative paths: `sys.path.insert(0, str(Path(__file__).parent))`.

---

### BUG-006: Dashboard N+1 query — one DB query per item for usage rate

- **File:** `backend/server.py:506` (inside `dashboard()`)
- **Severity:** Medium
- **Description:** The dashboard loop calls `await usage_rate_per_day(it["id"])` for each item. Each call runs a separate MongoDB query against the log collection. With N items, this produces N+2 queries (1 for items, 1 for lots, N for usage rates).
- **Impact:** Dashboard loads slowly with many items.
- **Fix:** Batch usage rate calculation into a single aggregation query.

---

### BUG-007: PO number generation race condition — duplicate PO numbers possible

- **File:** `backend/server.py:785-787`
- **Severity:** Medium
- **Description:** `_next_po_number()` uses `count_documents({})` then increments. Two concurrent requests can read the same count and generate identical PO numbers.
- **Fix:** Use an atomic counter document with `find_one_and_update` and `upsert=True`.

---

### BUG-008: Dead route files reference undefined variables — cannot be imported

- **Files:** `backend/server_routes_api.py`, `backend/server_routes_auth.py`
- **Severity:** Medium
- **Description:** These files define route handlers but reference variables (`db`, `api`, `datetime`, `jwt`, `new_id`, `hash_password`, etc.) that are never imported. They appear to be intended as modular route files but `server.py` is monolithic and never imports them. They are dead code that could mislead future contributors.
- **Fix:** Either integrate them into `server.py` via `include_router`, or delete them.

---

### BUG-009: `mock_mongo.py` is structurally broken — never used

- **File:** `backend/mock_mongo.py`
- **Severity:** Medium
- **Description:** `MockMotorDatabase` defines collection accessors as async methods (`async def items(self)`), but the server accesses them as properties (`db.items`). This mock would fail with `AttributeError` if actually used. The working mock is in `run_backend_fixed.py`.
- **Fix:** Delete this file or rewrite it to match the working mock in `run_backend_fixed.py`.

---

### BUG-010: Delete PO endpoint has no admin check

- **File:** `backend/server.py:878-881`
- **Severity:** Medium
- **Description:** `delete_po` uses `get_current_user` (any authenticated user), while `delete_item` and `delete_user` properly use `require_admin`. Any logged-in technician can delete purchase orders.
- **Fix:** Change dependency from `get_current_user` to `require_admin`.

---

## Minor Bugs / Code Issues

### BUG-011: `StockInReq.action` field is dead code

- **File:** `backend/server.py:182`
- **Severity:** Minor
- **Description:** The `action: str = "in"` field on `StockInReq` is defined but never read by `do_stock_in`. It adds confusion.
- **Fix:** Remove the field.

---

### BUG-012: CameraScanner `useEffect` missing `onDetected` dependency

- **File:** `frontend/src/components/CameraScanner.js:53`
- **Severity:** Minor
- **Description:** The `useEffect` for camera start/stop depends only on `[open]` but captures `onDetected` in its closure. If `onDetected` changes identity between renders, the scanner uses a stale callback. The `eslint-disable` comment masks this.
- **Impact:** Low in practice because `onDetected` calls state setters which are stable.
- **Fix:** Wrap `onDetected` in `useCallback` in the parent and add it to the deps array.

---

### BUG-013: `_verify_query_token` doesn't check if user is active

- **File:** `backend/server.py:645-651`
- **Severity:** Minor (Security)
- **Description:** Unlike `get_current_user`, this function only verifies JWT signature. A disabled user with a still-valid token could access exports/backup.
- **Fix:** Decode the token, look up the user, and check `active` status.

---

### BUG-014: `server.py:182` — `StockInReq` model has unused `action` field

- **File:** `backend/server.py:182`
- **Severity:** Minor
- **Description:** Duplicate of BUG-011, listed separately for tracking.

---

### BUG-015: `requirements.txt` contains many unused packages

- **File:** `backend/requirements.txt`
- **Severity:** Minor
- **Description:** Packages like `litellm`, `openai`, `google-generativeai`, `boto3`, `stripe`, `pandas`, `numpy`, `tiktoken`, `tokenizers`, etc. are not imported anywhere in the application. They bloat the install and increase attack surface.
- **Fix:** Audit imports and remove unused dependencies.

---

### BUG-016: No `.env` file in backend directory

- **File:** `backend/` (missing `.env`)
- **Severity:** Minor
- **Description:** `server.py` loads `.env` via `load_dotenv(ROOT_DIR / ".env")` and requires `MONGO_URL` and `DB_NAME`. Only `run_backend_fixed.py` sets these env vars. Any other startup path fails with `KeyError`.
- **Fix:** Create a `.env` file with defaults, or add a `.env.example`.

---

### BUG-017: `run_backend_fixed.py` duplicate `import os`

- **File:** `backend/run_backend_fixed.py:10,99`
- **Severity:** Minor
- **Description:** `import os` appears twice. Harmless but sloppy.
- **Fix:** Remove the duplicate.

---

## Architecture Issues

### ARCH-001: Three versions of backend code — confusing and maintenance-prone

- `server.py` — Monolithic, canonical file (1218 lines). All routes, models, and services in one file.
- `server_core.py` — Truncated copy of the first ~300 lines of `server.py`. Never imported.
- `server_routes_api.py` / `server_routes_auth.py` — Route fragments with undefined variables. Never imported.

**Recommendation:** Keep only `server.py` or properly refactor into a package with `routes/`, `models/`, `services/` modules.

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
