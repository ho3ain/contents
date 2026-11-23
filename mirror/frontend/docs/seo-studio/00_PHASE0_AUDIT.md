# MESH SEO Studio · Content Studio · Knowledge Graph — Phase 0 Audit

Date: 2026-10-15 · Baseline: FE `ce427c7`, BE `292c164` (+ BE `f630d90` migration boot guard).
Scope: admin article module (`/admin/blog/*`), public blog + product pages, SEO output. This document
is the evidence base for every design decision in the phases that follow. Nothing below is assumed —
each line was read from the repositories.

## 1. Frontend (React 19.3 · TypeScript 6.0 · Vite 8.3 · React Router 7.18)

| Area | Finding | Location |
|---|---|---|
| Router | Single `createBrowserRouter`-style tree in `src/app/router.tsx`; public `/blog`, `/blog/:slug`, `/blog/{category,tag,author}/:slug`, `/agents/:slug`; admin `/admin/blog`, `/admin/blog/posts/new`, `/admin/blog/posts/:id`, `/admin/blog/posts/:id/preview` (outside admin shell), `/admin/blog/taxonomy`, `/admin/blog/comments`. Lazy-loaded. | `src/app/router.tsx` L33–50, 313–334, 531, 581–585 |
| Article editor | `AdminBlogEditorPage.tsx` (1 202 lines): local `Form` copy of the server detail, PATCH sends **only changed fields + `version`**, 409 `STALE_STATE` → conflict banner (never overwrites), autosave 30 s for non-live articles, unload guard, revisions, workflow actions, readiness checklist, SERP preview (`SerpPreview` in `editorPanels.tsx`), featured image, sources, pickers (tags, related posts, agents, market categories). | `src/pages/admin/blog/AdminBlogEditorPage.tsx`, `editorPanels.tsx` |
| Current editor | **Plain `<textarea>` Markdown editor** (`MarkdownEditor` in `editorPanels.tsx`) with write/preview tabs; preview calls `POST /admin/blog/render` so the preview uses the *same* server parser as save time. Image upload via `POST /admin/blog/media` (StorageService). No WYSIWYG, no toolbar, no block handling. | `editorPanels.tsx` L49–140 |
| Content format | Source of truth is **Markdown subset** (`bodyMarkdown`); server derives a **typed JSON block tree** (`bodyBlocks`), TOC, plain text, word count. **No HTML anywhere** — public renderer builds React elements from blocks, no `dangerouslySetInnerHTML`, no sanitizer dependency needed. | BE `src/modules/blog/domain/blog-markdown.ts` (712 lines, 200-line spec); FE `src/pages/blog/BlogBlocks.tsx` |
| Existing SEO fields | `seoTitle` (≤70), `seoDescription` (≤160), `canonicalUrl`, `ogImageUrl` on the post; SERP preview estimate; readiness warnings `seo_title_long`, `seo_description_long`, `image_alt_missing`, content warnings (`unsafe_url`, `image_without_alt`, `heading_level_skipped`, `h1_demoted`, `empty_heading`). | `blogAdminShared.tsx`, BE `blog-posts.service.ts` L778–810 |
| Missing SEO fields | robots index/follow, OG title/description, Twitter card, focus keyword, related keywords, content language, translation links, slug-change redirect policy UI (redirects exist server-side), per-field "stored vs fallback" indication. Products (`agents`) have **no SEO fields at all**. | — |
| Head management | `usePageMeta()` mutates `document.head` client-side: title, description, OG (type/title/description/image/locale/alternate), canonical + `og:url`, robots, JSON-LD (`BlogPosting` with real `aggregateRating` only when ratings exist; `Product` on agent page). **No hreflang. No breadcrumb JSON-LD.** | `src/lib/usePageMeta.ts`, `BlogArticlePage.tsx` L110–160, `AgentDetailPage.tsx` L120–126 |
| Render method | **Pure SPA** — `index.html` ships one static `<title>`/description for every route; per-page tags exist only after JS runs. No SSR, no prerender. Crawlers that execute JS (Googlebot) see the tags; link previews (Telegram/WhatsApp/LinkedIn) and non-JS crawlers see the generic shell. | `index.html`, `vite.config.ts` |
| robots / sitemap | `scripts/emit-seo.mjs` writes `public/robots.txt` + static `public/sitemap.xml` at build (static routes + taxonomy landings when `SEO_API_BASE` is set). The **backend also serves a dynamic** `GET /api/v1/seo/sitemap.xml` (agents, creators, categories, industries, **published blog posts with lastmod**). Two sitemaps; robots.txt points to the static one. | `scripts/emit-seo.mjs`, BE `src/modules/seo/seo.service.ts` |
| i18n / RTL | `fa` default `dir="rtl"`, `en` LTR via `i18n` + `ah-locale`; themes light/dark; design system in `src/components/ui`, `DESIGN_SYSTEM.md`, Card system, Icon system (`public/icons.svg` sprite). | `src/i18n`, `src/components/ui` |
| Media | `storageApi` / `POST /admin/blog/media` (size/type validated server-side, `uploadsEnabled` flag). | `editorPanels.tsx`, BE `blog-admin.controller.ts` L317 |
| Tests | Vitest 1 338 (incl. `BlogPages`, `BlogEngagement`, `AdminBlogEditor*` tests), Playwright 27 specs (`26-blog-discovery`, `27-blog-engagement`), axe checks in e2e. | `src/**/__tests__`, `e2e/` |
| Dependencies | react 19.3, react-dom 19.3, react-router-dom 7.18, typescript ~6.0, vite 8.3, vitest, @testing-library/react 16.3. **No editor library, no graph library, no sanitizer, no markdown library in the FE.** | `package.json` |

