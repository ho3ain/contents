# SEO Studio — Test evidence, verification matrix & known limitations

Date of evidence: 2026-10-15 (sandbox, dev database seeded with the standard fixtures). Final FE run: 1374/1374 tests.
Statuses: **PASS** · **PASS WITH NOTES** · **FAIL** · **NOT VERIFIED**.

## 1. Automated tests

### Backend (`agentHub_backend`, commit `0792482`)

| Suite | Scope | Result |
| --- | --- | --- |
| `test/seo/seo-studio.e2e-spec.ts` (S1–S10, 13 tests) | metadata view/upsert/validation; drafts never indexable; noindex removes from sitemap + HTML; translations → reciprocal hreflang (same language refused); fa analysis rules on real content (broken/unpublished links, image alt, keyword rules, labelled metric); en analysis + readability + stuffing cap; public HTML title/meta/canonical/OG/JSON-LD/breadcrumbs, slug 301, unknown 404; Product JSON-LD with real offer and no fabricated rating; link index statuses + graph real vs suggested edges + server-side filters; create/remove link through the versioned update path; explainable suggestions, idempotent approve/reject; unpublish flips inbound status and republish restores; authz matrix (view/manage/other/anonymous) | **PASS 18/18** (incl. `test/seo.e2e-spec.ts`) |
| `test/blog/*.e2e-spec.ts`, `test/api-contract.e2e-spec.ts`, agents e2e | regression of the blog module, public routes and the API contract after adding `seo`/`breadcrumbs` | **PASS 35/35** |
| Unit (`jest`) incl. `seo-analysis.spec.ts` (10), `blocks-html.spec.ts`, `content-links.spec.ts`, `markdown-link-edit.spec.ts` (6), `persian-normalize.spec.ts` | engine rules, HTML generation, link extraction, in-place Markdown link edit, Persian normalisation | **PASS 1726/1726** |
| ESLint (changed files) | | **PASS** |

### Frontend (`agentHub_frontend`)

| Suite | Scope | Result |
| --- | --- | --- |
| `editor/__tests__/markdownBridge.test.ts` (7) | every server block type ↔ editor schema; server dialect serialisation; ZWNJ; escaping; emphasis whitespace; heading/list clamping; URL encoding | **PASS** |
| `editor/__tests__/ContentEditor.test.tsx` (8) | hydrate from blocks + RTL; server render fallback + error/retry; emits dialect after edit; **safe paste** (Word/GDocs HTML → scripts/styles/`javascript:`/handlers dropped, structure kept, H1 clamped); external re-hydrate (conflict/revision); unsafe link rejection; callout/table/figure insertion; read-only | **PASS** |
| `editor/__tests__/SeoStudioPanel.test.tsx` (8) | save-first state; stored vs fallback vs forced + SERP device toggle; **saved-copy analysis while pristine → live analysis on first edit**; debounced unsaved analysis, grouping, go-to; PUT + language 409; saved analysis after host save; translations link/unlink; engine failure never blocks saving | **PASS** |
| `graph/__tests__/graphLayout.test.ts` (3) | deterministic/finite layout, proximity, empty input | **PASS** |
| `graph/__tests__/AdminKnowledgeGraphPage.test.tsx` (7) | real nodes/legend/counts; URL-driven server filters + reset; empty state; details drawer + delete link + approve/reject via API; create link only for real targets + `INVALID_STATE`; viewer role hides mutations; error state + retry | **PASS** |
| `admin/blog/__tests__/AdminBlogPages.test.tsx` (21) | existing editor suite + **conflict compare/recover**, **local draft retention across reload**, **Visual ⇄ Markdown switch over the same body** | **PASS** |
| `blog/__tests__/BlogPages.test.tsx` (20) | public article head data from the `seo` payload | **PASS** |
| Full `vitest run` | 120 files | **PASS 1374/1374** (two full runs today, no flakes) |
| `tsc -p tsconfig.app.json` | | **PASS (exit 0)** |
| ESLint (all changed/new files) | incl. `react-hooks` v7 rules | **PASS** |
| `npm run build` | | **PASS** — admin editor chunk 519 kB (Tiptap, lazy, admin-only), graph chunk 202 kB (lazy) |

A regression found by the new tests and fixed: Tiptap's `setEditable()` emits an `update` event, which made a read-only toggle (e.g. during save) re-emit the body and could mark a freshly recovered article dirty with the *editor's* copy. Fixed in `ContentEditor.tsx` (`setEditable(x, false)` + `transaction.docChanged` guard) and covered by the compare/recover test.

## 2. Live verification (real HTTP against the rebuilt backend + built SPA, headless Chromium)

