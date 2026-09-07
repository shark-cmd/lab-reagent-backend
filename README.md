# LabStock

**Barcode-driven lab reagent & chemical inventory management** — scan, track, reorder.

Built for clinical labs that need FEFO lot tracking, audit trails, and real-time stock visibility.

![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat&logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-61DAFB?style=flat&logo=react&logoColor=black)
![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=flat&logo=mongodb&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat&logo=docker&logoColor=white)

---

## Quick Start

### One-Command (Docker)

```bash
git clone <repo-url>
cd lab-reagent-trackerX
docker compose up -d
```

- **App:** http://localhost:3000
- **API docs:** http://localhost:8003/docs
- **Login:** `admin` / `admin123`

### Manual Setup

<details>
<summary>Backend</summary>

```bash
cd backend
pip install -r requirements.txt
python run_backend_fixed.py
```

Server runs on http://localhost:8003
</details>

<details>
<summary>Frontend</summary>

```bash
cd frontend
npm install
npm start
```

App runs on http://localhost:3000
</details>

---

## Features

| Feature | Description |
|---------|-------------|
| **Barcode scanning** | USB scanner + camera (html5-qrcode); auto-register unknown barcodes |
| **FEFO lot management** | First-Expired-First-Out consumption with days-left estimates |
| **Audit log** | Append-only history with operator, timestamp, and quantities |
| **Dashboard** | KPIs, reorder alerts, expiry buckets (30/60/90 days), usage trends |
| **Inventory ops** | Stock-in, use/consume, stocktake, move between locations |
| **Receive queue** | Batch received items and commit together |
| **CSV import/export** | Bulk data flows for Excel users |
| **Auth & RBAC** | JWT + PIN login; admin and technician roles |
| **Purchase orders** | Create, track, and email POs with PDF generation |
| **Expiry forecasting** | Predict waste risk based on usage rate vs. expiry date |
| **Mobile-friendly** | Responsive UI with large tap targets and haptic feedback |

---

## Pre-loaded Inventory

The backend auto-seeds **72 lab reagents and chemicals** from the HMNR Bio-Chemistry Routine Consumption Report (August 2026). On first launch, items are created with current stock levels — no manual data entry needed.

Items include Glucose, Creatinine, Urea, Cholesterol, Bilirubin, SGPT/SGOT, Albumin, Calcium, Iron, and more. Each item has:

- Original Item Code as barcode (e.g., `I0000727`)
- Test name and pack size
- Stocked quantity (closing balance from the consumption report)
- Lot and expiry tracking

To re-seed or append new items: `POST /api/admin/seed`

---

## Deployment

### Render (Backend + Frontend)

1. **Create a MongoDB cluster** at [MongoDB Atlas](https://cloud.mongodb.com) (free tier works)

2. **Deploy backend** on [render.com](https://render.com):
   - New > Web Service > connect your repo
   - **Root Directory:** `backend`
   - **Runtime:** Docker
   - **Environment variables:**

   | Key | Value |
   |-----|-------|
   | `MONGO_URL` | Your MongoDB Atlas connection string |
   | `DB_NAME` | `labstock` |
   | `JWT_SECRET` | Any random string |
   | `CORS_ORIGINS` | `*` |
   | `FORCE_SEED` | `true` (first deploy only — auto-seeds 72 items) |

3. **Deploy frontend:**
   - New > Static Site
   - **Root Directory:** `frontend`
   - **Build command:** `npm install --legacy-peer-deps && npm run build`
   - **Publish directory:** `build`
   - **Environment variable:** `REACT_APP_BACKEND_URL` → your backend URL

### Vercel (Frontend only)

1. Import repo on [vercel.com](https://vercel.com)
2. Set **Root Directory** to `frontend`
3. Set env var: `REACT_APP_BACKEND_URL` → your backend URL
4. Deploy

### Docker Compose (Full stack)

```bash
# Set up env
cp backend/.env.example backend/.env
# Edit backend/.env with your values

# Start everything
docker compose up -d
```

---

## Environment Variables

| Variable | Where | Description | Default |
|----------|-------|-------------|---------|
| `MONGO_URL` | Backend | MongoDB connection string | `mongodb://localhost:27017` |
| `DB_NAME` | Backend | Database name | `labstock` |
| `JWT_SECRET` | Backend | JWT signing secret | `labstock-dev-secret-change-me-please` |
| `CORS_ORIGINS` | Backend | Allowed origins (comma-separated) | `*` |
| `FORCE_SEED` | Backend | Re-seed inventory on startup | `false` |
| `REACT_APP_BACKEND_URL` | Frontend | Backend API URL | `http://localhost:8003` |

---

## Default Credentials

| Username | Password | PIN | Role |
|----------|----------|-----|------|
| `admin` | `admin123` | `1234` | Admin |
| `tech` | `tech123` | `5678` | Technician |

> Change these before deploying to production.

---

## API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/login` | POST | Login, get JWT token |
| `/api/resolve` | POST | Look up barcode → item + lots |
| `/api/stock-in` | POST | Add stock (auto-registers new barcodes) |
| `/api/use` | POST | Consume stock (FEFO) |
| `/api/stocktake` | POST | Physical count adjustment |
| `/api/move` | POST | Transfer item to new location |
| `/api/items` | GET | List all items with totals |
| `/api/dashboard` | GET | KPIs, reorder list, expiring items |
| `/api/history` | GET | Audit log with filters |
| `/api/expiry-forecast` | GET | Waste risk predictions |
| `/api/usage-trends` | GET | Consumption trends over time |
| `/api/purchase-orders` | POST | Create purchase order |
| `/api/import` | POST | Bulk import via CSV |
| `/api/export/items.csv` | GET | Export items as CSV |
| `/api/export/history.csv` | GET | Export audit log as CSV |
| `/api/admin/seed` | POST | Seed/append inventory items |

Full interactive docs at `/docs` (Swagger UI).

---

## Project Structure

```
lab-reagent-trackerX/
├── backend/
│   ├── server.py                # FastAPI app + all routes
│   ├── run_backend_fixed.py     # Dev server (mock MongoDB)
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/          # Reusable UI components
│   │   ├── pages/               # Page-level views
│   │   └── lib/                 # API client, utils
│   ├── package.json
│   ├── tailwind.config.js
│   ├── vercel.json
│   └── Dockerfile
├── import_excel.py              # Import items from Excel catalog
├── import_consumption.py        # Import consumption report data
├── Lab Inventory Optimized.xlsx # Source inventory catalog
├── docker-compose.yml
├── render.yaml
└── README.md
```

---

## Data Import Scripts

For importing data outside the auto-seed:

```bash
# Import items from the Excel catalog
python import_excel.py

# Import consumption report data (stocks + usage)
python import_consumption.py
```

Both scripts require the backend to be running.

---

## License

Private — Vijaya Diagnostics Centre.
