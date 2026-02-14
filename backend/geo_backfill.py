"""
Batch NPI → State/City geo-enrichment.

Resolves all 617K provider NPIs from provider_summary against the
NPPES NPI Registry API, writing results to CSV first, then bulk-loading
into DuckDB provider_geo table. Zero lock contention with the API server.

Usage:  python -m backend.geo_backfill          (full run)
        python -m backend.geo_backfill --limit 1000  (test with 1K NPIs)
"""

import asyncio
import aiohttp
import csv
import duckdb
import os
import time
import logging
import argparse

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

DB_PATH = os.getenv("DATABASE_PATH", "data/medicaid.duckdb")
NPI_API = "https://npiregistry.cms.hhs.gov/api/"
CSV_STAGING = os.getenv("GEO_CSV_PATH", "data/provider_geo_staging.csv")
CONCURRENCY = 20        # parallel HTTP requests (keep sane to avoid NPPES silently dropping responses)
REQUEST_TIMEOUT = 10    # seconds per request
MAX_RETRIES = 3


def _get_pending_npis(limit=None):
    """Get NPIs from provider_summary not yet in provider_geo."""
    con = duckdb.connect(DB_PATH, read_only=True)
    try:
        # Check if provider_geo exists
        tables = [r[0] for r in con.execute(
            "SELECT table_name FROM information_schema.tables WHERE table_name='provider_geo'"
        ).fetchall()]
        if tables:
            sql = """
                SELECT ps.billing_npi
                FROM provider_summary ps
                LEFT JOIN provider_geo pg ON ps.billing_npi = pg.npi
                WHERE pg.npi IS NULL
            """
        else:
            sql = "SELECT billing_npi FROM provider_summary"
        if limit:
            sql += f" LIMIT {limit}"
        return [row[0] for row in con.execute(sql).fetchall()]
    finally:
        con.close()


def _parse_npi_result(npi, data):
    """Parse NPPES API response into a flat dict."""
    results = data.get("results", [])
    if not results:
        return {"npi": npi, "name": "Unknown", "provider_type": "",
                "specialty": "", "state": "", "city": ""}

    result = results[0]
    basic = result.get("basic", {})

    enumeration_type = basic.get("enumeration_type", "")
    if enumeration_type == "NPI-2":
        name = basic.get("organization_name", "Unknown Org")
        provider_type = "Organization"
    else:
        first = basic.get("first_name", "")
        last = basic.get("last_name", "")
        name = f"{first} {last}".strip() or "Unknown Provider"
        provider_type = "Individual"

    taxonomies = result.get("taxonomies", [])
    specialty = ""
    if taxonomies:
        primary = next((t for t in taxonomies if t.get("primary")), taxonomies[0])
        specialty = primary.get("desc", "")

    addresses = result.get("addresses", [])
    state, city = "", ""
    if addresses:
        practice = next(
            (a for a in addresses if a.get("address_purpose") == "LOCATION"),
            addresses[0],
        )
        state = practice.get("state", "")
        city = practice.get("city", "")

    return {
        "npi": npi, "name": name, "provider_type": provider_type,
        "specialty": specialty, "state": state, "city": city,
    }


