#!/usr/bin/env python3
"""
Extract the MESH content-production feature into a standalone, self-describing copy.

Design rules (deliberate):
  * Sources are opened READ-ONLY. Nothing in agentHub_backend / agentHub_frontend
    is created, modified, moved or deleted by this script.
  * Every declared path MUST exist. A missing path aborts the run before any
    copy happens, so a partial/silently-wrong package can never be produced.
  * Every copied file is sha256-verified against its source after the copy.
  * The mirror keeps ORIGINAL relative paths, so a diff against the live repo is
    trivial and re-integration is a plain path-for-path copy back.

Usage:  python3 extract.py            (writes ../mirror + ../manifest.json)
"""

from __future__ import annotations

import collections
import hashlib
import json
import os
import re
import shutil
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone

# --------------------------------------------------------------------------
# Locations
# --------------------------------------------------------------------------
HOME = "/home/user"
BE = os.path.join(HOME, "agentHub_backend")
FE = os.path.join(HOME, "agentHub_frontend")
OUT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
MIRROR = os.path.join(OUT, "mirror")

REPOS = {"backend": BE, "frontend": FE}

# Directory names never copied even when they sit inside a selected directory.
SKIP_DIRS = {
    "node_modules", "dist", "build", "coverage", ".git", "__pycache__",
    ".turbo", ".vite", ".cache", "out",
}

# Tier meanings:
#   core      -> the content-production feature itself. This IS the deliverable.
#   shared    -> platform code the feature genuinely depends on at runtime.
#   reference -> not part of the feature; copied only so the wiring/hook points
#                are visible (registration lines, route tables, env schema).
TIERS = ("core", "shared", "auto", "reference")


@dataclass
class Spec:
    repo: str          # "backend" | "frontend"
    tier: str          # core | shared | reference
    path: str          # path relative to the repo root (file OR directory)
    group: str         # human-facing grouping used in the manifest
    note: str = ""     # one line explaining why it is here
    exts: tuple = ()   # if set, only these extensions are taken from a directory
    exclude: tuple = ()  # repo-relative path prefixes to skip inside a directory


