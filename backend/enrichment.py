"""
NPI Registry and HCPCS Code enrichment.
Provides human-readable provider names and procedure descriptions.
"""

import httpx
import logging
from functools import lru_cache

logger = logging.getLogger(__name__)

NPI_REGISTRY_URL = "https://npiregistry.cms.hhs.gov/api/"

# Common HCPCS codes with descriptions (top ~100 Medicaid codes)
HCPCS_DESCRIPTIONS = {
    "99213": "Office visit, established patient (15 min)",
    "99214": "Office visit, established patient (25 min)",
    "99215": "Office visit, established patient (40 min)",
    "99211": "Office visit, established patient (5 min)",
    "99212": "Office visit, established patient (10 min)",
    "99203": "Office visit, new patient (30 min)",
    "99204": "Office visit, new patient (45 min)",
    "99205": "Office visit, new patient (60 min)",
    "99201": "Office visit, new patient (10 min)",
    "99202": "Office visit, new patient (20 min)",
    "90834": "Psychotherapy, 45 minutes",
    "90837": "Psychotherapy, 60 minutes",
    "90832": "Psychotherapy, 30 minutes",
    "90847": "Family psychotherapy with patient",
    "90853": "Group psychotherapy",
    "90791": "Psychiatric diagnostic evaluation",
    "90792": "Psychiatric diagnostic evaluation with medical services",
    "97153": "Adaptive behavior treatment (ABA therapy)",
    "97151": "Behavior identification assessment",
    "97155": "Adaptive behavior treatment modification",
    "97156": "Family adaptive behavior treatment guidance",
    "97154": "Group adaptive behavior treatment",
    "97530": "Therapeutic activities",
    "97110": "Therapeutic exercises",
    "97140": "Manual therapy techniques",
    "97116": "Gait training",
    "97161": "Physical therapy evaluation, low complexity",
    "97162": "Physical therapy evaluation, moderate complexity",
    "97163": "Physical therapy evaluation, high complexity",
    "92523": "Speech/language evaluation",
    "92507": "Speech therapy treatment",
    "92526": "Treatment of swallowing dysfunction",
    "96130": "Psychological testing evaluation",
    "96131": "Psychological testing evaluation, additional hour",
    "96136": "Psychological/neuropsychological testing",
    "96137": "Psychological/neuropsychological testing, additional 30 min",
    "99381": "Preventive visit, new patient, infant",
    "99382": "Preventive visit, new patient, age 1-4",
    "99383": "Preventive visit, new patient, age 5-11",
    "99384": "Preventive visit, new patient, age 12-17",
    "99385": "Preventive visit, new patient, age 18-39",
    "99391": "Preventive visit, established patient, infant",
    "99392": "Preventive visit, established patient, age 1-4",
    "99393": "Preventive visit, established patient, age 5-11",
    "99394": "Preventive visit, established patient, age 12-17",
    "99395": "Preventive visit, established patient, age 18-39",
    "T1017": "Targeted case management",
    "H0031": "Mental health assessment",
    "H0032": "Mental health service plan development",
    "H0036": "Community psychiatric supportive treatment",
    "H0004": "Behavioral health counseling, per 15 min",
    "H0005": "Alcohol/drug group counseling",
    "H2015": "Comprehensive community support services",
    "H2017": "Psychosocial rehabilitation services",
    "H2019": "Therapeutic behavioral services, per 15 min",
    "H2014": "Skills training, per 15 min",
    "T1019": "Personal care services, per 15 min",
    "T1020": "Personal care services, per diem",
    "S5125": "Attendant care services, per 15 min",
    "S5130": "Homemaker services, per 15 min",
    "S5150": "Unskilled respite care, per 15 min",
    "S5151": "Unskilled respite care, per diem",
    "T2003": "Non-emergency transportation, encounter",
    "A0080": "Non-emergency transportation, per mile",
    "E1390": "Oxygen concentrator",
    "A4253": "Blood glucose test strips",
    "J3490": "Unclassified drugs",
    "J1170": "Injection, hydromorphone, up to 4 mg",
    "J2270": "Injection, morphine sulfate, up to 10 mg",
    "J0585": "Injection, onabotulinumtoxinA, 1 unit",
    "J7030": "Infusion, normal saline, 1000 cc",
    "99221": "Initial hospital care, low severity",
    "99222": "Initial hospital care, moderate severity",
    "99223": "Initial hospital care, high severity",
    "99231": "Subsequent hospital care, low complexity",
    "99232": "Subsequent hospital care, moderate complexity",
    "99233": "Subsequent hospital care, high complexity",
    "99238": "Hospital discharge day",
    "99239": "Hospital discharge day, >30 min",
    "99281": "Emergency department visit, level 1",
    "99282": "Emergency department visit, level 2",
    "99283": "Emergency department visit, level 3",
    "99284": "Emergency department visit, level 4",
    "99285": "Emergency department visit, level 5",
    "D0120": "Periodic oral evaluation",
    "D0150": "Comprehensive oral evaluation",
    "D1110": "Prophylaxis - adult dental cleaning",
    "D1120": "Prophylaxis - child dental cleaning",
    "D0220": "Intraoral periapical radiographic image",
    "D0274": "Bitewings - four radiographic images",
    "D2140": "Amalgam - one surface, primary",
    "D2150": "Amalgam - two surfaces, primary",
    "D7140": "Extraction, erupted tooth",
}


