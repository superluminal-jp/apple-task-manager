#!/usr/bin/env python3
"""Contract tests for the isolated Scrum role perspective agents.

Standard library only. These tests validate project-scoped agent configuration and
workflow guidance; they never access Apple Notes or Reminders.

Run via: bash tests/run-scrum-role-agents.sh
"""

import subprocess
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
AGENTS_DIR = REPO_ROOT / ".claude" / "agents"
PO_AGENT = AGENTS_DIR / "product-owner-perspective.md"
DEVELOPERS_AGENT = AGENTS_DIR / "developers-perspective.md"
CLAUDE_GUIDANCE = REPO_ROOT / "CLAUDE.md"
README = REPO_ROOT / "README.md"


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def parse_frontmatter(text: str) -> dict[str, str]:
    """Parse the flat frontmatter fields used by project agent definitions."""
    if not text.startswith("---\n"):
        raise AssertionError("agent definition has no opening frontmatter fence")
    try:
        frontmatter = text.split("---\n", 2)[1]
    except IndexError as exc:
        raise AssertionError("agent definition has no closing frontmatter fence") from exc

    fields: dict[str, str] = {}
    for line in frontmatter.splitlines():
        if not line or line.startswith((" ", "-")):
            continue
        key, separator, value = line.partition(":")
        if separator:
            fields[key.strip()] = value.strip()
    return fields


def section(text: str, heading: str) -> str:
    marker = f"## {heading}\n"
    if marker not in text:
        raise AssertionError(f"missing section: {heading}")
    return text.split(marker, 1)[1].split("\n## ", 1)[0]


class AgentDefinitionContract(unittest.TestCase):
    def test_both_role_perspectives_exist(self):
        self.assertTrue(PO_AGENT.is_file(), PO_AGENT)
        self.assertTrue(DEVELOPERS_AGENT.is_file(), DEVELOPERS_AGENT)

    def test_agent_frontmatter_is_named_and_read_only(self):
        expected_names = {
            PO_AGENT: "product-owner-perspective",
            DEVELOPERS_AGENT: "developers-perspective",
        }
        for path, expected_name in expected_names.items():
            with self.subTest(agent=expected_name):
                fields = parse_frontmatter(read(path))
                self.assertEqual(fields.get("name"), expected_name)
                self.assertTrue(fields.get("description"))
                self.assertEqual(fields.get("tools"), "Read, Grep, Glob")
                self.assertNotIn("skills", fields)
                self.assertNotIn("Bash", fields.get("tools", ""))
                self.assertNotIn("Write", fields.get("tools", ""))
                self.assertNotIn("Edit", fields.get("tools", ""))

    def test_both_agents_define_contamination_and_accountability_boundaries(self):
        for path in (PO_AGENT, DEVELOPERS_AGENT):
            text = read(path)
            with self.subTest(agent=path.stem):
                self.assertIn("## Input contract", text)
                self.assertIn("## Contaminated context", text)
                self.assertIn("## Decision boundary", text)
                self.assertIn("## Output contract", text)
                self.assertIn("Facts", text)
                self.assertIn("Inferences and assumptions", text)
                self.assertIn("Evidence requests", text)
                self.assertIn("Accountability boundary", text)
                self.assertIn("advisory perspective", text)
                self.assertIn("human", text)
                self.assertNotIn("skills:\n  - apple-", text)


class AsymmetricBriefContract(unittest.TestCase):
    def test_product_owner_brief_and_boundary_are_product_specific(self):
        text = read(PO_AGENT)
        brief = section(text, "Input contract")
        boundary = section(text, "Decision boundary")
        for required in (
            "Product Goal",
            "user and stakeholder evidence",
            "outcome evidence",
            "candidate Product Backlog items",
        ):
            self.assertIn(required, brief)
        self.assertIn("Do not include the Developers report", brief)
        self.assertIn("Product Backlog ordering", boundary)
        self.assertIn("Do not assign work", boundary)
        self.assertIn("Do not estimate implementation effort", boundary)

    def test_developers_brief_and_boundary_are_delivery_specific(self):
        text = read(DEVELOPERS_AGENT)
        brief = section(text, "Input contract")
        boundary = section(text, "Decision boundary")
        for required in (
            "candidate Sprint Goal",
            "Definition of Done",
            "capacity evidence",
            "technical and quality constraints",
        ):
            self.assertIn(required, brief)
        self.assertIn("Do not include the Product Owner report", brief)
        self.assertIn("Sprint forecast", boundary)
        self.assertIn("Do not order the Product Backlog", boundary)
        self.assertIn("Do not invent product value", boundary)


class ProjectRoutingContract(unittest.TestCase):
    def test_claude_guidance_preserves_separate_contexts_and_human_decision(self):
        guidance = read(CLAUDE_GUIDANCE)
        for required in (
            "product-owner-perspective",
            "developers-perspective",
            "別コンテキスト",
            "相手のレポートを渡さない",
            "scrum-master",
            "apple-reminders-operator",
            "apple-notes-operator",
            "最終判断は人間",
        ):
            self.assertIn(required, guidance)

    def test_readme_exposes_the_workflow_and_focused_verification(self):
        readme = read(README)
        self.assertIn("product-owner-perspective", readme)
        self.assertIn("developers-perspective", readme)
        self.assertIn("tests/run-scrum-role-agents.sh", readme)
        self.assertNotIn("役割別サブエージェント、実利用者との接点——は未着手", readme)
        self.assertNotIn("両者はまだ書かれていない", readme)

    def test_vendored_scrum_master_snapshot_is_unchanged(self):
        result = subprocess.run(
            [
                "git",
                "diff",
                "--quiet",
                "main",
                "--",
                ".claude/skills/scrum-master",
            ],
            cwd=REPO_ROOT,
            check=False,
        )
        self.assertEqual(result.returncode, 0)


if __name__ == "__main__":
    unittest.main()
