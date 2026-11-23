# MESH editorial reader — API delta

No route, permission, entity or migration was added. Existing route inventory
`contracts/api-routes.json` remains accurate (it records method/path, not query enums).

- `GET /api/v1/blog/home`: `featured` is now the latest eligible published post,
  ordered by publishedAt DESC then id ASC, regardless of editorial isFeatured.
- `GET /api/v1/blog/posts`: accepts `sort=popular`. Ordering is rated before
  unrated, ratingAvg DESC, ratingCount DESC, publishedAt DESC, id ASC. These
  are existing persisted, authenticated-reader rating aggregates, not views.
- Reader UI requests `pageSize=9`. Existing general pagination API limits and
  other sort/filter contracts are unchanged.
- `PublicBlogPostDetail.publishedAt` is nullable for the authorised preview:
  never-published drafts return null, not their creation timestamp. Public
  published posts continue returning their actual publication timestamp.
- Related editorial picks exclude self and are limited to three, with the
  existing category/recent published-only fallback.
- Saved preview remains `GET /api/v1/admin/blog/posts/:id/preview`, protected
  by existing admin role + blog:view policy. No token-in-URL mechanism.
- Existing comments are authenticated writes with immediate publication and
  post-moderation; no duplicate comment persistence or policy was introduced.

Tests: blog domain 32 passed; blog API + engagement integration 33 passed on
local PostgreSQL. Changed files pass ESLint with zero warnings. Repository-wide
lint still reports unrelated formatting errors / SEO test warnings; see the
frontend docs/blog/MESH_EDITORIAL_IMPLEMENTATION_REPORT.md and workspace logs.

Deployment/rollback: deploy backend enum/serializer support before the frontend.
No database migration or data rewrite is needed. Roll back the paired code
changes together; existing article Markdown, blocks, relations and engagement
records remain untouched.
