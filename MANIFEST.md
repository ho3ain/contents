# فهرست کامل فایل‌های استخراج‌شده

این فایل به‌صورت خودکار از `manifest.json` ساخته می‌شود. دست‌کاری‌اش نکنید؛
به‌جایش `_tools/extract.py` را دوباره اجرا کنید.

- تاریخ تولید: `2026-11-23T11:14:36+00:00`
- کامیت بک‌اند: `1421c7bc485a`
- کامیت فرانت‌اند: `3bcfe835fc10`
- مجموع: **657 فایل**، **165,620 خط**، **6,552,381 بایت**

هر فایل پس از کپی با `sha256` در برابر مبدأ راستی‌آزمایی شده است؛ ستون آخر همان مقدار است.

## ۱) خلاصه بر اساس لایه

| مخزن | لایه | فایل | خط | بایت |
| --- | --- | --- | --- | --- |
| بک‌اند (NestJS) | `core` | 61 | 17,950 | 603,532 |
| بک‌اند (NestJS) | `shared` | 121 | 17,256 | 543,114 |
| بک‌اند (NestJS) | `auto` | 218 | 56,180 | 1,884,971 |
| بک‌اند (NestJS) | `reference` | 5 | 1,844 | 71,474 |
| فرانت‌اند (React + Vite) | `core` | 91 | 27,784 | 1,247,279 |
| فرانت‌اند (React + Vite) | `shared` | 97 | 19,844 | 694,095 |
| فرانت‌اند (React + Vite) | `auto` | 57 | 11,120 | 660,523 |
| فرانت‌اند (React + Vite) | `reference` | 7 | 13,642 | 847,393 |
| **مجموع** | | **657** | **165,620** | **6,552,381** |

## ۲) خلاصه بر اساس گروه کارکردی

| گروه | مخزن | لایه | فایل | خط |
| --- | --- | --- | --- | --- |
| Docs (content) | بک‌اند (NestJS) | `core` | 1 | 31 |
| Blog entities | بک‌اند (NestJS) | `core` | 6 | 781 |
| SEO entities | بک‌اند (NestJS) | `core` | 4 | 305 |
| Migrations (content) | بک‌اند (NestJS) | `core` | 4 | 608 |
| Seeds | بک‌اند (NestJS) | `core` | 1 | 330 |
| Blog module (backend) | بک‌اند (NestJS) | `core` | 19 | 6,638 |
| SEO studio & knowledge graph (backend) | بک‌اند (NestJS) | `core` | 20 | 5,774 |
| Backend e2e tests (content) | بک‌اند (NestJS) | `core` | 6 | 3,483 |
| Shared utilities | بک‌اند (NestJS) | `shared` | 2 | 870 |
| TypeORM entity graph | بک‌اند (NestJS) | `shared` | 91 | 8,934 |
| Taxonomy / categories | بک‌اند (NestJS) | `shared` | 9 | 2,960 |
| Audit trail | بک‌اند (NestJS) | `shared` | 3 | 344 |
| Authorisation | بک‌اند (NestJS) | `shared` | 2 | 715 |
| Notifications | بک‌اند (NestJS) | `shared` | 6 | 2,362 |
| Media storage | بک‌اند (NestJS) | `shared` | 8 | 1,071 |
| Auto-resolved dependency | بک‌اند (NestJS) | `auto` | 218 | 56,180 |
| Wiring (reference only) | بک‌اند (NestJS) | `reference` | 5 | 1,844 |
| Docs (content) | فرانت‌اند (React + Vite) | `core` | 9 | 1,068 |
| Playwright e2e (content) | فرانت‌اند (React + Vite) | `core` | 3 | 534 |
| Tooling (content) | فرانت‌اند (React + Vite) | `core` | 2 | 550 |
| API clients (content) | فرانت‌اند (React + Vite) | `core` | 2 | 959 |
| Other authoring surfaces | فرانت‌اند (React + Vite) | `core` | 6 | 1,377 |
| Static editorial content | فرانت‌اند (React + Vite) | `core` | 19 | 3,186 |
| i18n (content) | فرانت‌اند (React + Vite) | `core` | 3 | 1,810 |
| Content libraries | فرانت‌اند (React + Vite) | `core` | 7 | 900 |
| Editorial CMS, editor & knowledge graph | فرانت‌اند (React + Vite) | `core` | 22 | 9,406 |
| Blog pages (public) | فرانت‌اند (React + Vite) | `core` | 15 | 3,856 |
| Styles (content) | فرانت‌اند (React + Vite) | `core` | 3 | 4,138 |
| Static assets | فرانت‌اند (React + Vite) | `shared` | 24 | 125 |
| API plumbing | فرانت‌اند (React + Vite) | `shared` | 3 | 7,328 |
| App shell | فرانت‌اند (React + Vite) | `shared` | 1 | 31 |
| Shared components | فرانت‌اند (React + Vite) | `shared` | 50 | 4,338 |
| Shared utilities | فرانت‌اند (React + Vite) | `shared` | 6 | 729 |
| i18n plumbing | فرانت‌اند (React + Vite) | `shared` | 1 | 172 |
| Styles (content) | فرانت‌اند (React + Vite) | `shared` | 1 | 6,752 |
| Test harness | فرانت‌اند (React + Vite) | `shared` | 1 | 8 |
| Theme tokens | فرانت‌اند (React + Vite) | `shared` | 8 | 334 |
| Ambient declarations | فرانت‌اند (React + Vite) | `shared` | 2 | 27 |
| Auto-resolved dependency | فرانت‌اند (React + Vite) | `auto` | 57 | 11,120 |
| Wiring (reference only) | فرانت‌اند (React + Vite) | `reference` | 7 | 13,642 |

## ۳) فهرست کامل فایل‌ها

### بک‌اند (NestJS)

#### لایهٔ `core` — هسته — خودِ فیچر تولید محتوا

| # | مسیر (همان مسیر اصلی در مش) | خط | بایت | sha256 (۱۲ رقم) |
| --- | --- | --- | --- | --- |
| 1 | `docs/blog/EDITORIAL_API_NOTES.md` | 31 | 1,949 | `88aeafef19c6` |
| 2 | `src/database/entities/blog/blog-category.entity.ts` | 61 | 1,890 | `ef7115161cb7` |
| 3 | `src/database/entities/blog/blog-engagement.entity.ts` | 257 | 6,963 | `79cafc68b52c` |
| 4 | `src/database/entities/blog/blog-post-links.entity.ts` | 184 | 5,455 | `3448cce9948d` |
| 5 | `src/database/entities/blog/blog-post.entity.ts` | 214 | 6,355 | `e08f0f2b4abc` |
| 6 | `src/database/entities/blog/blog-tag.entity.ts` | 28 | 667 | `3cc6f52723de` |
| 7 | `src/database/entities/blog/index.ts` | 37 | 949 | `1a0d28589ca6` |
| 8 | `src/database/entities/seo/content-link.entity.ts` | 66 | 1,958 | `be3f2ef585eb` |
| 9 | `src/database/entities/seo/content-seo.entity.ts` | 129 | 3,607 | `323b7f10aaaa` |
| 10 | `src/database/entities/seo/index.ts` | 28 | 604 | `df26be5e2d47` |
| 11 | `src/database/entities/seo/link-suggestion.entity.ts` | 82 | 2,525 | `702fd56a0509` |
| 12 | `src/database/migrations/1772200000000-blog-platform.ts` | 264 | 12,093 | `675fac7d2a10` |
| 13 | `src/database/migrations/1772500000000-blog-search-fold.ts` | 39 | 1,770 | `a4e4b27afa75` |
| 14 | `src/database/migrations/1772600000000-blog-engagement.ts` | 178 | 8,059 | `42e4b707d93c` |
| 15 | `src/database/migrations/1772700000000-seo-studio.ts` | 127 | 5,762 | `30575932a456` |
| 16 | `src/database/seeds/seed-blog-demo.ts` | 330 | 17,068 | `41513fef7fdc` |
| 17 | `src/modules/blog/blog-admin.controller.ts` | 413 | 11,961 | `3bd17afdb41a` |
| 18 | `src/modules/blog/blog-comments-admin.controller.ts` | 114 | 3,337 | `f1740c93a588` |
| 19 | `src/modules/blog/blog-engagement.controller.ts` | 190 | 5,785 | `2641c4be1ca5` |
| 20 | `src/modules/blog/blog-engagement.service.ts` | 998 | 32,232 | `2d817068873d` |
| 21 | `src/modules/blog/blog-posts.service.ts` | 1,171 | 39,709 | `371104893f09` |
| 22 | `src/modules/blog/blog-public.controller.ts` | 212 | 6,933 | `c896fe231ebb` |
| 23 | `src/modules/blog/blog-public.service.ts` | 540 | 19,377 | `cf3fa5d4e782` |
| 24 | `src/modules/blog/blog-serializers.ts` | 304 | 8,502 | `a4f084f10e30` |
| 25 | `src/modules/blog/blog-taxonomy.service.ts` | 534 | 17,037 | `d3831fd84770` |
| 26 | `src/modules/blog/blog.module.ts` | 73 | 2,094 | `df9beb52bb58` |
| 27 | `src/modules/blog/domain/blog-markdown.spec.ts` | 200 | 7,212 | `8046bcc474e9` |
| 28 | `src/modules/blog/domain/blog-markdown.ts` | 712 | 20,286 | `f11260d329b7` |
| 29 | `src/modules/blog/domain/blog-search.spec.ts` | 148 | 5,411 | `1420b46d032a` |
| 30 | `src/modules/blog/domain/blog-search.ts` | 186 | 7,159 | `9ac11efd69d1` |
| 31 | `src/modules/blog/domain/blog-status.spec.ts` | 100 | 3,052 | `9d3136be67b1` |
| 32 | `src/modules/blog/domain/blog-status.ts` | 108 | 3,360 | `545e2bd9ee1a` |
| 33 | `src/modules/blog/dto/blog-admin.dto.ts` | 409 | 8,878 | `ab67a5786ccb` |
| 34 | `src/modules/blog/dto/blog-engagement.dto.ts` | 155 | 3,814 | `07e951b376f8` |
| 35 | `src/modules/blog/dto/blog-public.dto.ts` | 71 | 1,795 | `f3f1ab0f024d` |
| 36 | `src/modules/seo/analysis/readability.ts` | 106 | 3,180 | `184f06715a5c` |
| 37 | `src/modules/seo/analysis/seo-analysis.spec.ts` | 291 | 11,058 | `8137021a7bba` |
| 38 | `src/modules/seo/analysis/seo-analysis.ts` | 1,104 | 41,027 | `89d8f9828316` |
| 39 | `src/modules/seo/content-links.service.ts` | 290 | 9,171 | `010beb899f6d` |
| 40 | `src/modules/seo/content-seo.service.ts` | 671 | 21,452 | `44cd90d72b0c` |
| 41 | `src/modules/seo/domain/blocks-html.spec.ts` | 40 | 1,536 | `aecb2b2c9f76` |
| 42 | `src/modules/seo/domain/blocks-html.ts` | 110 | 3,595 | `712f552953f4` |
| 43 | `src/modules/seo/domain/content-links.spec.ts` | 74 | 2,562 | `2875ce96de08` |
| 44 | `src/modules/seo/domain/content-links.ts` | 145 | 3,888 | `255a87329b36` |
| 45 | `src/modules/seo/domain/markdown-link-edit.spec.ts` | 60 | 2,210 | `2a97ca2bd8b6` |
| 46 | `src/modules/seo/domain/markdown-link-edit.ts` | 146 | 4,906 | `eca3af867a19` |
| 47 | `src/modules/seo/dto/seo-admin.dto.ts` | 333 | 5,911 | `361897e7709c` |
| 48 | `src/modules/seo/knowledge-graph.service.ts` | 804 | 25,328 | `ef3dccdcf61e` |
| 49 | `src/modules/seo/link-suggestions.service.ts` | 623 | 19,871 | `4732a27c70c6` |
| 50 | `src/modules/seo/seo-admin.controller.ts` | 228 | 6,602 | `21d867fe5c40` |
| 51 | `src/modules/seo/seo-core.module.ts` | 23 | 771 | `9cd9ee3affac` |
| 52 | `src/modules/seo/seo-render.service.ts` | 442 | 15,822 | `aea72055ad99` |
| 53 | `src/modules/seo/seo.controller.ts` | 97 | 3,258 | `66e961757bd9` |
| 54 | `src/modules/seo/seo.module.ts` | 23 | 891 | `7ebcfceff97a` |
| 55 | `src/modules/seo/seo.service.ts` | 164 | 6,469 | `d727b40eafb2` |
| 56 | `test/blog/blog-engagement.e2e-spec.ts` | 810 | 29,420 | `152d5f9526ef` |
| 57 | `test/blog/blog-migration.e2e-spec.ts` | 163 | 6,067 | `d2fa3be412f8` |
| 58 | `test/blog/blog.e2e-spec.ts` | 1,193 | 44,960 | `adc2f1c64ae3` |
| 59 | `test/helpers/seo-shell.ts` | 30 | 1,011 | `597df5c18a35` |
| 60 | `test/seo.e2e-spec.ts` | 181 | 6,779 | `fa29b9a56a0e` |
| 61 | `test/seo/seo-studio.e2e-spec.ts` | 1,106 | 40,179 | `26547fe3faeb` |

#### لایهٔ `shared` — مشترک — وابستگی واقعی و دستی‌اعلام‌شدهٔ فیچر

