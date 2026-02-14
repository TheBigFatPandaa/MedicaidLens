"""
AI Chat Engine — Anthropic Claude integration for natural language queries.
Translates user questions into DuckDB SQL, executes them, enriches results
with provider names and HCPCS descriptions, and returns formatted responses.
"""

import os
import json
import logging
import anthropic
from . import db
from .enrichment import enrich_providers, enrich_codes

logger = logging.getLogger(__name__)

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")

SYSTEM_PROMPT = """You are MedicaidLens AI — an expert Medicaid data analyst powering a DOGE × HHS transparency tool.
You have access to the largest Medicaid provider spending database in HHS history: 227 million rows, 617K+ providers, $1.09 trillion in payments, January 2018 – December 2024.

## DATABASE SCHEMA

### ⚡ PRE-AGGREGATED TABLES (USE THESE FIRST — instant results)

**provider_summary** — one row per billing NPI (617K rows)
| Column | Type | Description |
|--------|------|-------------|
| billing_npi | VARCHAR | Provider NPI |
| record_count | BIGINT | Number of claim line items |
| total_claims | BIGINT | Total claims submitted |
| total_paid | DOUBLE | Total Medicaid payments ($) |
| total_beneficiaries | BIGINT | Total unique beneficiaries |
| unique_codes | BIGINT | Distinct HCPCS codes billed |
| first_month | DATE | First active month |
| last_month | DATE | Last active month |
| active_months | BIGINT | Number of active months |

**code_summary** — one row per HCPCS code (~11K rows)
| Column | Type | Description |
|--------|------|-------------|
| hcpcs_code | VARCHAR | HCPCS code |
| provider_count | BIGINT | Providers billing this code |
| total_claims | BIGINT | Total claims |
| total_paid | DOUBLE | Total payments ($) |
| total_beneficiaries | BIGINT | Total beneficiaries |
| avg_paid_per_claim | DOUBLE | Average payment per claim |

**monthly_trends** — one row per month (~84 rows)
| Column | Type | Description |
|--------|------|-------------|
| claim_month | DATE | Month (YYYY-MM-01) |
| active_providers | BIGINT | Active providers that month |
| total_claims | BIGINT | Total claims |
| total_paid | DOUBLE | Total payments ($) |
| total_beneficiaries | BIGINT | Total beneficiaries |

**anomaly_scores** — statistical outliers (pre-computed)
| Column | Type | Description |
|--------|------|-------------|
| billing_npi | VARCHAR | Provider NPI |
| hcpcs_code | VARCHAR | HCPCS code |
| total_paid | DOUBLE | Provider's total for this code |
| total_claims | BIGINT | Claims for this code |
| total_beneficiaries | BIGINT | Beneficiaries |
| z_score_paid | DOUBLE | Z-score vs peers (>3 suspicious, >5 highly suspicious) |
| z_score_claims | DOUBLE | Z-score of claims vs peers |
| code_avg_paid | DOUBLE | Peer average payment |
| code_avg_claims | DOUBLE | Peer average claims |

**provider_geo** — NPI → state/city lookup (ONLY for geographic filtering)
| Column | Type | Description |
|--------|------|-------------|
| npi | VARCHAR | Provider NPI (join to billing_npi) |
| state | VARCHAR | 2-letter US state code (e.g. 'CA', 'TX', 'NY') |
| city | VARCHAR | City name |

⚠️ **NEVER SELECT name, specialty, or provider_type from provider_geo.** The system AUTOMATICALLY enriches those from the NPI registry when billing_npi is in results. Only use provider_geo for WHERE/JOIN filtering by state or city.

**state_summary** — one row per US state (~55 rows)
| Column | Type | Description |
|--------|------|-------------|
| state | VARCHAR | 2-letter state code |
| providers | BIGINT | Number of providers in state |
| total_claims | BIGINT | Total claims |
| total_paid | DOUBLE | Total payments ($) |
| total_beneficiaries | BIGINT | Total beneficiaries |

### 🐢 RAW TABLE (use ONLY when you need month-level or cross-dimensional granularity)

**claims** — 227M+ rows, SLOW for full scans
| Column | Type | Description |
|--------|------|-------------|
| billing_npi | VARCHAR | Billing provider NPI |
| servicing_npi | VARCHAR | Servicing provider NPI |
| hcpcs_code | VARCHAR | HCPCS code |
| claim_month | DATE | Month (YYYY-MM-01) |
| beneficiaries | INTEGER | Unique beneficiaries |
| total_claims | INTEGER | Claims submitted |
| total_paid | DOUBLE | Medicaid payment ($) |

## CRITICAL RULES
1. **ALWAYS prefer pre-aggregated tables.** Use provider_summary for provider questions, code_summary for HCPCS questions, monthly_trends for time series, anomaly_scores for fraud/outliers, state_summary for state-level questions.
2. ONLY query `claims` when you absolutely need month-level breakdown per provider or per code, or cross-joins between providers and codes.
3. Use DuckDB SQL syntax.
4. ONLY SELECT statements. Never INSERT, UPDATE, DELETE, DROP, ALTER, CREATE.
5. ALWAYS LIMIT to 25 rows unless the user requests more. Keep results concise.
6. **DO NOT try to SELECT provider names, specialties, cities, or states from any table.** The system AUTOMATICALLY enriches provider info when billing_npi is in results. Just include billing_npi and the system handles the rest. The ONLY use of provider_geo is for WHERE clauses to filter by state/city (e.g. `WHERE pg.state = 'CA'`).
7. When showing HCPCS codes, ALWAYS include hcpcs_code as a column — the system will automatically add procedure descriptions.
8. For year-specific totals, use monthly_trends with EXTRACT(YEAR FROM claim_month) = YYYY.
9. Common autism codes: 97153 (ABA therapy), 97151 (behavior assessment), 97155 (protocol modification).

## RESPONSE FORMAT
Respond with ONLY a JSON object (no markdown fences):
{
  "thinking": "Brief explanation of your analytical approach (1-2 sentences)",
  "sql": "Your DuckDB SQL query (or null if no SQL needed)",
  "visualization": "table" | "line_chart" | "bar_chart" | "number" | "none",
  "chart_config": {"x": "column_name", "y": "column_name", "title": "Chart Title"},
  "narrative": "Rich, insightful analysis. Use **bold** for key numbers. Highlight patterns, anomalies, or policy implications. Write 2-4 sentences minimum. This is what makes you valuable — raw data is boring, insight is gold."
}

## NARRATIVE GUIDELINES
- Always contextualize numbers: "$450M" means nothing; "$450M — 41% of all Medicaid spending" tells a story
- Compare to averages, highlight outliers, note trends
- Use **bold** for key figures and findings
- If fraud/anomaly related, explain what the z-scores mean in plain English
- Be specific and authoritative — you are the HHS data expert
"""


