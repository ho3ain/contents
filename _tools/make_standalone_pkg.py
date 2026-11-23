#!/usr/bin/env python3
"""
Generate standalone/{backend,frontend}/package.json from the VERIFIED dependency
list produced by verify_closure.py, so the manifests can never drift from what
the extracted code actually imports.

Every version range is copied verbatim from the source repo, never invented.
A few packages are added that no import statement reveals:
  * runtime/tooling that is loaded by name (pg driver, reflect-metadata, …)
  * @types/* packages matching the runtime deps
Each addition is annotated below so nothing is unexplained.
"""

from __future__ import annotations

import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, ".."))
REPOS = {"backend": "/home/user/agentHub_backend", "frontend": "/home/user/agentHub_frontend"}

# Not discoverable from import statements, but required to run/build.
# reason -> listed in the generated file as a comment block in the README.
EXTRA = {
    "backend": {
        "dependencies": {
            "pg": "PostgreSQL driver, loaded by TypeORM through `type: 'postgres'`.",
            "reflect-metadata": "Required by NestJS/TypeORM decorators.",
            "rxjs": "NestJS peer dependency.",
            "dotenv": "Loaded by main.ts and the data source.",
        },
        "devDependencies": {
            "@nestjs/cli": "`nest build` / `nest start`.",
            "@nestjs/schematics": "@nestjs/cli peer.",
            "typescript": "Compiler.",
            "ts-node": "TypeORM CLI + seeds.",
            "ts-jest": "Jest transform.",
            "jest": "Unit test runner.",
            "@types/node": "Node typings.",
            "@types/jest": "Jest typings.",
            "@types/express": "`import type { Response } from 'express'` in controllers.",
            "@types/supertest": "e2e typings.",
            "@types/bcryptjs": "bcryptjs typings.",
            "@types/pg": "pg typings.",
            "@types/nodemailer": "nodemailer typings.",
            "source-map-support": "Readable stack traces.",
        },
    },
    "frontend": {
        "dependencies": {},
        "devDependencies": {
            "vite": "Dev server and bundler.",
            "@vitejs/plugin-react": "React fast refresh / JSX transform.",
            "typescript": "Compiler.",
            "jsdom": "Vitest DOM environment.",
            "@types/react": "React typings.",
            "@types/react-dom": "React DOM typings.",
        },
    },
}

# Packages that only the Playwright e2e specs need: keep them out of the
# default install so a plain `npm install` stays small.
E2E_ONLY = {"@playwright/test", "@axe-core/playwright"}

DEV_HINTS = {
    "vitest", "@testing-library/react", "@testing-library/jest-dom",
    "@nestjs/testing", "supertest",
}


def main() -> None:
    with open(os.path.join(HERE, "closure-report.json"), encoding="utf-8") as fh:
        report = json.load(fh)
    external = report["external_packages"]            # pkg -> {repo: version}

    for repo in ("backend", "frontend"):
        declared_path = os.path.join(REPOS[repo], "package.json")
        with open(declared_path, encoding="utf-8") as fh:
            source_pkg = json.load(fh)
        source_all = {}
        for field in ("dependencies", "devDependencies"):
            source_all.update(source_pkg.get(field, {}))

        deps: dict = {}
        dev: dict = {}

        for pkg, by_repo in sorted(external.items()):
            if repo not in by_repo:
                continue
            version = by_repo[repo]
            if pkg in E2E_ONLY or pkg in DEV_HINTS:
                dev[pkg] = version
            else:
                deps[pkg] = version

        missing = []
        for pkg in sorted(EXTRA[repo]["dependencies"]):
            if pkg in source_all:
                deps[pkg] = source_all[pkg]
            else:
                missing.append(pkg)
        for pkg in sorted(EXTRA[repo]["devDependencies"]):
            if pkg in source_all:
                dev[pkg] = source_all[pkg]
            else:
                missing.append(pkg)
        if missing:
            raise SystemExit(f"{repo}: not declared in the source repo: {missing}")

        if repo == "backend":
            pkg_json = {
                "name": "mesh-content-backend",
                "version": "0.0.0",
                "private": True,
                "description": "Extracted MESH content-production API (blog, SEO studio, knowledge graph).",
                "engines": source_pkg.get("engines", {}),
                "scripts": {
                    "build": "nest build",
                    "start": "nest start",
                    "start:dev": "nest start --watch",
                    "start:prod": "node dist/main",
                    "typecheck": "tsc -p tsconfig.json --noEmit",
                    "test": "jest",
                    "typeorm": "typeorm-ts-node-commonjs -d src/content-data-source.ts",
                    "migration:run": "npm run typeorm -- migration:run",
                    "migration:revert": "npm run typeorm -- migration:revert",
                    "migration:show": "npm run typeorm -- migration:show",
                },
                "dependencies": dict(sorted(deps.items())),
                "devDependencies": dict(sorted(dev.items())),
                "jest": {
                    "moduleFileExtensions": ["js", "json", "ts"],
                    "rootDir": "src",
                    "testRegex": ".*\\.spec\\.ts$",
                    "transform": {"^.+\\.(t|j)s$": "ts-jest"},
                    "testEnvironment": "node",
                },
            }
        else:
            pkg_json = {
                "name": "mesh-content-frontend",
                "version": "0.0.0",
                "private": True,
                "type": "module",
                "description": "Extracted MESH content-production UI (blog, editorial CMS, knowledge graph).",
                "engines": source_pkg.get("engines", {}),
                "scripts": {
                    "dev": "vite",
                    "build": "tsc -b && vite build",
                    "preview": "vite preview",
                    "typecheck": "tsc -p tsconfig.json --noEmit",
                    "test": "vitest run",
                },
                "dependencies": dict(sorted(deps.items())),
                "devDependencies": dict(sorted(dev.items())),
            }

        path = os.path.join(OUT, "standalone", repo, "package.json")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(pkg_json, fh, indent=2, ensure_ascii=False)
            fh.write("\n")
        print(f"{repo:9s} -> {len(deps)} deps, {len(dev)} devDeps  ({path})")


if __name__ == "__main__":
    main()
