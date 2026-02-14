"""
DuckDB Database Engine for Medicaid Provider Spending Data.
Handles data loading, indexing, aggregate views, and query execution.
"""

import duckdb
import os
import logging

logger = logging.getLogger(__name__)

DB_PATH = os.getenv("DATABASE_PATH", "data/medicaid.duckdb")
CSV_PATH = os.getenv("CSV_PATH", "data/medicaid-provider-spending.csv")


def get_connection(read_only: bool = True) -> duckdb.DuckDBPyConnection:
    """Get a DuckDB connection."""
    return duckdb.connect(DB_PATH, read_only=read_only)


def initialize_database():
    """Load CSV into DuckDB and create optimized tables/views."""
    if os.path.exists(DB_PATH):
        logger.info("Database already exists at %s", DB_PATH)
        return

    logger.info("Initializing database from CSV: %s", CSV_PATH)
    if not os.path.exists(CSV_PATH):
        raise FileNotFoundError(
            f"CSV not found at {CSV_PATH}. Download it first."
        )

    con = duckdb.connect(DB_PATH, read_only=False)

    # Load raw data
    logger.info("Loading CSV into DuckDB (this may take a few minutes)...")
    con.execute("""
        CREATE TABLE claims AS
        SELECT
            BILLING_PROVIDER_NPI_NUM AS billing_npi,
            SERVICING_PROVIDER_NPI_NUM AS servicing_npi,
            HCPCS_CODE AS hcpcs_code,
            CAST(CLAIM_FROM_MONTH || '-01' AS DATE) AS claim_month,
            CAST(TOTAL_UNIQUE_BENEFICIARIES AS INTEGER) AS beneficiaries,
            CAST(TOTAL_CLAIMS AS INTEGER) AS total_claims,
            CAST(TOTAL_PAID AS DOUBLE) AS total_paid
        FROM read_csv_auto(?, header=true, sample_size=100000)
    """, [CSV_PATH])

    row_count = con.execute("SELECT COUNT(*) FROM claims").fetchone()[0]
    logger.info("Loaded %s rows into claims table", f"{row_count:,}")

    # Pre-computed aggregate: Provider summary
    logger.info("Creating aggregate tables...")
    con.execute("""
        CREATE TABLE provider_summary AS
        SELECT
            billing_npi,
            COUNT(*) AS record_count,
            SUM(total_claims) AS total_claims,
            SUM(total_paid) AS total_paid,
            SUM(beneficiaries) AS total_beneficiaries,
            COUNT(DISTINCT hcpcs_code) AS unique_codes,
            MIN(claim_month) AS first_month,
            MAX(claim_month) AS last_month,
            COUNT(DISTINCT claim_month) AS active_months
        FROM claims
        GROUP BY billing_npi
    """)

    # Pre-computed aggregate: HCPCS code summary
    con.execute("""
        CREATE TABLE code_summary AS
        SELECT
            hcpcs_code,
            COUNT(DISTINCT billing_npi) AS provider_count,
            SUM(total_claims) AS total_claims,
            SUM(total_paid) AS total_paid,
            SUM(beneficiaries) AS total_beneficiaries,
            AVG(total_paid / NULLIF(total_claims, 0)) AS avg_paid_per_claim
        FROM claims
        GROUP BY hcpcs_code
    """)

    # Pre-computed aggregate: Monthly spending trends
    con.execute("""
        CREATE TABLE monthly_trends AS
        SELECT
            claim_month,
            COUNT(DISTINCT billing_npi) AS active_providers,
            SUM(total_claims) AS total_claims,
            SUM(total_paid) AS total_paid,
            SUM(beneficiaries) AS total_beneficiaries
        FROM claims
        GROUP BY claim_month
        ORDER BY claim_month
    """)

    # Anomaly scoring: Z-score per provider within each HCPCS code
    con.execute("""
        CREATE TABLE anomaly_scores AS
        WITH code_stats AS (
            SELECT
                hcpcs_code,
                AVG(total_paid) AS avg_paid,
                STDDEV_POP(total_paid) AS std_paid,
                AVG(total_claims) AS avg_claims,
                STDDEV_POP(total_claims) AS std_claims
            FROM (
                SELECT billing_npi, hcpcs_code,
                       SUM(total_paid) AS total_paid,
                       SUM(total_claims) AS total_claims
                FROM claims
                GROUP BY billing_npi, hcpcs_code
            ) provider_code
            GROUP BY hcpcs_code
            HAVING COUNT(*) >= 10
        ),
        provider_totals AS (
            SELECT billing_npi, hcpcs_code,
                   SUM(total_paid) AS total_paid,
                   SUM(total_claims) AS total_claims,
                   SUM(beneficiaries) AS total_beneficiaries
            FROM claims
            GROUP BY billing_npi, hcpcs_code
        )
        SELECT
            pt.billing_npi,
            pt.hcpcs_code,
            pt.total_paid,
            pt.total_claims,
            pt.total_beneficiaries,
            CASE WHEN cs.std_paid > 0
                 THEN (pt.total_paid - cs.avg_paid) / cs.std_paid
                 ELSE 0 END AS z_score_paid,
            CASE WHEN cs.std_claims > 0
                 THEN (pt.total_claims - cs.avg_claims) / cs.std_claims
                 ELSE 0 END AS z_score_claims,
            cs.avg_paid AS code_avg_paid,
            cs.avg_claims AS code_avg_claims
        FROM provider_totals pt
        JOIN code_stats cs ON pt.hcpcs_code = cs.hcpcs_code
        WHERE ABS((pt.total_paid - cs.avg_paid) / NULLIF(cs.std_paid, 0)) > 3
           OR ABS((pt.total_claims - cs.avg_claims) / NULLIF(cs.std_claims, 0)) > 3
    """)

    # Global stats
    con.execute("""
        CREATE TABLE global_stats AS
        SELECT
            COUNT(DISTINCT billing_npi) AS total_providers,
            COUNT(DISTINCT hcpcs_code) AS total_codes,
            SUM(total_claims) AS total_claims,
            SUM(total_paid) AS total_paid,
            SUM(beneficiaries) AS total_beneficiaries,
            MIN(claim_month) AS date_from,
            MAX(claim_month) AS date_to,
            COUNT(*) AS total_rows
        FROM claims
    """)

    con.close()
    logger.info("Database initialization complete!")


def query(sql: str, params: list = None) -> list[dict]:
    """Execute a read-only query and return results as list of dicts."""
    con = get_connection(read_only=True)
    try:
        if params:
            result = con.execute(sql, params)
        else:
            result = con.execute(sql)
        columns = [desc[0] for desc in result.description]
        rows = result.fetchall()
        return [dict(zip(columns, row)) for row in rows]
    finally:
        con.close()


def query_df(sql: str, params: list = None):
    """Execute a query and return a DuckDB relation for further processing."""
    con = get_connection(read_only=True)
    try:
        if params:
            return con.execute(sql, params).fetchdf()
        return con.execute(sql).fetchdf()
    finally:
        con.close()
