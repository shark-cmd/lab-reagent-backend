# AUDIT_01.md — LabStock Full-Stack Audit & Remediation

**Project:** LabStock (`lab-reagent-trackerX`) — barcode-driven lab reagent/QC inventory
**Stack:** FastAPI + MongoDB (Motor) backend, React 19 (CRA/craco) frontend
**Date:** 2026-10-17
**Auditor:** CommandCode (automated deep audit)
**Scope:** `backend/server.py`, `backend/run_backend_fixed.py`, infra/config
(`Dockerfile`, `docker-compose.yml`, `render.yaml`, `.env*`), `frontend/src/**`, test assets.

---

## 1. Method

1. Read all backend routes, service functions, models, seed data, and startup logic in `backend/server.py` (1528 lines).
2. Read every alternate backend entrypoint/mock (`run_backend.py`, `run_backend_fixed.py`, `server_core.py`, `server_mock.py`, `mock_mongo_async.py`, `mock_mongo_server.py`).
3. Read core frontend modules (`App.js`, `lib/api.js`, `context/AuthContext.js`, `pages/Login.js`, `pages/ScanPage.js`, `pages/Users.js`) and `package.json`.
4. Read deployment/config: `Dockerfile`, `docker-compose.yml`, `render.yaml`, `.env`, `.env.example`, `start-dev.ps1`, `.gitignore`.
5. Cross-checked against the prior report `BUGS_1.md` and `BACKEND_STATUS.md`.
6. **Verified findings by execution**: started the documented dev backend (`run_backend_fixed.py`) and exercised the app.

### Environment baseline (verified)
| Component | Version |
|-----------|---------|
| Python | 3.13.5 |
| fastapi | 0.141.1 (pinned 0.110.1 — drift) |
| pydantic | 2.13.4 |
| starlette | 1.6.0 |
| motor | 3.3.1 |
| mongomock | 4.3.0 |
| Node / npm | 22.17.1 / 11.11.0 |
| Docker | 29.7.2 installed, **daemon not running** |

---

## 2. Findings Summary

| ID | Severity | Area | Title | Status |
|----|----------|------|-------|--------|
| AUD-001 | Critical | Dev runtime | Mock async cursor has no `__aiter__` → backend startup crashes | **Fixed** |
| AUD-002 | High | Dev runtime | Non-ASCII `✓` prints crash on Windows cp1252 console | **Fixed** |
| AUD-003 | Critical | Dev runtime | Mock collection has no `aggregate()` → `/api/items` & `/api/dashboard` unusable | **Fixed** |
| AUD-004 | High | Security | PIN (2nd factor) is bypassable — login succeeds without PIN | **Fixed** |
| AUD-005 | Medium-High | Security | CORS `*` combined with `allow_credentials=True` | **Fixed** |
| AUD-006 | Medium | Security | No login throttling; 4-digit PIN brute-forceable | **Fixed** |
| AUD-007 | Medium | Security | Weak default JWT secret shipped; default admin always seeded | **Fixed (warn)** |
| AUD-008 | Low | Security | JWT stored in `localStorage`; no refresh/revocation | **Fixed (hardened)** |
| AUD-009 | High | Correctness | Mixed expiry date formats → `days_until` returns `None` for **all** seeded lots (no expiry alerts, broken FEFO) | **Fixed** |
| AUD-010 | Medium | Correctness | No server-side quantity validation (negative / NaN / absurd qty) | **Fixed** |
| AUD-011 | Medium | Data integrity | Seed logs full `used` qty even when lots insufficient | **Fixed** |
| AUD-012 | Medium | Performance | `/api/expiry-forecast` N+1 per-item usage query | **Fixed** |
| AUD-013 | Low | Audit trail | Stocktake writes both per-lot `adjust_out` and summary `adjust` logs | Documented (by design) |
| AUD-014 | Low | Data quality | Seeds 72 items with `min_stock=0`, `cost=0` → reorder KPI & value KPI dead | **Fixed (min_stock)** |
| AUD-015 | Medium | Code health | Dead/duplicate backend entrypoints & broken mocks | **Fixed (deleted)** |
| AUD-016 | Low | Code health | Deprecated `@app.on_event` startup/shutdown | **Fixed (lifespan)** |
| AUD-017 | Low | Test assets | Root `backend_test*.py` hit a defunct preview URL, write to `/app/...`; `test_result.md` protocol empty | **Fixed (deleted)** |
| AUD-018 | Low | RBAC | `item-update` / `import` open to any authenticated user (plan says admin-only) | **Fixed** |