| # | مسیر (همان مسیر اصلی در مش) | خط | بایت | sha256 (۱۲ رقم) |
| --- | --- | --- | --- | --- |
| 1 | `src/common/utils/persian-normalize.ts` | 94 | 2,712 | `b6cfe0d258e7` |
| 2 | `src/database/entities/activation/creator-activation-reminder.entity.ts` | 54 | 1,605 | `1bfc2ab1c2ac` |
| 3 | `src/database/entities/activation/creator-assistance-request.entity.ts` | 79 | 2,641 | `264b3c69773d` |
| 4 | `src/database/entities/activation/creator-idea.entity.ts` | 92 | 3,028 | `9311619c5ecf` |
| 5 | `src/database/entities/agents/agent-category.entity.ts` | 34 | 912 | `b65e21bac1ac` |
| 6 | `src/database/entities/agents/agent-data-policy.entity.ts` | 84 | 2,287 | `4e11ba6d3195` |
| 7 | `src/database/entities/agents/agent-industry.entity.ts` | 29 | 722 | `94aeb0546316` |
| 8 | `src/database/entities/agents/agent-integration.entity.ts` | 33 | 866 | `313fdf255c24` |
| 9 | `src/database/entities/agents/agent-permission.entity.ts` | 41 | 1,130 | `9b85ac662d8b` |
| 10 | `src/database/entities/agents/agent-requirement.entity.ts` | 59 | 1,527 | `0f23d40b5c62` |
| 11 | `src/database/entities/agents/agent-review-feedback.entity.ts` | 96 | 3,054 | `2750ae2216c2` |
| 12 | `src/database/entities/agents/agent-review-submission.entity.ts` | 152 | 4,749 | `5c6cc562b42d` |
| 13 | `src/database/entities/agents/agent-verification.entity.ts` | 83 | 2,181 | `dec20f5c7a0a` |
| 14 | `src/database/entities/agents/agent-version.entity.ts` | 221 | 7,193 | `8e5ac191f223` |
| 15 | `src/database/entities/agents/agent.entity.ts` | 430 | 13,550 | `d54872d40159` |
| 16 | `src/database/entities/agents/commercial-profile.spec.ts` | 143 | 4,077 | `6fa872dc5f15` |
| 17 | `src/database/entities/agents/product-model.ts` | 579 | 20,005 | `d42c14fb9059` |
| 18 | `src/database/entities/catalog/category.entity.ts` | 79 | 2,112 | `82af2ed5454a` |
| 19 | `src/database/entities/catalog/industry.entity.ts` | 62 | 1,576 | `4cd5f249a308` |
| 20 | `src/database/entities/catalog/integration.entity.ts` | 35 | 923 | `b50dcf50d6bf` |
| 21 | `src/database/entities/catalog/permission.entity.ts` | 30 | 769 | `accf5594e0d2` |
| 22 | `src/database/entities/commerce/entitlement-event.entity.ts` | 86 | 2,624 | `7d58269b6fc3` |
| 23 | `src/database/entities/commerce/entitlement.entity.ts` | 168 | 5,194 | `9fc4707a1676` |
| 24 | `src/database/entities/commerce/order-item.entity.ts` | 107 | 3,078 | `da15a7ddf38b` |
| 25 | `src/database/entities/commerce/order.entity.ts` | 84 | 2,062 | `7bd53dd8a992` |
| 26 | `src/database/entities/commerce/payment.entity.ts` | 83 | 1,982 | `08b2b6752a39` |
| 27 | `src/database/entities/commerce/refund.entity.ts` | 101 | 2,660 | `04d6e2dd0aa5` |
| 28 | `src/database/entities/crm/creator-attribution.entity.ts` | 93 | 3,078 | `d5339d3fbab2` |
| 29 | `src/database/entities/crm/creator-crm-action.entity.ts` | 80 | 2,542 | `9bbead3ba5cb` |
| 30 | `src/database/entities/crm/creator-crm-note.entity.ts` | 56 | 1,611 | `5fb745a017b0` |
| 31 | `src/database/entities/crm/creator-crm-saved-view.entity.ts` | 73 | 2,010 | `db72b5d36a0f` |
| 32 | `src/database/entities/crm/creator-crm-segment.entity.ts` | 57 | 1,657 | `cc9f3e266006` |
| 33 | `src/database/entities/crm/creator-crm-tag.entity.ts` | 70 | 2,038 | `2589181a74c9` |
| 34 | `src/database/entities/crm/creator-growth-event.entity.ts` | 95 | 3,169 | `70f4b650252c` |
| 35 | `src/database/entities/crm/creator-lead.entity.ts` | 202 | 7,551 | `0e376b0c4825` |
| 36 | `src/database/entities/evaluation/evaluation-claim-assessment.entity.ts` | 60 | 1,688 | `57dc774345e0` |
| 37 | `src/database/entities/evaluation/evaluation-control-result.entity.ts` | 73 | 1,986 | `87b1ca3c7eb2` |
| 38 | `src/database/entities/evaluation/evaluation-evidence-record.entity.ts` | 58 | 1,784 | `3dabef5185f9` |
| 39 | `src/database/entities/evaluation/evaluation-policy.entity.ts` | 36 | 993 | `6538b0f09e7f` |
| 40 | `src/database/entities/evaluation/evaluation-run.entity.ts` | 163 | 4,865 | `c658e908e82b` |
| 41 | `src/database/entities/growth/agent-analytics-event.entity.ts` | 101 | 3,589 | `2bf1afef17b9` |
| 42 | `src/database/entities/growth/agent-favorite.entity.ts` | 42 | 1,132 | `20a8c41d2aa6` |
| 43 | `src/database/entities/growth/creator-milestone.entity.ts` | 46 | 1,415 | `7505045387c7` |
| 44 | `src/database/entities/growth/promotion.entity.ts` | 165 | 4,521 | `623616f9f530` |
| 45 | `src/database/entities/ideas/creator-opportunity.entity.ts` | 89 | 2,659 | `83397fa9281c` |
| 46 | `src/database/entities/identity/creator-profile.entity.ts` | 209 | 5,793 | `08cbc3279c94` |
| 47 | `src/database/entities/identity/user-interest.entity.ts` | 42 | 1,163 | `1a4a815a4e19` |
| 48 | `src/database/entities/identity/user-session.entity.ts` | 68 | 2,064 | `b6682b363cec` |
| 49 | `src/database/entities/identity/user-verification.entity.ts` | 57 | 1,349 | `dc977204e033` |
| 50 | `src/database/entities/identity/user.entity.ts` | 156 | 4,656 | `118603e68e0c` |
| 51 | `src/database/entities/index.ts` | 233 | 9,143 | `6131fb1b028f` |
| 52 | `src/database/entities/platform/audit-log.entity.ts` | 53 | 1,494 | `dcd9ae7db6c6` |
| 53 | `src/database/entities/platform/email-message.entity.ts` | 122 | 3,565 | `e08208421fb1` |
| 54 | `src/database/entities/platform/media-asset.entity.ts` | 69 | 1,809 | `64aa6355d0bc` |
| 55 | `src/database/entities/platform/notification.entity.ts` | 66 | 2,025 | `b88ca6ae6f8f` |
| 56 | `src/database/entities/release-gate/release-gate-decision.entity.ts` | 39 | 1,460 | `0b061bc4e7b2` |
| 57 | `src/database/entities/release-gate/release-gate-operation.entity.ts` | 60 | 2,355 | `9f8b1d0378e8` |
| 58 | `src/database/entities/reviews/review-reply.entity.ts` | 63 | 1,586 | `1b767c5a49ff` |
| 59 | `src/database/entities/reviews/review.entity.ts` | 163 | 4,635 | `e620af98344f` |
| 60 | `src/database/entities/runtime/runtime-conformance-run.entity.ts` | 60 | 1,829 | `4a733c3a5348` |
| 61 | `src/database/entities/runtime/runtime-credential.entity.ts` | 61 | 1,901 | `0a77b061918d` |
| 62 | `src/database/entities/runtime/runtime-event.entity.ts` | 74 | 2,044 | `2b20e60ea399` |
| 63 | `src/database/entities/runtime/runtime-registration.entity.ts` | 192 | 5,716 | `74f8c942eed9` |
| 64 | `src/database/entities/runtime/runtime-release.entity.ts` | 133 | 4,009 | `7e78ff13f86a` |
| 65 | `src/database/entities/scale/affiliate-commission.entity.ts` | 135 | 4,040 | `99152121db1c` |
| 66 | `src/database/entities/scale/affiliate.entity.ts` | 145 | 4,687 | `1e8103414a73` |
| 67 | `src/database/entities/scale/ambassador-level.entity.ts` | 71 | 2,392 | `70e2cfd444d5` |
| 68 | `src/database/entities/scale/ambassador.entity.ts` | 113 | 3,731 | `1b201877721f` |
| 69 | `src/database/entities/scale/community.entity.ts` | 244 | 7,003 | `2eafba80f973` |
| 70 | `src/database/entities/scale/growth-risk-flag.entity.ts` | 83 | 2,581 | `1b48a150f870` |
| 71 | `src/database/entities/scale/partnership.entity.ts` | 159 | 5,030 | `18192c590d17` |
| 72 | `src/database/entities/scale/referral-reward.entity.ts` | 139 | 4,422 | `d66482ee35c4` |
| 73 | `src/database/entities/success/case-study.entity.ts` | 177 | 5,456 | `c966d075cd1a` |
| 74 | `src/database/entities/success/creator-referral-event.entity.ts` | 66 | 2,077 | `b3ab2c56c40f` |
| 75 | `src/database/entities/success/creator-referral.entity.ts` | 134 | 4,674 | `ddfe9d302b0a` |
| 76 | `src/database/entities/success/review-request.entity.ts` | 95 | 3,179 | `cb8f715b14a9` |
| 77 | `src/database/entities/support/contact-message.entity.ts` | 99 | 3,232 | `7129be0b6083` |
| 78 | `src/database/entities/support/support-enums.ts` | 14 | 309 | `b05756f83ac8` |
| 79 | `src/database/entities/support/support-message.entity.ts` | 46 | 1,236 | `5b821b4088e1` |
| 80 | `src/database/entities/support/support-request.entity.ts` | 93 | 2,865 | `a693be1f681f` |
| 81 | `src/database/entities/technical-review/review-access-grant.entity.ts` | 77 | 2,630 | `ec7ff14d4133` |
| 82 | `src/database/entities/technical-review/technical-review-assignment.entity.ts` | 23 | 1,000 | `28f94ddb2973` |
| 83 | `src/database/entities/technical-review/technical-review-case.entity.ts` | 63 | 2,606 | `23df67e7d108` |
| 84 | `src/database/entities/technical-review/technical-review-control-review.entity.ts` | 33 | 1,215 | `03ee74c6cbad` |
| 85 | `src/database/entities/technical-review/technical-review-creator-response.entity.ts` | 30 | 937 | `12f0b5657fb8` |
| 86 | `src/database/entities/technical-review/technical-review-decision.entity.ts` | 30 | 1,169 | `78cc2283b62e` |
| 87 | `src/database/entities/technical-review/technical-review-event.entity.ts` | 30 | 1,089 | `67ef48196558` |
| 88 | `src/database/entities/technical-review/technical-review-finding.entity.ts` | 45 | 1,564 | `5dcf83d7e921` |
| 89 | `src/database/entities/trust/report.entity.ts` | 107 | 2,834 | `e34f51588171` |
| 90 | `src/database/entities/trust/security-checklist.ts` | 41 | 1,807 | `99c2e96f621c` |
| 91 | `src/database/entities/trust/security-review-item.entity.ts` | 48 | 1,287 | `ecfd8fa60329` |
| 92 | `src/database/entities/trust/security-review.entity.ts` | 71 | 1,905 | `3ef8f4cc4d69` |
| 93 | `src/database/migrations/1772000000000-taxonomy-persian-industries.ts` | 236 | 10,225 | `4a7d2db7fb43` |
| 94 | `src/database/migrations/1772100000000-taxonomy-search-document.ts` | 229 | 11,244 | `b31bf4d3d80b` |
| 95 | `src/database/taxonomy/taxonomy-data.ts` | 1,763 | 45,231 | `00716e70e8e4` |
| 96 | `src/modules/agents/search/search-concepts.ts` | 776 | 14,847 | `683f9c2be550` |
| 97 | `src/modules/audit/audit-actions.ts` | 261 | 11,916 | `0db49ebf37e5` |
| 98 | `src/modules/audit/audit.module.ts` | 12 | 383 | `1e87a4b1c032` |
| 99 | `src/modules/audit/audit.service.ts` | 71 | 2,137 | `8465f45919d8` |
| 100 | `src/modules/categories/categories.controller.ts` | 72 | 2,573 | `f7bb2747a7f7` |
| 101 | `src/modules/categories/categories.module.ts` | 31 | 1,338 | `3b3661376582` |
| 102 | `src/modules/categories/categories.service.spec.ts` | 29 | 1,052 | `6aca4e99051b` |
| 103 | `src/modules/categories/categories.service.ts` | 117 | 3,816 | `0a903dc491a5` |
| 104 | `src/modules/categories/industries.service.ts` | 61 | 2,104 | `2f2f9a3af9b5` |
| 105 | `src/modules/categories/taxonomy-admin.service.ts` | 422 | 14,383 | `ea265a9503e7` |
| 106 | `src/modules/control-plane/authz/admin-permissions.ts` | 492 | 16,205 | `bc26baa4d28c` |
| 107 | `src/modules/control-plane/authz/route-permissions.ts` | 223 | 9,896 | `abb72af97488` |
| 108 | `src/modules/notifications/notification-templates.spec.ts` | 278 | 11,093 | `8ebfee46ce06` |
| 109 | `src/modules/notifications/notification-templates.ts` | 1,241 | 44,086 | `ab4beb416aa4` |
| 110 | `src/modules/notifications/notifications.controller.ts` | 122 | 3,792 | `3e8997aba7c3` |
| 111 | `src/modules/notifications/notifications.module.ts` | 15 | 621 | `5e394f0d1350` |
| 112 | `src/modules/notifications/notifications.service.spec.ts` | 250 | 7,818 | `58f8f1d11ac5` |
| 113 | `src/modules/notifications/notifications.service.ts` | 456 | 15,476 | `a7daa79f1ed2` |
| 114 | `src/modules/storage/image-sniff.ts` | 112 | 4,069 | `bd62c8b0138c` |
| 115 | `src/modules/storage/media-rules.ts` | 121 | 3,132 | `90136ba846cb` |
| 116 | `src/modules/storage/storage.controller.ts` | 121 | 4,204 | `9a2cd7e2a1a7` |
| 117 | `src/modules/storage/storage.module.ts` | 32 | 1,127 | `46d1a45969f0` |
| 118 | `src/modules/storage/storage.provider.ts` | 58 | 1,933 | `4b16087b23fb` |
| 119 | `src/modules/storage/storage.service.ts` | 307 | 9,246 | `32811159d7cb` |
| 120 | `src/modules/storage/storage.spec.ts` | 248 | 7,967 | `1c80cf3a0746` |
| 121 | `src/modules/storage/test-images.ts` | 72 | 2,140 | `4778c58b75b7` |

#### لایهٔ `auto` — خودکار — با پیمایش ترابرِد importها کشیده شده (زنجیرهٔ علت در ستون «چرا»)