## 2. Backend (NestJS 11 · TypeORM · PostgreSQL · `/api/v1`)

| Area | Finding | Location |
|---|---|---|
| Entities | `blog_posts` (title, slug unique, excerpt, `body_markdown`, `body_blocks` jsonb, toc, word_count, reading_minutes, search_text, featured image+alt+caption, author/reviewer, status, published_at, scheduled_for, content_updated_at, `seo_title`, `seo_description`, `canonical_url`, `og_image_url`, primary_category_id, pillar_post_id, is_featured, rating/comment counters, sources, editorial_note, `version`, created_by/updated_by); `blog_categories`, `blog_tags`, `blog_post_tags`, `blog_post_relations` (related posts, ordered), `blog_post_agents`, `blog_post_market_categories`, **`blog_slug_redirects`**, **`blog_post_revisions`** (snapshot jsonb), engagement tables. `agents` (products) carry no SEO columns. | `src/database/entities/blog/*`, `agents/agent.entity.ts` |
| Services | `BlogPostsService` (1 124 lines): CRUD with optimistic `version` (409 `STALE_STATE`), autosave only for drafts, slug uniqueness + redirect chain handling, workflow (`submit-review`, `request-changes`, `publish`, `schedule`, `cancel-schedule`, `unpublish`, `archive`, `restore`), readiness gate on publish, revisions + restore, bulk. `BlogPublicService`: home, list (search/filter/sort), post detail (published only; preview token path for drafts), archives. `BlogTaxonomyService`. `SeoService`: dynamic sitemap feed + XML. | `src/modules/blog/*`, `src/modules/seo/*` |
| DTOs / validation | class-validator DTOs (`blog-admin.dto.ts`): slug regex, lengths (seoTitle 70, seoDescription 160), URL checks, `autosave`, `version`. | `src/modules/blog/dto/*` |
| AuthZ | Global `RolesGuard` + `AdminAccessService` (blog roles resolved server-side via `GET /admin/blog/me`); all `/admin/blog/*` admin-only; public controller `@Public()`. | `blog-admin.controller.ts` L55–66 |
| Publish flow | Server-enforced state machine (`domain/blog-status.ts`), readiness errors block publish; scheduled publishing via jobs module. | `domain/blog-status.ts`, `blog-posts.service.ts` L513–560 |
| Sanitisation | By construction: Markdown subset → typed blocks; `safeUrl()` whitelist (http/https/mailto/tel/relative/anchor; rejects `javascript:`, `data:`, protocol-relative, control chars). No HTML parsing exists server-side. | `domain/blog-markdown.ts` L97–110 |
| Internal links | Links are parsed into inline `link` nodes but **never extracted/stored** — no link table, no broken-link or orphan data, no inbound counts. | — |
| Cache | `@PublicCache` decorator (ETag/revalidate) on public reads; in-process public query cache (`PUBLIC_QUERY_CACHE_TTL_MS`). | `common/decorators/public-cache.decorator.ts` |
| Migrations | 49 migrations, `typeorm_migrations`; `synchronize: false`; boot guard added in `f630d90` (`DB_MIGRATIONS_ON_BOOT`). | `src/database/migrations/` |
| Tests | Jest unit 1 707 (119 suites) incl. `blog-markdown.spec.ts`; e2e `test/blog/{blog,blog-migration,blog-engagement}.e2e-spec.ts`, `api-contract.e2e-spec.ts` (routes ↔ `contracts/api-routes.json`). | `test/` |

## 3. Current SEO output (verified against real responses)

