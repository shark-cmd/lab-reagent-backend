# LabStock

**Lab reagent & chemical inventory tracking** — scan-first, FEFO-aware, audit-ready.

## Features

- **Scan-first workflows** — USB barcode + camera scanning (html5-qrcode); auto-register unknown barcodes on the fly
- **FEFO lot management** — First-Expired-First-Out consumption with days-left estimates
- **Append-only audit log** — immutable action history with operator identity + timestamp
- **Dashboard & alerts** — KPI cards, reorder alerts, expiry buckets (30/60/90 days), usage trends
- **Inventory operations** — stock-in, use/consume, stocktake, move between locations, `LOC:` shelf-label scanning
- **Receive queue** — batch received items and commit together
- **CSV import/export** — Excel-ready bulk data flows
- **Authentication & RBAC** — JWT access + refresh; username/password + PIN login; admin/technician roles
- **Mobile-friendly UI** — responsive shell with sticky scan input, large tap targets, haptic feedback

## Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | FastAPI, Python 3.11+, Motor/PyMongo, JWT (python-jose), bcrypt |
| Frontend | React 19, Tailwind CSS, shadcn/ui, Radix UI primitives |
| Data | MongoDB (mock mode available for development) |
| Scanning | html5-qrcode (camera), auto-focused text input (USB) |
| Icons | lucide-react |

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- MongoDB (optional — backend falls back to in-memory mock MongoDB)

### Backend

```bash
cd backend
pip install -r requirements.txt
python run_backend_fixed.py
```

Server starts at **http://localhost:8003**. Swagger UI: **http://localhost:8003/docs**

### Frontend

```bash
cd frontend
npm install
npm start
```

App opens at **http://localhost:3000**

## Default Credentials

| Username | Password | PIN |
|----------|----------|-----|
| admin | admin123 | 1234 |

## API Endpoints

- `POST /api/auth/login` — obtain JWT + refresh
- `POST /api/resolve` — resolve barcode to item/lot
- `POST /api/stock-in` — receive stock (register-on-first-seen)
- `POST /api/use` — consume stock (FEFO)
- `POST /api/stocktake` — physical count adjustment
- `POST /api/move` — transfer between locations
- `GET /api/dashboard` — KPIs, reorder, expiry
- `GET /api/history` — audit log with filters
- `GET /api/expiry-forecast` — waste predictions
- `GET /api/usage-trends` — consumption trends
- `POST /api/purchase-orders` — create PO
- `GET /api/export/items.csv` — export items
- `GET /api/export/history.csv` — export audit log

Full list available in Swagger UI (`/docs`).

## Testing

```bash
cd backend
python test_backend.py
```

End-to-end flows covered: register → receive → use (FEFO) → move → stocktake → dashboard alerts → export/import → auth + role restrictions.

## Project Structure

```
lab-reagent-trackerX/
├── backend/
│   ├── server.py
│   ├── server_routes_api.py
│   ├── server_routes_auth.py
│   ├── run_backend_fixed.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   └── index.css
│   ├── tailwind.config.js
│   └── package.json
├── design_guidelines.md
├── plan.md
└── README.md
```

## Status

LabStock is **complete and production-ready**. All phases delivered:

- Phase 1: POC — FEFO, audit log, resolve/stock-in/stock-out
- Phase 2: Full app — scan page, dashboard, history, CSV, receive queue, stocktake, move
- Phase 3: Auth — JWT + PIN, RBAC, seeded accounts, protected endpoints
- Phase 4: Backups/snapshots, export/import, mobile polish

## Design

Clean clinical UI with scan-first ergonomics. High-contrast palette for bright lab environments. Dense data tables with sticky headers, right-aligned numerics, and status badges. Full keyboard support and WCAG AA focus.