async def _fetch_npi(session, npi, semaphore):
    """Fetch a single NPI with retries."""
    async with semaphore:
        for attempt in range(MAX_RETRIES):
            try:
                async with session.get(
                    NPI_API,
                    params={"version": "2.1", "number": npi},
                    timeout=aiohttp.ClientTimeout(total=REQUEST_TIMEOUT),
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json(content_type=None)
                        return _parse_npi_result(npi, data)
                    if resp.status == 429:
                        await asyncio.sleep(2 ** attempt)
                        continue
                    return _parse_npi_result(npi, {})
            except Exception:
                if attempt < MAX_RETRIES - 1:
                    await asyncio.sleep(1)
        return _parse_npi_result(npi, {})


def _bulk_load_csv():
    """Bulk-load the staged CSV into DuckDB provider_geo (single fast op)."""
    if not os.path.exists(CSV_STAGING):
        logger.error("CSV staging file not found: %s", CSV_STAGING)
        return
    logger.info("Bulk-loading CSV into DuckDB...")
    con = duckdb.connect(DB_PATH, read_only=False)
    try:
        con.execute("""
            CREATE TABLE IF NOT EXISTS provider_geo (
                npi VARCHAR PRIMARY KEY,
                name VARCHAR,
                provider_type VARCHAR,
                specialty VARCHAR,
                state VARCHAR,
                city VARCHAR
            )
        """)
        con.execute("""
            INSERT OR REPLACE INTO provider_geo
            SELECT * FROM read_csv_auto(?, header=true)
        """, [CSV_STAGING])
        total = con.execute("SELECT COUNT(*) FROM provider_geo").fetchone()[0]
        logger.info("provider_geo now has %s rows", f"{total:,}")
    finally:
        con.close()


def create_state_summary():
    """Build state_summary aggregate table."""
    logger.info("Creating state_summary table...")
    con = duckdb.connect(DB_PATH, read_only=False)
    try:
        con.execute("DROP TABLE IF EXISTS state_summary")
        con.execute("""
            CREATE TABLE state_summary AS
            SELECT
                pg.state,
                COUNT(DISTINCT ps.billing_npi) AS providers,
                SUM(ps.total_claims)           AS total_claims,
                SUM(ps.total_paid)             AS total_paid,
                SUM(ps.total_beneficiaries)    AS total_beneficiaries
            FROM provider_summary ps
            JOIN provider_geo pg ON ps.billing_npi = pg.npi
            WHERE pg.state != '' AND pg.state IS NOT NULL
            GROUP BY pg.state
            ORDER BY total_paid DESC
        """)
        rows = con.execute("SELECT COUNT(*) FROM state_summary").fetchone()[0]
        logger.info("state_summary created with %d states", rows)
        top = con.execute(
            "SELECT state, providers, total_paid FROM state_summary LIMIT 5"
        ).fetchall()
        for s, p, t in top:
            logger.info("  %s — %s providers, $%s", s, f"{p:,}", f"{t:,.0f}")
    finally:
        con.close()


async def run(limit=None):
    npis = _get_pending_npis(limit)
    total = len(npis)

    if total == 0:
        logger.info("All NPIs already resolved! Rebuilding state_summary...")
        create_state_summary()
        return

    logger.info("Resolving %s NPIs → CSV (concurrency=%d)...", f"{total:,}", CONCURRENCY)

    # Write results to CSV (no DuckDB lock needed)
    semaphore = asyncio.Semaphore(CONCURRENCY)
    done = 0
    t0 = time.time()

    with open(CSV_STAGING, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["npi", "name", "provider_type", "specialty", "state", "city"])
        writer.writeheader()

        async with aiohttp.ClientSession() as session:
            for chunk_start in range(0, total, 5000):
                chunk = npis[chunk_start : chunk_start + 5000]
                tasks = [_fetch_npi(session, npi, semaphore) for npi in chunk]

                for coro in asyncio.as_completed(tasks):
                    result = await coro
                    writer.writerow(result)
                    done += 1

                    if done % 5000 == 0:
                        f.flush()
                        elapsed = time.time() - t0
                        rate = done / elapsed if elapsed > 0 else 0
                        eta_min = (total - done) / rate / 60 if rate > 0 else 0
                        logger.info(
                            "  %s / %s  (%.0f/s,  ETA %.0f min)",
                            f"{done:,}", f"{total:,}", rate, eta_min,
                        )

    elapsed = time.time() - t0
    logger.info("CSV done! %s NPIs in %.1f min (%.0f/s)", f"{done:,}", elapsed / 60, done / elapsed)

    # Single bulk-load into DuckDB (brief lock)
    _bulk_load_csv()

    # Build state aggregate
    create_state_summary()

    # Clean up staging CSV
    try:
        os.remove(CSV_STAGING)
        logger.info("Cleaned up staging CSV")
    except OSError:
        pass


def main():
    parser = argparse.ArgumentParser(description="NPI Geo Backfill")
    parser.add_argument("--limit", type=int, default=None,
                        help="Limit number of NPIs to resolve (for testing)")
    args = parser.parse_args()
    asyncio.run(run(limit=args.limit))


if __name__ == "__main__":
    main()