# --------------------------------------------------------------------------
# BACKEND — NestJS + TypeORM + PostgreSQL
# --------------------------------------------------------------------------
BACKEND_SPECS = [
    # ---------------- core: the blog platform -----------------------------
    Spec("backend", "core", "src/modules/blog", "Blog module (backend)",
         "Public reads, editorial CMS, comments, ratings, taxonomy, revisions."),
    Spec("backend", "core", "src/database/entities/blog", "Blog entities",
         "14 TypeORM entities: posts, categories, tags, revisions, comments, bans, ratings."),

    # ---------------- core: SEO studio + knowledge graph ------------------
    Spec("backend", "core", "src/modules/seo", "SEO studio & knowledge graph (backend)",
         "Knowledge graph, internal-link suggestions, SEO analysis, SSR render, sitemap."),
    Spec("backend", "core", "src/database/entities/seo", "SEO entities",
         "content_seo, content_link, link_suggestion."),

    # ---------------- core: schema ---------------------------------------
    Spec("backend", "core", "src/database/migrations/1772200000000-blog-platform.ts",
         "Migrations (content)", "Creates the whole blog schema."),
    Spec("backend", "core", "src/database/migrations/1772500000000-blog-search-fold.ts",
         "Migrations (content)", "Persian search-fold column + index for blog search."),
    Spec("backend", "core", "src/database/migrations/1772600000000-blog-engagement.ts",
         "Migrations (content)", "Comments, likes, reports, bans, ratings."),
    Spec("backend", "core", "src/database/migrations/1772700000000-seo-studio.ts",
         "Migrations (content)", "content_seo / content_link / link_suggestion tables."),
    Spec("backend", "core", "src/database/seeds/seed-blog-demo.ts",
         "Seeds", "Demo editorial content used to boot a usable blog."),

    # ---------------- core: tests ----------------------------------------
    Spec("backend", "core", "test/blog", "Backend e2e tests (content)",
         "blog, blog-engagement and blog-migration end-to-end suites."),
    Spec("backend", "core", "test/seo", "Backend e2e tests (content)",
         "SEO studio end-to-end suite."),
    Spec("backend", "core", "test/seo.e2e-spec.ts", "Backend e2e tests (content)",
         "Public SEO surface (sitemap, robots, meta, JSON-LD)."),
    Spec("backend", "core", "test/helpers/seo-shell.ts", "Backend e2e tests (content)",
         "Test helper that boots an SEO-capable Nest shell."),

    # ---------------- core: docs -----------------------------------------
    Spec("backend", "core", "docs/blog/EDITORIAL_API_NOTES.md", "Docs (content)",
         "Editorial API notes that ship with the backend."),

    # ---------------- shared: genuine runtime dependencies ----------------
    Spec("backend", "shared", "src/common/utils/persian-normalize.ts", "Shared utilities",
         "Persian text normalisation; blog search and slug folding depend on it."),
    Spec("backend", "shared", "src/modules/storage", "Media storage",
         "Cover images and in-article media. Imported by BlogModule."),
    Spec("backend", "shared", "src/modules/audit", "Audit trail",
         "Editorial actions are audit-logged. Imported by BlogModule."),
    Spec("backend", "shared", "src/modules/notifications", "Notifications",
         "Comment/▸publish notifications. Imported by BlogModule."),
    Spec("backend", "shared", "src/modules/categories", "Taxonomy / categories",
         "Marketplace taxonomy joined to posts; imported by SeoModule."),
    Spec("backend", "shared", "src/database/entities",
         "TypeORM entity graph",
         "The whole entity graph. `entities/index.ts` re-exports all of them and blog "
         "authors/comments/agents relate outward, so the graph only type-checks complete.",
         exclude=("src/database/entities/blog", "src/database/entities/seo")),
    Spec("backend", "shared", "src/database/taxonomy/taxonomy-data.ts", "Taxonomy / categories",
         "Canonical Persian taxonomy data used for archives and landing pages."),
    Spec("backend", "shared", "src/database/migrations/1772000000000-taxonomy-persian-industries.ts",
         "Taxonomy / categories", "Taxonomy schema the content archives read from."),
    Spec("backend", "shared", "src/database/migrations/1772100000000-taxonomy-search-document.ts",
         "Taxonomy / categories", "Search document used by taxonomy-aware content search."),
    Spec("backend", "shared", "src/modules/agents/search/search-concepts.ts", "Shared utilities",
         "Concept list shared by marketplace search and blog relevance."),
    Spec("backend", "shared", "src/modules/control-plane/authz/route-permissions.ts",
         "Authorisation", "Declares blog:view / blog:manage / blog:publish route guards."),
    Spec("backend", "shared", "src/modules/control-plane/authz/admin-permissions.ts",
         "Authorisation", "Permission catalogue containing the blog permissions."),

    # ---------------- reference: wiring only ------------------------------
    Spec("backend", "reference", "src/app.module.ts", "Wiring (reference only)",
         "Shows exactly where BlogModule and SeoModule are registered."),
    Spec("backend", "reference", "src/database/seeds/seed.ts", "Wiring (reference only)",
         "Seed runner that calls seed-blog-demo."),
    Spec("backend", "reference", "src/config/env.validation.ts", "Wiring (reference only)",
         "Env schema; contains the SEO/site-URL variables."),
    Spec("backend", "reference", "test/fixtures/public-routes.ts", "Wiring (reference only)",
         "Public route fixture listing the blog routes."),
    Spec("backend", "reference", "package.json", "Wiring (reference only)",
         "Source of truth for backend dependency versions."),
]

