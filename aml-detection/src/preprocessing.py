import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, OneHotEncoder
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from typing import Tuple, List, Dict, Any

def build_preprocessor(numeric_features: List[str], categorical_features: List[str]) -> ColumnTransformer:
    """
    Constructs a leakage-free Scikit-learn ColumnTransformer with
    StandardScaler for continuous variables and OneHotEncoder for categories.
    """
    transformers = []
    if numeric_features:
        transformers.append(("num", StandardScaler(), numeric_features))
    if categorical_features:
        transformers.append(("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), categorical_features))
        
    return ColumnTransformer(transformers=transformers, remainder="drop")

def split_partitions(
    df: pd.DataFrame, target_col: str, test_size: float = 0.15, val_size: float = 0.15, random_state: int = 42
) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """
    Stratified disjoint splitting into train, validation, and held-out test sets.
    Uses exact count integer boundaries to prevent floating-point truncation off-by-one errors.
    On a 100-row dataset, this strictly produces (70, 15, 15) disjoint partitions.
    """
    n = len(df)
    test_count = int(round(n * test_size)) if isinstance(test_size, float) else int(test_size)
    val_count = int(round(n * val_size)) if isinstance(val_size, float) else int(val_size)

    y = df[target_col]
    train_val_df, test_df = train_test_split(df, test_size=test_count, stratify=y, random_state=random_state)
    
    train_df, val_df = train_test_split(
        train_val_df, test_size=val_count, stratify=train_val_df[target_col], random_state=random_state
    )
    
    return train_df.reset_index(drop=True), val_df.reset_index(drop=True), test_df.reset_index(drop=True)

def split_dataset_stratified(
    df: pd.DataFrame, target_col: str, train_ratio: float = 0.7, val_ratio: float = 0.15, test_ratio: float = 0.15, random_state: int = 42
) -> Tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """
    Splits dataset into stratified train, val, and test partitions with strict integer rounding:
    n_train = int(round(n * train_ratio))
    n_val = int(round(n * val_ratio))
    n_test = n - n_train - n_val
    """
    n = len(df)
    n_train = int(round(n * train_ratio))
    n_val = int(round(n * val_ratio))
    n_test = n - n_train - n_val
    return split_partitions(df, target_col, test_size=n_test, val_size=n_val, random_state=random_state)

def aggregate_transactions_to_accounts(df: pd.DataFrame) -> pd.DataFrame:
    """
    Groups raw transaction records by account counterparty entities and calculates
    rolling behavioral aggregates required by champion account-profile models.
    """
    sender_col = "from_account" if "from_account" in df.columns else ("sender" if "sender" in df.columns else None)
    receiver_col = "to_account" if "to_account" in df.columns else ("receiver" if "receiver" in df.columns else None)
    amount_col = "amount" if "amount" in df.columns else None
    format_col = "payment_format" if "payment_format" in df.columns else ("format" if "format" in df.columns else None)
    currency_col = "currency" if "currency" in df.columns else None
    timestamp_col = "timestamp" if "timestamp" in df.columns else ("date" if "date" in df.columns else None)

    if not sender_col or not receiver_col or not amount_col:
        return df

    accounts = set(df[sender_col].dropna().astype(str).unique()) | set(df[receiver_col].dropna().astype(str).unique())
    rows = []

    amounts = pd.to_numeric(df[amount_col].astype(str).str.replace(",", ""), errors="coerce").fillna(0.0)
    df_copy = df.copy()
    df_copy["_amt"] = amounts

    # Cash flag
    if format_col:
        fmts = df_copy[format_col].astype(str).str.lower()
        df_copy["_is_cash"] = fmts.str.contains("cash|atm")
    else:
        df_copy["_is_cash"] = False

    # International flag
    if currency_col:
        currs = df_copy[currency_col].astype(str).str.upper()
        df_copy["_is_intl"] = ~currs.isin(["USD", "INR", "EUR"])
    else:
        df_copy["_is_intl"] = False

    # Night flag (22:00 to 06:00)
    if timestamp_col:
        parsed_dates = pd.to_datetime(df_copy[timestamp_col], errors="coerce", utc=True)
        hours = parsed_dates.dt.hour
        df_copy["_is_night"] = (hours >= 22) | (hours < 6)
    else:
        df_copy["_is_night"] = False

    outflows = df_copy.groupby(sender_col)["_amt"].sum().to_dict()
    inflows = df_copy.groupby(receiver_col)["_amt"].sum().to_dict()
    out_counts = df_copy.groupby(sender_col).size().to_dict()
    in_counts = df_copy.groupby(receiver_col).size().to_dict()

    cash_counts = df_copy[df_copy["_is_cash"]].groupby(sender_col).size().to_dict()
    intl_counts = df_copy[df_copy["_is_intl"]].groupby(sender_col).size().to_dict()
    night_counts = df_copy[df_copy["_is_night"]].groupby(sender_col).size().to_dict()

    for acc in sorted(accounts):
        out_amt = float(outflows.get(acc, 0.0))
        in_amt = float(inflows.get(acc, 0.0))
        tx_cnt = int(out_counts.get(acc, 0) + in_counts.get(acc, 0))
        if tx_cnt == 0:
            tx_cnt = 1

        # Balanced estimation when only one-sided flow observed
        inflow = in_amt if in_amt > 0 else max(1500.0, out_amt * 1.05)
        outflow = out_amt if out_amt > 0 else max(1000.0, inflow * 0.8)

        in_out_ratio = round(inflow / (outflow + 1e-6), 3)
        cash_ratio = round(float(cash_counts.get(acc, 0)) / tx_cnt, 3)
        intl_ratio = round(float(intl_counts.get(acc, 0)) / tx_cnt, 3)
        night_ratio = round(float(night_counts.get(acc, 0)) / tx_cnt, 3)

        cust_type = "Individual"
        if any(w in str(acc).upper() for w in ["RESTAURANT", "STORE", "MERCHANT", "CORP", "LTD", "INC"]):
            cust_type = "SMB"

        avg_balance = round(max(3500.0, inflow * 0.75), 2)
        age_months = 36

        rows.append({
            "account_id": acc,
            "customer_type": cust_type,
            "account_age_months": age_months,
            "avg_balance": avg_balance,
            "monthly_inflow": round(inflow, 2),
            "monthly_outflow": round(outflow, 2),
            "in_out_ratio": in_out_ratio,
            "txn_count_monthly": tx_cnt,
            "cash_deposit_ratio": cash_ratio,
            "international_tx_ratio": intl_ratio,
            "night_activity_ratio": night_ratio,
        })

    return pd.DataFrame(rows)

def enrich_transactions_with_account_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Attaches rolling account-profile features onto each transaction row based on the sender account.
    """
    acc_df = aggregate_transactions_to_accounts(df)
    if "account_id" not in acc_df.columns:
        return df

    sender_col = "from_account" if "from_account" in df.columns else ("sender" if "sender" in df.columns else None)
    if not sender_col:
        return df

    merged = df.merge(acc_df, left_on=sender_col, right_on="account_id", how="left")
    # Clean up duplicate columns if any
    for col in ["customer_type", "account_age_months", "avg_balance", "monthly_inflow", "monthly_outflow",
                "in_out_ratio", "txn_count_monthly", "cash_deposit_ratio", "international_tx_ratio", "night_activity_ratio"]:
        if f"{col}_y" in merged.columns:
            merged[col] = merged[f"{col}_x"].fillna(merged[f"{col}_y"])
            merged.drop(columns=[f"{col}_x", f"{col}_y"], inplace=True)

    return merged
