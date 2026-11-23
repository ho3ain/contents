# MESH SEO Studio · Content Studio · Knowledge Graph — Architecture

Status: implemented 2026-10-15 (BE `agentHub_backend` · FE `agentHub_frontend`).
Prerequisite reading: `00_PHASE0_AUDIT.md` (what existed before, what was reused).

## 1. Guiding decisions

| Decision | Choice | Why |
| --- | --- | --- |
| Source of truth for article content | **`blog_posts.body_markdown`** (unchanged) → server-derived `body_blocks` (jsonb) → HTML | No second content model. The visual editor speaks the *same* Markdown dialect the server already parses (`blog-markdown.ts`), verified by round-trip tests. |
| Source of truth for SEO fields | `blog_posts.seo_*` (legacy columns, kept) + new `content_seo` row per content item | Extends, does not replace. Posts keep their four legacy columns; `content_seo` adds the rest (robots, OG/Twitter, focus keyword, language, translation group) and is the *only* SEO store for products (agents). |
| Source of truth for internal links | `content_links` table, synced from the Markdown on every save | The graph, the broken-link rule, the orphan rule and the editor all read the same rows. No link is ever inferred client-side. |
| Analysis engine | MESH-own rule engine (`seo/analysis/seo-analysis.ts`), runs identically on server and client | YoastSEO.js is GPL-3.0 — incompatible with a proprietary product and **not** circumventable by wrapping. Engine has an adapter boundary (`engine: 'mesh-rules', version: 1`). |
| Rich-text editor | Tiptap 3.32 (MIT) **inside** the existing `AdminBlogEditorPage`, with the original Markdown textarea kept as a switchable fallback | "In-place gradual replacement": no second editor route, both modes edit the same `form.bodyMarkdown`. |
| Graph UI | `@xyflow/react` 12.12 (MIT), server-computed graph, server-side filters & limits | Graph data is never derived on the client; filters hit the API. |
| Crawler HTML | `GET /seo/render?path=` renders the SPA shell with real `<head>` + `<article>` HTML from blocks | FE stays a pure SPA (no SSR rewrite). Edge routes bots for `/blog/*` and `/agents/*` to this endpoint (see `03_MIGRATION_ROLLBACK.md`). |

## 2. Backend (NestJS) — `src/modules/seo/`

```
seo.module.ts              public controller + SeoCoreModule
seo-core.module.ts         shared providers (services below), imported by blog/agents modules
seo.controller.ts          GET /seo/head, GET /seo/render, sitemap (existing SeoService extended)
seo-admin.controller.ts    /admin/seo/** (permission: blog:view for GET, blog:manage otherwise)
content-seo.service.ts     view/upsert/translations/publicMeta/analyze/duplicates
content-links.service.ts   resolve+sync links from Markdown, rescan, inbound/outbound queries
knowledge-graph.service.ts graph(filters) → {nodes, edges, meta}; node(type,id)
link-suggestions.service.ts explainable suggestions, approve/reject, createLink/deleteLink
seo-render.service.ts      head tags + crawler HTML (301 slug redirects, 404 noindex)
analysis/seo-analysis.ts   rule engine (23 rules, documented weights) + readability.ts
domain/blocks-html.ts      blocks → sanitised public HTML
domain/content-links.ts    link extraction from blocks (href, anchor, position)
domain/markdown-link-edit.ts insert/remove a link in Markdown without touching other text
```

Entities: `src/database/entities/seo/{content-seo,content-link,link-suggestion}.entity.ts`.
Migration: `src/database/migrations/1772700000000-seo-studio.ts` (`up` creates three tables + indexes, `down` drops them; no data is rewritten).

Shared utility: `src/common/utils/persian-normalize.ts` — ي/ك → ی/ک, Arabic/Persian digits → ASCII, ZWNJ/diacritics stripped **for comparison keys only** (`focus_keyword_key`); displayed text is never normalised.

### Data flow on article save

1. `PUT /admin/blog/posts/:id` (existing) → `BlogPostsService.update` parses Markdown → blocks, bumps `version`.
2. `ContentLinksService.sync(post)` rewrites `content_links` rows for that source (status `ok | broken | unpublished` resolved against real posts/agents/routes).
3. The editor's SEO panel calls `POST /admin/seo/analyze` (local, unsaved) or `GET /admin/seo/content/post/:id/analysis` (saved). Both use the same engine; the response carries `basis: 'local' | 'saved'` so the UI labels it.

### Publish gating

`robots_index` is **forced** to `false` whenever the content is not published (draft, scheduled, archived, deleted, private product). The field view returns `source: 'forced'` so the UI shows the lock; the sitemap and `/seo/head` apply the same rule server-side.

## 3. Frontend (React 19) — `src/pages/admin/blog/`

```
AdminBlogEditorPage.tsx    existing page, extended: BodyEditor, SEO panel tab, conflict compare/recover,
                           local draft retention (localStorage `mesh-blog-draft:<id>`)
editor/BodyEditor.tsx      mode switch Visual ⇄ Markdown over the same value (localStorage `mesh-blog-body-mode`)
editor/ContentEditor.tsx   Tiptap canvas, toolbar, bubble tools, link/image forms, callouts, tables, figures,
                           status: loading/ready/error, emits Markdown (debounced)
editor/extensions.ts       Tiptap schema restricted to the server dialect (H2–H4, one list level,
                           paragraph-only table cells, callout kinds, figure with caption)
editor/blocksToDoc.ts      server blocks → ProseMirror doc
editor/docToMarkdown.ts    ProseMirror doc → server Markdown dialect (escaping, ZWNJ preserved)
editor/SeoStudioPanel.tsx  fields (stored vs effective vs forced), SERP preview (desktop/mobile, labelled estimate),
                           score + recommendations with go-to-location, translations, weights disclosure
graph/AdminKnowledgeGraphPage.tsx  /admin/blog/graph — xyflow canvas, filters in URL, legend, details drawer,
                           create/delete link, approve/reject suggestions, rescan
graph/graphLayout.ts       deterministic layered layout (no physics; keyboard reachable nodes)
src/api/seo.ts             typed client for /admin/seo/** and /seo/head
```

Public pages (`BlogArticlePage.tsx`, `AgentDetailPage.tsx`) read the `seo` + `breadcrumbs` objects now embedded in the existing detail responses and feed `usePageMeta` (title, description, canonical, robots, OG/Twitter, hreflang, JSON-LD). Nothing is fetched twice.

## 4. Security

- All `/admin/seo/**` routes require an authenticated staff user with `blog:view` (reads) or `blog:manage` (writes); enforced by the existing permission guard, not by the UI.
- Canonical and link URLs are validated server-side (`https:` only for canonical; same-host or site-relative for internal links; `javascript:`/`data:` rejected). The editor applies the same checks before insertion.
- Public HTML is generated from blocks (no raw HTML passthrough); embeds are restricted to an allow-list.
- `/seo/*` public responses contain only published data; unpublished targets appear in the graph **only** for staff.
- JSON-LD never contains fabricated ratings; `aggregateRating` is emitted only when real ratings exist.

## 5. What is intentionally *not* here

- No real-time collaboration (explicitly out of scope). Conflicts are detected by `version` and resolved by reload / compare / recover.
- No automatic bulk conversion of stored Markdown — the editor converts on open; the stored text changes only when a human saves.
- No paid or AI service: suggestions are explainable heuristics (shared keyword, same category, orphan target, title overlap) with evidence.