# --------------------------------------------------------------------------
# FRONTEND — React 19 + TypeScript + Vite (fa/RTL + en/LTR)
# --------------------------------------------------------------------------
FRONTEND_SPECS = [
    # ---------------- core: reader-facing blog ----------------------------
    Spec("frontend", "core", "src/pages/blog", "Blog pages (public)",
         "Home, article, archive, filters, engagement, share rail, article images."),

    # ---------------- core: editorial CMS + editor + graph ----------------
    Spec("frontend", "core", "src/pages/admin/blog", "Editorial CMS, editor & knowledge graph",
         "Admin list, Tiptap editor, SEO studio panel, taxonomy, comments, graph canvas."),

    # ---------------- core: API clients -----------------------------------
    Spec("frontend", "core", "src/api/blog.ts", "API clients (content)",
         "Every blog endpoint the UI calls."),
    Spec("frontend", "core", "src/api/seo.ts", "API clients (content)",
         "SEO studio + knowledge graph endpoints."),

    # ---------------- core: i18n ------------------------------------------
    Spec("frontend", "core", "src/i18n/blog.fa.ts", "i18n (content)",
         "Persian (RTL) strings for the whole content surface."),
    Spec("frontend", "core", "src/i18n/blog.en.ts", "i18n (content)",
         "English (LTR) strings for the whole content surface."),
    Spec("frontend", "core", "src/i18n/__tests__/blog-i18n.test.ts", "i18n (content)",
         "fa/en key-parity test."),

    # ---------------- core: styling ---------------------------------------
    Spec("frontend", "core", "src/styles/blog.css", "Styles (content)",
         "Reader-facing blog styling."),
    Spec("frontend", "core", "src/styles/blog-admin.css", "Styles (content)",
         "Editorial CMS, editor and knowledge-graph styling."),
    Spec("frontend", "core", "src/styles/blog-editorial.css", "Styles (content)",
         "Long-form article typography."),

    # ---------------- core: content libraries -----------------------------
    Spec("frontend", "core", "src/lib/seo.ts", "Content libraries",
         "Meta tags, canonical URLs, JSON-LD builders."),
    Spec("frontend", "core", "src/lib/__tests__/seo.test.ts", "Content libraries", "Tests for lib/seo."),
    Spec("frontend", "core", "src/lib/searchFold.ts", "Content libraries",
         "Persian search folding shared with the backend behaviour."),
    Spec("frontend", "core", "src/lib/__tests__/searchFold.test.ts", "Content libraries",
         "Tests for searchFold."),
    Spec("frontend", "core", "src/lib/usePageMeta.ts", "Content libraries",
         "Hook that applies per-page SEO metadata."),
    Spec("frontend", "core", "src/lib/__tests__/sitemap-coverage.test.ts", "Content libraries",
         "Asserts every public content route is in the sitemap."),
    Spec("frontend", "core", "src/lib/changelog.ts", "Content libraries",
         "Changelog parsing/formatting for creator-authored release notes."),

    # ---------------- core: static/editorial content ----------------------
    Spec("frontend", "core", "src/content", "Static editorial content",
         "Docs hub, legal documents, markdown-lite renderer, platform facts, social links."),

    # ---------------- core: other authoring surfaces ----------------------
    Spec("frontend", "core", "src/components/engagement/ChangelogEditor.tsx",
         "Other authoring surfaces", "Creator-facing changelog authoring component."),
    Spec("frontend", "core", "src/components/engagement/ProductChangelog.tsx",
         "Other authoring surfaces", "Reader-facing changelog renderer."),
    Spec("frontend", "core", "src/pages/website/docs", "Other authoring surfaces",
         "Docs hub and legal-document rendering pages."),

    # ---------------- core: tooling + e2e ---------------------------------
    Spec("frontend", "core", "scripts/emit-seo.mjs", "Tooling (content)",
         "Build-time sitemap.xml / robots.txt emitter."),
    Spec("frontend", "core", "scripts/qa/blog-qa.mjs", "Tooling (content)",
         "Blog QA crawler."),
    Spec("frontend", "core", "e2e/26-blog-discovery.spec.ts", "Playwright e2e (content)",
         "Discovery/reading journeys."),
    Spec("frontend", "core", "e2e/27-blog-engagement.spec.ts", "Playwright e2e (content)",
         "Comments, likes, ratings."),
    Spec("frontend", "core", "e2e/28-blog-editorial.spec.ts", "Playwright e2e (content)",
         "Editorial CMS journeys."),

    # ---------------- core: feature docs ----------------------------------
    Spec("frontend", "core", "docs/blog", "Docs (content)",
         "Blog decisions, release report, editorial implementation report."),
    Spec("frontend", "core", "docs/seo-studio", "Docs (content)",
         "SEO studio phase-0 audit, architecture, data model, migration, tests."),

    # ---------------- shared: genuine UI dependencies ---------------------
    Spec("frontend", "shared", "src/api/client.ts", "API plumbing", "fetch wrapper / envelope handling."),
    Spec("frontend", "shared", "src/api/endpoints.ts", "API plumbing", "Central endpoint registry."),
    Spec("frontend", "shared", "src/api/types.ts", "API plumbing", "Shared API types incl. content types."),
    Spec("frontend", "shared", "src/components/Toast.tsx", "Shared components", "Used by every editorial screen."),
    Spec("frontend", "shared", "src/components/Modal.tsx", "Shared components", "Used by CMS dialogs."),
    Spec("frontend", "shared", "src/components/Pagination.tsx", "Shared components", "Used by CMS lists."),
    Spec("frontend", "shared", "src/components/ui", "Shared components",
         "Design-system primitives (Button, Card, Badge, AppIcon, SegmentedControl, icons…)."),
    Spec("frontend", "shared", "src/components/share", "Shared components",
         "Share menu + targets used by the article share rail."),
    Spec("frontend", "shared", "src/theme", "Theme tokens",
         "The fixed organisational colour/spacing tokens the content UI must use."),
    Spec("frontend", "shared", "src/i18n/index.tsx", "i18n plumbing",
         "Translation provider; blog.fa/blog.en are registered here."),
    Spec("frontend", "shared", "src/lib/format.ts", "Shared utilities", "Date/number formatting."),
    Spec("frontend", "shared", "src/lib/error.ts", "Shared utilities", "Error normalisation."),
    Spec("frontend", "shared", "src/lib/useAsync.ts", "Shared utilities", "Async state hook."),
    Spec("frontend", "shared", "src/lib/avatar.ts", "Shared utilities", "Author avatars."),
    Spec("frontend", "shared", "src/lib/safe-url.ts", "Shared utilities", "URL sanitisation for links/media."),
    Spec("frontend", "shared", "docs/icon-system/mesh-icon-specimen.svg", "Static assets",
         "Icon specimen sheet; the design-system test compares it byte-for-byte."),
    Spec("frontend", "shared", "public", "Static assets",
         "sitemap.xml / robots.txt (emitted by scripts/emit-seo.mjs), favicon, "
         "icon sprite and the og-cover used in article social cards."),
    Spec("frontend", "shared", "src/assets", "Static assets",
         "Icon SVG sources; the design-system icon test compares them byte-for-byte."),
    Spec("frontend", "shared", "src/vite-env.d.ts", "Ambient declarations",
         "Vite client types. Never imported by path; TypeScript loads it implicitly."),
    Spec("frontend", "shared", "src/types", "Ambient declarations",
         "Module declarations for untyped packages (e.g. @multiavatar/multiavatar)."),
    Spec("frontend", "shared", "src/app/providers.tsx", "App shell",
         "Composes ThemeProvider + I18nProvider + AuthProvider + ToastProvider; "
         "every content page expects all four."),
    Spec("frontend", "shared", "src/index.css", "Styles (content)",
         "Base stylesheet the blog stylesheets build on."),
    Spec("frontend", "shared", "src/test", "Test harness",
         "Vitest setup file (jest-dom matchers + RTL config) every suite loads."),
    Spec("frontend", "shared", "src/context/AuthContext.tsx", "Shared utilities",
         "Identity for comments, ratings and CMS permissions."),

    # ---------------- reference: wiring only ------------------------------
    Spec("frontend", "reference", "src/app/router.tsx", "Wiring (reference only)",
         "All content routes, public and admin."),
    Spec("frontend", "reference", "src/main.tsx", "Wiring (reference only)",
         "Where the blog stylesheets are imported."),
    Spec("frontend", "reference", "src/i18n/messages/fa.ts", "Wiring (reference only)",
         "Root fa message map that pulls in blog.fa."),
    Spec("frontend", "reference", "src/i18n/messages/en.ts", "Wiring (reference only)",
         "Root en message map that pulls in blog.en."),
    Spec("frontend", "reference", "src/lib/nav.ts", "Wiring (reference only)",
         "Navigation entries pointing at /blog."),
    Spec("frontend", "reference", "src/components/Header.tsx", "Wiring (reference only)",
         "Header link into the blog."),
    Spec("frontend", "reference", "package.json", "Wiring (reference only)",
         "Source of truth for frontend dependency versions (Tiptap, xyflow…)."),
]

