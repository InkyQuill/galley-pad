import csv
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import core
from design_system import persist_design_system


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

    def test_persist_design_system_writes_project_and_page_layout(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            result = persist_design_system(
                minimal_design_system("My Project"),
                page="Admin / Root",
                output_dir=temp_dir,
                page_query="admin root dashboard",
            )

            base = Path(temp_dir) / "design-system" / "my-project"
            self.assertEqual(result["design_system_dir"], str(base))
            self.assertEqual(
                result["created_files"],
                [
                    str(base / "MASTER.md"),
                    str(base / "pages" / "admin-root.md"),
                ],
            )
            self.assertTrue((base / "MASTER.md").exists())
            self.assertTrue((base / "pages" / "admin-root.md").exists())

    def test_persist_design_system_rejects_empty_safe_slugs(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            with self.assertRaises(ValueError):
                persist_design_system(
                    minimal_design_system("!!!"),
                    output_dir=temp_dir,
                )
            self.assertFalse((Path(temp_dir) / "design-system").exists())

    def test_persist_design_system_rejects_empty_page_slug_before_writing(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            with self.assertRaises(ValueError):
                persist_design_system(
                    minimal_design_system("Valid Project"),
                    page="!!!",
                    output_dir=temp_dir,
                )
            self.assertFalse((Path(temp_dir) / "design-system").exists())

    def test_persist_design_system_rejects_explicit_empty_page_before_writing(self):
        with tempfile.TemporaryDirectory() as temp_dir:
            with self.assertRaises(ValueError):
                persist_design_system(
                    minimal_design_system("Valid Project"),
                    page="",
                    output_dir=temp_dir,
                )
            self.assertFalse((Path(temp_dir) / "design-system").exists())

    def test_cli_design_system_persist_writes_expected_files(self):
        script = Path(__file__).with_name("search.py")
        with tempfile.TemporaryDirectory() as temp_dir:
            result = subprocess.run(
                [
                    sys.executable,
                    str(script),
                    "fintech crypto",
                    "--design-system",
                    "--persist",
                    "--project-name",
                    "Review Project",
                    "--page",
                    "Admin / Root",
                    "--output-dir",
                    temp_dir,
                ],
                check=True,
                capture_output=True,
                text=True,
            )

            base = Path(temp_dir) / "design-system" / "review-project"
            self.assertIn(str(base), result.stdout)
            self.assertTrue((base / "MASTER.md").exists())
            self.assertTrue((base / "pages" / "admin-root.md").exists())

    def test_cli_rejects_page_without_persist(self):
        script = Path(__file__).with_name("search.py")
        result = subprocess.run(
            [
                sys.executable,
                str(script),
                "fintech crypto",
                "--design-system",
                "--page",
                "dashboard",
            ],
            capture_output=True,
            text=True,
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("--page requires --persist", result.stderr)

    def test_cli_rejects_persist_without_design_system(self):
        script = Path(__file__).with_name("search.py")
        result = subprocess.run(
            [
                sys.executable,
                str(script),
                "minimalism",
                "--persist",
            ],
            capture_output=True,
            text=True,
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("--persist requires --design-system", result.stderr)

def write_csv(path, fieldnames, rows):
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(fieldnames)
        writer.writerows(rows)


def minimal_design_system(project_name):
    return {
        "project_name": project_name,
        "category": "General",
        "pattern": {
            "name": "Hero",
            "sections": "Hero > CTA",
            "cta_placement": "Above fold",
            "color_strategy": "",
            "conversion": "",
        },
        "style": {
            "name": "Minimalism",
            "type": "General",
            "effects": "",
            "keywords": "",
            "best_for": "",
            "performance": "",
            "accessibility": "",
            "light_mode": "",
            "dark_mode": "",
        },
        "colors": {
            "primary": "#000000",
            "secondary": "#ffffff",
            "accent": "#999999",
            "background": "#ffffff",
            "foreground": "#000000",
            "cta": "#999999",
            "text": "#000000",
        },
        "typography": {
            "heading": "Inter",
            "body": "Inter",
            "mood": "",
            "best_for": "",
            "google_fonts_url": "",
            "css_import": "",
        },
        "key_effects": "",
        "anti_patterns": "",
    }


if __name__ == "__main__":
    unittest.main()