---

## 3. Detailed Findings

### AUD-001 — Mock cursor missing `__aiter__` (Critical, runtime)
`backend/run_backend_fixed.py` `MockAsyncCursor` implements only `to_list()`. `server.py:_seed_inventory`
(line ~1439) iterates with `async for doc in db.items.find(...)`. On the documented dev path this raises:

```
TypeError: 'async for' requires an object with __aiter__ method, got MockAsyncCursor
ERROR:    Application startup failed. Exiting.
```

**Impact:** the backend cannot start in mock/dev mode at all — the app never boots.

### AUD-002 — Non-ASCII prints crash the console (High, runtime)
`run_backend_fixed.py` prints `"✓ LabStock Backend"`. On a native Windows console (cp1252) this raises
`UnicodeEncodeError: 'charmap' codec can't encode character '\u2713'` and aborts the process before uvicorn runs.

### AUD-003 — Mock collection missing `aggregate()` (Critical, runtime)
`MockAsyncCollection` has no `aggregate()`. `GET /api/items` uses an aggregation pipeline
(`$lookup`/`$addFields`/`$project`/`$sort`) and `GET /api/dashboard` uses `$group` pipelines against `db.log`.
Both raise `AttributeError` in mock mode, so the Dashboard and item picker are broken.
(mongomock 4.3 itself *does* support these operators — verified — so only the async wrapper is missing them.)

### AUD-004 — PIN bypass (High, security)
`server.py` login:
```python
if user.get("pin_hash") and req.pin is not None and req.pin != "":
    if not verify_password(req.pin, user["pin_hash"]): ...
```
If a user has a PIN configured, omitting it skips verification entirely — the documented 2-factor login is
optional in practice. `Login.js` compounds this by labelling the PIN field **"(optional)"**.
(Reported as "Deferred" in `BUGS_1.md`; still present.)

### AUD-005 — CORS misconfiguration (Medium-High, security)
`CORSMiddleware(allow_credentials=True, allow_origins=["*"])` with `CORS_ORIGINS` defaulting to `*`
in `.env`, `render.yaml`, and `docker-compose.yml`. Credentialed wildcard origins is invalid/over-permissive.

### AUD-006 — No login throttling (Medium, security)
4-digit PIN (10k space) plus password with unlimited attempts. No rate limit, delay, or lockout.

### AUD-007 — Weak default secret / always-seeded admin (Medium, security)
`JWT_SECRET` falls back to `"labstock-dev-secret-change-me-please"` (also committed in `backend/.env`).
`startup()` unconditionally seeds `admin/admin123` + PIN `1234`, and `Login.js` displays those demo
credentials on-screen. Safe for a POC on a LAN; unsafe as shipped defaults.

### AUD-009 — Mixed expiry formats break expiry logic (High, correctness)
Frontend date inputs send ISO `YYYY-MM-DD`. Seed data (`LAB_INVENTORY`) uses **`DD.MM.YYYY`**
(e.g. `01.02.2028`) and includes an invalid calendar date (`31.06.2027`).

- `days_until()` parses only `%Y-%m-%d` → returns `None` for every seeded lot.
- Result: seeded stock **never** appears in expiry buckets, the digest, or the forecast.
- `expiry_sort_key()` sorts raw strings → FEFO ordering is wrong when formats are mixed
  (`"01..."` sorts before `"2027..."`, so far-future dot-dates are consumed first).

**Impact:** expiry alerts (a headline feature) are inert for the auto-seeded inventory, and FEFO is incorrect.

### AUD-010 — No quantity validation (Medium, correctness)
`UseReq.qty`, `StockInReq.qty`, `StocktakeReq.counted` accept any float: negative, `NaN`, `Infinity`, or absurd
magnitudes. The frontend guards some of this, but the API (and CSV import) does not.

### AUD-011 — Seed consumption log inconsistent (Medium, data integrity)
`_seed_inventory` decrements lots by up to `used` but logs `qty=used` regardless of how much stock was actually
available, inflating the audit log when `used > total_available`.

### AUD-012 — `/api/expiry-forecast` N+1 (Medium, performance)
Loops items and `await usage_rate_per_day(it["id"])` per item → N queries per request. `usage_rates_batch()`
already exists (added for the dashboard) but isn't used here.