SPECS = BACKEND_SPECS + FRONTEND_SPECS


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------
CODE_EXT = (".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs")
TRY_SUFFIX = ["", ".ts", ".tsx", ".mts", ".cts", ".d.ts", ".d.mts", ".d.cts",
              ".js", ".jsx", ".mjs", ".cjs", ".json", ".css", ".svg", ".png"]
TRY_INDEX = ["/index.ts", "/index.tsx", "/index.js", "/index.jsx"]

# A relative specifier always starts with "./" or "../". Requiring that prefix
# (and forbidding newlines) stops prose inside comments — e.g. the literal text
#   Vite fail with "Failed to resolve import".
# in frontend/src/lib/avatar.ts — from being mistaken for an import.
IMPORT_RE = re.compile(
    r"""(?:\bfrom[ \t]*|\bimport[ \t]*|\brequire[ \t]*\([ \t]*|\bimport[ \t]*\([ \t]*)['"](\.{1,2}/[^'"\n]*)['"]"""
)


def resolve_rel(repo_root: str, from_rel: str, spec: str) -> str | None:
    """Resolve a relative import to a repo-relative path, or None."""
    base = os.path.dirname(os.path.join(repo_root, from_rel))
    target = os.path.normpath(os.path.join(base, spec))
    if not target.startswith(repo_root):
        return None
    for suffix in TRY_SUFFIX:
        if os.path.isfile(target + suffix):
            return os.path.relpath(target + suffix, repo_root)
    for ext in (".js", ".jsx", ".mjs"):
        if target.endswith(ext):
            stem = target[: -len(ext)]
            for suffix in (".ts", ".tsx"):
                if os.path.isfile(stem + suffix):
                    return os.path.relpath(stem + suffix, repo_root)
    if os.path.isdir(target):
        for idx in TRY_INDEX:
            if os.path.isfile(target + idx):
                return os.path.relpath(target + idx, repo_root)
    return None


def sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def count_lines(path: str) -> int:
    try:
        with open(path, "rb") as fh:
            data = fh.read()
        if b"\x00" in data[:4096]:
            return 0
        return data.count(b"\n") + (0 if data.endswith(b"\n") or not data else 1)
    except OSError:
        return 0


def walk_spec(spec: Spec) -> list[str]:
    """Return repo-relative file paths for one spec (file or directory)."""
    root = REPOS[spec.repo]
    abs_path = os.path.join(root, spec.path)
    if os.path.isfile(abs_path):
        return [spec.path]
    found: list[str] = []
    for dirpath, dirnames, filenames in os.walk(abs_path):
        dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS)
        for name in sorted(filenames):
            full = os.path.join(dirpath, name)
            rel = os.path.relpath(full, root)
            if spec.exts and not name.endswith(spec.exts):
                continue
            if spec.exclude and rel.startswith(spec.exclude):
                continue
            found.append(rel)
    return sorted(found)


# --------------------------------------------------------------------------
# Phase 1 — validate every declared path BEFORE touching the filesystem
# --------------------------------------------------------------------------
def validate() -> None:
    missing = []
    for spec in SPECS:
        if spec.tier not in TIERS:
            raise SystemExit(f"bad tier {spec.tier!r} for {spec.path}")
        if spec.repo not in REPOS:
            raise SystemExit(f"bad repo {spec.repo!r} for {spec.path}")
        if not os.path.exists(os.path.join(REPOS[spec.repo], spec.path)):
            missing.append(f"{spec.repo}:{spec.path}")
    if missing:
        print("ABORT — declared paths that do not exist:", file=sys.stderr)
        for m in missing:
            print("   " + m, file=sys.stderr)
        raise SystemExit(2)

    # A file must not be claimed by two specs (would make the manifest lie).
    seen: dict[tuple[str, str], str] = {}
    clashes = []
    for spec in SPECS:
        for rel in walk_spec(spec):
            key = (spec.repo, rel)
            if key in seen and seen[key] != spec.path:
                clashes.append(f"{spec.repo}:{rel} claimed by {seen[key]!r} and {spec.path!r}")
            seen[key] = spec.path
    if clashes:
        print("ABORT — overlapping specs:", file=sys.stderr)
        for c in clashes:
            print("   " + c, file=sys.stderr)
        raise SystemExit(3)