| # | مسیر (همان مسیر اصلی در مش) | خط | بایت | sha256 (۱۲ رقم) |
| --- | --- | --- | --- | --- |
| 1 | `src/common/cache/public-query-cache.module.ts` | 6 | 288 | `9f6c9759a56c` |
| 2 | `src/common/cache/public-query-cache.ts` | 49 | 2,071 | `aecaec12b932` |
| 3 | `src/common/cache/single-flight-ttl-cache.ts` | 134 | 4,647 | `227b35c4ef6a` |
| 4 | `src/common/crypto/crypto.module.ts` | 9 | 231 | `5b8a265231fc` |
| 5 | `src/common/crypto/field-crypto.service.ts` | 71 | 2,485 | `d309ba70c7fe` |
| 6 | `src/common/crypto/field-crypto.ts` | 182 | 6,168 | `379cc5e8b2d3` |
| 7 | `src/common/crypto/totp.ts` | 118 | 3,778 | `bac82d9530ac` |
| 8 | `src/common/db/returned.ts` | 19 | 721 | `d5f8294364fb` |
| 9 | `src/common/decorators/current-user.decorator.ts` | 17 | 568 | `2928c6f70e9b` |
| 10 | `src/common/decorators/public-cache.decorator.ts` | 21 | 919 | `19ddadb92680` |
| 11 | `src/common/decorators/public.decorator.ts` | 6 | 209 | `b63f607154b7` |
| 12 | `src/common/decorators/roles.decorator.ts` | 7 | 308 | `3db0b9c72639` |
| 13 | `src/common/dto/pagination.dto.ts` | 58 | 1,551 | `da222c7e6fa2` |
| 14 | `src/common/errors/api-error.ts` | 122 | 2,986 | `9a4df771210f` |
| 15 | `src/common/logging/app-logger.ts` | 233 | 7,429 | `aa0b915a2cd5` |
| 16 | `src/common/logging/redact.ts` | 128 | 4,445 | `d226198c6d3e` |
| 17 | `src/common/logging/request-context.ts` | 44 | 1,486 | `42d505141cd5` |
| 18 | `src/common/observability/metrics.ts` | 309 | 9,708 | `59cb477fd50a` |
| 19 | `src/common/types/auth-user.ts` | 29 | 895 | `f77fd2a7f094` |
| 20 | `src/common/utils/slug.ts` | 119 | 2,414 | `0dac4853d90f` |
| 21 | `src/common/utils/user-agent.ts` | 48 | 1,551 | `568c8a73893e` |
| 22 | `src/common/validation/page-params.pipe.ts` | 58 | 2,188 | `502e82d751b4` |
| 23 | `src/database/ssl.ts` | 65 | 2,350 | `56fe2c2799d1` |
| 24 | `src/modules/agents/agents-views.ts` | 222 | 7,202 | `c267717facc1` |
| 25 | `src/modules/agents/agents.controller.ts` | 318 | 10,612 | `7ea5da687d87` |
| 26 | `src/modules/agents/agents.module.ts` | 48 | 2,159 | `772390328477` |
| 27 | `src/modules/agents/agents.service.ts` | 1,231 | 43,751 | `730227a04dc1` |
| 28 | `src/modules/agents/dto/list-agents.dto.ts` | 223 | 6,622 | `ed9dc2f17d41` |
| 29 | `src/modules/agents/dto/record-view.dto.ts` | 63 | 1,384 | `97a9db625dee` |
| 30 | `src/modules/agents/dto/search-discovery.dto.ts` | 13 | 393 | `e533f2f5cd29` |
| 31 | `src/modules/agents/product-freshness.ts` | 83 | 2,398 | `20f4668118f2` |
| 32 | `src/modules/agents/search/agent-search.controller.ts` | 89 | 3,131 | `9f08e8eda228` |
| 33 | `src/modules/agents/search/agent-search.service.ts` | 1,133 | 41,876 | `4dcb1328cd81` |
| 34 | `src/modules/agents/search/filters.ts` | 107 | 3,556 | `ada8336547b4` |
| 35 | `src/modules/agents/search/query-plan.ts` | 171 | 5,660 | `cca0ee37de9b` |
| 36 | `src/modules/agents/search/ranking.ts` | 209 | 6,678 | `f5ecb0b8a07c` |
| 37 | `src/modules/agents/search/search-text.ts` | 121 | 4,280 | `5df30b12fd74` |
| 38 | `src/modules/analytics/analytics-events.service.ts` | 479 | 16,371 | `d5b0b77feb84` |
| 39 | `src/modules/auth/auth-housekeeping.service.ts` | 70 | 2,110 | `bf36e1b794c5` |
| 40 | `src/modules/auth/auth-sessions.service.ts` | 151 | 4,776 | `759632a178b5` |
| 41 | `src/modules/auth/auth-tokens.service.ts` | 120 | 3,563 | `44a973e92487` |
| 42 | `src/modules/auth/auth.controller.ts` | 400 | 13,788 | `25238b286cd1` |
| 43 | `src/modules/auth/auth.module.ts` | 40 | 1,434 | `5fba5d16de16` |
| 44 | `src/modules/auth/auth.service.ts` | 1,075 | 37,006 | `743165de1fb6` |
| 45 | `src/modules/auth/dto/login.dto.ts` | 24 | 702 | `ef6325cd9131` |
| 46 | `src/modules/auth/dto/mfa.dto.ts` | 40 | 872 | `d4b7e94148a5` |
| 47 | `src/modules/auth/dto/onboarding.dto.ts` | 82 | 2,310 | `30b741e836c6` |
| 48 | `src/modules/auth/dto/password-reset.dto.ts` | 37 | 1,097 | `b09d2b12f522` |
| 49 | `src/modules/auth/dto/register.dto.ts` | 111 | 3,551 | `ebaabb19ca65` |
| 50 | `src/modules/auth/dto/verify-email.dto.ts` | 12 | 255 | `cbf46b1843de` |
| 51 | `src/modules/auth/legal-documents.ts` | 56 | 2,041 | `7fd032ec5042` |
| 52 | `src/modules/auth/login-attempts.service.ts` | 225 | 8,473 | `a13f3bea3321` |
| 53 | `src/modules/auth/optional-viewer.ts` | 23 | 670 | `5a6228caed03` |
| 54 | `src/modules/auth/two-factor.controller.ts` | 106 | 3,178 | `02f00e553b65` |
| 55 | `src/modules/auth/two-factor.service.ts` | 460 | 15,826 | `cff4051d2039` |
| 56 | `src/modules/auth/verification-sender.service.ts` | 51 | 1,541 | `263339e8508b` |
| 57 | `src/modules/buyer-journey/contract.ts` | 333 | 11,331 | `f43fadd7eb15` |
| 58 | `src/modules/buyer-journey/setup-blueprint.ts` | 125 | 3,549 | `9d9fd0edaf8f` |
| 59 | `src/modules/commerce/admin-commerce.controller.ts` | 219 | 7,223 | `7ebb04e351f0` |
| 60 | `src/modules/commerce/commerce.controller.ts` | 295 | 9,736 | `d0c1b577fd34` |
| 61 | `src/modules/commerce/commerce.module.ts` | 71 | 2,738 | `2fbc4445d551` |
| 62 | `src/modules/commerce/commerce.service.ts` | 491 | 16,895 | `22f2eb12f240` |
| 63 | `src/modules/commerce/dto/entitlement.dto.ts` | 8 | 311 | `3f75295f6875` |
| 64 | `src/modules/commerce/dto/my-orders-query.dto.ts` | 18 | 766 | `ffe1a564a75a` |
| 65 | `src/modules/commerce/dto/purchase.dto.ts` | 109 | 2,480 | `14239ca468c9` |
| 66 | `src/modules/commerce/entitlement-domain.ts` | 108 | 3,611 | `d1f1b5e04de7` |
| 67 | `src/modules/commerce/entitlements.service.ts` | 910 | 30,467 | `fe535ed89553` |
| 68 | `src/modules/commerce/gateway/payment-gateway.factory.ts` | 29 | 1,084 | `3c108bd53764` |
| 69 | `src/modules/commerce/gateway/payment-gateway.types.ts` | 107 | 3,645 | `8ce48f9422d8` |
| 70 | `src/modules/commerce/gateway/sandbox.gateway.ts` | 53 | 1,594 | `58a748f79669` |
| 71 | `src/modules/commerce/gateway/zarinpal.gateway.ts` | 315 | 10,336 | `f4e81f2c7d60` |
| 72 | `src/modules/commerce/order-detail.ts` | 211 | 5,864 | `c48820a9adaa` |
| 73 | `src/modules/commerce/orders.service.ts` | 455 | 14,614 | `899ec93196fb` |
| 74 | `src/modules/commerce/payments.service.ts` | 1,550 | 52,933 | `a3f37ae8f7a0` |
| 75 | `src/modules/commerce/refund-policy.ts` | 119 | 3,745 | `66a9f8db61d2` |
| 76 | `src/modules/commerce/refunds.service.ts` | 456 | 15,640 | `eb2e1aa056c1` |
| 77 | `src/modules/commerce/webhook-signature.service.ts` | 50 | 1,527 | `fbb6081af7a4` |
| 78 | `src/modules/control-plane/audit/admin-audit.service.ts` | 224 | 7,837 | `6a013d03666a` |
| 79 | `src/modules/control-plane/authz/admin-access.service.ts` | 271 | 9,103 | `04af78a6a95e` |
| 80 | `src/modules/control-plane/authz/admin-decorators.ts` | 15 | 603 | `f638fca83cd2` |
| 81 | `src/modules/control-plane/config/feature-flags.service.ts` | 526 | 16,840 | `81c397ff8661` |
| 82 | `src/modules/control-plane/config/kill-switch.guard.ts` | 41 | 1,317 | `60174a8d664d` |
| 83 | `src/modules/control-plane/control-plane-metrics.ts` | 96 | 3,576 | `8c556600d04b` |
| 84 | `src/modules/control-plane/impersonation/impersonation-policy.ts` | 54 | 2,247 | `0f60679aa95e` |
| 85 | `src/modules/crm/crm-acquisition.service.ts` | 384 | 12,663 | `6acb73508748` |
| 86 | `src/modules/crm/crm-analytics.service.ts` | 429 | 15,778 | `e16eec54ec9a` |
| 87 | `src/modules/crm/crm-attribution.controller.ts` | 125 | 4,184 | `f7f93fb82ce0` |
| 88 | `src/modules/crm/crm-attribution.service.ts` | 342 | 12,521 | `783031544671` |
| 89 | `src/modules/crm/crm-capability.guard.ts` | 65 | 2,181 | `2ef2e381b222` |
| 90 | `src/modules/crm/crm-conversion.service.ts` | 177 | 5,888 | `0d4d78661144` |
| 91 | `src/modules/crm/crm-engagement.service.ts` | 398 | 11,785 | `0b88315ad525` |
| 92 | `src/modules/crm/crm-events.service.ts` | 327 | 11,481 | `d4adaf350516` |
| 93 | `src/modules/crm/crm-export.service.ts` | 176 | 5,039 | `ba269bb59df3` |
| 94 | `src/modules/crm/crm-import.service.ts` | 499 | 16,264 | `0227fb67754a` |
| 95 | `src/modules/crm/crm-integration.service.ts` | 516 | 15,063 | `ebec4092b7ba` |
| 96 | `src/modules/crm/crm-leads.service.ts` | 1,206 | 38,268 | `77be0f0acee9` |
| 97 | `src/modules/crm/crm-records.service.ts` | 998 | 39,265 | `4639407fe6b7` |
| 98 | `src/modules/crm/crm-segments.service.ts` | 377 | 11,492 | `bf2a91ab4f6d` |
| 99 | `src/modules/crm/crm.controller.ts` | 1,057 | 33,563 | `88c84622e2c1` |
| 100 | `src/modules/crm/crm.module.ts` | 81 | 3,361 | `bb021e893c99` |
| 101 | `src/modules/crm/domain/activity.ts` | 122 | 3,751 | `4e4e3ac7d284` |
| 102 | `src/modules/crm/domain/crm-permissions.ts` | 58 | 2,241 | `72b7208ada60` |
| 103 | `src/modules/crm/domain/csv.ts` | 125 | 3,935 | `e0644a90a41e` |
| 104 | `src/modules/crm/domain/events.ts` | 245 | 10,271 | `8b650a18d4fa` |
| 105 | `src/modules/crm/domain/funnel.ts` | 394 | 14,362 | `b62bbd15b06f` |
| 106 | `src/modules/crm/domain/privacy.ts` | 113 | 4,321 | `a65848d7e8eb` |
| 107 | `src/modules/crm/domain/scoring.ts` | 337 | 11,511 | `195bc81622b2` |
| 108 | `src/modules/crm/domain/segments.ts` | 436 | 13,048 | `e7456bd0a5af` |
| 109 | `src/modules/crm/domain/taxonomy.ts` | 341 | 10,345 | `ae7bd6292e7e` |
| 110 | `src/modules/crm/dto/crm.dto.ts` | 394 | 12,958 | `5a37de76c811` |
| 111 | `src/modules/discovery/buyer-events.service.ts` | 40 | 1,242 | `aa973f55a09d` |
| 112 | `src/modules/discovery/buyer-events.ts` | 89 | 2,634 | `19ea2d3d74b3` |
| 113 | `src/modules/discovery/interest-scoring.ts` | 155 | 5,307 | `bcef367c1cfc` |
| 114 | `src/modules/discovery/interest.constants.ts` | 38 | 1,220 | `e0df5db59546` |
| 115 | `src/modules/email/email.module.ts` | 19 | 838 | `30afadcfa658` |
| 116 | `src/modules/email/email.service.ts` | 446 | 15,800 | `0311c20d7ff0` |
| 117 | `src/modules/email/security-alerts.service.ts` | 76 | 2,539 | `1c54d90c68c1` |
| 118 | `src/modules/email/templates/email-templates.ts` | 1,665 | 65,996 | `7662083571c6` |
| 119 | `src/modules/email/transports/console-email.transport.ts` | 37 | 1,242 | `ab6b4da02d5e` |
| 120 | `src/modules/email/transports/email-transport.ts` | 39 | 1,204 | `d25a5e10daa0` |
| 121 | `src/modules/email/transports/smtp-email.transport.ts` | 105 | 3,487 | `164b41c40cdf` |
| 122 | `src/modules/evaluation-engine/domain/control-catalog.ts` | 619 | 21,516 | `7da2038eeaf6` |
| 123 | `src/modules/evaluation-engine/domain/evaluation-domain.ts` | 319 | 11,427 | `0cc916b1efed` |
| 124 | `src/modules/evaluation-engine/domain/evaluation-policy.ts` | 71 | 2,492 | `0ceb20420aef` |
| 125 | `src/modules/evaluation-engine/domain/evaluation.types.ts` | 227 | 6,236 | `7ea20f13b1e2` |
| 126 | `src/modules/evaluation-engine/domain/trust-disclosure.ts` | 184 | 5,270 | `8e6d6cbe41dd` |
| 127 | `src/modules/evaluation-engine/dto/evaluation.dto.ts` | 88 | 1,479 | `44a7e0b8fc4a` |
| 128 | `src/modules/evaluation-engine/evaluation-policy.service.ts` | 66 | 1,976 | `e8e8155ab3f9` |
| 129 | `src/modules/evaluation-engine/evaluation-source.service.ts` | 287 | 10,405 | `5d428130590d` |
| 130 | `src/modules/evaluation-engine/evaluation.controller.ts` | 170 | 4,766 | `faee495c4f0b` |
| 131 | `src/modules/evaluation-engine/evaluation.module.ts` | 55 | 2,542 | `61dd118320eb` |
| 132 | `src/modules/evaluation-engine/evaluation.service.ts` | 520 | 18,746 | `d48f4e03461d` |
| 133 | `src/modules/evaluation-engine/trust-disclosure.service.ts` | 84 | 2,869 | `b4792fe4ee74` |
| 134 | `src/modules/finance/balance.service.ts` | 314 | 10,003 | `b00bb81ee835` |
| 135 | `src/modules/finance/bank-accounts.service.ts` | 276 | 9,266 | `599086775535` |
| 136 | `src/modules/finance/creator-resolver.ts` | 37 | 1,200 | `7b8af8ad5ed5` |
| 137 | `src/modules/finance/domain/commission.ts` | 107 | 3,301 | `21bb2af547be` |
| 138 | `src/modules/finance/domain/iban.ts` | 94 | 3,106 | `1405ffa8bec6` |
| 139 | `src/modules/finance/domain/ledger.ts` | 342 | 9,792 | `36aadade1b58` |
| 140 | `src/modules/finance/domain/money.ts` | 232 | 7,914 | `48e45737567d` |
| 141 | `src/modules/finance/domain/national-id.ts` | 26 | 952 | `dd1e9a789867` |
| 142 | `src/modules/finance/domain/net-sales.ts` | 80 | 2,578 | `7b4a75dba469` |
| 143 | `src/modules/finance/domain/payout-rules.ts` | 111 | 3,342 | `24c53ba2f53f` |
| 144 | `src/modules/finance/domain/policy.ts` | 260 | 7,970 | `d1e3dbfd799d` |
| 145 | `src/modules/finance/domain/refund-rules.ts` | 108 | 3,113 | `3b3cedc97b6c` |
| 146 | `src/modules/finance/domain/state-machines.ts` | 514 | 13,962 | `63bcf508a24d` |
| 147 | `src/modules/finance/dto/finance.dto.ts` | 317 | 5,998 | `5ab497693486` |
| 148 | `src/modules/finance/finance-actor.ts` | 45 | 1,351 | `9070f9692abe` |
| 149 | `src/modules/finance/finance-admin.service.ts` | 198 | 6,576 | `5e45b75c969b` |
| 150 | `src/modules/finance/finance-clock.ts` | 43 | 1,217 | `623eb866f610` |
| 151 | `src/modules/finance/finance-exceptions.service.ts` | 64 | 1,892 | `dd59b0614730` |
| 152 | `src/modules/finance/finance-jobs.service.ts` | 109 | 3,287 | `b5057498f844` |
| 153 | `src/modules/finance/finance-metrics.ts` | 114 | 3,893 | `89ec84a2dcbb` |
| 154 | `src/modules/finance/finance.controllers.ts` | 868 | 25,583 | `59106172e16a` |
| 155 | `src/modules/finance/finance.module.ts` | 96 | 3,266 | `6eff028677c2` |
| 156 | `src/modules/finance/financial-audit.service.ts` | 61 | 2,106 | `798665fe7469` |
| 157 | `src/modules/finance/financial-calculations.service.ts` | 191 | 6,744 | `cef8f81e73b3` |
| 158 | `src/modules/finance/financial-holds.service.ts` | 99 | 3,351 | `5f02b8e585cb` |
| 159 | `src/modules/finance/integrity.service.ts` | 223 | 10,445 | `328041eb6b0c` |
| 160 | `src/modules/finance/kyc.service.ts` | 364 | 11,157 | `1c219a80b809` |
| 161 | `src/modules/finance/ledger.service.ts` | 389 | 12,178 | `38d08bee3979` |
| 162 | `src/modules/finance/payout-provider.ts` | 24 | 905 | `e13fbfce6859` |
| 163 | `src/modules/finance/payouts.service.ts` | 903 | 29,350 | `1c7f8726a1c3` |
| 164 | `src/modules/finance/policy.service.ts` | 200 | 6,492 | `7f3a83a3aff7` |
| 165 | `src/modules/finance/receipts.service.ts` | 204 | 6,864 | `4c9fb807c23a` |
| 166 | `src/modules/finance/reconciliation.service.ts` | 644 | 22,040 | `036a38cc83e2` |
| 167 | `src/modules/finance/recovery.service.ts` | 75 | 2,161 | `036ea8e59c22` |
| 168 | `src/modules/finance/refund-settlement.service.ts` | 487 | 16,812 | `48461690400e` |
| 169 | `src/modules/finance/release.service.ts` | 151 | 5,006 | `34ffd44534d0` |
| 170 | `src/modules/finance/sale-recorder.service.ts` | 419 | 13,236 | `6d146efbe980` |
| 171 | `src/modules/finance/sql.ts` | 7 | 336 | `4862d30223bc` |
| 172 | `src/modules/finance/statements.service.ts` | 316 | 12,120 | `afe336450dfb` |
| 173 | `src/modules/finance/usage-metering.service.ts` | 803 | 28,188 | `ea5577c112da` |
| 174 | `src/modules/jobs/jobs.service.ts` | 225 | 8,038 | `7deca34abc6e` |
| 175 | `src/modules/runtime/connector-client.service.ts` | 291 | 9,177 | `583139c1fb9a` |
| 176 | `src/modules/runtime/dto/runtime.dto.ts` | 196 | 3,848 | `a169410e4747` |
| 177 | `src/modules/runtime/gateway-assertion.service.ts` | 57 | 1,508 | `185cc5c98d2e` |
| 178 | `src/modules/runtime/managed-runtime.service.ts` | 185 | 5,732 | `8eed80e904dc` |
| 179 | `src/modules/runtime/runtime-credential-scope.decorator.ts` | 11 | 574 | `5fabf01a3f74` |
| 180 | `src/modules/runtime/runtime-domain.ts` | 379 | 13,123 | `c075858c51a5` |
| 181 | `src/modules/runtime/runtime-gateway.service.ts` | 196 | 7,244 | `cc7cbbb5372d` |
| 182 | `src/modules/runtime/runtime.controller.ts` | 345 | 10,221 | `20d07cc9fd2d` |
| 183 | `src/modules/runtime/runtime.module.ts` | 64 | 2,418 | `62935e14e648` |
| 184 | `src/modules/runtime/runtimes.service.ts` | 1,330 | 44,770 | `fd7c96c330a6` |
| 185 | `src/modules/scale/affiliate.service.ts` | 549 | 20,795 | `b532e6cc7611` |
| 186 | `src/modules/scale/ambassador.service.ts` | 739 | 27,460 | `166cdfe1c39f` |
| 187 | `src/modules/scale/community.service.ts` | 536 | 20,075 | `9b38c2b750c0` |
| 188 | `src/modules/scale/domain/affiliate.ts` | 118 | 3,636 | `d7df09585575` |
| 189 | `src/modules/scale/domain/ambassador.ts` | 198 | 6,284 | `2f50f7f8642a` |
| 190 | `src/modules/scale/domain/attribution.ts` | 225 | 7,481 | `159692ac911a` |
| 191 | `src/modules/scale/domain/money.ts` | 217 | 8,482 | `0042b2f74c34` |
| 192 | `src/modules/scale/domain/partnership.ts` | 152 | 4,198 | `1fce7272bda2` |
| 193 | `src/modules/scale/dto/scale.dto.ts` | 436 | 8,942 | `c39b17f1c4f4` |
| 194 | `src/modules/scale/growth-loop.service.ts` | 184 | 6,974 | `43ba26735c57` |
| 195 | `src/modules/scale/growth-reports.service.ts` | 398 | 14,953 | `d9df8a85a1ae` |
| 196 | `src/modules/scale/partnership.service.ts` | 398 | 13,830 | `bf4c4ef1947b` |
| 197 | `src/modules/scale/referral.service.ts` | 734 | 28,870 | `1b061686ac78` |
| 198 | `src/modules/scale/reward.service.ts` | 611 | 22,230 | `70a20fd627fb` |
| 199 | `src/modules/scale/scale-admin.controller.ts` | 522 | 17,100 | `e317c851cc20` |
| 200 | `src/modules/scale/scale-creator.controller.ts` | 280 | 10,770 | `75de7527c0f4` |
| 201 | `src/modules/scale/scale-public.controller.ts` | 66 | 2,421 | `e7bcc5ff96df` |
| 202 | `src/modules/scale/scale.module.ts` | 103 | 3,641 | `632646f01229` |
| 203 | `src/modules/success/c4-lifecycle.service.ts` | 227 | 7,871 | `79566968bd7c` |
| 204 | `src/modules/success/domain/case-study-eligibility.ts` | 206 | 6,337 | `725232c22689` |
| 205 | `src/modules/success/domain/insights.ts` | 327 | 11,395 | `ef8127018fef` |
| 206 | `src/modules/success/domain/referral.ts` | 151 | 4,893 | `f546cb1451d5` |
| 207 | `src/modules/success/referral.service.ts` | 561 | 19,909 | `f1fbdf8e4da7` |
| 208 | `src/modules/success/review-success.service.ts` | 415 | 14,386 | `0b0920ad382d` |
| 209 | `src/modules/technical-review/admin-technical-reviews.controller.ts` | 194 | 5,970 | `8e491bb393c4` |
| 210 | `src/modules/technical-review/creator-technical-reviews.controller.ts` | 88 | 2,582 | `5e41a7a24468` |
| 211 | `src/modules/technical-review/domain/review-access.ts` | 158 | 4,899 | `f1010b1dd218` |
| 212 | `src/modules/technical-review/domain/technical-review.types.ts` | 64 | 1,695 | `011d996d8a5a` |
| 213 | `src/modules/technical-review/dto/technical-review.dto.ts` | 153 | 4,109 | `44fc5ae8e796` |
| 214 | `src/modules/technical-review/review-access.service.ts` | 254 | 8,211 | `d76669dc514d` |
| 215 | `src/modules/technical-review/technical-review.module.ts` | 53 | 2,977 | `1ef609d518c5` |
| 216 | `src/modules/technical-review/technical-review.service.ts` | 1,473 | 46,396 | `9c6c81278565` |
| 217 | `src/modules/users/user-view.ts` | 58 | 1,880 | `d338ec564fa4` |
| 218 | `src/modules/users/users.service.ts` | 313 | 10,567 | `ca6e39c46ac0` |

