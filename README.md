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
| Backend | FastAPI, Python 3.12, Motor/PyMongo, JWT (PyJWT), bcrypt |
| Frontend | React 19, Tailwind CSS, shadcn/ui, Radix UI primitives, CRACO |
| Data | MongoDB (mock mode available for development) |
| Scanning | html5-qrcode (camera), auto-focused text input (USB) |
| Deployment | Vercel (frontend), Docker, Render, Coolify, any VPS |

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

## Deployment

### Vercel (Frontend)

1. Push repo to GitHub
2. Import on [vercel.com](https://vercel.com) — set **Root Directory** to `frontend`
3. Framework auto-detected as Create React App
4. Set env var: `REACT_APP_BACKEND_URL` → your backend URL
5. Deploy

The `frontend/vercel.json` handles SPA rewrites and static asset caching.

### Render (Backend)

1. Create a free MongoDB cluster at [MongoDB Atlas](https://cloud.mongodb.com)
2. Import repo on [render.com](https://render.com) > New > Web Service
3. Select **Docker** as runtime — Render will detect the root `Dockerfile`
4. Set the following environment variables in the **Environment** tab:

| Key | Value |
|-----|-------|
| `MONGO_URL` | Your MongoDB Atlas connection string |
| `DB_NAME` | `labstock` |
| `JWT_SECRET` | A strong random secret |
| `CORS_ORIGINS` | `*` (or your frontend domain) |

5. Deploy

> **Note:** If using Blueprint (render.yaml), only `MONGO_URL` needs to be set manually — the rest are defined in the file.

### Docker / Coolify / VPS

```bash
# Full stack (backend + MongoDB + frontend)
docker compose up -d

# Backend only (use external MongoDB)
docker compose up -d backend
```

Set env vars via a `.env` file at project root or your platform's dashboard:

```bash
cp backend/.env.example backend/.env
# Edit backend/.env with your values
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `MONGO_URL` | MongoDB connection string | `mongodb://localhost:27017` |
| `DB_NAME` | Database name | `labstock` |
| `JWT_SECRET` | JWT signing secret | `labstock-dev-secret-change-me-please` |
| `CORS_ORIGINS` | Allowed origins | `*` |
| `REACT_APP_BACKEND_URL` | Backend API URL (frontend) | `http://localhost:8000` |

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
│   ├── server.py              # FastAPI application
│   ├── run_backend_fixed.py   # Dev launcher (mock MongoDB)
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   └── lib/
│   ├── craco.config.js
│   ├── tailwind.config.js
│   ├── package.json
│   ├── vercel.json
│   ├── Dockerfile
│   └── .env.example
├── docker-compose.yml
├── Dockerfile
├── render.yaml
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
