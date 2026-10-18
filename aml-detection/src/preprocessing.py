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
    """
    y = df[target_col]
    train_val_df, test_df = train_test_split(df, test_size=test_size, stratify=y, random_state=random_state)
    
    val_ratio = val_size / (1.0 - test_size)
    train_df, val_df = train_test_split(
        train_val_df, test_size=val_ratio, stratify=train_val_df[target_col], random_state=random_state
    )
    
    return train_df.reset_index(drop=True), val_df.reset_index(drop=True), test_df.reset_index(drop=True)
