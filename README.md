# MedicaidLens — AI-Powered Medicaid Data Explorer

> Explore the largest Medicaid dataset in HHS history through interactive dashboards and an AI-powered chat interface.

Built on the **HHS DOGE Open Data** — aggregated, provider-level Medicaid claims data covering January 2018 to December 2024 across all 50 states, DC, and territories.

## Features

- **📊 Dashboard** — Global spending metrics, monthly trend charts, top providers & billing codes
- **💬 AI Chat** — Natural language queries powered by Anthropic Claude (NL → SQL)
- **🚨 Anomaly Detection** — Z-score based fraud/waste/abuse identification
- **📈 Trends** — Monthly/yearly spending analysis with YoY growth comparisons
- **🔍 Code Explorer** — HCPCS code search with provider distribution drill-downs

## Architecture

| Layer | Technology |
|-------|-----------|
| **Data** | DuckDB (10GB embedded analytical database) |
| **Backend** | Python FastAPI + Anthropic Claude API |
| **Frontend** | React + Vite + Recharts |
| **Design** | Masala Design System (dark theme) |

## Quick Start

### 1. Download Data
```bash
cd data
curl -L -o medicaid-provider-spending.csv.zip \
  "https://stopendataprod.blob.core.windows.net/datasets/medicaid-provider-spending/2026-02-09/medicaid-provider-spending.csv.zip"
unzip medicaid-provider-spending.csv.zip
```

### 2. Backend
```bash
cd backend
pip install -r requirements.txt
```

Create `.env` in project root:
```
ANTHROPIC_API_KEY=your-key-here
DATABASE_PATH=data/medicaid.duckdb
CSV_PATH=data/medicaid-provider-spending.csv
```

Run the backend:
```bash
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

### 3. Frontend
```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5174`

## Dataset

| Property | Detail |
|----------|--------|
| Source | [opendata.hhs.gov](https://opendata.hhs.gov/) |
| Size   | ~10.32 GB uncompressed |
| Coverage | Jan 2018 – Dec 2024 |
| Granularity | Provider × Procedure × Month |

**Columns:** `BILLING_PROVIDER_NPI_NUM`, `SERVICING_PROVIDER_NPI_NUM`, `HCPCS_CODE`, `CLAIM_FROM_MONTH`, `TOTAL_UNIQUE_BENEFICIARIES`, `TOTAL_CLAIMS`, `TOTAL_PAID`

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/overview` | Global statistics |
| `GET /api/trends` | Monthly spending trends |
| `GET /api/top-providers` | Top providers by spending |
| `GET /api/top-codes` | Top HCPCS codes |
| `GET /api/provider/:npi` | Provider detail + trend |
| `GET /api/code/:code` | HCPCS code detail |
| `GET /api/anomalies` | Statistical outliers |
| `POST /api/chat` | AI natural language queries |

## License

Data sourced from [HHS Open Data](https://opendata.hhs.gov/) — U.S. Department of Health and Human Services.
