import csv
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import core


class CoreSearchTests(unittest.TestCase):
    def test_bm25_ranks_relevant_documents_first(self):
        bm25 = core.BM25()
        bm25.fit([
            "accessible modal keyboard focus management",
            "color palette brand tokens",
            "modal dialog aria focus trap",
        ])

        ranked = bm25.score("modal focus")

        self.assertEqual(ranked[0][0], 0)
        self.assertGreater(ranked[0][1], ranked[-1][1])

    def test_detect_domain_uses_keyword_match(self):
        self.assertEqual(core.detect_domain("accessible keyboard focus"), "ux")
        self.assertEqual(core.detect_domain("popular variable font"), "google-fonts")
        self.assertEqual(core.detect_domain("unknown term"), "style")

    def test_search_dispatches_to_domain_config(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir)
            write_csv(
                data_dir / "fixture.csv",
                ["Title", "Keywords", "Result"],
                [["Accessible Modal", "modal keyboard focus", "Use focus trap"]],
            )

            config = {
                "fixture": {
                    "file": "fixture.csv",
                    "search_cols": ["Title", "Keywords"],
                    "output_cols": ["Title", "Result"],
                },
                "style": {
                    "file": "fixture.csv",
                    "search_cols": ["Title", "Keywords"],
                    "output_cols": ["Title"],
                },
            }
            with patch.object(core, "DATA_DIR", data_dir), patch.object(
                core, "CSV_CONFIG", config
            ):
                result = core.search("keyboard modal", "fixture")

            self.assertEqual(result["domain"], "fixture")
            self.assertEqual(result["count"], 1)
            self.assertEqual(result["results"][0]["Title"], "Accessible Modal")

    def test_search_reports_missing_domain_file(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            config = {
                "missing": {
                    "file": "missing.csv",
                    "search_cols": ["Title"],
                    "output_cols": ["Title"],
                },
                "style": {
                    "file": "missing.csv",
                    "search_cols": ["Title"],
                    "output_cols": ["Title"],
                },
            }
            with patch.object(core, "DATA_DIR", Path(temp_dir)), patch.object(
                core, "CSV_CONFIG", config
            ):
                result = core.search("anything", "missing")

            self.assertIn("error", result)
            self.assertEqual(result["domain"], "missing")

    def test_search_stack_dispatches_and_reports_unknown_stack(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            data_dir = Path(temp_dir)
            stack_dir = data_dir / "stacks"
            stack_dir.mkdir()
            write_csv(
                stack_dir / "react.csv",
                ["Category", "Guideline", "Description", "Do", "Don't", "Severity"],
                [["Performance", "Memo", "Avoid rerenders", "Use memo", "Overmemoize", "MEDIUM"]],
            )

            with patch.object(core, "DATA_DIR", data_dir), patch.object(
                core, "STACK_CONFIG", {"react": {"file": "stacks/react.csv"}}
            ), patch.object(core, "AVAILABLE_STACKS", ["react"]):
                result = core.search_stack("rerenders memo", "react")
                missing = core.search_stack("rerenders", "vue")

            self.assertEqual(result["stack"], "react")
            self.assertEqual(result["count"], 1)
            self.assertIn("Unknown stack", missing["error"])


class SearchCliTests(unittest.TestCase):
    def test_cli_search_runs_end_to_end(self):
        script = Path(__file__).with_name("search.py")
        result = subprocess.run(
            [
                sys.executable,
                str(script),
                "minimalism dark mode",
                "--domain",
                "style",
                "--max-results",
                "1",
                "--json",
            ],
            check=True,
            capture_output=True,
            text=True,
        )

        payload = json.loads(result.stdout)
        self.assertEqual(payload["domain"], "style")
        self.assertEqual(payload["query"], "minimalism dark mode")
        self.assertLessEqual(payload["count"], 1)


def write_csv(path, fieldnames, rows):
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(fieldnames)
        writer.writerows(rows)


if __name__ == "__main__":
    unittest.main()
