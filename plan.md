# STATUS: ✅ COMPLETE — LabStock delivered. Phase 1 (POC/FEFO) validated, Phase 2 (full app + auth) built & tested (backend 38/38, frontend 14/14), Phase 3 items (backup/CSV export-import) implemented & tested. All user stories passing.

# plan.md — LabStock (FARM) Build Plan

## 1. Objectives
- Deliver a production-quality LabStock web app (FastAPI + React + MongoDB) that preserves **all** PDF features: scan-first workflows, auto-register barcodes, FEFO lots/expiry, append-only audit log, reorder/expiry alerts + days-left estimate, locations + `LOC:` shelf labels, stocktake, receive queue, CSV import/export, backup/snapshots.
- Add **full authentication** (username+password + PIN) with JWT; seeded test/admin account.
- Provide **USB/manual scanning + camera scanning** (html5-qrcode) with mobile-friendly, data-dense clinical UI.

## 2. Implementation Steps

### Phase 1 — Core Workflow POC (isolation, prove the “hard parts”)
Focus: FEFO, audit-log immutability, auto-register + resolve, and inventory math correctness.

**User stories (POC)**
1. As a technician, I can scan/enter a barcode and instantly know if it’s registered.
2. As a technician, when I stock-out an item, the system consumes lots by **earliest expiry first** (unknown expiry last).
3. As a technician, every stock action creates an **append-only** audit log entry with my identity + timestamp.
4. As a supervisor, I can see when stock is insufficient (shortfall reported) and no quantities go negative.
5. As a technician, I can create a new item during first scan (auto-register) and immediately transact with it.

**Steps**
- Websearch (quick) best practices for: FEFO lot ordering, handling blank expiry, and Mongo transaction patterns.
- Implement minimal FastAPI project (no frontend) with Mongo models:
  - `items`, `lots`, `log`
- Implement endpoints + service functions:
  - `POST /poc/resolve`
  - `POST /poc/stock-in`
  - `POST /poc/stock-out` (FEFO)
  - `GET /poc/history`
- Write a Python test script that:
  - Seeds an item with 3 lots (two dated expiries + one blank)
  - Runs stock-out scenarios and asserts FEFO consumption + correct remaining quantities
  - Asserts log entries are created and never updated
- Fix until all assertions pass and edge cases behave (shortfall, unknown expiry, exact depletion).

### Phase 2 — V1 App Development (core app without auth first)
Goal: Working end-to-end app with full inventory workflows; keep it simple but complete.

**User stories (V1)**
1. As a user, I can open the **Scan** page and scan via USB (auto-focused input + Enter) to transact quickly.
2. As a user, I can switch modes (Use/Receive/Count/Move) and complete a transaction in under 10 seconds.
3. As a user, when I scan an unknown barcode, I get a modal to register name/lot/expiry and continue.
4. As a user, I can add multiple received items to a **receive queue** and commit them together.
5. As a supervisor, I can view Dashboard reorder + expiry alerts and export items/history to CSV.

**Backend (FastAPI)**
- Build full API under `/api` (still no auth):
  - `POST /api/resolve`
  - `POST /api/stock-in` (supports register-on-first-seen)
  - `POST /api/use` (FEFO)
  - `POST /api/stocktake`
  - `POST /api/move` (support `LOC:` prefix to set active location)
  - `GET /api/dashboard` (value, reorder, expiring 30/60/90, days-left)
  - `GET /api/history?limit=&filters=`
  - `POST /api/import` (CSV paste/upload)
  - `GET /api/export/items.csv`, `GET /api/export/history.csv`
  - `POST /api/item-update` (name, min_stock, location, storage, cost, unit)
- Implement `days_left` estimate from recent usage (e.g., last 30/60/90 days) with safe fallback when no usage.
- Ensure log is append-only at API level (no update/delete routes; DB indices).

**Frontend (React)**
- Routes: `/scan`, `/dashboard`, `/history`.
- Scan page:
  - Mode buttons (Use/Receive/Count/Move)
  - Auto-focus barcode field; Enter submits
  - Camera scan toggle (html5-qrcode) that fills barcode input
  - Unknown barcode -> register modal
  - Receive queue UI with commit
  - `LOC:` scanning sets active location banner
- Dashboard:
  - KPI cards: total value, low-stock count, expiring count
  - Tables: Reorder, Expiring (30/60/90), All items (inline edit)
  - CSV import (paste + upload), export buttons
- History:
  - Table with filters (action/technician/date basic), last 500

**Phase 2 testing (mandatory)**
- Run one end-to-end testing pass with the testing agent covering: register → receive → use FEFO → move → stocktake → dashboard alerts → export/import.

### Phase 3 — Add Authentication + Role-based controls (production readiness)
Add JWT auth, user management, and lock down all APIs.

**User stories (Auth)**
1. As a user, I can log in with username/password and confirm with PIN.
2. As a logged-in technician, my identity is automatically attached to every log entry.
3. As an admin, I can create/disable users and reset PIN/password.
4. As a user, I am auto-logged out when my token expires.
5. As an admin, I can restrict item edits/imports to admin role.

**Steps**
- Backend:
  - `users` collection, password hashing, PIN verification
  - JWT access token + refresh strategy (simple)
  - Seed admin/test account
  - Protect endpoints; derive `technician` from JWT, not user input
- Frontend:
  - Login page + guarded routes
  - Token storage + axios interceptor
  - Optional admin User Management page

**Phase 3 testing**
- Testing agent pass: login, token expiry handling, role restrictions, ensure workflows still work.

### Phase 4 — Backups/Snapshots + Hardening

**User stories (Ops/Hardening)**
1. As an admin, I can download a snapshot backup (JSON/zip) on demand.
2. As an admin, I can view available backups and restore in a controlled way (optional).
3. As a supervisor, I can export CSV anytime and it opens cleanly in Excel.
4. As a user, I can use the app comfortably on phone/tablet/PC.
5. As a lab, we can run on LAN reliably with good performance.

**Steps**
- Implement snapshot export endpoint (DB dump to JSON + metadata) + retention.
- Improve indexes (barcode unique, item_id+expiry for lots, ts for logs).
- Polish UI (dense tables, sticky scan input, better empty/error states).
- Final testing agent pass across all critical flows.

## 3. Next Actions
1. Implement Phase 1 POC FastAPI + Mongo core services (resolve/stock-in/stock-out FEFO/log).
2. Write and run the FEFO Python test script; fix edge cases until green.
3. Scaffold Phase 2 full backend routes and React pages; connect end-to-end.
4. Run Phase 2 testing agent; fix defects.
5. Add Phase 3 auth + RBAC and re-test.

## 4. Success Criteria
- FEFO is correct (earliest expiry first; blank expiry last) and never produces negative quantities.
- Unknown barcodes trigger register flow and immediately work for all modes.
- Every operation creates an immutable audit log entry with user identity + timestamp.
- Dashboard correctly shows reorder + expiry (30/60/90) and reasonable days-left estimates.
- Receive queue, stocktake, and move (including `LOC:` shelf labels) work smoothly on mobile and desktop.
- CSV import/export is Excel-ready and matches the specified columns.
- Auth works (JWT + PIN), endpoints are protected, seeded test/admin account exists.
- Testing agent passes end-to-end scenarios with no broken flows.