| Item | State |
|---|---|
| `<title>` / meta description | Client-side only (`usePageMeta`); initial HTML is the generic shell for every URL. |
| Canonical | Client-side `link[rel=canonical]` from `seo.canonicalUrl ?? path` (article) / `seo.canonical` (agent). Host comes from `VITE_PUBLIC_SITE_URL` — never from request headers. ✔ safe |
| OG / Twitter | OG type/title/description/image/locale set client-side; `twitter:card=summary_large_image` static in `index.html`; no OG title/description override fields. |
| hreflang | **None.** Posts have no language column; no translation relation. |
| robots | Static `index,follow`; article preview and 404 set `noindex,nofollow` client-side. Drafts are unreachable publicly (404) ✔. |
| Sitemap | Dynamic BE sitemap includes only `status = published` posts with `lastmod = GREATEST(updated_at, published_at)` ✔; static FE sitemap lacks posts. `robots.txt` → static sitemap ✘ (should reference the dynamic one). |
| JSON-LD | `BlogPosting` (headline, description, image, dates, author Person, publisher Organization, `aggregateRating` only with real ratings) ✔ client-side. `Product` on agent page. No `BreadcrumbList`. |
| Slug redirects | `blog_slug_redirects` resolved by the public post endpoint (old slug → 301-equivalent payload consumed by FE `Navigate replace`). |
| Duplicate content | `/blog/:slug` only; archive pages paginate via `?page=` (canonical set to page path). Taxonomy landings `noindex` when empty ✔. |
| Broken internal links | Not detected. |

## 4. Dependency decisions (real versions checked via `npm view`, 2026-10-15)

| Package | Version | Licence | Decision |
|---|---|---|---|
| `@tiptap/react`, `@tiptap/core`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-{link,image,table,table-row,table-cell,table-header,placeholder,character-count}` | 3.32.0 | MIT | **ADOPT** for Content Studio. Peer deps `react ^17‖^18‖^19`, `@types/react ^19` ✔. Headless — MESH UI is built on the design system (no Tiptap UI kit, which is not needed and not RTL-aware). |
| `@xyflow/react` | 12.12.0 | MIT | **ADOPT** for the Knowledge Graph. Peer `react >=17` ✔. |
| `yoastseo` | 3.6.0 | **GPL-3.0** | **REJECT.** Copyleft is incompatible with MESH's proprietary codebase (both client bundle and server). Also: Persian readability/keyword research not covered; last meaningful release cadence tied to the WordPress plugin. No wrapper/renaming workaround (explicitly forbidden). |
| Litic | — | — | **Not adopted** (optional in spec; no benefit over MESH-own rules for fa/en). |
| HTML sanitiser (DOMPurify / sanitize-html) | — | — | **Not required**: no HTML is stored or rendered; the Tiptap schema is restricted to the block model and paste is normalised into it. |

## 5. Gaps → work items

1. **Data model**: `content_seo` (per content type/id: robots index/follow, OG title/description, Twitter card, focus keyword, related keywords, language, translation-of, social image) — for posts the four existing columns stay where they are (API compatibility); products get the whole set here. `content_links` (real internal links extracted from blocks at save time + broken state), `link_suggestions` (explainable, approve/reject). Keywords are stored normalised on `content_seo`/`content_keywords` so the graph has real Keyword nodes.
2. **Analysis engine**: MESH-own, language-aware (fa/en) rule set with an adapter boundary; runs on the server (same pattern as `render`): `POST /admin/seo/analyze` accepts unsaved content and reports `basis: 'unsaved' | 'saved'`. Recommendations carry title/severity/problem/why/fix/location; score with documented weights labelled "MESH internal metric".
3. **Technical SEO**: hreflang from real translation links; `BreadcrumbList`; `robots.txt` → dynamic sitemap; sitemap excludes `noindex`; `GET /api/v1/seo/head?path=` + an HTML shell renderer (`/api/v1/seo/render?path=`) that injects head tags + server-rendered article/product body into the built `index.html` so crawlers/link previews receive real HTML — opt-in via deployment routing (documented), no FE rewrite.
4. **Content Studio**: Tiptap replaces the textarea in place (schema = block model: paragraph, heading 2–4, bold, italic, code, link, image+caption, bullet/ordered list one level, quote/callout, code block, table, hr, hard break). Tiptap doc ⇄ Markdown subset converters with round-trip tests; the stored format does **not** change (no content migration); the old Markdown textarea remains available as "Markdown source" fallback until the new path is validated.
5. **Knowledge Graph**: `GET /admin/seo/graph` (server filters, limits) + `/admin/blog/graph` page with `@xyflow/react`, details panel, real vs suggested edges, orphan/broken filters, link create/delete with server confirmation applied to content.

## 6. Risks

- SPA render method: per-page tags are client-side; shell renderer closes the gap only when the deployment routes bot/preview traffic (or all `/blog/*`, `/agents/*`) to it — reported as PASS WITH NOTES.
- Tiptap ⇄ Markdown round trip must be lossless for the subset; proven by tests on real seeded articles before the new editor becomes default.
- 2 GB sandbox: heavy test suites run sequentially.

## 7. Regression proof plan

BE: unit + `test/blog/*` + `api-contract` + `authorization-matrix` e2e. FE: `tsc -p tsconfig.app.json`, `eslint .`, vitest, Playwright `26`/`27` + new specs, build. Public pages, admin/buyer/creator panels unaffected (no shared code changed except additive).