#### لایهٔ `reference` — مرجع — جزو فیچر نیست؛ فقط برای دیدن نقاط اتصال کپی شده

| # | مسیر (همان مسیر اصلی در مش) | خط | بایت | sha256 (۱۲ رقم) |
| --- | --- | --- | --- | --- |
| 1 | `package.json` | 120 | 3,991 | `f8b3ced81ee9` |
| 2 | `src/app.module.ts` | 235 | 11,242 | `a5158679edf2` |
| 3 | `src/config/env.validation.ts` | 698 | 26,544 | `68b15a160927` |
| 4 | `src/database/seeds/seed.ts` | 689 | 25,085 | `09a424e0ed20` |
| 5 | `test/fixtures/public-routes.ts` | 102 | 4,612 | `33f6afb56797` |

### فرانت‌اند (React + Vite)

#### لایهٔ `core` — هسته — خودِ فیچر تولید محتوا

| # | مسیر (همان مسیر اصلی در مش) | خط | بایت | sha256 (۱۲ رقم) |
| --- | --- | --- | --- | --- |
| 1 | `docs/blog/MESH_Blog_Decisions_FA.md` | 133 | 20,948 | `8fec2d748cab` |
| 2 | `docs/blog/MESH_Blog_Release_Report_FA.md` | 275 | 33,547 | `abae45e4d243` |
| 3 | `docs/blog/MESH_EDITORIAL_IMPLEMENTATION_REPORT.md` | 223 | 26,996 | `25870dd5c5bf` |
| 4 | `docs/seo-studio/00_PHASE0_AUDIT.md` | 82 | 13,676 | `97aa31561d84` |
| 5 | `docs/seo-studio/01_ARCHITECTURE.md` | 85 | 7,521 | `06e93e0fc6dc` |
| 6 | `docs/seo-studio/02_API_AND_DATA_MODEL.md` | 100 | 8,250 | `714441e4a8d3` |
| 7 | `docs/seo-studio/02_CONTENT_STUDIO.md` | 52 | 4,485 | `8c980bfb931b` |
| 8 | `docs/seo-studio/03_MIGRATION_ROLLBACK.md` | 44 | 3,854 | `9f6656d94e2d` |
| 9 | `docs/seo-studio/04_TESTS_AND_LIMITATIONS.md` | 74 | 8,995 | `6571a1606dd6` |
| 10 | `e2e/26-blog-discovery.spec.ts` | 163 | 8,959 | `93bc8d1b2ad6` |
| 11 | `e2e/27-blog-engagement.spec.ts` | 168 | 7,949 | `fc3760993807` |
| 12 | `e2e/28-blog-editorial.spec.ts` | 203 | 13,688 | `d9de607d483c` |
| 13 | `scripts/emit-seo.mjs` | 226 | 9,527 | `a932eab2e9be` |
| 14 | `scripts/qa/blog-qa.mjs` | 324 | 17,163 | `ee1fdcfcb918` |
| 15 | `src/api/blog.ts` | 602 | 20,968 | `efe712bdaffb` |
| 16 | `src/api/seo.ts` | 357 | 10,861 | `6cfa4a45f7e6` |
| 17 | `src/components/engagement/ChangelogEditor.tsx` | 130 | 4,369 | `6c0f38147498` |
| 18 | `src/components/engagement/ProductChangelog.tsx` | 127 | 4,898 | `458ab681632a` |
| 19 | `src/content/__tests__/docs-content.test.ts` | 143 | 6,401 | `5b514d39f7c1` |
| 20 | `src/content/__tests__/social-links.test.ts` | 26 | 1,441 | `c36139b37c15` |
| 21 | `src/content/docs/buying.ts` | 435 | 28,194 | `d56959291edd` |
| 22 | `src/content/docs/creators.ts` | 389 | 24,617 | `1e7fd6e25b15` |
| 23 | `src/content/docs/developers.ts` | 457 | 22,142 | `36ece81a3a69` |
| 24 | `src/content/docs/getting-started.ts` | 191 | 13,520 | `aed02d6c2e6e` |
| 25 | `src/content/docs/index.ts` | 196 | 7,415 | `ba800f0bb226` |
| 26 | `src/content/docs/security.ts` | 195 | 14,368 | `6fa19558514b` |
| 27 | `src/content/docs/status.ts` | 54 | 2,863 | `cd8ceed4f4ef` |
| 28 | `src/content/docs/types.ts` | 24 | 863 | `2b641cdeac78` |
| 29 | `src/content/legal/__tests__/legal-version-parity.test.ts` | 81 | 3,820 | `b82a34b56bcd` |
| 30 | `src/content/legal/index.ts` | 33 | 1,447 | `6a4f66d331f7` |
| 31 | `src/content/legal/legal-documents.ts` | 87 | 2,865 | `fd465906ae2b` |
| 32 | `src/content/legal/privacy.ts` | 208 | 17,879 | `d5cd2ff0e32e` |
| 33 | `src/content/legal/refunds.ts` | 144 | 10,746 | `3be265b71310` |
| 34 | `src/content/legal/terms.ts` | 209 | 25,320 | `7cbaca5a8a81` |
| 35 | `src/content/markdown-lite.ts` | 228 | 7,576 | `01af8aa0611e` |
| 36 | `src/content/platform-facts.ts` | 53 | 2,619 | `dc322df5c7ea` |
| 37 | `src/content/social-links.ts` | 33 | 1,366 | `84d53fd593e2` |
| 38 | `src/i18n/__tests__/blog-i18n.test.ts` | 104 | 4,617 | `a31ea9d60ea7` |
| 39 | `src/i18n/blog.en.ts` | 847 | 47,510 | `13ddf541cf2b` |
| 40 | `src/i18n/blog.fa.ts` | 859 | 63,258 | `75b46957b62d` |
| 41 | `src/lib/__tests__/searchFold.test.ts` | 56 | 2,769 | `0cbcc0c169c1` |
| 42 | `src/lib/__tests__/seo.test.ts` | 153 | 6,512 | `eeebc30065bb` |
| 43 | `src/lib/__tests__/sitemap-coverage.test.ts` | 85 | 3,406 | `9e57aa892b2e` |
| 44 | `src/lib/changelog.ts` | 96 | 3,797 | `498d32878bd8` |
| 45 | `src/lib/searchFold.ts` | 149 | 5,182 | `c4e889b174f4` |
| 46 | `src/lib/seo.ts` | 153 | 6,216 | `680c8d7d349a` |
| 47 | `src/lib/usePageMeta.ts` | 208 | 9,549 | `84cabf2c1853` |
| 48 | `src/pages/admin/blog/AdminBlogCommentsPage.tsx` | 560 | 22,018 | `4b054ffcbaf7` |
| 49 | `src/pages/admin/blog/AdminBlogEditorPage.tsx` | 1,419 | 54,213 | `1c0bf9b7c0fb` |
| 50 | `src/pages/admin/blog/AdminBlogPage.tsx` | 421 | 17,040 | `7431db2849e2` |
| 51 | `src/pages/admin/blog/AdminBlogPreviewPage.tsx` | 57 | 2,232 | `0833d0f66e64` |
| 52 | `src/pages/admin/blog/AdminBlogTaxonomyPage.tsx` | 721 | 27,186 | `1a6dbf75fcf0` |
| 53 | `src/pages/admin/blog/__tests__/AdminBlogCommentsPage.test.tsx` | 186 | 8,326 | `4d35f6f0b477` |
| 54 | `src/pages/admin/blog/__tests__/AdminBlogPages.test.tsx` | 564 | 25,915 | `516d8b5e63f7` |
| 55 | `src/pages/admin/blog/blogAdminShared.tsx` | 119 | 5,379 | `a67c69a253fb` |
| 56 | `src/pages/admin/blog/editor/BodyEditor.tsx` | 95 | 2,847 | `be11e1054186` |
| 57 | `src/pages/admin/blog/editor/ContentEditor.tsx` | 815 | 29,680 | `a76adfa75f9c` |
| 58 | `src/pages/admin/blog/editor/SeoStudioPanel.tsx` | 924 | 34,673 | `43b63ab2db39` |
| 59 | `src/pages/admin/blog/editor/__tests__/ContentEditor.test.tsx` | 211 | 9,422 | `b3762c1ba7e2` |
| 60 | `src/pages/admin/blog/editor/__tests__/SeoStudioPanel.test.tsx` | 314 | 13,895 | `6e6272ce465d` |
| 61 | `src/pages/admin/blog/editor/__tests__/markdownBridge.test.ts` | 198 | 7,264 | `c5481aede7a1` |
| 62 | `src/pages/admin/blog/editor/blocksToDoc.ts` | 100 | 3,952 | `53b4afeb86da` |
| 63 | `src/pages/admin/blog/editor/docToMarkdown.ts` | 220 | 8,894 | `9423b9af5621` |
| 64 | `src/pages/admin/blog/editor/extensions.ts` | 211 | 6,792 | `b4f19652c321` |
| 65 | `src/pages/admin/blog/editorPanels.tsx` | 545 | 19,870 | `db6ff23bd101` |
| 66 | `src/pages/admin/blog/graph/AdminKnowledgeGraphPage.tsx` | 1,181 | 48,047 | `85fbc5fa74cc` |
| 67 | `src/pages/admin/blog/graph/__tests__/AdminKnowledgeGraphPage.test.tsx` | 393 | 14,424 | `a4fe344ac568` |
| 68 | `src/pages/admin/blog/graph/__tests__/graphLayout.test.ts` | 60 | 1,837 | `1c682c1c43d8` |
| 69 | `src/pages/admin/blog/graph/graphLayout.ts` | 92 | 3,359 | `279d5dca9a13` |
| 70 | `src/pages/blog/ArticleImage.tsx` | 21 | 1,314 | `41ed4b2b1d0b` |
| 71 | `src/pages/blog/ArticleShareRail.tsx` | 24 | 1,774 | `6e85b3939949` |
| 72 | `src/pages/blog/BlogArchivePage.tsx` | 218 | 8,523 | `bd8db13297c4` |
| 73 | `src/pages/blog/BlogArticlePage.tsx` | 401 | 17,522 | `84767872c3f0` |
| 74 | `src/pages/blog/BlogBlocks.tsx` | 212 | 6,980 | `0024dc8295cd` |
| 75 | `src/pages/blog/BlogEngagement.tsx` | 912 | 33,463 | `e216a285af7a` |
| 76 | `src/pages/blog/BlogFilters.tsx` | 261 | 9,929 | `8a27b5c5659f` |
| 77 | `src/pages/blog/BlogHomePage.tsx` | 225 | 10,232 | `13a464f4f599` |
| 78 | `src/pages/blog/__tests__/BlogEngagement.test.tsx` | 286 | 13,540 | `428d2cdba8f4` |
| 79 | `src/pages/blog/__tests__/BlogPages.test.tsx` | 488 | 26,042 | `f8ff3f1cd17e` |
| 80 | `src/pages/blog/__tests__/EditorialTools.test.tsx` | 53 | 3,456 | `9a5cade92fb2` |
| 81 | `src/pages/blog/__tests__/blogListState.test.ts` | 72 | 4,059 | `d0ce1a4be731` |
| 82 | `src/pages/blog/blogListState.ts` | 152 | 5,960 | `b514c37de7c1` |
| 83 | `src/pages/blog/blogShared.tsx` | 490 | 19,385 | `1b9b68bf6fcd` |
| 84 | `src/pages/blog/useBlogListState.ts` | 41 | 1,882 | `d835f6ce7cb7` |
| 85 | `src/pages/website/docs/DocsPage.tsx` | 456 | 17,855 | `af9f322e1e1a` |
| 86 | `src/pages/website/docs/DocsSearchDialog.tsx` | 227 | 8,832 | `929eb867ed5c` |
| 87 | `src/pages/website/docs/LegalDocumentPage.tsx` | 245 | 9,618 | `a7fbef24dfff` |
| 88 | `src/pages/website/docs/__tests__/DocsAndLegalPages.test.tsx` | 192 | 9,903 | `994048bd8523` |
| 89 | `src/styles/blog-admin.css` | 2,472 | 51,482 | `3a1ee2fbb00b` |
| 90 | `src/styles/blog-editorial.css` | 139 | 12,791 | `0e0a8440a09e` |
| 91 | `src/styles/blog.css` | 1,527 | 30,540 | `7bc9f3f28f00` |

#### لایهٔ `shared` — مشترک — وابستگی واقعی و دستی‌اعلام‌شدهٔ فیچر

