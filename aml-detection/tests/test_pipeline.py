import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import networkx as nx  # noqa: E402
import pandas as pd  # noqa: E402

from config import FEATURE_COLS, MODEL_ARTIFACT_PATH, TARGET_COL, TRAINING_DATA_PATH  # noqa: E402
from src.graph_analysis import describe_cycles, find_circular_cycles  # noqa: E402
from src.preprocessing import split_partitions  # noqa: E402


def _ensure_model():
    if not MODEL_ARTIFACT_PATH.exists():
        from src.train_models import train_and_select_models
        train_and_select_models(pd.read_csv(TRAINING_DATA_PATH), TARGET_COL, TRAINING_DATA_PATH.name)


class TestAMLPipeline(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        _ensure_model()
        cls.df = pd.read_csv(TRAINING_DATA_PATH)
        from app import app
        cls.client = app.test_client()

    def test_split_is_disjoint_70_15_15(self):
        tr, va, te = split_partitions(self.df, TARGET_COL)
        self.assertEqual((len(tr), len(va), len(te)), (70, 15, 15))
        ids = [set(x["account_id"]) for x in (tr, va, te)]
        self.assertFalse(ids[0] & ids[1] or ids[0] & ids[2] or ids[1] & ids[2])

    def test_label_never_a_feature(self):
        self.assertNotIn(TARGET_COL, FEATURE_COLS)
        self.assertFalse(any("synthetic" in c for c in FEATURE_COLS))

    def test_known_cycle_detected_with_evidence(self):
        G = nx.DiGraph()
        for a, b in [("A", "B"), ("B", "C"), ("C", "A"), ("C", "D")]:
            G.add_edge(a, b, weight=100.0)
        cycles = find_circular_cycles(G)
        self.assertEqual(len(cycles), 1)
        self.assertEqual(describe_cycles(G, cycles)[0]["label"], "Unvalidated circular flow")

    def test_missing_features_rejected(self):
        r = self.client.post("/api/analyze", json={"rows": [{"from_account": "A", "to_account": "B", "amount": 10}]})
        self.assertEqual(r.status_code, 422)

    def test_bad_row_is_unable_to_classify(self):
        rows = self.df.drop(columns=[TARGET_COL]).head(3).to_dict("records")
        rows[0]["avg_balance"] = "abc"
        rows[1]["customer_type"] = "Alien"
        res = self.client.post("/api/analyze", json={"rows": rows}).get_json()
        self.assertEqual(res["unable_to_classify"], 2)
        self.assertEqual(res["classified"], 1)

    def test_prediction_not_automatically_flag(self):
        rows = self.df.drop(columns=[TARGET_COL]).to_dict("records")
        res = self.client.post("/api/analyze", json={"rows": rows}).get_json()
        self.assertLess(res["flagged_alerts"], res["total_transactions"])
        for r in res["records"]:
            if r["flagged"]:
                self.assertGreaterEqual(r["risk_score"], 0.5)
                self.assertGreater(len(r["reasons"]), 1)

    def test_output_changes_with_features(self):
        base = self.df.drop(columns=[TARGET_COL]).iloc[[0]].to_dict("records")[0]
        safe = dict(base, cash_deposit_ratio=0.02, international_tx_ratio=0.01, night_activity_ratio=0.01,
                    account_age_months=120, in_out_ratio=0.6, avg_balance=90000)
        res = self.client.post("/api/analyze", json={"rows": [base, safe]}).get_json()
        self.assertNotEqual(res["records"][0]["risk_score"], res["records"][1]["risk_score"])

    def test_models_endpoint_reports_held_out_metrics(self):
        r = self.client.get("/api/models").get_json()
        self.assertEqual(r["test_size"], 15)
        self.assertIn("test_confusion_matrix", r)
        self.assertEqual(len([m for m in r["leaderboard"] if m["status"] == "completed"]), 4)


if __name__ == "__main__":
    unittest.main()