# --------------------------------------------------------------------------
# Phase 2 — copy + verify
# --------------------------------------------------------------------------
def close_over_imports(selected: dict) -> list[dict]:
    """
    Iteratively pull in every file the selected code imports, until the set is
    closed under relative imports.

    Two kinds of file are copied but NOT traversed:
      * tier `reference` — app.module.ts / router.tsx / entity barrels import the
        ENTIRE application. Traversing them would drag in all of MESH, which is
        the opposite of an extract.
      * `test/` and `e2e/` files — they boot the full app fixture. Their outside
        references are reported separately in UNRESOLVED_TEST_IMPORTS.
    """
    seeds = [
        (repo, rel) for (repo, rel), meta in selected.items()
        if meta["tier"] != "reference"
        and not rel.startswith(("test/", "e2e/"))
        and rel.endswith(CODE_EXT)
    ]
    # Breadth-first, so `parent` yields the SHORTEST chain from a declared seed.
    queue = collections.deque(seeds)
    parent: dict = {k: None for k in seeds}
    added: list[dict] = []
    guard = 0
    while queue:
        guard += 1
        if guard > 200_000:
            raise SystemExit("closure did not converge")
        repo, rel = queue.popleft()
        root = REPOS[repo]
        try:
            with open(os.path.join(root, rel), encoding="utf-8") as fh:
                src_text = fh.read()
        except (OSError, UnicodeDecodeError):
            continue
        for spec_str in IMPORT_RE.findall(src_text):
            target = resolve_rel(root, rel, spec_str)
            if target is None or (repo, target) in selected:
                continue
            selected[(repo, target)] = {
                "tier": "auto",
                "group": "Auto-resolved dependency",
                "spec": target,
                "note": "Pulled in automatically: extracted code imports it (import-closure pass).",
            }
            parent[(repo, target)] = (repo, rel)
            added.append({"repo": repo, "path": target})
            if target.endswith(CODE_EXT):
                queue.append((repo, target))

    # A .js/.mjs/.cjs module is typed by a SIBLING declaration file that no
    # import statement ever names (TypeScript picks it up implicitly). Without
    # this pass the extract compiles as `any` — or fails under noImplicitAny.
    DECL_FOR = {".js": ".d.ts", ".jsx": ".d.ts", ".mjs": ".d.mts", ".cjs": ".d.cts"}
    for (repo, rel) in list(selected.keys()):
        stem, ext = os.path.splitext(rel)
        decl_ext = DECL_FOR.get(ext)
        if not decl_ext:
            continue
        decl = stem + decl_ext
        if (repo, decl) in selected:
            continue
        if os.path.isfile(os.path.join(REPOS[repo], decl)):
            selected[(repo, decl)] = {
                "tier": "auto",
                "group": "Auto-resolved dependency",
                "spec": decl,
                "note": f"Sibling TypeScript declaration for {os.path.basename(rel)}.",
                "why": [rel, decl],
            }
            added.append({"repo": repo, "path": decl})

    # Record, for every auto-added file, the chain back to a declared seed.
    for repo, rel in [(a["repo"], a["path"]) for a in added]:
        chain, cur, hops = [], (repo, rel), 0
        while cur is not None and hops < 64:
            chain.append(cur[1])
            cur = parent.get(cur)
            hops += 1
        if selected[(repo, rel)].get("why"):
            continue
        selected[(repo, rel)]["why"] = list(reversed(chain))
    return added