| # | مسیر (همان مسیر اصلی در مش) | خط | بایت | sha256 (۱۲ رقم) |
| --- | --- | --- | --- | --- |
| 1 | `docs/icon-system/mesh-icon-specimen.svg` | 1 | 33,526 | `09a7eecb36cf` |
| 2 | `public/favicon.svg` | 4 | 585 | `83f410422cd1` |
| 3 | `public/icons.svg` | 24 | 5,031 | `b45fa506195c` |
| 4 | `public/og-cover.png` | 0 | 29,924 | `3e5738799e72` |
| 5 | `public/og-cover.svg` | 22 | 1,423 | `f3f3b0e30884` |
| 6 | `public/robots.txt` | 13 | 237 | `1338d4a4c312` |
| 7 | `public/sitemap.xml` | 45 | 1,231 | `09904917a795` |
| 8 | `src/api/client.ts` | 319 | 11,478 | `ce3aec52a441` |
| 9 | `src/api/endpoints.ts` | 1,997 | 70,574 | `da886dba5e8b` |
| 10 | `src/api/types.ts` | 5,012 | 134,335 | `449e0a4ea40d` |
| 11 | `src/app/providers.tsx` | 31 | 1,115 | `f718dcbf290b` |
| 12 | `src/assets/hero.png` | 0 | 13,057 | `881ffbcaafc2` |
| 13 | `src/assets/icons/mesh/agent.svg` | 1 | 391 | `79c81d8419eb` |
| 14 | `src/assets/icons/mesh/builder.svg` | 1 | 381 | `71d1dfdf0445` |
| 15 | `src/assets/icons/mesh/growth.svg` | 1 | 321 | `1e7b5408bd3f` |
| 16 | `src/assets/icons/mesh/ideas.svg` | 1 | 403 | `793f25eb7c08` |
| 17 | `src/assets/icons/mesh/mark.svg` | 1 | 560 | `f897db864ab8` |
| 18 | `src/assets/icons/mesh/network.svg` | 1 | 465 | `7d0ae0692869` |
| 19 | `src/assets/icons/mesh/opportunity.svg` | 1 | 321 | `880e5d00d73f` |
| 20 | `src/assets/icons/mesh/portfolio.svg` | 1 | 336 | `03bb3599305c` |
| 21 | `src/assets/icons/mesh/publish.svg` | 1 | 338 | `cfc9566a143b` |
| 22 | `src/assets/icons/mesh/review.svg` | 1 | 331 | `9750d9b0b70a` |
| 23 | `src/assets/icons/mesh/success.svg` | 1 | 289 | `73422ca482c1` |
| 24 | `src/assets/icons/mesh/toman.svg` | 1 | 391 | `2b7154659759` |
| 25 | `src/assets/icons/mesh/tools.svg` | 1 | 398 | `ad2d41241d7a` |
| 26 | `src/assets/icons/mesh/version.svg` | 1 | 422 | `9650e8bafa13` |
| 27 | `src/assets/icons/mesh/workflow.svg` | 1 | 408 | `c91af79c2c9d` |
| 28 | `src/assets/vite.svg` | 1 | 8,709 | `5be21acd42eb` |
| 29 | `src/components/Modal.tsx` | 107 | 3,610 | `654708b79e46` |
| 30 | `src/components/Pagination.tsx` | 96 | 2,452 | `288077714659` |
| 31 | `src/components/Toast.tsx` | 77 | 2,099 | `598640c89b5f` |
| 32 | `src/components/share/ShareMenu.tsx` | 284 | 9,690 | `aadf8bbd94ca` |
| 33 | `src/components/share/__tests__/ShareMenu.test.tsx` | 176 | 8,000 | `47cb3ada4513` |
| 34 | `src/components/share/shareTargets.ts` | 88 | 3,051 | `942a4d133526` |
| 35 | `src/components/ui/Alert.tsx` | 29 | 628 | `02003df17f1d` |
| 36 | `src/components/ui/AppIcon.tsx` | 48 | 2,024 | `73c1bbd71f4f` |
| 37 | `src/components/ui/AppText.tsx` | 72 | 2,041 | `6e8608349ff9` |
| 38 | `src/components/ui/Avatar.tsx` | 61 | 1,643 | `c435877a51db` |
| 39 | `src/components/ui/AvatarPicker.tsx` | 181 | 5,694 | `9de3cdcd0786` |
| 40 | `src/components/ui/BackLink.tsx` | 13 | 522 | `6cbed91bbfd9` |
| 41 | `src/components/ui/Badge.tsx` | 32 | 922 | `5ca062c08ec6` |
| 42 | `src/components/ui/Button.tsx` | 92 | 2,328 | `ad53a5e64ef0` |
| 43 | `src/components/ui/Card.tsx` | 73 | 2,364 | `78028b360a09` |
| 44 | `src/components/ui/Chip.tsx` | 17 | 486 | `ec4f9300942f` |
| 45 | `src/components/ui/CodeInput.tsx` | 89 | 2,486 | `4473b1f5c973` |
| 46 | `src/components/ui/ConfirmDialog.tsx` | 123 | 3,558 | `d4ad5d66b9de` |
| 47 | `src/components/ui/Dialog.tsx` | 7 | 276 | `9de72fc3569a` |
| 48 | `src/components/ui/Divider.tsx` | 15 | 342 | `da0802357d44` |
| 49 | `src/components/ui/FloatingActionButton.tsx` | 47 | 1,086 | `1946689ea6f4` |
| 50 | `src/components/ui/InlineSection.tsx` | 43 | 1,761 | `496c883e0764` |
| 51 | `src/components/ui/Input.tsx` | 67 | 1,839 | `54cb3858b83e` |
| 52 | `src/components/ui/MeshMark.tsx` | 17 | 738 | `898c186182a4` |
| 53 | `src/components/ui/Price.tsx` | 67 | 2,693 | `8b7d6998922e` |
| 54 | `src/components/ui/PriorityPanel.tsx` | 73 | 2,663 | `8f5e24299385` |
| 55 | `src/components/ui/ProductRow.tsx` | 186 | 6,315 | `a526a4aa69a2` |
| 56 | `src/components/ui/ProgressBar.tsx` | 48 | 1,487 | `0b4ca0246da7` |
| 57 | `src/components/ui/README.md` | 84 | 6,357 | `478966401652` |
| 58 | `src/components/ui/SegmentedControl.tsx` | 98 | 3,072 | `1264753b93ff` |
| 59 | `src/components/ui/Skeleton.tsx` | 146 | 4,620 | `3b20aac88323` |
| 60 | `src/components/ui/Spacer.tsx` | 11 | 335 | `0cc69a446404` |
| 61 | `src/components/ui/Spinner.tsx` | 46 | 1,618 | `cf24dae4dd16` |
| 62 | `src/components/ui/Stat.tsx` | 19 | 360 | `16c3c98950ce` |
| 63 | `src/components/ui/Tabs.tsx` | 103 | 2,974 | `d00ac36ced84` |
| 64 | `src/components/ui/Toggle.tsx` | 55 | 1,418 | `bffcb788dbef` |
| 65 | `src/components/ui/__tests__/Button.test.tsx` | 23 | 863 | `7db981e1eed5` |
| 66 | `src/components/ui/__tests__/CardSystem.test.tsx` | 199 | 8,420 | `05fa5b5046f7` |
| 67 | `src/components/ui/__tests__/ConfirmDialog.test.tsx` | 93 | 3,953 | `49f26c5ae84d` |
| 68 | `src/components/ui/__tests__/Price.test.tsx` | 74 | 3,527 | `7c081ceef610` |
| 69 | `src/components/ui/__tests__/Stars.test.tsx` | 34 | 961 | `7f738197a4f1` |
| 70 | `src/components/ui/__tests__/icons.test.tsx` | 283 | 13,655 | `1e2316b135be` |
| 71 | `src/components/ui/icons/FlagIcon.tsx` | 95 | 4,025 | `76299fcbad74` |
| 72 | `src/components/ui/icons/MeshIcon.tsx` | 42 | 1,500 | `1e4afdcfce9a` |
| 73 | `src/components/ui/icons/SocialIcon.tsx` | 53 | 2,116 | `2fd5d31fa4d3` |
| 74 | `src/components/ui/icons/StateIcon.tsx` | 35 | 1,420 | `3754b8661966` |
| 75 | `src/components/ui/icons/base.ts` | 284 | 6,550 | `32d39b87df09` |
| 76 | `src/components/ui/icons/mesh.ts` | 175 | 6,558 | `7bfcceeafee5` |
| 77 | `src/components/ui/icons/types.ts` | 62 | 2,310 | `7bfe968a3bdd` |
| 78 | `src/components/ui/index.tsx` | 96 | 3,864 | `2449ff04d416` |
| 79 | `src/context/AuthContext.tsx` | 277 | 8,544 | `f215e82664ca` |
| 80 | `src/i18n/index.tsx` | 172 | 6,101 | `fb8a6fb7241f` |
| 81 | `src/index.css` | 6,752 | 178,283 | `e0bf5f09a257` |
| 82 | `src/lib/avatar.ts` | 137 | 7,111 | `109a37971b96` |
| 83 | `src/lib/error.ts` | 81 | 3,281 | `53a0a3d7794b` |
| 84 | `src/lib/format.ts` | 115 | 4,214 | `59d876e558a5` |
| 85 | `src/lib/safe-url.ts` | 32 | 1,166 | `575d4d5b4426` |
| 86 | `src/lib/useAsync.ts` | 87 | 2,610 | `96ce1f9a1e4b` |
| 87 | `src/test/setup.ts` | 8 | 386 | `95d7b2007e05` |
| 88 | `src/theme/ThemeContext.ts` | 21 | 933 | `ffb9ed0fe38d` |
| 89 | `src/theme/ThemeProvider.tsx` | 189 | 6,389 | `62cdfe410c8f` |
| 90 | `src/theme/dark.ts` | 20 | 579 | `e8f8c485d21d` |
| 91 | `src/theme/displayPresets.ts` | 22 | 607 | `613c97144738` |
| 92 | `src/theme/index.ts` | 6 | 243 | `d5a90f2714db` |
| 93 | `src/theme/light.ts` | 20 | 582 | `ef626f82942b` |
| 94 | `src/theme/types.ts` | 30 | 1,017 | `8ed2be74adfd` |
| 95 | `src/theme/useAppTheme.ts` | 26 | 937 | `d2ad94fa3ff2` |
| 96 | `src/types/multiavatar.d.ts` | 9 | 263 | `0f8dca3cf912` |
| 97 | `src/vite-env.d.ts` | 18 | 595 | `d11966a0cdb8` |

#### لایهٔ `auto` — خودکار — با پیمایش ترابرِد importها کشیده شده (زنجیرهٔ علت در ستون «چرا»)

| # | مسیر (همان مسیر اصلی در مش) | خط | بایت | sha256 (۱۲ رقم) |
| --- | --- | --- | --- | --- |
| 1 | `scripts/icons/export-mesh-icons.d.mts` | 14 | 842 | `03902d037c14` |
| 2 | `scripts/icons/export-mesh-icons.mjs` | 106 | 5,184 | `93f1abb1c5f7` |
| 3 | `src/api/control.ts` | 899 | 30,246 | `0ffe542b5101` |
| 4 | `src/components/Stars.tsx` | 73 | 2,267 | `a8821e47630e` |
| 5 | `src/components/feedback/EmptyState.tsx` | 27 | 742 | `5d293d28bfb5` |
| 6 | `src/components/feedback/ErrorBanner.tsx` | 24 | 503 | `3f3445d1e791` |
| 7 | `src/components/feedback/ErrorState.tsx` | 38 | 1,010 | `ae5b300ea1ec` |
| 8 | `src/components/feedback/LoadingState.tsx` | 18 | 400 | `6abe785df6e5` |
| 9 | `src/components/feedback/index.ts` | 7 | 328 | `593f6da401d4` |
| 10 | `src/components/feedback/states.tsx` | 47 | 1,356 | `809d7dacd170` |
| 11 | `src/components/feedback/toastConfig.tsx` | 10 | 343 | `41563bfaf4b4` |
| 12 | `src/components/layout/Header.tsx` | 34 | 1,078 | `8016c8bfe8eb` |
| 13 | `src/components/layout/Screen.tsx` | 49 | 1,426 | `4c02de8ee69c` |
| 14 | `src/config/env.ts` | 36 | 1,598 | `c65f037bc34c` |
| 15 | `src/constants/accessibility.ts` | 8 | 326 | `9d807eb4e44a` |
| 16 | `src/constants/colors.ts` | 109 | 3,322 | `7234f4bdd747` |
| 17 | `src/constants/layout.ts` | 9 | 301 | `6f2a4945c6e2` |
| 18 | `src/constants/motion.ts` | 15 | 349 | `5e3c280bb3d2` |
| 19 | `src/constants/radius.ts` | 8 | 199 | `72269f0ac6b8` |
| 20 | `src/constants/shadows.ts` | 8 | 295 | `8f30b6f1dfb8` |
| 21 | `src/constants/spacing.ts` | 37 | 978 | `95a4f0838203` |
| 22 | `src/constants/typography.ts` | 36 | 880 | `2143808f9704` |
| 23 | `src/i18n/account.en.ts` | 189 | 10,977 | `4d13e4b01d7c` |
| 24 | `src/i18n/account.fa.ts` | 190 | 14,765 | `80bbdaa8ca02` |
| 25 | `src/i18n/comparison.en.ts` | 64 | 3,776 | `f8058a5fe908` |
| 26 | `src/i18n/comparison.fa.ts` | 64 | 4,856 | `53a5746962f1` |
| 27 | `src/i18n/control.en.ts` | 775 | 39,845 | `03650f984327` |
| 28 | `src/i18n/control.fa.ts` | 775 | 52,492 | `653b3fbd0fe9` |
| 29 | `src/i18n/creatorLanding.en.ts` | 341 | 26,129 | `3a6ea129f4b4` |
| 30 | `src/i18n/creatorLanding.fa.ts` | 356 | 34,925 | `87712e1c7301` |
| 31 | `src/i18n/discovery.en.ts` | 413 | 23,388 | `39c4d86128c3` |
| 32 | `src/i18n/discovery.fa.ts` | 413 | 31,187 | `438a65023eee` |
| 33 | `src/i18n/finance.en.ts` | 297 | 19,064 | `3425d4dcace0` |
| 34 | `src/i18n/finance.fa.ts` | 306 | 26,304 | `07bd653f369d` |
| 35 | `src/i18n/home.en.ts` | 137 | 8,195 | `2572f49d2d44` |
| 36 | `src/i18n/home.fa.ts` | 143 | 12,072 | `3dc3c411cb22` |
| 37 | `src/i18n/journey.en.ts` | 521 | 31,730 | `c1bd60e0a1ff` |
| 38 | `src/i18n/journey.fa.ts` | 521 | 43,102 | `d01f4d116268` |
| 39 | `src/i18n/monitoring.en.ts` | 117 | 5,487 | `d7ac165ef340` |
| 40 | `src/i18n/monitoring.fa.ts` | 115 | 6,948 | `66074f6e3621` |
| 41 | `src/i18n/runtime.en.ts` | 313 | 21,687 | `301035534f49` |
| 42 | `src/i18n/runtime.fa.ts` | 316 | 30,571 | `2ef5ad379c31` |
| 43 | `src/i18n/scale.en.ts` | 416 | 23,618 | `1c47ea977d6d` |
| 44 | `src/i18n/scale.fa.ts` | 423 | 29,363 | `09d0ec66f456` |
| 45 | `src/i18n/trust.en.ts` | 294 | 17,955 | `f0ca0d1a6307` |
| 46 | `src/i18n/trust.fa.ts` | 294 | 24,188 | `194c04bd232e` |
| 47 | `src/lib/buy.ts` | 274 | 9,499 | `1d3449ac5c47` |
| 48 | `src/lib/currency.ts` | 101 | 4,748 | `c387f2addedd` |
| 49 | `src/lib/journey.ts` | 332 | 14,266 | `f54ae3b7588e` |
| 50 | `src/lib/launch.ts` | 313 | 12,416 | `4ebf1672a761` |
| 51 | `src/lib/money.ts` | 58 | 2,563 | `79148ce1881f` |
| 52 | `src/lib/panel-storage.ts` | 98 | 3,465 | `a5c95387e11a` |
| 53 | `src/lib/review.ts` | 454 | 14,431 | `ce49c22a36a7` |
| 54 | `src/lib/rtl.ts` | 18 | 513 | `31cfcdfe2554` |
| 55 | `src/lib/storage.ts` | 24 | 510 | `1d4c8c45e1c1` |
| 56 | `src/lib/useMediaQuery.ts` | 16 | 668 | `5c4619fa32af` |
| 57 | `src/utils/digits.ts` | 27 | 847 | `df55c2d77c5c` |

#### لایهٔ `reference` — مرجع — جزو فیچر نیست؛ فقط برای دیدن نقاط اتصال کپی شده

| # | مسیر (همان مسیر اصلی در مش) | خط | بایت | sha256 (۱۲ رقم) |
| --- | --- | --- | --- | --- |
| 1 | `package.json` | 66 | 1,953 | `e7841c56b5ac` |
| 2 | `src/app/router.tsx` | 675 | 40,813 | `ba863e8eb191` |
| 3 | `src/components/Header.tsx` | 287 | 11,193 | `9ff5dee94b4b` |
| 4 | `src/i18n/messages/en.ts` | 6,271 | 336,246 | `82182e8908ba` |
| 5 | `src/i18n/messages/fa.ts` | 6,238 | 452,263 | `276a87070b76` |
| 6 | `src/lib/nav.ts` | 68 | 3,746 | `ad2c79b67027` |
| 7 | `src/main.tsx` | 37 | 1,179 | `4bcf9a4919c4` |

## ۴) لبه‌های پل — جاهایی که اگر قطع کنید، استخراج کوچک می‌شود

این‌ها یال‌هایی در گراف import هستند که بیشترین حجم لایهٔ `auto` از آن‌ها عبور می‌کند.
اگر این فیچر را در پروژه‌ای تازه می‌کارید، همین چند نقطه را stub کنید.

