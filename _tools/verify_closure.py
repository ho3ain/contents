#!/usr/bin/env python3
"""
Completeness proof for the extract.

Walks every TypeScript/JavaScript file in `mirror/` and resolves every RELATIVE
import against the mirror itself. A dangling relative import means the extract
is incomplete — a file the feature needs was not copied.

Exit code 0 = closed (nothing missing). Exit code 1 = dangling imports listed.
Also reports which bare (node_modules) packages are required, so the standalone
package.json can be checked against reality.
"""

from __future__ import annotations

import json
import os
import re
import sys

# Node builtins may be imported bare (no "node:" prefix) — they are not packages.
BUILTINS = {
    "assert", "async_hooks", "buffer", "child_process", "cluster", "console",
    "constants", "crypto", "dgram", "diagnostics_channel", "dns", "domain",
    "events", "fs", "http", "http2", "https", "inspector", "module", "net",
    "os", "path", "perf_hooks", "process", "punycode", "querystring",
    "readline", "repl", "stream", "string_decoder", "timers", "tls", "trace_events",
    "tty", "url", "util", "v8", "vm", "wasi", "worker_threads", "zlib",
}
# npm name grammar, so prose caught inside comments is never mistaken for a package.
PKG_RE = re.compile(r"^(?:@[a-z0-9][a-z0-9._~-]*/)?[a-z0-9][a-z0-9._~-]*$")
from collections import defaultdict

OUT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
MIRROR = os.path.join(OUT, "mirror")
SOURCE_REPOS = {
    "backend": "/home/user/agentHub_backend",
    "frontend": "/home/user/agentHub_frontend",
}


def declared_deps(repo_dir: str) -> dict:
    """Every dependency the source repo declares, with its version range."""
    try:
        with open(os.path.join(repo_dir, "package.json"), encoding="utf-8") as fh:
            pkg = json.load(fh)
    except OSError:
        return {}
    out = {}
    for field in ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies"):
        out.update(pkg.get(field, {}))
    return out

CODE_EXT = (".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs")
# Order matters: TS resolution tries the exact file, then extensions, then /index.
TRY_SUFFIX = ["", ".ts", ".tsx", ".d.ts", ".js", ".jsx", ".mjs", ".cjs", ".json",
              ".css", ".svg", ".png"]
TRY_INDEX = ["/index.ts", "/index.tsx", "/index.js", "/index.jsx"]

SPEC_RE = re.compile(
    r"""(?:\bfrom[ \t]*|\bimport[ \t]*|\brequire[ \t]*\([ \t]*|\bimport[ \t]*\([ \t]*)['"]([^'"\n]+)['"]"""
)


def iter_code_files() -> list[str]:
    out = []
    for dirpath, dirnames, filenames in os.walk(MIRROR):
        dirnames[:] = sorted(d for d in dirnames if d != "node_modules")
        for name in sorted(filenames):
            if name.endswith(CODE_EXT):
                out.append(os.path.join(dirpath, name))
    return out


def resolve(base_dir: str, spec: str) -> str | None:
    target = os.path.normpath(os.path.join(base_dir, spec))
    for suffix in TRY_SUFFIX:
        cand = target + suffix
        if os.path.isfile(cand):
            return cand
    # TS allows importing "./x.js" to mean "./x.ts"
    for ext in (".js", ".jsx", ".mjs"):
        if target.endswith(ext):
            stem = target[: -len(ext)]
            for suffix in (".ts", ".tsx"):
                if os.path.isfile(stem + suffix):
                    return stem + suffix
    if os.path.isdir(target):
        for idx in TRY_INDEX:
            cand = target + idx
            if os.path.isfile(cand):
                return cand
    return None