def get_client() -> anthropic.Anthropic:
    """Get Anthropic client."""
    if not ANTHROPIC_API_KEY:
        raise ValueError("ANTHROPIC_API_KEY not set. Please configure it in your .env file.")
    return anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)


def _detect_and_enrich(results: list[dict]) -> list[dict]:
    """Auto-detect NPI and HCPCS columns in results and enrich them."""
    if not results or len(results) == 0:
        return results

    keys = set(results[0].keys())

    # Enrich NPI columns
    npi_fields = [k for k in keys if 'npi' in k.lower()]
    for npi_field in npi_fields:
        try:
            results = enrich_providers(results, npi_field=npi_field)
        except Exception as e:
            logger.warning("NPI enrichment failed for field %s: %s", npi_field, e)

    # Enrich HCPCS columns (only actual hcpcs columns, not score/avg columns)
    hcpcs_fields = [k for k in keys if 'hcpcs' in k.lower()]
    for code_field in hcpcs_fields:
        try:
            results = enrich_codes(results, code_field=code_field)
        except Exception as e:
            logger.warning("HCPCS enrichment failed for field %s: %s", code_field, e)

    # Post-enrichment cleanup: remove NULL geo alias columns that duplicate enriched columns
    if results:
        # These are common aliases the AI uses from provider_geo joins — if mostly NULL, drop them
        geo_aliases = {'provider', 'name', 'type', 'provider_name_1', 'npi_name'}
        enriched_keys = {'provider_name', 'provider_type', 'specialty', 'city', 'state'}
        has_enriched = bool(enriched_keys & set(results[0].keys()))

        if has_enriched:
            # Find columns that are all NULL/empty/dash and match geo alias patterns
            all_keys = list(results[0].keys())
            drop_keys = set()
            for k in all_keys:
                if k in geo_aliases or (k in enriched_keys and any(k2 in all_keys for k2 in geo_aliases)):
                    continue
                # Check if this looks like a geo-dup column with all NULL values
                if k.lower() in {'provider', 'name', 'type'} and all(
                    not row.get(k) or row.get(k) in (None, '', '—', 'Unknown')
                    for row in results
                ):
                    drop_keys.add(k)

            # Also drop any geo_aliases that are all NULL when we have enriched versions
            for alias in geo_aliases:
                if alias in all_keys and all(
                    not row.get(alias) or row.get(alias) in (None, '', '—', 'Unknown')
                    for row in results
                ):
                    drop_keys.add(alias)

            if drop_keys:
                results = [{k: v for k, v in row.items() if k not in drop_keys} for row in results]

    # Reorder columns to put names first
    if results:
        priority = ['provider_name', 'specialty', 'city', 'state', 'provider_type',
                     'description', 'billing_npi', 'hcpcs_code']
        all_keys = list(results[0].keys())
        ordered = [k for k in priority if k in all_keys]
        ordered += [k for k in all_keys if k not in ordered]
        results = [{k: row.get(k) for k in ordered} for row in results]

    return results