### AUD-015 — Dead/duplicate backend code (Medium, code health)
- `run_backend.py`, `mock_mongo_server.py`, `mock_mongo_async.py`, `server_mock.py`: hardcoded Linux paths,
  broken async wrappers (`matched_count = modified_count`), and a sync mongomock assigned to `server.db`.
- `server_core.py`: truncated copy of `server.py`.
None are imported by the app; they only confuse maintenance. (`BUGS_1.md` claimed these were deleted — they were not.)

### AUD-016 — Deprecated startup hooks (Low)
`@app.on_event("startup"/"shutdown")` is deprecated; migrate to the `lifespan` context manager.

### AUD-018 — RBAC gap vs. plan (Low)
`plan.md` Phase-3 says "restrict item edits/imports to admin role", but `item-update`, `import`, `receive-commit`
and `stock-in` only require `get_current_user`. Left as-is (technicians plausibly need receiving/importing) but
flagged for a product decision.

### Explicitly checked and found OK
- **No JWT-in-URL leak** — BUG-003 fix is intact; `getToken` is no longer used in download params.
- **`matched_count` / `sort()` mock bugs** — BUG-001/002 fixes are intact.
- **`delete_po` admin check** — present.
- **Backup endpoint** exports only `items`/`lots`/`log` (no `users`, no hashes).

---

## 4. Remediation Plan (executed in this pass)

| Fix | Addresses | Change |
|-----|-----------|--------|
| FIX-01 | AUD-001/002/003 | Repair `run_backend_fixed.py`: ASCII-only prints, `__aiter__`, `aggregate()` |
| FIX-02 | AUD-004 | Require + verify PIN when the user has one; update `Login.js` label |
| FIX-03 | AUD-005 | Disable credentialed wildcard CORS; warn when `*` used |
| FIX-04 | AUD-006 | In-memory failed-login throttle/lockout |
| FIX-05 | AUD-007 | Startup warning when the default JWT secret is in use |
| FIX-06 | AUD-009 | `normalize_expiry()` (multi-format + invalid-date clamping) used by `days_until`, FEFO sort, and seed |
| FIX-07 | AUD-010 | Pydantic constraints + finite validation on quantities |
| FIX-08 | AUD-011 | Log actual seeded consumption, not the requested amount |
| FIX-09 | AUD-012 | Batch usage rates in `/api/expiry-forecast` |
| FIX-10 | AUD-015 | Delete dead backend files |
| FIX-11 | AUD-016 | Migrate to `lifespan` |
| FIX-12 | — | Add `backend/test_audit.py` regression suite; verify end-to-end |

Deferred (documented, not changed): AUD-008, AUD-013, AUD-014, AUD-017, AUD-018.

---

## 5. Execution Log

### 5.1 Changes applied

| Fix | File(s) | What changed |
|-----|---------|--------------|
| FIX-01 (AUD-001/002/003) | `backend/run_backend_fixed.py` | Rewrote the mock: ASCII-only startup prints; added `MockAsyncCursor.__aiter__`; added `MockAsyncCollection.aggregate()`; simplified `find_one_and_update`. |
| FIX-02 (AUD-004) | `backend/server.py`, `frontend/src/pages/Login.js` | Login now requires + verifies the PIN whenever the user has one (`401 "PIN required"` otherwise). Login form marks PIN `(required)` and requires it client-side. |
| FIX-03 (AUD-005) | `backend/server.py` | CORS no longer pairs a wildcard origin with `allow_credentials`; logs a warning when all origins are allowed. |
| FIX-04 (AUD-006) | `backend/server.py` | Process-local failed-login throttle (`LOGIN_MAX_FAILURES=5`, `LOGIN_LOCKOUT_SECONDS=300`) → `429` on lockout. |
| FIX-05 (AUD-007) | `backend/server.py` | Startup warning when the insecure default `JWT_SECRET` is in use. |
| FIX-06 (AUD-009) | `backend/server.py` | New `normalize_expiry()` (ISO + `DD.MM.YYYY`/`DD/MM/YYYY`/`DD-MM-YYYY`, invalid days clamped). `days_until()`, `expiry_sort_key()` and the seed now use it. |
| FIX-07 (AUD-010) | `backend/server.py` | `UseReq`/`StockInReq`/`StocktakeReq` validate quantities (finite, non-negative, `>0` for use, upper-bounded) → `422`. |
| FIX-08 (AUD-011) | `backend/server.py` | Seed logs the *actual* consumed quantity, not the requested amount. |
| FIX-09 (AUD-012) | `backend/server.py` | `/api/expiry-forecast` uses the batched `usage_rates_batch()` (one query instead of N). |
| FIX-10 (AUD-015) | `backend/` | Deleted `run_backend.py`, `server_core.py`, `server_mock.py`, `mock_mongo_async.py`, `mock_mongo_server.py`. |
| FIX-11 (AUD-016) | `backend/server.py` | Migrated `@app.on_event` startup/shutdown → `lifespan`. |
| FIX-12 | `backend/test_audit.py` (new), `test_backend.py`, `test_api.py`, `debug_errors.py` | Added regression suite; updated the legacy smoke scripts for the enforced PIN, corrected the advertised port (8003) and Windows-safe stdout. |

