# SEO Studio — Data model & API reference

All routes are under `/api/v1`. The machine-readable contract lives in `contracts/api-routes.json` (regenerated from the backend; the frontend copy is identical).

## 1. Tables (migration `SeoStudio1772700000000`)

### `content_seo` — one row per content item (post or agent)

| column | type | notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `content_type` | `post` \| `agent` | unique with `content_id` |
| `content_id` | uuid | FK semantics enforced in service (polymorphic) |
| `seo_title` (70), `seo_description` (160), `canonical_url`, `og_image_url` | text, nullable | **agents only** — posts keep the legacy `blog_posts.seo_*` columns; the service reads/writes the right place |
| `og_title` (95), `og_description` (200) | text, nullable | |
| `twitter_card` | `summary` \| `summary_large_image` | default `summary_large_image` |
| `robots_index`, `robots_follow` | bool | stored preference; **effective** value is forced to `noindex` for unpublished content |
| `focus_keyword`, `focus_keyword_key` | text | `_key` = Persian-normalised comparison key (never displayed) |
| `related_keywords` | jsonb string[] | max 10 |
| `language` | `fa` \| `en` | |
| `translation_group_id` | uuid, nullable | all members of a group are each other's `hreflang` alternates; one language per group (409 `CONFLICT` otherwise) |
| `updated_by` | uuid, nullable | staff user |
| `created_at`, `updated_at` | timestamptz | |

### `content_links` — real outbound links extracted from saved Markdown

| column | notes |
| --- | --- |
| `source_type`/`source_id` | `post` only today (agents have no rich body) |
| `target_type`/`target_id` | `post`, `agent`, `route` (known SPA route), `external` (id = null, `href` kept) |
| `href`, `anchor`, `position` | as written in the body; `position` = block index for "go to location" |
| `status` | `ok` \| `broken` (target does not exist / 404 route) \| `unpublished` (exists but not public) |
| `checked_at` | last rescan |

Rows are replaced on every post save and on `POST /admin/seo/links/rescan`; when a target changes status (publish/unpublish/delete) `refreshTarget` updates inbound rows.

### `link_suggestions` — explainable internal-link proposals

| column | notes |
| --- | --- |
| `source_*`, `target_*` | post → post \| agent |
| `reason` | `shared_keyword` \| `same_category` \| `orphan_target` \| `title_overlap` |
| `evidence` | jsonb: the keywords / category / overlap tokens that produced the suggestion |
| `score` | 0–100, deterministic |
| `status` | `pending` \| `approved` \| `rejected` |
| unique | (`source`, `target`, `reason`) |

### Existing tables touched

- `blog_posts`: no new columns. Existing `seo_title/seo_description/canonical_url/og_image_url` are still the storage for posts.
- Existing detail responses gained a read-only `seo` object (`title, description, canonical, robots, og, twitter, hreflang[], jsonLd`) and posts gained `breadcrumbs[]`. Additive → API-compatible.

## 2. Admin API — `/admin/seo` (staff; `blog:view` for GET, `blog:manage` otherwise)

