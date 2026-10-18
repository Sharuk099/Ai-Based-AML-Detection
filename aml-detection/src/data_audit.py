import pandas as pd
from typing import Dict, Any, List
from config import INTENDED_CATEGORIES

def audit_dataset(df: pd.DataFrame) -> Dict[str, Any]:
    """
    Validates schema, checks 12 categories coverage, identifies roles, and missing rates.
    """
    total_records = len(df)
    columns = list(df.columns)
    
    # Check target label coverage
    labels = df["label"].dropna().unique().tolist() if "label" in df.columns else []
    supported = [cat for cat in INTENDED_CATEGORIES if cat in labels]
    unsupported = [cat for cat in INTENDED_CATEGORIES if cat not in labels]
    
    missing_counts = df.isnull().sum().to_dict()
    duplicates = int(df.duplicated().sum())
    
    roles = {
        "transaction_id": next((c for c in columns if "id" in c.lower() and "account" not in c.lower()), None),
        "sender": next((c for c in columns if any(k in c.lower() for k in ["from", "sender", "orig"])), None),
        "receiver": next((c for c in columns if any(k in c.lower() for k in ["to", "receiver", "dest"])), None),
        "amount": next((c for c in columns if "amount" in c.lower() or "amt" in c.lower()), None),
        "timestamp": next((c for c in columns if any(k in c.lower() for k in ["time", "date", "ts"])), None),
        "label": "label" if "label" in columns else None,
    }
    
    return {
        "total_records": total_records,
        "columns": columns,
        "roles": roles,
        "missing_counts": missing_counts,
        "duplicate_rows": duplicates,
        "supported_12_categories": supported,
        "unsupported_12_categories": unsupported,
        "graph_supported": bool(roles["sender"] and roles["receiver"]),
    }
