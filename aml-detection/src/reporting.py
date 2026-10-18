import json
import datetime
from typing import Dict, Any

def generate_compliance_dossier(analysis_summary: Dict[str, Any], filename: str) -> Dict[str, Any]:
    """
    Generates a structured, audit-ready AML compliance investigation dossier.
    """
    return {
        "report_id": f"AML-DOSSIER-{datetime.datetime.now().strftime('%Y%m%d-%H%M%S')}",
        "generated_at": datetime.datetime.now().isoformat(),
        "analyzed_file": filename,
        "executive_summary": {
            "total_transactions": analysis_summary.get("total_transactions", 0),
            "flagged_alerts": analysis_summary.get("flagged_alerts", 0),
            "flagged_percentage": analysis_summary.get("flagged_percentage", 0),
            "high_risk_critical": analysis_summary.get("high_risk_critical", 0),
        },
        "regulatory_notice": (
            "MANDATORY: In accordance with FATF recommendations and FinCEN SAR guidelines, "
            "automated machine learning risk scores require corroborating human review by a "
            "certified anti-money laundering compliance specialist prior to regulatory filing."
        ),
        "priority_records": [
            r for r in analysis_summary.get("records", []) if r.get("risk_level") == "HIGH"
        ][:25],
    }
