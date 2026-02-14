"""
Batch NPI → State/City geo-enrichment.

Resolves all 617K provider NPIs from provider_summary against the
NPPES NPI Registry API, writing results to a 'provider_geo' table
in DuckDB. Creates a 'state_summary' aggregate table after completion.

Usage:  python -m backend.geo_backfill          (full run)
        python -m backend.geo_backfill --limit 1000  (test with 1K NPIs)
"""

import asyncio
import aiohttp
import duckdb
import os
import sys
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
CONCURRENCY = 20        # parallel requests
BATCH_SAVE = 500        # flush to DB every N results
REQUEST_TIMEOUT = 10    # seconds per request
MAX_RETRIES = 3


def _ensure_table(con):
    """Create provider_geo table if it doesn't exist."""
    con.execute("""
        CREATE TABLE IF NOT EXISTS provider_geo (
            npi           VARCHAR PRIMARY KEY,
            name          VARCHAR,
            provider_type VARCHAR,
            specialty     VARCHAR,
            state         VARCHAR,
            city          VARCHAR
        )
    """)


def _get_pending_npis(con, limit=None):
    """Get NPIs from provider_summary not yet in provider_geo."""
    sql = """
        SELECT ps.billing_npi
        FROM provider_summary ps
        LEFT JOIN provider_geo pg ON ps.billing_npi = pg.npi
        WHERE pg.npi IS NULL
    """
    if limit:
        sql += f" LIMIT {limit}"
    return [row[0] for row in con.execute(sql).fetchall()]


def _parse_npi_result(npi, data):
    """Parse NPPES API response into a flat dict."""
    results = data.get("results", [])
    if not results:
        return {"npi": npi, "name": "Unknown", "provider_type": "",
                "specialty": "", "state": "", "city": ""}

    result = results[0]
    basic = result.get("basic", {})

    # Name
    enumeration_type = basic.get("enumeration_type", "")
    if enumeration_type == "NPI-2":
        name = basic.get("organization_name", "Unknown Org")
        provider_type = "Organization"
    else:
        first = basic.get("first_name", "")
        last = basic.get("last_name", "")
        name = f"{first} {last}".strip() or "Unknown Provider"
        provider_type = "Individual"

    # Specialty
    taxonomies = result.get("taxonomies", [])
    specialty = ""
    if taxonomies:
        primary = next((t for t in taxonomies if t.get("primary")), taxonomies[0])
        specialty = primary.get("desc", "")

    # Address → state/city
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
    """Fetch a single NPI from the registry, with retries."""
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
                    if resp.status == 429:  # rate-limited
                        await asyncio.sleep(2 ** attempt)
                        continue
                    # Other error — return unknown
                    return _parse_npi_result(npi, {})
            except Exception:
                if attempt < MAX_RETRIES - 1:
                    await asyncio.sleep(1)
        return _parse_npi_result(npi, {})


def _flush_batch(con, batch):
    """Write a batch of results to provider_geo."""
    if not batch:
        return
    con.executemany(
        """INSERT OR REPLACE INTO provider_geo (npi, name, provider_type, specialty, state, city)
           VALUES (?, ?, ?, ?, ?, ?)""",
        [(r["npi"], r["name"], r["provider_type"], r["specialty"],
          r["state"], r["city"]) for r in batch],
    )


def create_state_summary(con):
    """Build state_summary aggregate table from provider_geo + provider_summary."""
    logger.info("Creating state_summary table...")
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
    # Show top 5
    top = con.execute(
        "SELECT state, providers, total_paid FROM state_summary LIMIT 5"
    ).fetchall()
    for s, p, t in top:
        logger.info("  %s — %s providers, $%s", s, f"{p:,}", f"{t:,.0f}")


async def run(limit=None):
    con = duckdb.connect(DB_PATH, read_only=False)
    _ensure_table(con)

    npis = _get_pending_npis(con, limit)
    total = len(npis)
    if total == 0:
        logger.info("All NPIs already resolved! Rebuilding state_summary...")
        create_state_summary(con)
        con.close()
        return

    logger.info("Resolving %s NPIs (concurrency=%d)...", f"{total:,}", CONCURRENCY)

    semaphore = asyncio.Semaphore(CONCURRENCY)
    done = 0
    batch = []
    t0 = time.time()

    async with aiohttp.ClientSession() as session:
        # Process in chunks of 5000 to avoid creating too many coroutines
        for chunk_start in range(0, total, 5000):
            chunk = npis[chunk_start : chunk_start + 5000]
            tasks = [_fetch_npi(session, npi, semaphore) for npi in chunk]

            for coro in asyncio.as_completed(tasks):
                result = await coro
                batch.append(result)
                done += 1

                if len(batch) >= BATCH_SAVE:
                    _flush_batch(con, batch)
                    batch = []

                if done % 1000 == 0:
                    elapsed = time.time() - t0
                    rate = done / elapsed if elapsed > 0 else 0
                    eta_min = (total - done) / rate / 60 if rate > 0 else 0
                    logger.info(
                        "  %s / %s  (%.0f/s,  ETA %.0f min)",
                        f"{done:,}", f"{total:,}", rate, eta_min,
                    )

    # Flush remaining
    _flush_batch(con, batch)
    elapsed = time.time() - t0
    logger.info("Done! %s NPIs in %.1f min (%.0f/s)", f"{done:,}", elapsed / 60, done / elapsed)

    # Build state aggregate
    create_state_summary(con)
    con.close()


def main():
    parser = argparse.ArgumentParser(description="NPI Geo Backfill")
    parser.add_argument("--limit", type=int, default=None,
                        help="Limit number of NPIs to resolve (for testing)")
    args = parser.parse_args()
    asyncio.run(run(limit=args.limit))


if __name__ == "__main__":
    main()