@lru_cache(maxsize=5000)
def lookup_npi(npi: str) -> dict:
    """Look up provider info from the NPI Registry."""
    try:
        response = httpx.get(
            NPI_REGISTRY_URL,
            params={"number": npi, "version": "2.1"},
            timeout=5.0
        )
        data = response.json()
        if data.get("result_count", 0) > 0:
            result = data["results"][0]
            basic = result.get("basic", {})

            # Determine name
            if result.get("enumeration_type") == "NPI-2":
                name = basic.get("organization_name", "Unknown Organization")
                provider_type = "Organization"
            else:
                first = basic.get("first_name", "")
                last = basic.get("last_name", "")
                name = f"{first} {last}".strip() or "Unknown Provider"
                provider_type = "Individual"

            # Get taxonomy/specialty
            taxonomies = result.get("taxonomies", [])
            specialty = ""
            if taxonomies:
                primary = next(
                    (t for t in taxonomies if t.get("primary")),
                    taxonomies[0]
                )
                specialty = primary.get("desc", "")

            # Get address for state
            addresses = result.get("addresses", [])
            state = ""
            city = ""
            if addresses:
                practice = next(
                    (a for a in addresses if a.get("address_purpose") == "LOCATION"),
                    addresses[0]
                )
                state = practice.get("state", "")
                city = practice.get("city", "")

            return {
                "npi": npi,
                "name": name,
                "provider_type": provider_type,
                "specialty": specialty,
                "state": state,
                "city": city,
            }
        return {"npi": npi, "name": "Unknown", "provider_type": "", "specialty": "", "state": "", "city": ""}
    except Exception as e:
        logger.warning("NPI lookup failed for %s: %s", npi, e)
        return {"npi": npi, "name": "Unknown", "provider_type": "", "specialty": "", "state": "", "city": ""}


def get_hcpcs_description(code: str) -> str:
    """Get human-readable description for an HCPCS code."""
    return HCPCS_DESCRIPTIONS.get(code, f"HCPCS Code {code}")


def enrich_providers(providers: list[dict], npi_field: str = "billing_npi") -> list[dict]:
    """Enrich provider records with names/specialties from local provider_geo table.
    Falls back to NPI Registry API for NPIs not found or with incomplete data."""
    if not providers:
        return providers

    # Collect unique NPIs
    npis = list({str(p.get(npi_field, "")) for p in providers if p.get(npi_field)})
    if not npis:
        return providers

    # Bulk lookup from local DuckDB (instant)
    geo_map = {}
    try:
        import duckdb, os
        db_path = os.getenv("DATABASE_PATH", "data/medicaid.duckdb")
        con = duckdb.connect(db_path, read_only=True)
        placeholders = ",".join(["?" for _ in npis])
        rows = con.execute(
            f"SELECT npi, name, provider_type, specialty, state, city FROM provider_geo WHERE npi IN ({placeholders})",
            npis
        ).fetchall()
        con.close()
        for npi, name, ptype, spec, state, city in rows:
            # Only trust records that have actual data (state present)
            if state and name and name not in ("Unknown", "Unknown Provider", "Unknown Org"):
                geo_map[npi] = {
                    "name": name,
                    "provider_type": ptype or "",
                    "specialty": spec or "",
                    "state": state,
                    "city": city or "",
                }
    except Exception as e:
        logger.warning("Bulk geo lookup failed: %s", e)

    # Apply enrichment — use geo_map if good, else fall back to live API
    for provider in providers:
        npi = str(provider.get(npi_field, ""))
        if not npi:
            continue
        if npi in geo_map:
            info = geo_map[npi]
        else:
            # Fall back to live NPI Registry API (cached via lru_cache)
            info = lookup_npi(npi)
        provider["provider_name"] = info.get("name", "Unknown")
        provider["provider_type"] = info.get("provider_type", "")
        provider["specialty"] = info.get("specialty", "")
        provider["state"] = info.get("state", "")
        provider["city"] = info.get("city", "")
    return providers


def enrich_codes(codes: list[dict], code_field: str = "hcpcs_code") -> list[dict]:
    """Enrich a list of code records with descriptions."""
    for code in codes:
        hcpcs = code.get(code_field, "")
        if hcpcs:
            code["description"] = get_hcpcs_description(str(hcpcs))
    return codes
