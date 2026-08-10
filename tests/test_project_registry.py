#!/usr/bin/env python3
"""Unit tests for .claude/skills/apple-notes/scripts/project_registry.py.

Standard library only (unittest) -- this repository deliberately carries no
Python package manifest, so the suite must run with a bare `python3`.

Mirrors tests/test_scrum_block.py's shape: the script under test never calls
osascript, so every case here runs on any platform, with no Notes.app and no
Automation grant. See specs/004-multi-project-scrum/contracts/project-registry.md
and docs/adr/0006-project-registry-as-notes-event-log.md for the contract this
suite verifies.

Run via: bash tests/run-project-registry.sh
"""
import importlib.util
import subprocess
import sys
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SCRIPT = REPO_ROOT / ".claude" / "skills" / "apple-notes" / "scripts" / "project_registry.py"


def load_module():
    spec = importlib.util.spec_from_file_location("project_registry", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


pr = load_module()


def run_cli(stdin_text, *args):
    """Run the script with `stdin_text` on stdin; return (stdout, stderr, returncode)."""
    proc = subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        input=stdin_text,
        capture_output=True,
        text=True,
    )
    return proc.stdout, proc.stderr, proc.returncode


REGISTER_A = (
    "--- projects ---\n"
    "event: register\n"
    "name: ProjectA\n"
    "notes_folder: ProjectA\n"
    "product_backlog: ProjectA Product Backlog\n"
    "sprint_backlog: ProjectA Sprint Backlog\n"
    "---"
)

REGISTER_SCRUM_NONCONFORMING = (
    "--- projects ---\n"
    "event: register\n"
    "name: Scrum\n"
    "notes_folder: Scrum\n"
    "product_backlog: Product Backlog\n"
    "sprint_backlog: Sprint Backlog\n"
    "---"
)

SET_CURRENT_A = "--- projects ---\nevent: set-current\nname: ProjectA\n---"


# --- fold(): the core read-side resolution ----------------------------------


