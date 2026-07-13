#!/usr/bin/env python3
"""Create a durable audit-to-10 baton without overwriting an existing run."""

from __future__ import annotations

import argparse
from datetime import date
from pathlib import Path


DEFAULT_GOAL = "Every applicable area reaches an independently verified 10/10"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("project_root", nargs="?", default=".")
    parser.add_argument("--report", default="docs/audit/AUDIT_TO_10.md")
    parser.add_argument("--goal", default=DEFAULT_GOAL)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    root = Path(args.project_root).expanduser().resolve()
    if not root.is_dir():
        raise SystemExit(f"Project root is not a directory: {root}")

    requested = Path(args.report).expanduser()
    target = requested.resolve() if requested.is_absolute() else (root / requested).resolve()
    try:
        target.relative_to(root)
    except ValueError as exc:
        raise SystemExit(f"Report must stay inside the project root: {target}") from exc

    if target.exists():
        print(f"Resume existing audit baton: {target}")
        return 0

    template = Path(__file__).resolve().parents[1] / "assets" / "audit-baton.md"
    content = template.read_text(encoding="utf-8")
    replacements = {
        "{{PROJECT_NAME}}": root.name,
        "{{PROJECT_ROOT}}": str(root),
        "{{DATE}}": date.today().isoformat(),
        "{{GOAL}}": args.goal,
    }
    for marker, value in replacements.items():
        content = content.replace(marker, value)

    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    print(f"Created audit baton: {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
