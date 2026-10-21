#!/usr/bin/env python3
"""Inventory remote command dispatch cases and literal source references.

This is a discovery aid, not proof that a control exists or that the desktop
accepts the command. Keep verified native/host outcomes in the readiness ledger.
"""

import csv
import re
from collections import defaultdict
from datetime import date
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DESKTOP = ROOT.parent / "koryphaios"
ADAPTER = ROOT / "src/control/remoteClient.ts"
DESTINATION = ROOT / "docs/audit" / date.today().isoformat() / "adapter-command-inventory.csv"
SOURCE_EXTENSIONS = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".svelte"}
CASE_PATTERN = re.compile(r"(?m)^[ \t]*case ['\"]([a-z][a-z0-9_.-]+)['\"]:[ \t]*\{?")
API_LITERAL_PATTERN = re.compile(r"(?P<quote>[`'\"])(?P<path>/api/[^`'\"\s]+)(?P=quote)")
METHOD_PATTERN = re.compile(r"\bmethod\s*:\s*['\"](GET|POST|PUT|PATCH|DELETE)['\"]")


def references(paths: list[Path], names: list[str]) -> dict[str, set[str]]:
    hits: dict[str, set[str]] = defaultdict(set)
    escaped = "|".join(re.escape(name) for name in sorted(names, key=len, reverse=True))
    literal = re.compile(r"(?P<quote>['\"])(?P<name>" + escaped + r")(?P=quote)")
    for source in paths:
        if not source.is_file() or source.suffix not in SOURCE_EXTENSIONS:
            continue
        try:
            content = source.read_text(encoding="utf-8")
        except (OSError, UnicodeError):
            continue
        origin = str(source.relative_to(ROOT)) if source.is_relative_to(ROOT) else f"desktop/{source.relative_to(DESKTOP)}"
        for match in literal.finditer(content):
            hits[match.group("name")].add(origin)
    return hits


def files_in(*paths: Path) -> list[Path]:
    return [path for folder in paths if folder.exists() for path in (folder.rglob("*") if folder.is_dir() else [folder])]


def main() -> None:
    text = ADAPTER.read_text(encoding="utf-8")
    dispatch_start = text.index("switch (command.name)")
    dispatch_end = text.index("default:", dispatch_start)
    cases = list(CASE_PATTERN.finditer(text, dispatch_start, dispatch_end))
    names = [match.group(1) for match in cases]
    if len(names) != len(set(names)):
        raise ValueError("Duplicate command dispatch cases detected")

    ui = references(files_in(ROOT / "src/components", ROOT / "src/app", ROOT / "src/control/ControlProvider.tsx"), names)
    tests = references(files_in(ROOT / "tests"), names)
    desktop = references(files_in(DESKTOP / "frontend/src", DESKTOP / "desktop"), names)
    host = references(files_in(DESKTOP / "backend/src/routes", DESKTOP / "shared/src"), names)

    DESTINATION.parent.mkdir(parents=True, exist_ok=True)
    with DESTINATION.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(("command", "mobile_adapter_line", "mobile_ui_provider_literal_refs", "mobile_test_literal_refs", "desktop_ui_literal_refs", "desktop_backend_shared_literal_refs", "adapter_api_path_literals_UNVERIFIED", "adapter_http_method_literals_UNVERIFIED", "direct_native", "linked_native", "desktop_effect", "physical_device"))
        with_paths = 0
        for index, match in enumerate(cases):
            name = match.group(1)
            line = text.count("\n", 0, match.start()) + 1
            # Hints are extracted only from each command's own switch body.
            # A path literal is not a verified route/handler, and a method
            # literal is not necessarily paired with any particular path.
            body_end = cases[index + 1].start() if index + 1 < len(cases) else dispatch_end
            body = text[match.end():body_end]
            paths = sorted({item.group("path") for item in API_LITERAL_PATTERN.finditer(body)})
            methods = sorted(set(METHOD_PATTERN.findall(body)))
            with_paths += bool(paths)
            writer.writerow((name, line, "; ".join(sorted(ui[name])), "; ".join(sorted(tests[name])), "; ".join(sorted(desktop[name])), "; ".join(sorted(host[name])), "; ".join(paths), "; ".join(methods), "NOT_VERIFIED", "NOT_VERIFIED", "NOT_VERIFIED", "NOT_VERIFIED"))

    print(f"Wrote {len(cases)} mobile adapter command cases to {DESTINATION}")
    print(f"Literal references: {sum(bool(ui[name]) for name in names)} mobile UI/provider; {sum(bool(tests[name]) for name in names)} tests; {sum(bool(desktop[name]) for name in names)} desktop UI; {sum(bool(host[name]) for name in names)} desktop backend/shared")
    print(f"Source-only API path hints: {with_paths}/{len(cases)} commands; remaining commands require handler tracing or are local-only")


if __name__ == "__main__":
    main()