### 5.2 Verification (all green)

**Backend** — `python run_backend_fixed.py` then `python test_audit.py`:

```
22 passed, 0 failed
```

Covers: PIN enforcement (3), `/items` aggregation (2), dev-boot (1), expiry-format
normalisation + dashboard alerts (6), FEFO ordering with mixed formats (2),
quantity validation (3), expiry forecast (2), login throttling (1).

**Legacy smoke test** — `python test_backend.py`: 11/11 checks pass
(33 endpoints, 72 items, 17 at-risk lots, 31-day usage series).

**Frontend** — `npm run build`: *Compiled successfully*; `npm test`: 9/9 pass.

### 5.3 Round-1 deferred findings

AUD-008, AUD-014, AUD-017 and AUD-018 were deliberately left for a follow-up pass (they needed
product/architecture decisions). They were all resolved in round 2 — see §6. AUD-013 remains
documented as by-design.

### 5.4 Notable runtime change

Because PIN is now enforced, **any existing integration that logs in without a PIN will start
getting `401 PIN required`**. Update clients to send the PIN (see `test_audit.py` for the shape).

---

## 6. Round 2 — Deferred Findings Resolved

Decisions confirmed with the maintainer before changing anything:

| Finding | Decision | Implementation |
|---------|----------|----------------|
| AUD-018 | item edits + import ⇒ **admin-only** | Backend: `require_admin` on `POST /item-update` and `POST /import`. Frontend: Dashboard `Import CSV` button and the row edit/delete actions now render only for admins. Scan/Receive/Use/Move/Stocktake stay open to all users. |
| AUD-008 | **Harden** the localStorage bearer | `JWT_EXPIRE_HOURS` is now env-configurable (`JWT_EXPIRE_HOURS`, default lowered `12 → 8`). Documented in `.env.example` and the README. The XSS caveat is recorded (see below). |
| AUD-014 | Derive `min_stock` from monthly usage | `_seed_inventory` now sets `min_stock = used` (the report's monthly consumption), so reorder alerts fire for genuinely low items. `cost` remains `0` — no cost data exists, so the value KPI stays 0 until costs are entered. |
| AUD-017 | **Delete** the defunct root scripts | Removed `backend_test.py`, `backend_test_iteration4.py`, `backend_test_iteration5.py` (all targeted a dead `…emergentagent.com` preview URL). `test_reports/` retained. |

### 6.1 Verification (round 2)

`python test_audit.py` → **30 passed, 0 failed** (previous 22, plus 8 new checks):

- RBAC: technician login OK; technician can read `/items` and `POST /stock-in` (200) but is
  **403** on `/item-update` and `/import`; admin can still import.
- Seed: Glucose (`I0000727`) `min_stock == 33` (its monthly usage); dashboard `reorder` list is
  now populated.
- All round-1 checks still pass.

`python test_backend.py` → **11/11**; `npm run build` → *Compiled successfully*.

### 6.2 Residual notes

- **AUD-008 (residual):** the token is still in `localStorage`, so it remains readable by any
  successful XSS. React escapes by default and no `dangerouslySetInnerHTML` is used, so XSS
  surface is low for this app, but a future move to httpOnly cookies + CSRF protection is the
  proper fix. `JWT_EXPIRE_HOURS` can be tuned per deployment.
- **AUD-014 (residual):** `cost` is still `0` for seeded items (the source report has no cost
  column), so "Inventory value" reads `$0.00` until costs are filled in — via the Dashboard edit
  dialog (admin) or CSV import (admin).
- **AUD-013:** intentionally unchanged.