def collect_unresolved(selected: dict) -> list[dict]:
    """Relative imports that still do not resolve inside the selected set."""
    out = []
    for (repo, rel), meta in sorted(selected.items()):
        if not rel.endswith(CODE_EXT):
            continue
        root = REPOS[repo]
        try:
            with open(os.path.join(root, rel), encoding="utf-8") as fh:
                src_text = fh.read()
        except (OSError, UnicodeDecodeError):
            continue
        for spec_str in IMPORT_RE.findall(src_text):
            target = resolve_rel(root, rel, spec_str)
            if target is None or (repo, target) not in selected:
                out.append({"repo": repo, "file": rel, "specifier": spec_str,
                            "tier": meta["tier"]})
    return out


def extract() -> dict:
    if os.path.isdir(MIRROR):
        shutil.rmtree(MIRROR)

    # ---- build the declared selection ------------------------------------
    selected: dict = {}
    for spec in SPECS:
        for rel in walk_spec(spec):
            selected[(spec.repo, rel)] = {
                "tier": spec.tier, "group": spec.group,
                "spec": spec.path, "note": spec.note,
            }
    declared_count = len(selected)

    # ---- close it under relative imports ---------------------------------
    auto_added = close_over_imports(selected)
    unresolved = collect_unresolved(selected)

    records: list[dict] = []
    for (repo, rel), meta in selected.items():
            root = REPOS[repo]
            spec = Spec(repo, meta["tier"], meta["spec"], meta["group"], meta["note"])
            src = os.path.join(root, rel)
            dst = os.path.join(MIRROR, spec.repo, rel)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copy2(src, dst)

            src_hash = sha256(src)
            dst_hash = sha256(dst)
            if src_hash != dst_hash:
                raise SystemExit(f"HASH MISMATCH after copy: {spec.repo}:{rel}")

            records.append({
                "repo": spec.repo,
                "tier": spec.tier,
                "group": spec.group,
                "path": rel,
                "spec": spec.path,
                "note": spec.note,
                "why": meta.get("why", []),
                "bytes": os.path.getsize(src),
                "lines": count_lines(src),
                "sha256": src_hash,
            })

    records.sort(key=lambda r: (r["repo"], TIERS.index(r["tier"]), r["path"]))
    return {
        "name": "MESH content-production feature extract",
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "sources": {
            "backend": {"path": BE, "commit": git_head(BE)},
            "frontend": {"path": FE, "commit": git_head(FE)},
        },
        "tiers": {
            "core": "The content-production feature itself.",
            "shared": "Platform code the feature genuinely depends on, declared by hand.",
            "auto": "Pulled in transitively by the import-closure pass. See each file's `why` chain.",
            "reference": "Not part of the feature; copied to show the wiring/hook points.",
        },
        "totals": {
            "files": len(records),
            "bytes": sum(r["bytes"] for r in records),
            "lines": sum(r["lines"] for r in records),
            "declared_files": declared_count,
            "auto_resolved_files": len(auto_added),
        },
        "cut_points": cut_points(records),
        "closure": {
            "policy": (
                "The selection is closed under relative imports. Files in tier "
                "`reference` and files under test/ or e2e/ are copied but not "
                "traversed, because they import the entire application."
            ),
            "unresolved_count": len(unresolved),
            "unresolved": unresolved,
        },
        "files": records,
    }


