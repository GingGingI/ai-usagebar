#!/usr/bin/env python3
"""Bump the version in metadata.json for an ai-usagebar release.

A GNOME Shell extension carries two version fields:

  - "version":      a monotonically increasing integer. extensions.gnome.org
                    compares THIS to decide whether an update exists, so it must
                    increase by 1 on every release, regardless of bump type.
  - "version-name": the human semver string (e.g. "1.0.1") shown to users.

This script computes the next semver from the bump type, increments the integer,
and prints the result. Pass --write to persist; without it, it's a dry run so
you can confirm the numbers before touching the file.

Usage:
    python3 bump.py {major|minor|patch}          # dry run, prints old -> new
    python3 bump.py {major|minor|patch} --write   # writes metadata.json
"""
import json
import sys
from pathlib import Path

META = Path(__file__).resolve().parents[4] / "metadata.json"


def next_semver(current: str, bump: str) -> str:
    parts = current.split(".")
    if len(parts) != 3 or not all(p.isdigit() for p in parts):
        sys.exit(f"version-name {current!r} is not MAJOR.MINOR.PATCH; fix it by hand")
    major, minor, patch = (int(p) for p in parts)
    if bump == "major":
        return f"{major + 1}.0.0"
    if bump == "minor":
        return f"{major}.{minor + 1}.0"
    if bump == "patch":
        return f"{major}.{minor}.{patch + 1}"
    sys.exit(f"unknown bump type {bump!r}; use major|minor|patch")


def main() -> None:
    if len(sys.argv) < 2 or sys.argv[1] not in ("major", "minor", "patch"):
        sys.exit("usage: bump.py {major|minor|patch} [--write]")
    bump = sys.argv[1]
    write = "--write" in sys.argv[2:]

    data = json.loads(META.read_text())
    old_name = data["version-name"]
    old_code = int(data["version"])
    new_name = next_semver(old_name, bump)
    new_code = old_code + 1

    print(f"version-name: {old_name} -> {new_name}")
    print(f"version:      {old_code} -> {new_code}  (GNOME integer, always +1)")
    print(f"tag:          v{new_name}")

    if write:
        data["version"] = new_code
        data["version-name"] = new_name
        # Preserve the file's 2-space indent + trailing newline so the diff is
        # only the two changed lines.
        META.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
        print("metadata.json written")
    else:
        print("(dry run — re-run with --write to persist)")


if __name__ == "__main__":
    main()