| یال | مخزن | فایل‌های `auto` عبوری | خط | توضیح |
| --- | --- | --- | --- | --- |
| `src/modules/agents/agents.module.ts` | بک‌اند (NestJS) | 175 | 46,569 | SeoModule imports AgentsModule for agent-aware internal links. That single NestJS edge transitively drags in runtime, finance, commerce, crm and auth. |
| `src/i18n/index.tsx` | فرانت‌اند (React + Vite) | 20 | 5,363 | The i18n provider registers every message pack, not just blog.fa/blog.en. |
| `src/database/entities/identity/user.entity.ts` | بک‌اند (NestJS) | 0 | 0 | Blog authors/comments relate to User, whose own relations fan out across the entity graph. |

## ۵) وضعیت بستار importها

- importهای نسبیِ حل‌نشده: **206**
- همهٔ آن‌ها از فایل‌های لایهٔ `reference` (مثل `router.tsx` و `app.module.ts`)
  و فایل‌های `test/` و `e2e/` می‌آیند؛ این فایل‌ها عمداً پیمایش نمی‌شوند چون
  کل اپلیکیشن را import می‌کنند. **هیچ import حل‌نشده‌ای از کد خودِ فیچر وجود ندارد.**

| فایل اعلام‌کننده | تعداد ارجاع بیرونی |
| --- | --- |
| `frontend:src/app/router.tsx` | 130 |
| `backend:src/app.module.ts` | 30 |
| `frontend:src/main.tsx` | 20 |
| `backend:test/blog/blog-engagement.e2e-spec.ts` | 5 |
| `backend:test/blog/blog.e2e-spec.ts` | 5 |
| `backend:test/seo/seo-studio.e2e-spec.ts` | 5 |
| `backend:test/seo.e2e-spec.ts` | 4 |
| `backend:src/database/seeds/seed.ts` | 2 |
| `backend:test/blog/blog-migration.e2e-spec.ts` | 1 |
| `frontend:e2e/26-blog-discovery.spec.ts` | 1 |
| `frontend:e2e/27-blog-engagement.spec.ts` | 1 |
| `frontend:e2e/28-blog-editorial.spec.ts` | 1 |
| `frontend:src/components/Header.tsx` | 1 |

## ۶) زنجیرهٔ علت برای فایل‌های لایهٔ `auto`

هر سطر نشان می‌دهد کدام فایلِ اعلام‌شده باعث کشیده‌شدن این فایل شده است.

