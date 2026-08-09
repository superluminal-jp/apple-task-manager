#!/usr/bin/env python3
"""Contract tests for the abolished PO/Developers perspective subagents.

Standard library only. These tests confirm that `product-owner-perspective` and
`developers-perspective` were removed as designed (ADR 0002, revised 2026-08-09):
Product Owner and Developers are real accountabilities held by a real person, whose
judgment is brought into the conversation directly rather than performed by an AI
role-play agent. They never access Apple Notes or Reminders.

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
ADR_0002 = REPO_ROOT / "docs" / "adr" / "0002-role-separation-via-subagents.md"
SCRUM_FRAMEWORK = (
    REPO_ROOT / ".claude" / "skills" / "scrum-master" / "references" / "scrum-framework.md"
)
SCRUM_MASTER_ROLE = (
    REPO_ROOT / ".claude" / "skills" / "scrum-master" / "references" / "scrum-master-role.md"
)


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


class AbolishedAgentDefinitionContract(unittest.TestCase):
    def test_both_role_perspective_agents_are_removed(self):
        self.assertFalse(PO_AGENT.exists(), PO_AGENT)
        self.assertFalse(DEVELOPERS_AGENT.exists(), DEVELOPERS_AGENT)

    def test_referenced_role_practice_docs_still_exist(self):
        self.assertTrue(SCRUM_FRAMEWORK.is_file(), SCRUM_FRAMEWORK)
        self.assertTrue(SCRUM_MASTER_ROLE.is_file(), SCRUM_MASTER_ROLE)


class ProjectRoutingContract(unittest.TestCase):
    def test_claude_guidance_no_longer_wires_role_perspective_agents(self):
        guidance = read(CLAUDE_GUIDANCE)
        self.assertNotIn("を**別コンテキスト**で起動", guidance)
        self.assertNotIn("役割視点は別コンテキストで検査する", guidance)
        self.assertIn("廃止", guidance)
        for required in (
            "Scrum Master のみ",
            "scrum-framework.md",
            "scrum-master-role.md",
        ):
            self.assertIn(required, guidance)

    def test_readme_no_longer_documents_role_perspective_agents(self):
        readme = read(README)
        self.assertNotIn("これは Scrum ではない", readme)
        for required in (
            "product-owner-perspective",
            "developers-perspective",
        ):
            self.assertIn(required, readme)
        self.assertIn("実在", readme)

    def test_adr_0002_records_the_reversal(self):
        adr = read(ADR_0002)
        self.assertIn("廃止", adr)
        self.assertIn("実在", adr)

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