| Method & path | Body / query | Returns |
| --- | --- | --- |
| `GET content/:type/:id` | — | `SeoContentView` = `{ content: {type,id,title,slug,status,url,publishedAt}, storage: 'legacy-columns' \| 'content_seo', fields: { <name>: { stored, effective, source: 'stored' \| 'fallback' \| 'forced' } }, focusKeyword, relatedKeywords, language, translations[] }` |
| `PUT content/:type/:id` | `UpsertContentSeoDto` (all optional: `seoTitle, seoDescription, canonicalUrl, ogImageUrl, ogTitle, ogDescription, twitterCard, robotsIndex, robotsFollow, focusKeyword, relatedKeywords[], language`) | updated view. Validation: lengths, `https:` canonical on an allowed host, 409 `CONFLICT` when a language change collides inside the translation group |
| `GET content/:type/:id/analysis` | — | `SeoAnalysisReport` with `basis: 'saved'` |
| `POST content/:type/:id/translations` | `{ targetType, targetId }` | view (links both into one group; 409 if languages collide) |
| `DELETE content/:type/:id/translations` | — | view (removes this item from its group) |
| `POST analyze` | `AnalyzeContentDto` = `{ contentType, contentId?, title, bodyMarkdown?, description?, seoTitle?, seoDescription?, focusKeyword?, relatedKeywords?, language, slug?, canonicalUrl?, ogImageUrl?, robotsIndex? }` | report with `basis: 'local'` (unsaved) — used by the editor on every debounced change |
| `GET graph` | `types[]`, `language`, `status`, `category`, `keyword`, `relations[]`, `orphans`, `broken`, `suggested`, `q`, `focus` (`type:id`), `limit ≤ 400` | `{ nodes[], edges[], meta: { total, returned, truncated, counts } }` |
| `GET graph/nodes/:type/:id` | — | node details: SEO summary, outbound links (with status), inbound, suggestions |
| `POST links` → 201 | `CreateLinkDto` = `{ sourceType:'post', sourceId, targetType, targetId, anchor? }` | created `content_links` row **after** the Markdown of the source was updated (new paragraph with the anchor) — the editor reloads and shows it. Errors: 400 self-link, 409 `INVALID_STATE` archived target, 409 duplicate |
| `DELETE links/:id` | — | 204; removes the link from the Markdown and the row |
| `POST relations/remove` | `{ sourceId, targetType, targetId }` | removes a confirmed related/agent relation |
| `POST links/rescan` | — | `{ sources, links, broken, unpublished }` |
| `GET suggestions` | `status, sourceId, page, pageSize` | paginated suggestions with evidence |
| `POST suggestions/generate` | `{ sourceId? }` | `{ created, skipped }` |
| `POST suggestions/:id/approve` | `{ anchor? }` | `{ applied: 'link' \| 'relation', suggestion }` |
| `POST suggestions/:id/reject` | — | suggestion |

Error envelope and pagination follow the existing MESH conventions (`{ code, message, details?, requestId }`).

## 3. Public API

| Method & path | Purpose |
| --- | --- |
| `GET /seo/head?path=/blog/<slug>` (also `/agents/<slug>`) | JSON head data for the path: `title, description, canonical, robots, og, twitter, hreflang[], jsonLd[], breadcrumbs[]`; 404 (+`X-Robots-Tag: noindex`) for unpublished/unknown; `{ redirectTo }` with 301 semantics for old slugs |
| `GET /seo/render?path=…` | Crawler HTML: the SPA shell (`SEO_SHELL_TEMPLATE` file, or fetched from `PUBLIC_SITE_URL/`) with the real `<head>` and an `<article>` body rendered from blocks. `Cache-Control: public, max-age=300`. 301 on slug redirects, 404 noindex, 503 when no shell is available |
| `GET /seo/sitemap.xml` | Published, indexable items only; `lastmod` = real `updated_at`; `xhtml:link rel="alternate" hreflang` for real translation groups only |
| `GET /blog/posts/:slug`, `GET /agents/:slug` (existing) | now include `seo` (+ `breadcrumbs` for posts) used by the SPA's `usePageMeta` |

## 4. Analysis report shape

```json
{
  "engine": "mesh-rules", "version": 1, "basis": "local" | "saved", "language": "fa" | "en",
  "score": { "value": 0-100, "label": "MESH internal metric", "criticalFailed": [], "weights": { "<rule>": n }, "note": "…" },
  "stats": { "words", "paragraphs", "headings", "images", "imagesWithoutAlt", "links", "internalLinks", "brokenLinks", "keywordDensity", "readability" },
  "recommendations": [
    { "rule": "seo_title", "severity": "critical" | "warning" | "info", "passed": false, "applicable": true,
      "title": {"fa","en"}, "problem": {"fa","en"}, "why": {"fa","en"}, "fix": {"fa","en"},
      "location": { "field": "seoTitle" } | { "block": 7 } | null, "data": { … } }
  ]
}
```

Weights (sum 100 for applicable rules; non-applicable rules are excluded and the rest re-normalised): seo_title 10, seo_description 10, content_length 10, broken_links 10, images_alt 8, heading_structure 8, paragraph_length 6, readability 6, keyword_in_title 6, keyword_density 6, internal_links 6, keyword_in_description 4, keyword_in_intro 4, inbound_links 4, duplicate_title 4, duplicate_description 4, keyword_in_headings 3, keyword_distribution 3, unpublished_links 3, social_image 3, canonical 3, slug 3, robots 0 (informational). Any failed *critical* rule or keyword stuffing caps the score at 49. The same weights are returned in every report and shown in the UI ("How is this computed?").