| Check | Evidence | Status |
| --- | --- | --- |
| `GET /seo/render?path=/blog/<slug>` | 200 `text/html`; `<title>`, `<meta robots index,follow>`, canonical, `og:type=article`, JSON-LD `BlogPosting + BreadcrumbList + Organization + Person`, one `<article>` | **PASS** |
| Unknown path | 404 + `X-Robots-Tag: noindex` | **PASS** |
| `GET /seo/head?path=/agents/<slug>` | title/canonical/robots + JSON-LD `Product`, `BreadcrumbList` | **PASS** |
| Sitemap | 31 URLs; 0 `xhtml:link` without translations → **2** after linking a translation pair; HTML of the linked article shows `hreflang fa / en / x-default`; back to 0 after unlink | **PASS** |
| Admin SEO view | `storage=blog_posts+content_seo`, per-field `stored`/`fallback` sources | **PASS** |
| Saved analysis | `engine=mesh-rules basis=saved language=fa score=49 label="MESH internal metric"`, failing rules `content_length (critical)`, `inbound_links`, `social_image` | **PASS** |
| Unsaved analysis (`POST /analyze`) | `basis=unsaved`, 3 words → score 22 | **PASS** |
| Graph | 14 nodes / 7 edges (`category` 4, `keyword` 3), `orphans=no-inbound&types=post` → 4, buyer → 403, anonymous → 401 | **PASS** |
| Create link with an anchor that exists in the body | `applied=link`, article version 7→8, Markdown contains `[یک مسیر](/blog/…)`, edge `ok` appears; delete → version 9, link removed, plain anchor text kept | **PASS** |
| Create link with an anchor absent from the body | falls back to a confirmed **relation** (`applied=relation`); self-link 400; duplicate 409; `relations/remove` 200 | **PASS WITH NOTES** — behaviour is intentional and documented in the UI hint, but editors must know an anchor is required for an in-text link |
| Suggestions | `generate` → 7 rows, reason `orphan_target`, score 45, evidence `{inbound:0}` | **PASS WITH NOTES** — seed data has few shared keywords, so only the orphan heuristic fires |
| SPA: editor page | `content-studio[data-status=ready]`, `dir=rtl`, 3 `<h2>`, toolbar rendered, no console/page errors | **PASS** |
| SPA: SEO panel on an unchanged article | SERP desktop, score 49, basis **«نسخهٔ ذخیره‌شده»**, 3 recommendations, sources `stored,stored,fallback,fallback,stored` | **PASS** |
| SPA: graph page | 14 nodes, meta line, details drawer loads from `/graph/nodes/...`, type filter → URL `?types=post,keyword,category` → 9 nodes | **PASS** |
| SPA: public article `<head>` | title, canonical, robots, JSON-LD `Organization + BreadcrumbList + BlogPosting` | **PASS** |

## 3. Not verified / out of reach in this environment

| Item | Why | How to verify |
| --- | --- | --- |
| Real crawler fetch through the production edge | No edge/CDN in the sandbox; the bot routing rule is documented, not applied | `curl -A Googlebot https://<site>/blog/<slug>` after applying the rule |
| Google Rich Results / SERP pixel widths | Offline; SERP preview is explicitly labelled an **estimate** | Rich Results Test on a staging URL |
| Paste from a real Word/Google Docs clipboard | Covered with a representative HTML fixture, not a live clipboard | Manual: paste a formatted doc, confirm structure and no styling leaks |
| Legacy Playwright journeys (29 specs) | Pre-existing staleness, unrelated to this work | Separate follow-up |
| Backend e2e beyond blog/seo/contract/agents | Memory-bound runner (2 GB) | Run full `jest-e2e` on a ≥4 GB runner |

## 4. Known limitations (honest list)

1. **Links from the graph need an anchor present in the article text** to become an in-text link; otherwise a confirmed relation is stored (shown in the editor's "related" pickers, rendered by the public page's related section). No text is ever invented.
2. **Suggestions are heuristic** (shared keyword, same category, orphan target, title overlap). No semantic similarity model; by design no paid/AI service.
3. **Products (agents) have no rich body**, so they are link *targets* only; their SEO fields live in `content_seo` and are edited from the admin agents page modal.
4. **No iframe/embed allow-list yet** — external media is linked, not embedded. The schema and the public renderer reject iframes.
5. **Readability** is a per-language heuristic (sentence/word length, Persian-aware tokenisation), labelled as such; not Flesch-Kincaid for Persian.
6. **Graph size** is capped at 400 nodes per request with server-side filters; very large sites should filter by type/language/topic first.
7. **Editor bundle**: Tiptap adds ~160 kB gzip to the admin editor chunk (lazy-loaded, admin only). Public pages are unaffected.
8. Slug redirects are kept for published articles (existing `blog_slug_history`); products rely on their existing slug rules.
