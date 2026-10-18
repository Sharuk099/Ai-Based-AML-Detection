import os
import random
import datetime
import pandas as pd
from config import RAW_DATA_DIR

def generate_benchmark_dataset(n_samples: int = 3000, output_filename: str = "benchmark_transactions.csv") -> str:
    """
    Generates a documented synthetic transaction dataset matching IBM AML-Data and AMLSim schemas.
    Used for automated setup and verifiable training.
    """
    random.seed(42)
    accounts = [f"ACC{i:04d}" for i in range(150)]
    mules = accounts[:8]
    
    rows = []
    base_date = datetime.datetime(2024, 1, 1, 8, 0, 0)
    
    for i in range(n_samples):
        is_laundering = random.random() < 0.12
        
        if is_laundering:
            from_acc = random.choice(mules)
            to_acc = random.choice(mules) if random.random() < 0.5 else random.choice(accounts)
            amount = random.uniform(9000, 9990) if random.random() < 0.6 else random.uniform(200, 20000)
            channel = random.choice(["Wire", "Cash", "Crypto", "ACH"])
            label = "Money Laundering" if random.random() < 0.75 else "Tumbler"
        else:
            from_acc = random.choice(accounts[8:])
            to_acc = random.choice(accounts)
            amount = random.uniform(15, 2500)
            channel = random.choice(["Card", "ACH", "Wire", "Cheque"])
            label = "Centralized Exchange" if random.random() < 0.15 else "Individual Wallet"
            
        timestamp = (base_date + datetime.timedelta(minutes=i * 12)).isoformat()
        currency = "USD" if random.random() < 0.85 else "EUR"
        
        rows.append({
            "transaction_id": f"TX_{i+1:05d}",
            "from_account": from_acc,
            "to_account": to_acc,
            "amount": round(amount, 2),
            "currency": currency,
            "payment_format": channel,
            "timestamp": timestamp,
            "label": label,
        })
        
    df = pd.DataFrame(rows)
    out_path = RAW_DATA_DIR / output_filename
    df.to_csv(out_path, index=False)
    return str(out_path)