BRIDGE_EDGES = [
    ("backend", "src/modules/agents/agents.module.ts",
     "SeoModule imports AgentsModule for agent-aware internal links. That single "
     "NestJS edge transitively drags in runtime, finance, commerce, crm and auth."),
    ("backend", "src/database/entities/identity/user.entity.ts",
     "Blog authors/comments relate to User, whose own relations fan out across "
     "the entity graph."),
    ("frontend", "src/i18n/index.tsx",
     "The i18n provider registers every message pack, not just blog.fa/blog.en."),
]


def cut_points(records: list[dict]) -> list[dict]:
    """How many auto-pulled files each known bridge edge is responsible for."""
    out = []
    for repo, bridge, why in BRIDGE_EDGES:
        hit = [r for r in records
               if r["repo"] == repo and r["tier"] == "auto" and bridge in (r.get("why") or [])]
        out.append({
            "repo": repo,
            "edge": bridge,
            "explanation": why,
            "auto_files_through_it": len(hit),
            "lines_through_it": sum(r["lines"] for r in hit),
        })
    return sorted(out, key=lambda x: -x["auto_files_through_it"])


def git_head(repo: str) -> str:
    head = os.path.join(repo, ".git", "HEAD")
    try:
        with open(head, "r", encoding="utf-8") as fh:
            ref = fh.read().strip()
        if ref.startswith("ref: "):
            refpath = os.path.join(repo, ".git", ref[5:])
            if os.path.exists(refpath):
                with open(refpath, "r", encoding="utf-8") as fh:
                    return fh.read().strip()[:40]
            packed = os.path.join(repo, ".git", "packed-refs")
            if os.path.exists(packed):
                with open(packed, "r", encoding="utf-8") as fh:
                    for line in fh:
                        if line.rstrip().endswith(" " + ref[5:]):
                            return line.split()[0]
        return ref[:40]
    except OSError:
        return "unknown"


def main() -> None:
    validate()
    manifest = extract()
    with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, ensure_ascii=False, indent=2)
        fh.write("\n")

    t = manifest["totals"]
    print(f"declared      : {t['declared_files']} files")
    print(f"auto-resolved : {t['auto_resolved_files']} files (import closure)")
    print(f"files         : {t['files']}")
    print(f"lines         : {t['lines']:,}")
    print(f"bytes         : {t['bytes']:,}")
    print(f"unresolved    : {manifest['closure']['unresolved_count']} "
          f"(expected: only from test/e2e/reference files)")
    print()
    print("bridge edges (cut these to shrink the extract):")
    for c in manifest["cut_points"]:
        print(f"  {c['auto_files_through_it']:4d} files / {c['lines_through_it']:7,d} lines"
              f"  <- {c['repo']}:{c['edge']}")
    for repo in ("backend", "frontend"):
        for tier in TIERS:
            sel = [r for r in manifest["files"] if r["repo"] == repo and r["tier"] == tier]
            if sel:
                print(f"  {repo:9s} {tier:9s} {len(sel):4d} files  "
                      f"{sum(r['lines'] for r in sel):7,d} lines")


if __name__ == "__main__":
    main()