def main() -> None:
    dangling: list[tuple[str, str]] = []
    bare: dict[str, set] = defaultdict(set)
    scanned = 0

    for path in iter_code_files():
        scanned += 1
        try:
            with open(path, encoding="utf-8") as fh:
                src = fh.read()
        except (OSError, UnicodeDecodeError):
            continue
        base_dir = os.path.dirname(path)
        rel_file = os.path.relpath(path, MIRROR)
        for spec in SPEC_RE.findall(src):
            if spec.startswith("."):
                if resolve(base_dir, spec) is None:
                    dangling.append((rel_file, spec))
            elif not spec.startswith(("node:", "/", "http:", "https:", "data:")):
                pkg = spec
                if pkg.startswith("@"):
                    pkg = "/".join(pkg.split("/")[:2])
                else:
                    pkg = pkg.split("/")[0]
                if pkg in BUILTINS or not PKG_RE.match(pkg):
                    continue
                bare[pkg].add(rel_file.split(os.sep)[0])

    print(f"scanned         : {scanned} code files")
    print(f"dangling imports: {len(dangling)}")
    # A bare specifier only counts as a package if the owning repo declares it.
    # Prose inside comments (e.g. `moves a lead from "contacted" to`) is
    # syntactically identical to an import and can only be ruled out this way.
    declared = {r: declared_deps(d) for r, d in SOURCE_REPOS.items()}
    # Imported for real, but satisfied transitively rather than declared.
    TRANSITIVE = {
        "express": "types only (`import type`), provided by @nestjs/platform-express + @types/express",
        "playwright": "provided by @playwright/test",
    }
    real: dict = {}
    transitive: dict = {}
    prose: dict = {}
    for pkg, repos in bare.items():
        for repo in repos:
            if pkg in declared.get(repo, {}):
                real.setdefault(pkg, {})[repo] = declared[repo][pkg]
            elif pkg in TRANSITIVE:
                transitive.setdefault(pkg, set()).add(repo)
            else:
                prose.setdefault(pkg, set()).add(repo)

    print()
    print("external packages required by the extracted code "
          "(cross-checked against each repo's package.json):")
    for pkg in sorted(real):
        for repo, version in sorted(real[pkg].items()):
            print(f"  {pkg:32s} {version:16s} <- {repo}")
    if transitive:
        print()
        print("imported but not declared directly (satisfied transitively):")
        for pkg in sorted(transitive):
            print(f"  {pkg:32s} {TRANSITIVE[pkg]}")
    if prose:
        print()
        print("ignored — matched the import grammar but no repo declares them")
        print("(these are quoted words inside comments, not imports):")
        for pkg in sorted(prose):
            print(f"  {pkg!r} <- {', '.join(sorted(prose[pkg]))}")
    print()

    report = {
        "scanned_files": scanned,
        "dangling_count": len(dangling),
        "dangling": [{"file": f, "specifier": s} for f, s in sorted(dangling)],
        "external_packages": {k: v for k, v in sorted(real.items())},
        "transitive_packages": {k: TRANSITIVE[k] for k in sorted(transitive)},
        "ignored_non_packages": {k: sorted(v) for k, v in sorted(prose.items())},
    }
    with open(os.path.join(OUT, "_tools", "closure-report.json"), "w", encoding="utf-8") as fh:
        json.dump(report, fh, ensure_ascii=False, indent=2)
        fh.write("\n")

    if dangling:
        print("DANGLING RELATIVE IMPORTS — the extract is NOT closed:")
        grouped: dict[str, list[str]] = defaultdict(list)
        for f, s in sorted(dangling):
            grouped[s].append(f)
        for spec in sorted(grouped, key=lambda s: -len(grouped[s])):
            print(f"  {spec}")
            for f in grouped[spec][:4]:
                print(f"      <- {f}")
            if len(grouped[spec]) > 4:
                print(f"      <- (+{len(grouped[spec]) - 4} more)")
        sys.exit(1)

    print("CLOSED: every relative import inside the mirror resolves inside the mirror.")


if __name__ == "__main__":
    main()
