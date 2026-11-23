# SEO Studio — Deployment, migration & rollback

## 1. Database

- Migration: `agentHub_backend/src/database/migrations/1772700000000-seo-studio.ts`.
- `up`: creates `content_seo`, `content_links`, `link_suggestions` with their indexes. **No existing table or row is altered.**
- `down`: drops the three tables. Legacy `blog_posts.seo_*` columns are untouched in both directions, so rolling back loses only the *additional* SEO fields, graph link rows and suggestions.
- Apply: `npm run migration:run` (or restart the backend in development — `DB_MIGRATIONS_ON_BOOT=auto`). In production the boot guard (`warn` by default) refuses `/health/ready` while migrations are pending; set `strict` to fail boot instead.
- Rollback: `npm run migration:revert` once (reverts `SeoStudio1772700000000`), then deploy the previous backend build.

## 2. Content — staged, never blanket

| Stage | What happens | How to go back |
| --- | --- | --- |
| 0 (today) | Stored Markdown is unchanged. The visual editor converts on open (`render` → blocks → doc) and emits the same dialect on edit. | n/a |
| 1 | Editors save articles through the visual mode. Only articles a human saves are re-serialised; round-trip is lossless for every construct the parser supports (see `04_TESTS_AND_LIMITATIONS.md`). | The Markdown fallback (`BodyEditor` toggle, persisted in `localStorage['mesh-blog-body-mode']`) is one click away and edits the identical value. Revisions (`blog_post_revisions`) remain the content undo. |
| 2 (optional, later) | If a bulk normalisation is ever wanted, run it as an explicit, logged job over published posts with a revision written per post. **Not shipped and not scheduled.** | Restore from revisions. |

Links (`content_links`) are *derived* data: `POST /admin/seo/links/rescan` rebuilds them from the Markdown at any time; dropping the table loses nothing that cannot be recomputed.

## 3. Crawler HTML (`/seo/render`)

The SPA is still served exactly as before. To make the technical SEO visible to crawlers:

1. Provide the shell: set `SEO_SHELL_TEMPLATE=/path/to/dist/index.html` on the backend (preferred) or let it fetch `PUBLIC_SITE_URL/` once per 5 min.
2. At the edge (nginx / CDN rule), route requests whose `User-Agent` matches known crawlers **and** whose path matches `^/(blog|agents)/` to `https://<api>/api/v1/seo/render?path=<original path>`. Everything else keeps hitting the SPA.
3. Verify with `curl -A Googlebot https://<site>/blog/<slug>` — the response must contain the article `<title>`, `<link rel="canonical">`, `<meta name="robots">`, OG tags, `hreflang` (only when a translation exists), JSON-LD and the `<article>` body.
4. Rollback: remove the edge rule. The SPA still sets the same tags client-side through `usePageMeta`, so nothing breaks — only crawlers that do not execute JS lose the head data again.

The sample edge rule is documented in `docs/deployment/` (nginx `map $http_user_agent $is_bot …`). It was **not** applied to any environment from this workspace.

## 4. Feature flags / kill switches

- Visual editor: the Markdown mode is always available; there is no server flag because both modes write the same field.
- SEO panel and graph are admin-only routes behind existing permissions; disabling `blog:view`/`blog:manage` hides them per role.
- Analysis engine failures are non-blocking: the editor saves even when `/admin/seo/analyze` fails (panel shows an error state, save path is independent).

## 5. Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `SEO_SHELL_TEMPLATE` | unset | Path to the built `index.html` used by `/seo/render` |
| `PUBLIC_SITE_URL` | existing | Canonical host, sitemap base, shell fetch fallback |
| `DB_MIGRATIONS_ON_BOOT` | `auto` (dev) / `warn` (prod, test) | Boot-time migration policy introduced with the blog fix (`f630d90`) |