class FoldTests(unittest.TestCase):
    def test_empty_body_yields_empty_state(self):
        state = pr.fold("")
        self.assertEqual(state, {"projects": {}, "current": None})

    def test_none_body_yields_empty_state(self):
        state = pr.fold(None)
        self.assertEqual(state, {"projects": {}, "current": None})

    def test_a_single_register_event_is_folded(self):
        state = pr.fold(REGISTER_A)
        self.assertEqual(
            state["projects"]["ProjectA"],
            {
                "notes_folder": "ProjectA",
                "product_backlog": "ProjectA Product Backlog",
                "sprint_backlog": "ProjectA Sprint Backlog",
            },
        )
        self.assertIsNone(state["current"])

    def test_register_then_set_current_resolves_current(self):
        body = REGISTER_A + "\n\n" + SET_CURRENT_A
        state = pr.fold(body)
        self.assertEqual(state["current"], "ProjectA")

    def test_prose_around_and_between_blocks_is_ignored(self):
        body = f"Notes about my projects.\n\n{REGISTER_A}\n\nSome more prose.\n\n{SET_CURRENT_A}\n\nTrailing."
        state = pr.fold(body)
        self.assertIn("ProjectA", state["projects"])
        self.assertEqual(state["current"], "ProjectA")

    def test_a_second_set_current_overrides_the_first(self):
        register_b = REGISTER_A.replace("ProjectA", "ProjectB")
        body = "\n\n".join(
            [
                REGISTER_A,
                register_b.replace("ProjectA", "ProjectB"),
                SET_CURRENT_A,
                "--- projects ---\nevent: set-current\nname: ProjectB\n---",
            ]
        )
        state = pr.fold(body)
        self.assertEqual(state["current"], "ProjectB")

    def test_a_non_conforming_registered_name_is_folded_verbatim(self):
        """spec FR-009: the migrated first project keeps its real resource names."""
        state = pr.fold(REGISTER_SCRUM_NONCONFORMING)
        self.assertEqual(
            state["projects"]["Scrum"],
            {
                "notes_folder": "Scrum",
                "product_backlog": "Product Backlog",
                "sprint_backlog": "Sprint Backlog",
            },
        )

    def test_unterminated_block_stops_folding_and_raises(self):
        body = "--- projects ---\nevent: register\nname: ProjectA\nnotes_folder: ProjectA"
        with self.assertRaises(pr.RegistryError) as ctx:
            pr.fold(body)
        self.assertIn("unterminated", str(ctx.exception))

    def test_unknown_event_type_raises(self):
        body = "--- projects ---\nevent: delete\nname: ProjectA\n---"
        with self.assertRaises(pr.RegistryError) as ctx:
            pr.fold(body)
        self.assertIn("delete", str(ctx.exception))

    def test_register_missing_a_required_field_raises(self):
        body = "--- projects ---\nevent: register\nname: ProjectA\nnotes_folder: ProjectA\n---"
        with self.assertRaises(pr.RegistryError) as ctx:
            pr.fold(body)
        self.assertIn("product_backlog", str(ctx.exception))

    def test_register_missing_name_raises(self):
        body = "--- projects ---\nevent: register\nnotes_folder: X\nproduct_backlog: Y\nsprint_backlog: Z\n---"
        with self.assertRaises(pr.RegistryError):
            pr.fold(body)

    def test_set_current_for_unregistered_name_raises(self):
        with self.assertRaises(pr.RegistryError) as ctx:
            pr.fold(SET_CURRENT_A)
        self.assertIn("ProjectA", str(ctx.exception))

    def test_a_later_malformed_block_does_not_corrupt_earlier_state_silently(self):
        """A hard stop, not a lenient skip -- see project_registry.py's module docstring
        for why this differs from scrum_block.py's single-block leniency."""
        body = REGISTER_A + "\n\n--- projects ---\nevent: register\nname: ProjectB\n---"
        with self.assertRaises(pr.RegistryError):
            pr.fold(body)


# --- CLI: resolve / list / current -------------------------------------------


class ResolveCommandTests(unittest.TestCase):
    def test_resolve_reports_projects_and_current(self):
        out, _, code = run_cli(REGISTER_A + "\n\n" + SET_CURRENT_A, "resolve")
        self.assertEqual(code, 0)
        import json

        payload = json.loads(out)
        self.assertIn("ProjectA", payload["projects"])
        self.assertEqual(payload["current"], "ProjectA")

    def test_resolve_on_empty_registry(self):
        out, _, code = run_cli("", "resolve")
        self.assertEqual(code, 0)
        import json

        self.assertEqual(json.loads(out), {"projects": {}, "current": None})

    def test_resolve_reports_a_malformed_block_and_exits_nonzero(self):
        out, err, code = run_cli("--- projects ---\nevent: register\nname: X", "resolve")
        self.assertNotEqual(code, 0)
        self.assertEqual(out, "")
        self.assertIn("unterminated", err)


class ListCommandTests(unittest.TestCase):
    def test_list_emits_a_sorted_json_array_of_names(self):
        register_b = REGISTER_A.replace("ProjectA", "ProjectB").replace(
            "ProjectA Product Backlog", "ProjectB Product Backlog"
        ).replace("ProjectA Sprint Backlog", "ProjectB Sprint Backlog")
        body = register_b + "\n\n" + REGISTER_A
        out, _, code = run_cli(body, "list")
        self.assertEqual(code, 0)
        import json

        self.assertEqual(json.loads(out), ["ProjectA", "ProjectB"])

    def test_list_on_empty_registry_is_an_empty_array(self):
        out, _, code = run_cli("", "list")
        self.assertEqual(code, 0)
        import json

        self.assertEqual(json.loads(out), [])