def _sanitize_sql(sql: str) -> str:
    """Remove provider_geo JOINs and related SELECTs from AI-generated SQL.
    The enrichment system handles provider info automatically."""
    import re
    if not sql or 'provider_geo' not in sql.lower():
        return sql

    # Remove JOIN ... provider_geo ... ON ... clauses
    sql = re.sub(
        r'\b(LEFT\s+|RIGHT\s+|INNER\s+|OUTER\s+|FULL\s+)?JOIN\s+provider_geo\s+\w+\s+ON\s+[^\n]+',
        '',
        sql,
        flags=re.IGNORECASE
    )

    # Remove SELECT columns that reference the provider_geo alias (e.g., pg.name, pg.state)
    # Find common aliases: pg, geo, g
    sql = re.sub(r',?\s*\bpg\.\w+(\s+AS\s+\w+)?', '', sql, flags=re.IGNORECASE)
    sql = re.sub(r',?\s*\bgeo\.\w+(\s+AS\s+\w+)?', '', sql, flags=re.IGNORECASE)

    # Clean up any resulting double commas or leading commas after SELECT
    sql = re.sub(r',\s*,', ',', sql)
    sql = re.sub(r'SELECT\s*,', 'SELECT ', sql, flags=re.IGNORECASE)

    return sql


async def chat(message: str, history: list[dict] = None) -> dict:
    """Process a natural language query and return enriched results."""
    client = get_client()

    # Build message history
    messages = []
    if history:
        for h in history[-6:]:  # Keep last 6 for context (less = faster)
            messages.append({"role": h["role"], "content": h["content"]})
    messages.append({"role": "user", "content": message})

    try:
        # Step 1: Get SQL from Claude
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1500,
            system=SYSTEM_PROMPT,
            messages=messages
        )

        response_text = response.content[0].text

        # Parse JSON response
        try:
            # Handle markdown code blocks if present
            if "```json" in response_text:
                json_str = response_text.split("```json")[1].split("```")[0].strip()
            elif "```" in response_text:
                json_str = response_text.split("```")[1].split("```")[0].strip()
            else:
                json_str = response_text.strip()

            parsed = json.loads(json_str)
        except (json.JSONDecodeError, IndexError):
            return {
                "thinking": "",
                "sql": None,
                "results": None,
                "visualization": "none",
                "chart_config": None,
                "narrative": response_text,
                "error": None
            }

        sql = parsed.get("sql")
        results = None
        error = None

        # Step 2: Execute SQL if present
        if sql:
            # Sanitize: strip provider_geo joins (enrichment handles this)
            sql = _sanitize_sql(sql)

            sql_upper = sql.strip().upper()
            if not sql_upper.startswith("SELECT") and not sql_upper.startswith("WITH"):
                error = "Only SELECT queries are allowed."
                sql = None
            else:
                dangerous = ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE", "TRUNCATE", "EXEC"]
                for kw in dangerous:
                    if f" {kw} " in f" {sql_upper} " or sql_upper.startswith(kw):
                        error = f"Dangerous keyword '{kw}' detected. Only read-only queries allowed."
                        sql = None
                        break

            if sql and not error:
                try:
                    results = db.query(sql)
                    if len(results) > 200:
                        results = results[:200]

                    # Step 3: Auto-enrich results with provider names and HCPCS descriptions
                    if results:
                        results = _detect_and_enrich(results)

                except Exception as e:
                    error = f"Query execution error: {str(e)}"
                    logger.error("SQL Error: %s | Query: %s", e, sql)

        return {
            "thinking": parsed.get("thinking", ""),
            "sql": sql,
            "results": results,
            "visualization": parsed.get("visualization", "table"),
            "chart_config": parsed.get("chart_config"),
            "narrative": parsed.get("narrative", ""),
            "error": error
        }

    except anthropic.APIError as e:
        logger.error("Anthropic API error: %s", e)
        return {
            "thinking": "",
            "sql": None,
            "results": None,
            "visualization": "none",
            "chart_config": None,
            "narrative": "",
            "error": f"AI service error: {str(e)}"
        }
    except Exception as e:
        logger.error("Chat error: %s", e)
        return {
            "thinking": "",
            "sql": None,
            "results": None,
            "visualization": "none",
            "chart_config": None,
            "narrative": "",
            "error": f"Unexpected error: {str(e)}"
        }
