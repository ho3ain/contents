#!/usr/bin/env python3
"""
Prove the mirror is a byte-for-byte copy of MESH.

For every file in manifest.json:
  1. the copy under mirror/ must exist
  2. its sha256 must equal the sha256 recorded at extraction time
  3. if the source repo is still present, the ORIGINAL must also still match,
     which simultaneously proves the extraction did not modify MESH

Exit 0 = everything matches. Exit 1 = at least one mismatch (listed).
"""

from __future__ import annotations

import hashlib
import json
import os
import sys

OUT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
MIRROR = os.path.join(OUT, "mirror")
REPOS = {"backend": "/home/user/agentHub_backend", "frontend": "/home/user/agentHub_frontend"}


def sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> None:
    with open(os.path.join(OUT, "manifest.json"), encoding="utf-8") as fh:
        manifest = json.load(fh)

    missing, changed, source_changed, checked, source_checked = [], [], [], 0, 0

    for rec in manifest["files"]:
        copy_path = os.path.join(MIRROR, rec["repo"], rec["path"])
        if not os.path.isfile(copy_path):
            missing.append(f'{rec["repo"]}:{rec["path"]}')
            continue
        checked += 1
        if sha256(copy_path) != rec["sha256"]:
            changed.append(f'{rec["repo"]}:{rec["path"]}')

        src_root = REPOS.get(rec["repo"])
        src_path = os.path.join(src_root, rec["path"]) if src_root else None
        if src_path and os.path.isfile(src_path):
            source_checked += 1
            if sha256(src_path) != rec["sha256"]:
                source_changed.append(f'{rec["repo"]}:{rec["path"]}')

    print(f"manifest entries        : {len(manifest['files'])}")
    print(f"copies verified         : {checked}")
    print(f"originals re-verified   : {source_checked}")
    print(f"missing copies          : {len(missing)}")
    print(f"copies that differ      : {len(changed)}")
    print(f"ORIGINALS that differ   : {len(source_changed)}")

    for label, items in (("MISSING", missing), ("COPY CHANGED", changed),
                         ("SOURCE CHANGED", source_changed)):
        for item in items[:25]:
            print(f"  [{label}] {item}")
        if len(items) > 25:
            print(f"  [{label}] (+{len(items) - 25} more)")

    if missing or changed or source_changed:
        sys.exit(1)
    print()
    print("OK: every file in the mirror is byte-identical to MESH,")
    print("    and every MESH original is unchanged.")


if __name__ == "__main__":
    main()