class CurrentCommandTests(unittest.TestCase):
    def test_current_prints_the_current_project(self):
        out, _, code = run_cli(REGISTER_A + "\n\n" + SET_CURRENT_A, "current")
        self.assertEqual(code, 0)
        self.assertEqual(out.strip(), "ProjectA")

    def test_current_is_empty_when_none_is_set(self):
        out, _, code = run_cli(REGISTER_A, "current")
        self.assertEqual(code, 0)
        self.assertEqual(out.strip(), "")


# --- CLI: register ------------------------------------------------------------


class RegisterCommandTests(unittest.TestCase):
    def test_register_a_new_project_emits_the_append_block(self):
        out, _, code = run_cli(
            "",
            "register",
            "--name",
            "ProjectA",
            "--notes-folder",
            "ProjectA",
            "--product-backlog",
            "ProjectA Product Backlog",
            "--sprint-backlog",
            "ProjectA Sprint Backlog",
        )
        self.assertEqual(code, 0)
        self.assertEqual(pr.fold(out)["projects"]["ProjectA"]["notes_folder"], "ProjectA")

    def test_register_accepts_names_that_do_not_follow_the_naming_convention(self):
        """spec FR-009 / User Story 4: the migrated first project is registered
        verbatim, not renamed to match the `<ProjectName> ...` convention."""
        out, _, code = run_cli(
            "",
            "register",
            "--name",
            "Scrum",
            "--notes-folder",
            "Scrum",
            "--product-backlog",
            "Product Backlog",
            "--sprint-backlog",
            "Sprint Backlog",
        )
        self.assertEqual(code, 0)
        state = pr.fold(out)
        self.assertEqual(
            state["projects"]["Scrum"],
            {
                "notes_folder": "Scrum",
                "product_backlog": "Product Backlog",
                "sprint_backlog": "Sprint Backlog",
            },
        )

    def test_reregistering_the_same_name_with_identical_resources_is_idempotent(self):
        out, _, code = run_cli(
            REGISTER_A,
            "register",
            "--name",
            "ProjectA",
            "--notes-folder",
            "ProjectA",
            "--product-backlog",
            "ProjectA Product Backlog",
            "--sprint-backlog",
            "ProjectA Sprint Backlog",
        )
        self.assertEqual(code, 0)
        self.assertIn("ProjectA", out)

    def test_reregistering_with_different_resource_names_is_refused(self):
        out, err, code = run_cli(
            REGISTER_A,
            "register",
            "--name",
            "ProjectA",
            "--notes-folder",
            "ProjectA-Renamed",
            "--product-backlog",
            "ProjectA Product Backlog",
            "--sprint-backlog",
            "ProjectA Sprint Backlog",
        )
        self.assertNotEqual(code, 0)
        self.assertEqual(out, "")
        self.assertIn("ProjectA", err)

    def test_register_rejects_a_malformed_existing_registry(self):
        out, err, code = run_cli(
            "--- projects ---\nevent: register\nname: X",
            "register",
            "--name",
            "ProjectB",
            "--notes-folder",
            "ProjectB",
            "--product-backlog",
            "ProjectB Product Backlog",
            "--sprint-backlog",
            "ProjectB Sprint Backlog",
        )
        self.assertNotEqual(code, 0)
        self.assertEqual(out, "")


# --- CLI: set-current ----------------------------------------------------------


class SetCurrentCommandTests(unittest.TestCase):
    def test_set_current_for_a_registered_project_emits_the_append_block(self):
        out, _, code = run_cli(REGISTER_A, "set-current", "--name", "ProjectA")
        self.assertEqual(code, 0)
        state = pr.fold(REGISTER_A + "\n\n" + out)
        self.assertEqual(state["current"], "ProjectA")

    def test_set_current_for_an_unregistered_name_is_refused(self):
        out, err, code = run_cli("", "set-current", "--name", "ProjectA")
        self.assertNotEqual(code, 0)
        self.assertEqual(out, "")
        self.assertIn("ProjectA", err)


if __name__ == "__main__":
    unittest.main()
