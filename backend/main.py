"""
FastAPI application — Medicaid Data Explorer API.
Provides REST endpoints for dashboard, analytics, and AI chat.
"""

import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

from .db import initialize_database, query
from .enrichment import enrich_providers, enrich_codes, lookup_npi, get_hcpcs_description
from . import ai_chat

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database on startup."""
    try:
        initialize_database()
        logger.info("Database ready.")
    except FileNotFoundError as e:
        logger.warning("Database not initialized: %s", e)
    yield


app = FastAPI(
    title="Medicaid Data Explorer API",
    description="AI-powered analytics for the HHS Medicaid Provider Spending dataset",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Pydantic Models ───────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    history: list[dict] = []


class ChatResponse(BaseModel):
    thinking: str = ""
    sql: str | None = None
    results: list[dict] | None = None
    visualization: str = "none"
    chart_config: dict | None = None
    narrative: str = ""
    error: str | None = None


# ─── Dashboard Endpoints ───────────────────────────────────────────

@app.get("/api/overview")
def get_overview():
    """Global statistics for the dashboard hero section."""
    stats = query("SELECT * FROM global_stats")[0]
    return {
        "total_providers": stats["total_providers"],
        "total_codes": stats["total_codes"],
        "total_claims": stats["total_claims"],
        "total_paid": stats["total_paid"],
        "total_beneficiaries": stats["total_beneficiaries"],
        "date_from": str(stats["date_from"]),
        "date_to": str(stats["date_to"]),
        "total_rows": stats["total_rows"],
    }


@app.get("/api/trends")
def get_trends(
    start: str = Query(None, description="Start month (YYYY-MM-01)"),
    end: str = Query(None, description="End month (YYYY-MM-01)"),
):
    """Monthly spending trends."""
    sql = "SELECT * FROM monthly_trends"
    params = []
    conditions = []
    if start:
        conditions.append("claim_month >= ?")
        params.append(start)
    if end:
        conditions.append("claim_month <= ?")
        params.append(end)
    if conditions:
        sql += " WHERE " + " AND ".join(conditions)
    sql += " ORDER BY claim_month"

    results = query(sql, params if params else None)
    # Convert dates to strings
    for r in results:
        r["claim_month"] = str(r["claim_month"])
    return results


@app.get("/api/top-providers")
def get_top_providers(
    limit: int = Query(20, ge=1, le=100),
    sort_by: str = Query("total_paid", enum=["total_paid", "total_claims", "total_beneficiaries"]),
):
    """Top providers by spending, claims, or beneficiaries."""
    sql = f"""
        SELECT billing_npi, total_claims, total_paid, total_beneficiaries,
               unique_codes, active_months
        FROM provider_summary
        ORDER BY {sort_by} DESC
        LIMIT ?
    """
    results = query(sql, [limit])
    results = enrich_providers(results)
    return results


@app.get("/api/top-codes")
def get_top_codes(
    limit: int = Query(20, ge=1, le=100),
    sort_by: str = Query("total_paid", enum=["total_paid", "total_claims", "provider_count"]),
):
    """Top HCPCS codes by spending, claims, or provider count."""
    sql = f"""
        SELECT hcpcs_code, provider_count, total_claims, total_paid,
               total_beneficiaries, avg_paid_per_claim
        FROM code_summary
        ORDER BY {sort_by} DESC
        LIMIT ?
    """
    results = query(sql, [limit])
    results = enrich_codes(results)
    return results


@app.get("/api/provider/{npi}")
def get_provider_detail(npi: str):
    """Detailed view for a specific provider."""
    # Provider summary
    summary = query(
        "SELECT * FROM provider_summary WHERE billing_npi = ?", [npi]
    )
    if not summary:
        raise HTTPException(status_code=404, detail="Provider not found")

    # NPI enrichment
    provider_info = lookup_npi(npi)

    # Monthly trend for this provider
    trend = query("""
        SELECT claim_month, SUM(total_claims) AS total_claims,
               SUM(total_paid) AS total_paid, SUM(beneficiaries) AS beneficiaries
        FROM claims
        WHERE billing_npi = ?
        GROUP BY claim_month
        ORDER BY claim_month
    """, [npi])
    for t in trend:
        t["claim_month"] = str(t["claim_month"])

    # Top codes for this provider
    top_codes = query("""
        SELECT hcpcs_code, SUM(total_claims) AS total_claims,
               SUM(total_paid) AS total_paid, SUM(beneficiaries) AS beneficiaries
        FROM claims
        WHERE billing_npi = ?
        GROUP BY hcpcs_code
        ORDER BY total_paid DESC
        LIMIT 20
    """, [npi])
    top_codes = enrich_codes(top_codes)

    # Any anomalies for this provider
    anomalies = query(
        "SELECT * FROM anomaly_scores WHERE billing_npi = ? ORDER BY z_score_paid DESC LIMIT 10",
        [npi]
    )
    anomalies = enrich_codes(anomalies)

    return {
        "provider": {**summary[0], **provider_info},
        "trend": trend,
        "top_codes": top_codes,
        "anomalies": anomalies,
    }


@app.get("/api/anomalies")
def get_anomalies(
    limit: int = Query(50, ge=1, le=200),
    min_z_score: float = Query(5.0, ge=2.0),
    hcpcs_code: str = Query(None, description="Filter by HCPCS code"),
):
    """Statistical outliers — potential fraud indicators."""
    sql = """
        SELECT billing_npi, hcpcs_code, total_paid, total_claims,
               total_beneficiaries, z_score_paid, z_score_claims,
               code_avg_paid, code_avg_claims
        FROM anomaly_scores
        WHERE (ABS(z_score_paid) >= ? OR ABS(z_score_claims) >= ?)
    """
    params = [min_z_score, min_z_score]

    if hcpcs_code:
        sql += " AND hcpcs_code = ?"
        params.append(hcpcs_code)

    sql += " ORDER BY z_score_paid DESC LIMIT ?"
    params.append(limit)

    results = query(sql, params)
    results = enrich_providers(results)
    results = enrich_codes(results)
    return results


@app.get("/api/code/{code}")
def get_code_detail(code: str):
    """Detailed view for a specific HCPCS code."""
    summary = query(
        "SELECT * FROM code_summary WHERE hcpcs_code = ?", [code]
    )
    if not summary:
        raise HTTPException(status_code=404, detail="HCPCS code not found")

    description = get_hcpcs_description(code)

    # Monthly trend for this code
    trend = query("""
        SELECT claim_month, COUNT(DISTINCT billing_npi) AS providers,
               SUM(total_claims) AS total_claims, SUM(total_paid) AS total_paid,
               SUM(beneficiaries) AS beneficiaries
        FROM claims
        WHERE hcpcs_code = ?
        GROUP BY claim_month
        ORDER BY claim_month
    """, [code])
    for t in trend:
        t["claim_month"] = str(t["claim_month"])

    # Top providers for this code
    top_providers = query("""
        SELECT billing_npi, SUM(total_claims) AS total_claims,
               SUM(total_paid) AS total_paid, SUM(beneficiaries) AS beneficiaries
        FROM claims
        WHERE hcpcs_code = ?
        GROUP BY billing_npi
        ORDER BY total_paid DESC
        LIMIT 20
    """, [code])
    top_providers = enrich_providers(top_providers)

    return {
        "code": {**summary[0], "description": description},
        "trend": trend,
        "top_providers": top_providers,
    }


# ─── AI Chat Endpoint ──────────────────────────────────────────────

@app.post("/api/chat", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest):
    """AI-powered natural language data query."""
    result = await ai_chat.chat(request.message, request.history)
    return ChatResponse(**result)


# ─── Health Check ───────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"status": "ok", "service": "Medicaid Data Explorer"}