| فایل | مخزن | زنجیره (از ریشه) |
| --- | --- | --- |
| `src/common/cache/public-query-cache.module.ts` | بک‌اند (NestJS) | `categories.module.ts` ← `public-query-cache.module.ts` |
| `src/common/cache/public-query-cache.ts` | بک‌اند (NestJS) | `categories.controller.ts` ← `public-query-cache.ts` |
| `src/common/cache/single-flight-ttl-cache.ts` | بک‌اند (NestJS) | `categories.controller.ts` ← `public-query-cache.ts` ← `single-flight-ttl-cache.ts` |
| `src/common/crypto/crypto.module.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `finance.module.ts` ← `crypto.module.ts` |
| `src/common/crypto/field-crypto.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `auth.module.ts` ← `two-factor.service.ts` ← `field-crypto.service.ts` |
| `src/common/crypto/field-crypto.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `auth.module.ts` ← `two-factor.service.ts` ← `field-crypto.service.ts` ← `field-crypto.ts` |
| `src/common/crypto/totp.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `auth.module.ts` ← `two-factor.service.ts` ← `totp.ts` |
| `src/common/db/returned.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `auth.module.ts` ← `two-factor.service.ts` ← `returned.ts` |
| `src/common/decorators/current-user.decorator.ts` | بک‌اند (NestJS) | `blog-admin.controller.ts` ← `current-user.decorator.ts` |
| `src/common/decorators/public-cache.decorator.ts` | بک‌اند (NestJS) | `blog-engagement.controller.ts` ← `public-cache.decorator.ts` |
| `src/common/decorators/public.decorator.ts` | بک‌اند (NestJS) | `blog-engagement.controller.ts` ← `public.decorator.ts` |
| `src/common/decorators/roles.decorator.ts` | بک‌اند (NestJS) | `blog-admin.controller.ts` ← `roles.decorator.ts` |
| `src/common/dto/pagination.dto.ts` | بک‌اند (NestJS) | `blog-engagement.service.ts` ← `pagination.dto.ts` |
| `src/common/errors/api-error.ts` | بک‌اند (NestJS) | `blog-engagement.controller.ts` ← `api-error.ts` |
| `src/common/logging/app-logger.ts` | بک‌اند (NestJS) | `audit.service.ts` ← `app-logger.ts` |
| `src/common/logging/redact.ts` | بک‌اند (NestJS) | `audit.service.ts` ← `app-logger.ts` ← `redact.ts` |
| `src/common/logging/request-context.ts` | بک‌اند (NestJS) | `audit.service.ts` ← `app-logger.ts` ← `request-context.ts` |
| `src/common/observability/metrics.ts` | بک‌اند (NestJS) | `categories.controller.ts` ← `public-query-cache.ts` ← `metrics.ts` |
| `src/common/types/auth-user.ts` | بک‌اند (NestJS) | `blog-admin.controller.ts` ← `auth-user.ts` |
| `src/common/utils/slug.ts` | بک‌اند (NestJS) | `blog-posts.service.ts` ← `slug.ts` |
| `src/common/utils/user-agent.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `auth.module.ts` ← `auth.controller.ts` ← `users.service.ts` ← `user-agent.ts` |
| `src/common/validation/page-params.pipe.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `auth.module.ts` ← `crm.module.ts` ← `crm.controller.ts` ← `page-params.pipe.ts` |
| `src/database/ssl.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `auth.module.ts` ← `auth-housekeeping.service.ts` ← `jobs.service.ts` ← `ssl.ts` |
| `src/modules/agents/agents-views.ts` | بک‌اند (NestJS) | `seo-render.service.ts` ← `agents.service.ts` ← `agents-views.ts` |
| `src/modules/agents/agents.controller.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `agents.controller.ts` |
| `src/modules/agents/agents.module.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` |
| `src/modules/agents/agents.service.ts` | بک‌اند (NestJS) | `seo-render.service.ts` ← `agents.service.ts` |
| `src/modules/agents/dto/list-agents.dto.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `agent-search.controller.ts` ← `list-agents.dto.ts` |
| `src/modules/agents/dto/record-view.dto.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `agents.controller.ts` ← `record-view.dto.ts` |
| `src/modules/agents/dto/search-discovery.dto.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `agent-search.controller.ts` ← `search-discovery.dto.ts` |
| `src/modules/agents/product-freshness.ts` | بک‌اند (NestJS) | `seo-render.service.ts` ← `agents.service.ts` ← `product-freshness.ts` |
| `src/modules/agents/search/agent-search.controller.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `agent-search.controller.ts` |
| `src/modules/agents/search/agent-search.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `agent-search.service.ts` |
| `src/modules/agents/search/filters.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `agent-search.service.ts` ← `filters.ts` |
| `src/modules/agents/search/query-plan.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `agent-search.service.ts` ← `query-plan.ts` |
| `src/modules/agents/search/ranking.ts` | بک‌اند (NestJS) | `seo-render.service.ts` ← `agents.service.ts` ← `ranking.ts` |
| `src/modules/agents/search/search-text.ts` | بک‌اند (NestJS) | `search-concepts.ts` ← `search-text.ts` |
| `src/modules/analytics/analytics-events.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `agents.controller.ts` ← `analytics-events.service.ts` |
| `src/modules/auth/auth-housekeeping.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `auth.module.ts` ← `auth-housekeeping.service.ts` |
| `src/modules/auth/auth-sessions.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `auth.module.ts` ← `auth-sessions.service.ts` |
| `src/modules/auth/auth-tokens.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `agents.controller.ts` ← `auth-tokens.service.ts` |
| `src/modules/auth/auth.controller.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `auth.module.ts` ← `auth.controller.ts` |
| `src/modules/auth/auth.module.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `auth.module.ts` |
| `src/modules/auth/auth.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `auth.module.ts` ← `auth.service.ts` |
| `src/modules/auth/dto/login.dto.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `auth.module.ts` ← `auth.controller.ts` ← `login.dto.ts` |
| `src/modules/auth/dto/mfa.dto.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `auth.module.ts` ← `auth.controller.ts` ← `mfa.dto.ts` |
| `src/modules/auth/dto/onboarding.dto.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `auth.module.ts` ← `auth.controller.ts` ← `onboarding.dto.ts` |
| `src/modules/auth/dto/password-reset.dto.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `auth.module.ts` ← `auth.controller.ts` ← `password-reset.dto.ts` |
| `src/modules/auth/dto/register.dto.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `auth.module.ts` ← `auth.controller.ts` ← `register.dto.ts` |
| `src/modules/auth/dto/verify-email.dto.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `auth.module.ts` ← `auth.controller.ts` ← `verify-email.dto.ts` |
| `src/modules/auth/legal-documents.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `auth.module.ts` ← `auth.service.ts` ← `legal-documents.ts` |
| `src/modules/auth/login-attempts.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `auth.module.ts` ← `login-attempts.service.ts` |
| `src/modules/auth/optional-viewer.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `agents.controller.ts` ← `optional-viewer.ts` |
| `src/modules/auth/two-factor.controller.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `auth.module.ts` ← `two-factor.controller.ts` |
| `src/modules/auth/two-factor.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `auth.module.ts` ← `two-factor.service.ts` |
| `src/modules/auth/verification-sender.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `auth.module.ts` ← `verification-sender.service.ts` |
| `src/modules/buyer-journey/contract.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `commerce.module.ts` ← `payments.service.ts` ← `contract.ts` |
| `src/modules/buyer-journey/setup-blueprint.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `commerce.module.ts` ← `payments.service.ts` ← `contract.ts` ← `setup-blueprint.ts` |
| `src/modules/commerce/admin-commerce.controller.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `commerce.module.ts` ← `admin-commerce.controller.ts` |
| `src/modules/commerce/commerce.controller.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `commerce.module.ts` ← `commerce.controller.ts` |
| `src/modules/commerce/commerce.module.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `commerce.module.ts` |
| `src/modules/commerce/commerce.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `commerce.module.ts` ← `commerce.service.ts` |
| `src/modules/commerce/dto/entitlement.dto.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `commerce.module.ts` ← `commerce.controller.ts` ← `entitlement.dto.ts` |
| `src/modules/commerce/dto/my-orders-query.dto.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `commerce.module.ts` ← `commerce.controller.ts` ← `my-orders-query.dto.ts` |
| `src/modules/commerce/dto/purchase.dto.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `commerce.module.ts` ← `commerce.controller.ts` ← `purchase.dto.ts` |
| `src/modules/commerce/entitlement-domain.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `commerce.module.ts` ← `entitlements.service.ts` ← `entitlement-domain.ts` |
| `src/modules/commerce/entitlements.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `commerce.module.ts` ← `entitlements.service.ts` |
| `src/modules/commerce/gateway/payment-gateway.factory.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `commerce.module.ts` ← `payment-gateway.factory.ts` |
| `src/modules/commerce/gateway/payment-gateway.types.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `commerce.module.ts` ← `payment-gateway.types.ts` |
| `src/modules/commerce/gateway/sandbox.gateway.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `commerce.module.ts` ← `payment-gateway.factory.ts` ← `sandbox.gateway.ts` |
| `src/modules/commerce/gateway/zarinpal.gateway.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `commerce.module.ts` ← `payment-gateway.factory.ts` ← `zarinpal.gateway.ts` |
| `src/modules/commerce/order-detail.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `commerce.module.ts` ← `orders.service.ts` ← `order-detail.ts` |
| `src/modules/commerce/orders.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `commerce.module.ts` ← `orders.service.ts` |
| `src/modules/commerce/payments.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `commerce.module.ts` ← `payments.service.ts` |
| `src/modules/commerce/refund-policy.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `commerce.module.ts` ← `orders.service.ts` ← `refund-policy.ts` |
| `src/modules/commerce/refunds.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `commerce.module.ts` ← `refunds.service.ts` |
| `src/modules/commerce/webhook-signature.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `commerce.module.ts` ← `webhook-signature.service.ts` |
| `src/modules/control-plane/audit/admin-audit.service.ts` | بک‌اند (NestJS) | `blog-admin.controller.ts` ← `admin-access.service.ts` ← `admin-audit.service.ts` |
| `src/modules/control-plane/authz/admin-access.service.ts` | بک‌اند (NestJS) | `blog-admin.controller.ts` ← `admin-access.service.ts` |
| `src/modules/control-plane/authz/admin-decorators.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `technical-review.module.ts` ← `admin-technical-reviews.controller.ts` ← `admin-decorators.ts` |
| `src/modules/control-plane/config/feature-flags.service.ts` | بک‌اند (NestJS) | `blog-admin.controller.ts` ← `kill-switch.guard.ts` ← `feature-flags.service.ts` |
| `src/modules/control-plane/config/kill-switch.guard.ts` | بک‌اند (NestJS) | `blog-admin.controller.ts` ← `kill-switch.guard.ts` |
| `src/modules/control-plane/control-plane-metrics.ts` | بک‌اند (NestJS) | `blog-admin.controller.ts` ← `admin-access.service.ts` ← `control-plane-metrics.ts` |
| `src/modules/control-plane/impersonation/impersonation-policy.ts` | بک‌اند (NestJS) | `blog-admin.controller.ts` ← `admin-access.service.ts` ← `impersonation-policy.ts` |
| `src/modules/crm/crm-acquisition.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `auth.module.ts` ← `crm.module.ts` ← `crm-acquisition.service.ts` |
| `src/modules/crm/crm-analytics.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `auth.module.ts` ← `crm.module.ts` ← `crm-analytics.service.ts` |
| `src/modules/crm/crm-attribution.controller.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `auth.module.ts` ← `crm.module.ts` ← `crm-attribution.controller.ts` |
| `src/modules/crm/crm-attribution.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `auth.module.ts` ← `crm.module.ts` ← `crm-attribution.service.ts` |
| `src/modules/crm/crm-capability.guard.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `auth.module.ts` ← `crm.module.ts` ← `crm-capability.guard.ts` |
| `src/modules/crm/crm-conversion.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `auth.module.ts` ← `crm.module.ts` ← `crm-conversion.service.ts` |
| `src/modules/crm/crm-engagement.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `auth.module.ts` ← `crm.module.ts` ← `crm-engagement.service.ts` |
| `src/modules/crm/crm-events.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `auth.module.ts` ← `crm.module.ts` ← `crm-events.service.ts` |
| `src/modules/crm/crm-export.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `auth.module.ts` ← `crm.module.ts` ← `crm-export.service.ts` |
| `src/modules/crm/crm-import.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `auth.module.ts` ← `crm.module.ts` ← `crm-import.service.ts` |
| `src/modules/crm/crm-integration.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `auth.module.ts` ← `auth.service.ts` ← `crm-integration.service.ts` |
| `src/modules/crm/crm-leads.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `auth.module.ts` ← `crm.module.ts` ← `crm-leads.service.ts` |
| `src/modules/crm/crm-records.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `auth.module.ts` ← `crm.module.ts` ← `crm-records.service.ts` |
| `src/modules/crm/crm-segments.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `auth.module.ts` ← `crm.module.ts` ← `crm-segments.service.ts` |
| `src/modules/crm/crm.controller.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `auth.module.ts` ← `crm.module.ts` ← `crm.controller.ts` |
| `src/modules/crm/crm.module.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `auth.module.ts` ← `crm.module.ts` |
| `src/modules/crm/domain/activity.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `auth.module.ts` ← `crm.module.ts` ← `crm.controller.ts` ← `activity.ts` |
| `src/modules/crm/domain/crm-permissions.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `auth.module.ts` ← `crm.module.ts` ← `crm-capability.guard.ts` ← `crm-permissions.ts` |
| `src/modules/crm/domain/csv.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `auth.module.ts` ← `crm.module.ts` ← `crm-import.service.ts` ← `csv.ts` |
| `src/modules/crm/domain/events.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `auth.module.ts` ← `auth.service.ts` ← `crm-integration.service.ts` ← `events.ts` |
| `src/modules/crm/domain/funnel.ts` | بک‌اند (NestJS) | `creator-crm-segment.entity.ts` ← `segments.ts` ← `funnel.ts` |
| `src/modules/crm/domain/privacy.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `auth.module.ts` ← `crm.module.ts` ← `crm-events.service.ts` ← `privacy.ts` |
| `src/modules/crm/domain/scoring.ts` | بک‌اند (NestJS) | `creator-crm-segment.entity.ts` ← `segments.ts` ← `scoring.ts` |
| `src/modules/crm/domain/segments.ts` | بک‌اند (NestJS) | `creator-crm-segment.entity.ts` ← `segments.ts` |
| `src/modules/crm/domain/taxonomy.ts` | بک‌اند (NestJS) | `creator-crm-segment.entity.ts` ← `segments.ts` ← `taxonomy.ts` |
| `src/modules/crm/dto/crm.dto.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `auth.module.ts` ← `crm.module.ts` ← `crm-attribution.controller.ts` ← `crm.dto.ts` |
| `src/modules/discovery/buyer-events.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `agents.controller.ts` ← `buyer-events.service.ts` |
| `src/modules/discovery/buyer-events.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `agents.controller.ts` ← `buyer-events.service.ts` ← `buyer-events.ts` |
| `src/modules/discovery/interest-scoring.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `agents.controller.ts` ← `interest-scoring.ts` |
| `src/modules/discovery/interest.constants.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `agent-search.service.ts` ← `interest.constants.ts` |
| `src/modules/email/email.module.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `auth.module.ts` ← `email.module.ts` |
| `src/modules/email/email.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `auth.module.ts` ← `verification-sender.service.ts` ← `email.service.ts` |
| `src/modules/email/security-alerts.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `auth.module.ts` ← `auth.service.ts` ← `security-alerts.service.ts` |
| `src/modules/email/templates/email-templates.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `auth.module.ts` ← `verification-sender.service.ts` ← `email.service.ts` ← `email-templates.ts` |
| `src/modules/email/transports/console-email.transport.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `auth.module.ts` ← `verification-sender.service.ts` ← `email.service.ts` ← `console-email.transport.ts` |
| `src/modules/email/transports/email-transport.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `auth.module.ts` ← `verification-sender.service.ts` ← `email.service.ts` ← `email-transport.ts` |
| `src/modules/email/transports/smtp-email.transport.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `auth.module.ts` ← `verification-sender.service.ts` ← `email.service.ts` ← `smtp-email.transport.ts` |
| `src/modules/evaluation-engine/domain/control-catalog.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `evaluation.module.ts` ← `evaluation.service.ts` ← `control-catalog.ts` |
| `src/modules/evaluation-engine/domain/evaluation-domain.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `evaluation.module.ts` ← `evaluation-policy.service.ts` ← `evaluation-domain.ts` |
| `src/modules/evaluation-engine/domain/evaluation-policy.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `evaluation.module.ts` ← `evaluation-policy.service.ts` ← `evaluation-policy.ts` |
| `src/modules/evaluation-engine/domain/evaluation.types.ts` | بک‌اند (NestJS) | `evaluation-claim-assessment.entity.ts` ← `evaluation.types.ts` |
| `src/modules/evaluation-engine/domain/trust-disclosure.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `agents.controller.ts` ← `trust-disclosure.service.ts` ← `trust-disclosure.ts` |
| `src/modules/evaluation-engine/dto/evaluation.dto.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `evaluation.module.ts` ← `evaluation.controller.ts` ← `evaluation.dto.ts` |
| `src/modules/evaluation-engine/evaluation-policy.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `evaluation.module.ts` ← `evaluation-policy.service.ts` |
| `src/modules/evaluation-engine/evaluation-source.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `evaluation.module.ts` ← `evaluation-source.service.ts` |
| `src/modules/evaluation-engine/evaluation.controller.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `evaluation.module.ts` ← `evaluation.controller.ts` |
| `src/modules/evaluation-engine/evaluation.module.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `evaluation.module.ts` |
| `src/modules/evaluation-engine/evaluation.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `evaluation.module.ts` ← `evaluation.service.ts` |
| `src/modules/evaluation-engine/trust-disclosure.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `agents.controller.ts` ← `trust-disclosure.service.ts` |
| `src/modules/finance/balance.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `finance.module.ts` ← `balance.service.ts` |
| `src/modules/finance/bank-accounts.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `finance.module.ts` ← `bank-accounts.service.ts` |
| `src/modules/finance/creator-resolver.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `finance.module.ts` ← `creator-resolver.ts` |
| `src/modules/finance/domain/commission.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `finance.module.ts` ← `refund-settlement.service.ts` ← `commission.ts` |
| `src/modules/finance/domain/iban.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `finance.module.ts` ← `bank-accounts.service.ts` ← `iban.ts` |
| `src/modules/finance/domain/ledger.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `finance.module.ts` ← `balance.service.ts` ← `ledger.ts` |
| `src/modules/finance/domain/money.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `commerce.module.ts` ← `orders.service.ts` ← `money.ts` |
| `src/modules/finance/domain/national-id.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `finance.module.ts` ← `kyc.service.ts` ← `national-id.ts` |
| `src/modules/finance/domain/net-sales.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `finance.module.ts` ← `financial-calculations.service.ts` ← `net-sales.ts` |
| `src/modules/finance/domain/payout-rules.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `finance.module.ts` ← `kyc.service.ts` ← `payout-rules.ts` |
| `src/modules/finance/domain/policy.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `finance.module.ts` ← `finance.controllers.ts` ← `policy.ts` |
| `src/modules/finance/domain/refund-rules.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `finance.module.ts` ← `refund-settlement.service.ts` ← `refund-rules.ts` |
| `src/modules/finance/domain/state-machines.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `finance.module.ts` ← `kyc.service.ts` ← `state-machines.ts` |
| `src/modules/finance/dto/finance.dto.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `finance.module.ts` ← `finance.controllers.ts` ← `finance.dto.ts` |
| `src/modules/finance/finance-actor.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `finance.module.ts` ← `bank-accounts.service.ts` ← `finance-actor.ts` |
| `src/modules/finance/finance-admin.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `finance.module.ts` ← `finance-admin.service.ts` |
| `src/modules/finance/finance-clock.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `finance.module.ts` ← `finance-clock.ts` |
| `src/modules/finance/finance-exceptions.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `finance.module.ts` ← `finance-exceptions.service.ts` |
| `src/modules/finance/finance-jobs.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `finance.module.ts` ← `finance-jobs.service.ts` |
| `src/modules/finance/finance-metrics.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `finance.module.ts` ← `integrity.service.ts` ← `finance-metrics.ts` |
| `src/modules/finance/finance.controllers.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `finance.module.ts` ← `finance.controllers.ts` |
| `src/modules/finance/finance.module.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `finance.module.ts` |
| `src/modules/finance/financial-audit.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `finance.module.ts` ← `financial-audit.service.ts` |
| `src/modules/finance/financial-calculations.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `finance.module.ts` ← `financial-calculations.service.ts` |
| `src/modules/finance/financial-holds.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `finance.module.ts` ← `financial-holds.service.ts` |
| `src/modules/finance/integrity.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `finance.module.ts` ← `integrity.service.ts` |
| `src/modules/finance/kyc.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `finance.module.ts` ← `kyc.service.ts` |
| `src/modules/finance/ledger.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `finance.module.ts` ← `ledger.service.ts` |
| `src/modules/finance/payout-provider.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `finance.module.ts` ← `payout-provider.ts` |
| `src/modules/finance/payouts.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `finance.module.ts` ← `payouts.service.ts` |
| `src/modules/finance/policy.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `finance.module.ts` ← `policy.service.ts` |
| `src/modules/finance/receipts.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `finance.module.ts` ← `receipts.service.ts` |
| `src/modules/finance/reconciliation.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `finance.module.ts` ← `reconciliation.service.ts` |
| `src/modules/finance/recovery.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `finance.module.ts` ← `recovery.service.ts` |
| `src/modules/finance/refund-settlement.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `finance.module.ts` ← `refund-settlement.service.ts` |
| `src/modules/finance/release.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `finance.module.ts` ← `release.service.ts` |
| `src/modules/finance/sale-recorder.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `finance.module.ts` ← `sale-recorder.service.ts` |
| `src/modules/finance/sql.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `finance.module.ts` ← `bank-accounts.service.ts` ← `sql.ts` |
| `src/modules/finance/statements.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `finance.module.ts` ← `statements.service.ts` |
| `src/modules/finance/usage-metering.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `finance.module.ts` ← `usage-metering.service.ts` |
| `src/modules/jobs/jobs.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `auth.module.ts` ← `auth-housekeeping.service.ts` ← `jobs.service.ts` |
| `src/modules/runtime/connector-client.service.ts` | بک‌اند (NestJS) | `seo-render.service.ts` ← `agents.service.ts` ← `runtimes.service.ts` ← `connector-client.service.ts` |
| `src/modules/runtime/dto/runtime.dto.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `runtime.controller.ts` ← `runtime.dto.ts` |
| `src/modules/runtime/gateway-assertion.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `gateway-assertion.service.ts` |
| `src/modules/runtime/managed-runtime.service.ts` | بک‌اند (NestJS) | `seo-render.service.ts` ← `agents.service.ts` ← `runtimes.service.ts` ← `managed-runtime.service.ts` |
| `src/modules/runtime/runtime-credential-scope.decorator.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `runtime.controller.ts` ← `runtime-credential-scope.decorator.ts` |
| `src/modules/runtime/runtime-domain.ts` | بک‌اند (NestJS) | `seo-render.service.ts` ← `agents.service.ts` ← `runtimes.service.ts` ← `runtime-domain.ts` |
| `src/modules/runtime/runtime-gateway.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `runtime-gateway.service.ts` |
| `src/modules/runtime/runtime.controller.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `runtime.controller.ts` |
| `src/modules/runtime/runtime.module.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` |
| `src/modules/runtime/runtimes.service.ts` | بک‌اند (NestJS) | `seo-render.service.ts` ← `agents.service.ts` ← `runtimes.service.ts` |
| `src/modules/scale/affiliate.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `commerce.module.ts` ← `scale.module.ts` ← `affiliate.service.ts` |
| `src/modules/scale/ambassador.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `commerce.module.ts` ← `scale.module.ts` ← `ambassador.service.ts` |
| `src/modules/scale/community.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `commerce.module.ts` ← `scale.module.ts` ← `community.service.ts` |
| `src/modules/scale/domain/affiliate.ts` | بک‌اند (NestJS) | `affiliate.entity.ts` ← `affiliate.ts` |
| `src/modules/scale/domain/ambassador.ts` | بک‌اند (NestJS) | `ambassador.entity.ts` ← `ambassador.ts` |
| `src/modules/scale/domain/attribution.ts` | بک‌اند (NestJS) | `growth-risk-flag.entity.ts` ← `attribution.ts` |
| `src/modules/scale/domain/money.ts` | بک‌اند (NestJS) | `affiliate-commission.entity.ts` ← `money.ts` |
| `src/modules/scale/domain/partnership.ts` | بک‌اند (NestJS) | `partnership.entity.ts` ← `partnership.ts` |
| `src/modules/scale/dto/scale.dto.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `commerce.module.ts` ← `scale.module.ts` ← `scale-creator.controller.ts` ← `scale.dto.ts` |
| `src/modules/scale/growth-loop.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `commerce.module.ts` ← `payments.service.ts` ← `growth-loop.service.ts` |
| `src/modules/scale/growth-reports.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `commerce.module.ts` ← `scale.module.ts` ← `growth-reports.service.ts` |
| `src/modules/scale/partnership.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `commerce.module.ts` ← `scale.module.ts` ← `partnership.service.ts` |
| `src/modules/scale/referral.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `commerce.module.ts` ← `scale.module.ts` ← `referral.service.ts` |
| `src/modules/scale/reward.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `commerce.module.ts` ← `scale.module.ts` ← `reward.service.ts` |
| `src/modules/scale/scale-admin.controller.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `commerce.module.ts` ← `scale.module.ts` ← `scale-admin.controller.ts` |
| `src/modules/scale/scale-creator.controller.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `commerce.module.ts` ← `scale.module.ts` ← `scale-creator.controller.ts` |
| `src/modules/scale/scale-public.controller.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `commerce.module.ts` ← `scale.module.ts` ← `scale-public.controller.ts` |
| `src/modules/scale/scale.module.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `commerce.module.ts` ← `scale.module.ts` |
| `src/modules/success/c4-lifecycle.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `commerce.module.ts` ← `payments.service.ts` ← `c4-lifecycle.service.ts` |
| `src/modules/success/domain/case-study-eligibility.ts` | بک‌اند (NestJS) | `case-study.entity.ts` ← `case-study-eligibility.ts` |
| `src/modules/success/domain/insights.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `commerce.module.ts` ← `payments.service.ts` ← `c4-lifecycle.service.ts` ← `review-success.service.ts` ← `insights.ts` |
| `src/modules/success/domain/referral.ts` | بک‌اند (NestJS) | `creator-referral-event.entity.ts` ← `referral.ts` |
| `src/modules/success/referral.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `commerce.module.ts` ← `payments.service.ts` ← `c4-lifecycle.service.ts` ← `referral.service.ts` |
| `src/modules/success/review-success.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `commerce.module.ts` ← `payments.service.ts` ← `c4-lifecycle.service.ts` ← `review-success.service.ts` |
| `src/modules/technical-review/admin-technical-reviews.controller.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `technical-review.module.ts` ← `admin-technical-reviews.controller.ts` |
| `src/modules/technical-review/creator-technical-reviews.controller.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `technical-review.module.ts` ← `creator-technical-reviews.controller.ts` |
| `src/modules/technical-review/domain/review-access.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `technical-review.module.ts` ← `review-access.service.ts` ← `review-access.ts` |
| `src/modules/technical-review/domain/technical-review.types.ts` | بک‌اند (NestJS) | `technical-review-assignment.entity.ts` ← `technical-review.types.ts` |
| `src/modules/technical-review/dto/technical-review.dto.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `technical-review.module.ts` ← `admin-technical-reviews.controller.ts` ← `technical-review.dto.ts` |
| `src/modules/technical-review/review-access.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `technical-review.module.ts` ← `review-access.service.ts` |
| `src/modules/technical-review/technical-review.module.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `technical-review.module.ts` |
| `src/modules/technical-review/technical-review.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `runtime.module.ts` ← `technical-review.module.ts` ← `technical-review.service.ts` |
| `src/modules/users/user-view.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `auth.module.ts` ← `auth.controller.ts` ← `user-view.ts` |
| `src/modules/users/users.service.ts` | بک‌اند (NestJS) | `seo.module.ts` ← `agents.module.ts` ← `auth.module.ts` ← `auth.controller.ts` ← `users.service.ts` |
| `scripts/icons/export-mesh-icons.d.mts` | فرانت‌اند (React + Vite) | `export-mesh-icons.mjs` ← `export-mesh-icons.d.mts` |
| `scripts/icons/export-mesh-icons.mjs` | فرانت‌اند (React + Vite) | `icons.test.tsx` ← `export-mesh-icons.mjs` |
| `src/api/control.ts` | فرانت‌اند (React + Vite) | `endpoints.ts` ← `control.ts` |
| `src/components/Stars.tsx` | فرانت‌اند (React + Vite) | `Stars.test.tsx` ← `Stars.tsx` |
| `src/components/feedback/EmptyState.tsx` | فرانت‌اند (React + Vite) | `index.tsx` ← `index.ts` ← `EmptyState.tsx` |
| `src/components/feedback/ErrorBanner.tsx` | فرانت‌اند (React + Vite) | `index.tsx` ← `index.ts` ← `ErrorBanner.tsx` |
| `src/components/feedback/ErrorState.tsx` | فرانت‌اند (React + Vite) | `index.tsx` ← `index.ts` ← `ErrorState.tsx` |
| `src/components/feedback/LoadingState.tsx` | فرانت‌اند (React + Vite) | `index.tsx` ← `index.ts` ← `LoadingState.tsx` |
| `src/components/feedback/index.ts` | فرانت‌اند (React + Vite) | `index.tsx` ← `index.ts` |
| `src/components/feedback/states.tsx` | فرانت‌اند (React + Vite) | `index.tsx` ← `index.ts` ← `states.tsx` |
| `src/components/feedback/toastConfig.tsx` | فرانت‌اند (React + Vite) | `Toast.tsx` ← `toastConfig.tsx` |
| `src/components/layout/Header.tsx` | فرانت‌اند (React + Vite) | `index.tsx` ← `Header.tsx` |
| `src/components/layout/Screen.tsx` | فرانت‌اند (React + Vite) | `index.tsx` ← `Screen.tsx` |
| `src/config/env.ts` | فرانت‌اند (React + Vite) | `usePageMeta.ts` ← `env.ts` |
| `src/constants/accessibility.ts` | فرانت‌اند (React + Vite) | `dark.ts` ← `accessibility.ts` |
| `src/constants/colors.ts` | فرانت‌اند (React + Vite) | `dark.ts` ← `colors.ts` |
| `src/constants/layout.ts` | فرانت‌اند (React + Vite) | `dark.ts` ← `layout.ts` |
| `src/constants/motion.ts` | فرانت‌اند (React + Vite) | `dark.ts` ← `motion.ts` |
| `src/constants/radius.ts` | فرانت‌اند (React + Vite) | `dark.ts` ← `radius.ts` |
| `src/constants/shadows.ts` | فرانت‌اند (React + Vite) | `dark.ts` ← `shadows.ts` |
| `src/constants/spacing.ts` | فرانت‌اند (React + Vite) | `dark.ts` ← `spacing.ts` |
| `src/constants/typography.ts` | فرانت‌اند (React + Vite) | `dark.ts` ← `typography.ts` |
| `src/i18n/account.en.ts` | فرانت‌اند (React + Vite) | `index.tsx` ← `account.en.ts` |
| `src/i18n/account.fa.ts` | فرانت‌اند (React + Vite) | `index.tsx` ← `account.fa.ts` |
| `src/i18n/comparison.en.ts` | فرانت‌اند (React + Vite) | `index.tsx` ← `comparison.en.ts` |
| `src/i18n/comparison.fa.ts` | فرانت‌اند (React + Vite) | `index.tsx` ← `comparison.fa.ts` |
| `src/i18n/control.en.ts` | فرانت‌اند (React + Vite) | `index.tsx` ← `control.en.ts` |
| `src/i18n/control.fa.ts` | فرانت‌اند (React + Vite) | `blog-i18n.test.ts` ← `control.fa.ts` |
| `src/i18n/creatorLanding.en.ts` | فرانت‌اند (React + Vite) | `index.tsx` ← `creatorLanding.en.ts` |
| `src/i18n/creatorLanding.fa.ts` | فرانت‌اند (React + Vite) | `index.tsx` ← `creatorLanding.fa.ts` |
| `src/i18n/discovery.en.ts` | فرانت‌اند (React + Vite) | `index.tsx` ← `discovery.en.ts` |
| `src/i18n/discovery.fa.ts` | فرانت‌اند (React + Vite) | `blog-i18n.test.ts` ← `discovery.fa.ts` |
| `src/i18n/finance.en.ts` | فرانت‌اند (React + Vite) | `index.tsx` ← `finance.en.ts` |
| `src/i18n/finance.fa.ts` | فرانت‌اند (React + Vite) | `index.tsx` ← `finance.fa.ts` |
| `src/i18n/home.en.ts` | فرانت‌اند (React + Vite) | `index.tsx` ← `home.en.ts` |
| `src/i18n/home.fa.ts` | فرانت‌اند (React + Vite) | `index.tsx` ← `home.fa.ts` |
| `src/i18n/journey.en.ts` | فرانت‌اند (React + Vite) | `index.tsx` ← `journey.en.ts` |
| `src/i18n/journey.fa.ts` | فرانت‌اند (React + Vite) | `blog-i18n.test.ts` ← `journey.fa.ts` |
| `src/i18n/monitoring.en.ts` | فرانت‌اند (React + Vite) | `index.tsx` ← `monitoring.en.ts` |
| `src/i18n/monitoring.fa.ts` | فرانت‌اند (React + Vite) | `index.tsx` ← `monitoring.fa.ts` |
| `src/i18n/runtime.en.ts` | فرانت‌اند (React + Vite) | `index.tsx` ← `runtime.en.ts` |
| `src/i18n/runtime.fa.ts` | فرانت‌اند (React + Vite) | `blog-i18n.test.ts` ← `runtime.fa.ts` |
| `src/i18n/scale.en.ts` | فرانت‌اند (React + Vite) | `index.tsx` ← `scale.en.ts` |
| `src/i18n/scale.fa.ts` | فرانت‌اند (React + Vite) | `blog-i18n.test.ts` ← `scale.fa.ts` |
| `src/i18n/trust.en.ts` | فرانت‌اند (React + Vite) | `index.tsx` ← `trust.en.ts` |
| `src/i18n/trust.fa.ts` | فرانت‌اند (React + Vite) | `index.tsx` ← `trust.fa.ts` |
| `src/lib/buy.ts` | فرانت‌اند (React + Vite) | `icons.test.tsx` ← `buy.ts` |
| `src/lib/currency.ts` | فرانت‌اند (React + Vite) | `seo.ts` ← `currency.ts` |
| `src/lib/journey.ts` | فرانت‌اند (React + Vite) | `icons.test.tsx` ← `buy.ts` ← `journey.ts` |
| `src/lib/launch.ts` | فرانت‌اند (React + Vite) | `icons.test.tsx` ← `launch.ts` |
| `src/lib/money.ts` | فرانت‌اند (React + Vite) | `seo.ts` ← `currency.ts` ← `money.ts` |
| `src/lib/panel-storage.ts` | فرانت‌اند (React + Vite) | `icons.test.tsx` ← `panel-storage.ts` |
| `src/lib/review.ts` | فرانت‌اند (React + Vite) | `icons.test.tsx` ← `review.ts` |
| `src/lib/rtl.ts` | فرانت‌اند (React + Vite) | `index.tsx` ← `rtl.ts` |
| `src/lib/storage.ts` | فرانت‌اند (React + Vite) | `icons.test.tsx` ← `launch.ts` ← `storage.ts` |
| `src/lib/useMediaQuery.ts` | فرانت‌اند (React + Vite) | `ShareMenu.tsx` ← `useMediaQuery.ts` |
| `src/utils/digits.ts` | فرانت‌اند (React + Vite) | `format.ts` ← `digits.ts` |

