import unittest
import pandas as pd
from src.dataset_loader import generate_benchmark_dataset
from src.data_audit import audit_dataset
from src.graph_analysis import compute_graph_features, find_circular_cycles
import networkx as nx

class TestAMLPipeline(unittest.TestCase):
    def test_benchmark_generation(self):
        filepath = generate_benchmark_dataset(n_samples=50, output_filename="test_txs.csv")
        df = pd.read_csv(filepath)
        self.assertEqual(len(df), 50)
        self.assertIn("amount", df.columns)
        self.assertIn("from_account", df.columns)
        self.assertIn("to_account", df.columns)

    def test_audit_dataset(self):
        df = pd.DataFrame({
            "from_account": ["A", "B"],
            "to_account": ["B", "C"],
            "amount": [100.0, 200.0],
            "label": ["Money Laundering", "Individual Wallet"]
        })
        audit = audit_dataset(df)
        self.assertEqual(audit["total_records"], 2)
        self.assertTrue(audit["graph_supported"])
        self.assertIn("Money Laundering", audit["supported_12_categories"])

    def test_circular_cycles(self):
        G = nx.DiGraph()
        G.add_edge("A", "B")
        G.add_edge("B", "C")
        G.add_edge("C", "A")
        cycles = find_circular_cycles(G)
        self.assertEqual(len(cycles), 1)

if __name__ == "__main__":
    unittest.main()
