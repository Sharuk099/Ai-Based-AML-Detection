import pandas as pd
import numpy as np
import networkx as nx
from typing import Tuple, Dict, Any, List

def compute_graph_features(df: pd.DataFrame, sender_col: str, receiver_col: str, amount_col: str) -> pd.DataFrame:
    """
    Constructs a NetworkX directed transaction graph and calculates:
    in/out degree, in/out total volumes, passthrough ratios, and indicators.
    """
    G = nx.DiGraph()
    
    # Add weighted edges
    for _, row in df.iterrows():
        s = str(row[sender_col])
        r = str(row[receiver_col])
        amt = float(row[amount_col]) if amount_col in row and not pd.isna(row[amount_col]) else 1.0
        
        if G.has_edge(s, r):
            G[s][r]["weight"] += amt
            G[s][r]["count"] += 1
        else:
            G.add_edge(s, r, weight=amt, count=1)
            
    # Node metrics
    node_stats = {}
    for node in G.nodes():
        out_edges = G.out_edges(node, data=True)
        in_edges = G.in_edges(node, data=True)
        
        out_deg = len(out_edges)
        in_deg = len(in_edges)
        
        out_vol = sum(d.get("weight", 0) for _, _, d in out_edges)
        in_vol = sum(d.get("weight", 0) for _, _, d in in_edges)
        
        passthrough = (out_vol / in_vol) if in_vol > 0 else 0.0
        
        node_stats[node] = {
            "out_degree": out_deg,
            "in_degree": in_deg,
            "out_volume": out_vol,
            "in_volume": in_vol,
            "passthrough_ratio": min(passthrough, 10.0),
        }
        
    # Map back to transactions
    df_feat = df.copy()
    df_feat["sender_out_degree"] = df_feat[sender_col].map(lambda x: node_stats.get(str(x), {}).get("out_degree", 0))
    df_feat["sender_passthrough"] = df_feat[sender_col].map(lambda x: node_stats.get(str(x), {}).get("passthrough_ratio", 0))
    df_feat["receiver_in_degree"] = df_feat[receiver_col].map(lambda x: node_stats.get(str(x), {}).get("in_degree", 0))
    df_feat["receiver_passthrough"] = df_feat[receiver_col].map(lambda x: node_stats.get(str(x), {}).get("passthrough_ratio", 0))
    
    return df_feat, G, node_stats

def find_circular_cycles(G: nx.DiGraph, max_len: int = 4, max_cycles: int = 50) -> List[List[str]]:
    """
    Finds simple circular transfer loops (A -> B -> C -> A) up to max_len.
    """
    cycles = []
    try:
        for c in nx.simple_cycles(G):
            if 2 <= len(c) <= max_len:
                cycles.append(c)
                if len(cycles) >= max_cycles:
                    break
    except Exception:
        pass
    return cycles