## ۷) دلیل حضور هر مجموعه

| مجموعه | مخزن | لایه | چرا اینجاست |
| --- | --- | --- | --- |
| `docs/blog/EDITORIAL_API_NOTES.md` | بک‌اند (NestJS) | `core` | Editorial API notes that ship with the backend. |
| `src/database/entities/blog` | بک‌اند (NestJS) | `core` | 14 TypeORM entities: posts, categories, tags, revisions, comments, bans, ratings. |
| `src/database/entities/seo` | بک‌اند (NestJS) | `core` | content_seo, content_link, link_suggestion. |
| `src/database/migrations/1772200000000-blog-platform.ts` | بک‌اند (NestJS) | `core` | Creates the whole blog schema. |
| `src/database/migrations/1772500000000-blog-search-fold.ts` | بک‌اند (NestJS) | `core` | Persian search-fold column + index for blog search. |
| `src/database/migrations/1772600000000-blog-engagement.ts` | بک‌اند (NestJS) | `core` | Comments, likes, reports, bans, ratings. |
| `src/database/migrations/1772700000000-seo-studio.ts` | بک‌اند (NestJS) | `core` | content_seo / content_link / link_suggestion tables. |
| `src/database/seeds/seed-blog-demo.ts` | بک‌اند (NestJS) | `core` | Demo editorial content used to boot a usable blog. |
| `src/modules/blog` | بک‌اند (NestJS) | `core` | Public reads, editorial CMS, comments, ratings, taxonomy, revisions. |
| `src/modules/seo` | بک‌اند (NestJS) | `core` | Knowledge graph, internal-link suggestions, SEO analysis, SSR render, sitemap. |
| `test/blog` | بک‌اند (NestJS) | `core` | blog, blog-engagement and blog-migration end-to-end suites. |
| `test/helpers/seo-shell.ts` | بک‌اند (NestJS) | `core` | Test helper that boots an SEO-capable Nest shell. |
| `test/seo.e2e-spec.ts` | بک‌اند (NestJS) | `core` | Public SEO surface (sitemap, robots, meta, JSON-LD). |
| `test/seo` | بک‌اند (NestJS) | `core` | SEO studio end-to-end suite. |
| `src/common/utils/persian-normalize.ts` | بک‌اند (NestJS) | `shared` | Persian text normalisation; blog search and slug folding depend on it. |
| `src/database/entities` | بک‌اند (NestJS) | `shared` | The whole entity graph. `entities/index.ts` re-exports all of them and blog authors/comments/agents relate outward, so the graph only type-checks complete. |
| `src/database/migrations/1772000000000-taxonomy-persian-industries.ts` | بک‌اند (NestJS) | `shared` | Taxonomy schema the content archives read from. |
| `src/database/migrations/1772100000000-taxonomy-search-document.ts` | بک‌اند (NestJS) | `shared` | Search document used by taxonomy-aware content search. |
| `src/database/taxonomy/taxonomy-data.ts` | بک‌اند (NestJS) | `shared` | Canonical Persian taxonomy data used for archives and landing pages. |
| `src/modules/agents/search/search-concepts.ts` | بک‌اند (NestJS) | `shared` | Concept list shared by marketplace search and blog relevance. |
| `src/modules/audit` | بک‌اند (NestJS) | `shared` | Editorial actions are audit-logged. Imported by BlogModule. |
| `src/modules/categories` | بک‌اند (NestJS) | `shared` | Marketplace taxonomy joined to posts; imported by SeoModule. |
| `src/modules/control-plane/authz/admin-permissions.ts` | بک‌اند (NestJS) | `shared` | Permission catalogue containing the blog permissions. |
| `src/modules/control-plane/authz/route-permissions.ts` | بک‌اند (NestJS) | `shared` | Declares blog:view / blog:manage / blog:publish route guards. |
| `src/modules/notifications` | بک‌اند (NestJS) | `shared` | Comment/▸publish notifications. Imported by BlogModule. |
| `src/modules/storage` | بک‌اند (NestJS) | `shared` | Cover images and in-article media. Imported by BlogModule. |
| `package.json` | بک‌اند (NestJS) | `reference` | Source of truth for backend dependency versions. |
| `src/app.module.ts` | بک‌اند (NestJS) | `reference` | Shows exactly where BlogModule and SeoModule are registered. |
| `src/config/env.validation.ts` | بک‌اند (NestJS) | `reference` | Env schema; contains the SEO/site-URL variables. |
| `src/database/seeds/seed.ts` | بک‌اند (NestJS) | `reference` | Seed runner that calls seed-blog-demo. |
| `test/fixtures/public-routes.ts` | بک‌اند (NestJS) | `reference` | Public route fixture listing the blog routes. |
| `docs/blog` | فرانت‌اند (React + Vite) | `core` | Blog decisions, release report, editorial implementation report. |
| `docs/seo-studio` | فرانت‌اند (React + Vite) | `core` | SEO studio phase-0 audit, architecture, data model, migration, tests. |
| `e2e/26-blog-discovery.spec.ts` | فرانت‌اند (React + Vite) | `core` | Discovery/reading journeys. |
| `e2e/27-blog-engagement.spec.ts` | فرانت‌اند (React + Vite) | `core` | Comments, likes, ratings. |
| `e2e/28-blog-editorial.spec.ts` | فرانت‌اند (React + Vite) | `core` | Editorial CMS journeys. |
| `scripts/emit-seo.mjs` | فرانت‌اند (React + Vite) | `core` | Build-time sitemap.xml / robots.txt emitter. |
| `scripts/qa/blog-qa.mjs` | فرانت‌اند (React + Vite) | `core` | Blog QA crawler. |
| `src/api/blog.ts` | فرانت‌اند (React + Vite) | `core` | Every blog endpoint the UI calls. |
| `src/api/seo.ts` | فرانت‌اند (React + Vite) | `core` | SEO studio + knowledge graph endpoints. |
| `src/components/engagement/ChangelogEditor.tsx` | فرانت‌اند (React + Vite) | `core` | Creator-facing changelog authoring component. |
| `src/components/engagement/ProductChangelog.tsx` | فرانت‌اند (React + Vite) | `core` | Reader-facing changelog renderer. |
| `src/content` | فرانت‌اند (React + Vite) | `core` | Docs hub, legal documents, markdown-lite renderer, platform facts, social links. |
| `src/i18n/__tests__/blog-i18n.test.ts` | فرانت‌اند (React + Vite) | `core` | fa/en key-parity test. |
| `src/i18n/blog.en.ts` | فرانت‌اند (React + Vite) | `core` | English (LTR) strings for the whole content surface. |
| `src/i18n/blog.fa.ts` | فرانت‌اند (React + Vite) | `core` | Persian (RTL) strings for the whole content surface. |
| `src/lib/__tests__/searchFold.test.ts` | فرانت‌اند (React + Vite) | `core` | Tests for searchFold. |
| `src/lib/__tests__/seo.test.ts` | فرانت‌اند (React + Vite) | `core` | Tests for lib/seo. |
| `src/lib/__tests__/sitemap-coverage.test.ts` | فرانت‌اند (React + Vite) | `core` | Asserts every public content route is in the sitemap. |
| `src/lib/changelog.ts` | فرانت‌اند (React + Vite) | `core` | Changelog parsing/formatting for creator-authored release notes. |
| `src/lib/searchFold.ts` | فرانت‌اند (React + Vite) | `core` | Persian search folding shared with the backend behaviour. |
| `src/lib/seo.ts` | فرانت‌اند (React + Vite) | `core` | Meta tags, canonical URLs, JSON-LD builders. |
| `src/lib/usePageMeta.ts` | فرانت‌اند (React + Vite) | `core` | Hook that applies per-page SEO metadata. |
| `src/pages/admin/blog` | فرانت‌اند (React + Vite) | `core` | Admin list, Tiptap editor, SEO studio panel, taxonomy, comments, graph canvas. |
| `src/pages/blog` | فرانت‌اند (React + Vite) | `core` | Home, article, archive, filters, engagement, share rail, article images. |
| `src/pages/website/docs` | فرانت‌اند (React + Vite) | `core` | Docs hub and legal-document rendering pages. |
| `src/styles/blog-admin.css` | فرانت‌اند (React + Vite) | `core` | Editorial CMS, editor and knowledge-graph styling. |
| `src/styles/blog-editorial.css` | فرانت‌اند (React + Vite) | `core` | Long-form article typography. |
| `src/styles/blog.css` | فرانت‌اند (React + Vite) | `core` | Reader-facing blog styling. |
| `docs/icon-system/mesh-icon-specimen.svg` | فرانت‌اند (React + Vite) | `shared` | Icon specimen sheet; the design-system test compares it byte-for-byte. |
| `public` | فرانت‌اند (React + Vite) | `shared` | sitemap.xml / robots.txt (emitted by scripts/emit-seo.mjs), favicon, icon sprite and the og-cover used in article social cards. |
| `src/api/client.ts` | فرانت‌اند (React + Vite) | `shared` | fetch wrapper / envelope handling. |
| `src/api/endpoints.ts` | فرانت‌اند (React + Vite) | `shared` | Central endpoint registry. |
| `src/api/types.ts` | فرانت‌اند (React + Vite) | `shared` | Shared API types incl. content types. |
| `src/app/providers.tsx` | فرانت‌اند (React + Vite) | `shared` | Composes ThemeProvider + I18nProvider + AuthProvider + ToastProvider; every content page expects all four. |
| `src/assets` | فرانت‌اند (React + Vite) | `shared` | Icon SVG sources; the design-system icon test compares them byte-for-byte. |
| `src/components/Modal.tsx` | فرانت‌اند (React + Vite) | `shared` | Used by CMS dialogs. |
| `src/components/Pagination.tsx` | فرانت‌اند (React + Vite) | `shared` | Used by CMS lists. |
| `src/components/Toast.tsx` | فرانت‌اند (React + Vite) | `shared` | Used by every editorial screen. |
| `src/components/share` | فرانت‌اند (React + Vite) | `shared` | Share menu + targets used by the article share rail. |
| `src/components/ui` | فرانت‌اند (React + Vite) | `shared` | Design-system primitives (Button, Card, Badge, AppIcon, SegmentedControl, icons…). |
| `src/context/AuthContext.tsx` | فرانت‌اند (React + Vite) | `shared` | Identity for comments, ratings and CMS permissions. |
| `src/i18n/index.tsx` | فرانت‌اند (React + Vite) | `shared` | Translation provider; blog.fa/blog.en are registered here. |
| `src/index.css` | فرانت‌اند (React + Vite) | `shared` | Base stylesheet the blog stylesheets build on. |
| `src/lib/avatar.ts` | فرانت‌اند (React + Vite) | `shared` | Author avatars. |
| `src/lib/error.ts` | فرانت‌اند (React + Vite) | `shared` | Error normalisation. |
| `src/lib/format.ts` | فرانت‌اند (React + Vite) | `shared` | Date/number formatting. |
| `src/lib/safe-url.ts` | فرانت‌اند (React + Vite) | `shared` | URL sanitisation for links/media. |
| `src/lib/useAsync.ts` | فرانت‌اند (React + Vite) | `shared` | Async state hook. |
| `src/test` | فرانت‌اند (React + Vite) | `shared` | Vitest setup file (jest-dom matchers + RTL config) every suite loads. |
| `src/theme` | فرانت‌اند (React + Vite) | `shared` | The fixed organisational colour/spacing tokens the content UI must use. |
| `src/types` | فرانت‌اند (React + Vite) | `shared` | Module declarations for untyped packages (e.g. @multiavatar/multiavatar). |
| `src/vite-env.d.ts` | فرانت‌اند (React + Vite) | `shared` | Vite client types. Never imported by path; TypeScript loads it implicitly. |
| `package.json` | فرانت‌اند (React + Vite) | `reference` | Source of truth for frontend dependency versions (Tiptap, xyflow…). |
| `src/app/router.tsx` | فرانت‌اند (React + Vite) | `reference` | All content routes, public and admin. |
| `src/components/Header.tsx` | فرانت‌اند (React + Vite) | `reference` | Header link into the blog. |
| `src/i18n/messages/en.ts` | فرانت‌اند (React + Vite) | `reference` | Root en message map that pulls in blog.en. |
| `src/i18n/messages/fa.ts` | فرانت‌اند (React + Vite) | `reference` | Root fa message map that pulls in blog.fa. |
| `src/lib/nav.ts` | فرانت‌اند (React + Vite) | `reference` | Navigation entries pointing at /blog. |
| `src/main.tsx` | فرانت‌اند (React + Vite) | `reference` | Where the blog stylesheets are imported. |

