"""
AI Chat Engine — Anthropic Claude integration for natural language queries.
Translates user questions into DuckDB SQL and returns formatted results.
"""

import os
import json
import logging
import anthropic
from . import db

logger = logging.getLogger(__name__)

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")

SYSTEM_PROMPT = """You are an expert Medicaid data analyst with access to the HHS Medicaid Provider Spending database.
This is the largest Medicaid dataset in department history, containing aggregated provider-level claims data from January 2018 to December 2024.

## DATABASE SCHEMA

You have access to these DuckDB tables:

### claims (main table — ~100M+ rows)
| Column | Type | Description |
|--------|------|-------------|
| billing_npi | VARCHAR | NPI of the billing provider |
| servicing_npi | VARCHAR | NPI of the servicing provider |
| hcpcs_code | VARCHAR | Healthcare Common Procedure Coding System code |
| claim_month | DATE | Month of aggregation (YYYY-MM-01) |
| beneficiaries | INTEGER | Unique beneficiaries served |
| total_claims | INTEGER | Number of claims submitted |
| total_paid | DOUBLE | Total Medicaid payment in USD |

### provider_summary (pre-aggregated by billing NPI)
| Column | Type | Description |
|--------|------|-------------|
| billing_npi | VARCHAR | Provider NPI |
| record_count | BIGINT | Number of claim records |
| total_claims | BIGINT | Total claims |
| total_paid | DOUBLE | Total payments |
| total_beneficiaries | BIGINT | Total unique beneficiaries |
| unique_codes | BIGINT | Number of distinct HCPCS codes billed |
| first_month | DATE | First month with claims |
| last_month | DATE | Last month with claims |
| active_months | BIGINT | Number of active months |

### code_summary (pre-aggregated by HCPCS code)
| Column | Type | Description |
|--------|------|-------------|
| hcpcs_code | VARCHAR | HCPCS code |
| provider_count | BIGINT | Number of providers billing this code |
| total_claims | BIGINT | Total claims |
| total_paid | DOUBLE | Total payments |
| total_beneficiaries | BIGINT | Total beneficiaries |
| avg_paid_per_claim | DOUBLE | Average payment per claim |

### monthly_trends (pre-aggregated by month)
| Column | Type | Description |
|--------|------|-------------|
| claim_month | DATE | Month |
| active_providers | BIGINT | Active providers |
| total_claims | BIGINT | Total claims |
| total_paid | DOUBLE | Total payments |
| total_beneficiaries | BIGINT | Total beneficiaries |

### anomaly_scores (pre-computed statistical outliers)
| Column | Type | Description |
|--------|------|-------------|
| billing_npi | VARCHAR | Provider NPI |
| hcpcs_code | VARCHAR | HCPCS code |
| total_paid | DOUBLE | Provider's total for this code |
| total_claims | BIGINT | Provider's total claims for this code |
| total_beneficiaries | BIGINT | Total beneficiaries |
| z_score_paid | DOUBLE | Z-score of payment vs peers |
| z_score_claims | DOUBLE | Z-score of claims vs peers |
| code_avg_paid | DOUBLE | Average payment for this code across all providers |
| code_avg_claims | DOUBLE | Average claims for this code across all providers |

## IMPORTANT RULES
1. ALWAYS use DuckDB SQL syntax.
2. ONLY generate SELECT statements. Never INSERT, UPDATE, DELETE, DROP, or ALTER.
3. Use the pre-aggregated tables (provider_summary, code_summary, monthly_trends, anomaly_scores) when possible for performance.
4. Only query the main `claims` table when you need granular month-level or cross-dimensional data.
5. ALWAYS LIMIT results to at most 100 rows unless the user explicitly requests more.
6. Format currency values to 2 decimal places.
7. When looking for fraud or anomalies, use the anomaly_scores table and look for high z_scores (>3 is suspicious, >5 is highly suspicious).
8. Common HCPCS codes for autism services: 97153 (ABA therapy), 97151 (behavior assessment), 97155 (adaptive behavior treatment by protocol modification).

## RESPONSE FORMAT
You must respond with a JSON object containing:
{
  "thinking": "Brief explanation of your analytical approach",
  "sql": "Your DuckDB SQL query",
  "visualization": "table" | "line_chart" | "bar_chart" | "number" | "none",
  "chart_config": {"x": "column_name", "y": "column_name", "title": "Chart Title"},
  "narrative": "A brief, insightful narrative about what the results mean"
}

If the user asks a question that doesn't require SQL, set sql to null and provide a narrative-only response.
"""


def get_client() -> anthropic.Anthropic:
    """Get Anthropic client."""
    if not ANTHROPIC_API_KEY:
        raise ValueError("ANTHROPIC_API_KEY not set. Please configure it in your .env file.")
    return anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)


async def chat(message: str, history: list[dict] = None) -> dict:
    """Process a natural language query and return results."""
    client = get_client()

    # Build message history
    messages = []
    if history:
        for h in history[-10:]:  # Keep last 10 messages for context
            messages.append({"role": h["role"], "content": h["content"]})
    messages.append({"role": "user", "content": message})

    try:
        # Step 1: Get SQL from Claude
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2048,
            system=SYSTEM_PROMPT,
            messages=messages
        )

        response_text = response.content[0].text

        # Try to parse JSON response
        try:
            # Handle markdown code blocks
            if "```json" in response_text:
                json_str = response_text.split("```json")[1].split("```")[0].strip()
            elif "```" in response_text:
                json_str = response_text.split("```")[1].split("```")[0].strip()
            else:
                json_str = response_text.strip()

            parsed = json.loads(json_str)
        except (json.JSONDecodeError, IndexError):
            # Fallback: return narrative response
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
            # Safety check — only allow SELECT
            sql_upper = sql.strip().upper()
            if not sql_upper.startswith("SELECT") and not sql_upper.startswith("WITH"):
                error = "Only SELECT queries are allowed."
                sql = None
            else:
                # Block dangerous keywords
                dangerous = ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE", "TRUNCATE", "EXEC"]
                for kw in dangerous:
                    if f" {kw} " in f" {sql_upper} " or sql_upper.startswith(kw):
                        error = f"Dangerous keyword '{kw}' detected. Only read-only queries allowed."
                        sql = None
                        break

            if sql and not error:
                try:
                    results = db.query(sql)
                    # Cap results for safety
                    if len(results) > 500:
                        results = results[:500]
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
