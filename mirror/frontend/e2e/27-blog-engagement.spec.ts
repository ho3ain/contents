import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { ADMIN, API_ORIGIN, BUYER, expectNoHorizontalOverflow, login } from './helpers';

/**
 * Blog engagement — rating, comments, moderation and share against the real
 * backend (seeded demo articles + demo accounts; nothing mocked).
 *
 * Serial journey: anonymous reader sees summaries + sign-in CTAs and the
 * share menu → buyer rates, comments, likes and edits → admin finds the
 * comment in the moderation queue, removes it with a reason and restores it
 * → buyer cleans up (withdraws comment and rating) so the run is repeatable.
 */

test.describe.configure({ mode: 'serial' });

const marker = `e2e-دیدگاه-${Date.now()}`;
let slug = '';

async function waitForApp(page: Page) {
  await page.waitForSelector('#root > *');
}

async function auditAxe(page: Page, label: string) {
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' });
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const blocking = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  const report = blocking.map(
    (v) =>
      `${v.impact} ${v.id}: ${v.help}\n` +
      v.nodes
        .slice(0, 4)
        .map((n) => `    ${n.target.join(' ')}`)
        .join('\n'),
  );
  expect(report, `[${label}] accessibility violations:\n${report.join('\n')}`).toEqual([]);
}

test.describe('Blog engagement', () => {
  test.beforeAll(async ({ request }) => {
    const res = await request.get(`${API_ORIGIN}/api/v1/blog/posts?pageSize=1&sort=oldest`);
    const body = (await res.json()) as { data?: { items?: Array<{ slug: string }> } };
    slug = body.data?.items?.[0]?.slug ?? '';
  });

  test('anonymous reader: summary, sign-in CTAs, share menu, axe', async ({ page }, testInfo) => {
    test.skip(!slug, 'needs a published article (npm run seed)');
    const touch = testInfo.project.name === 'mobile';
    if (touch) {
      // Touch devices go to the native share sheet first; record what would be handed to it.
      await page.addInitScript(() => {
        const w = window as unknown as { __shared?: ShareData };
        Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
        Object.defineProperty(navigator, 'share', {
          configurable: true,
          value: (data: ShareData) => {
            w.__shared = data;
            return Promise.resolve();
          },
        });
      });
    }
    await page.goto(`/blog/${slug}`);
    await waitForApp(page);
    await expect(page.getByTestId('blog-article-rating-chip')).toBeVisible();
    await expect(page.getByTestId('blog-article-comments-chip')).toBeVisible();
    await expect(page.getByTestId('blog-rating-login')).toBeVisible();
    await expect(page.getByTestId('blog-comments-login')).toBeVisible();
    await expect(page.getByTestId('blog-rating-star-5')).toHaveCount(0);

    const rail = page.getByRole('navigation', { name: 'اشتراک‌گذاری مقاله' });
    await expect(rail.getByRole('button', { name: 'کپی لینک مقاله' })).toBeVisible();
    await expect(rail.getByRole('link')).toHaveCount(3);
    const telegram = await rail.getByRole('link', { name: 'Telegram' }).getAttribute('href');
    expect(telegram).toContain(encodeURIComponent(`/blog/${slug}`));
    expect(telegram).not.toMatch(/utm_/);

    await expectNoHorizontalOverflow(page, 'article with engagement');
    await auditAxe(page, 'article anonymous');
  });

  test('buyer rates, comments, likes and edits', async ({ page }) => {
    test.skip(!slug, 'needs a published article (npm run seed)');
    await login(page, BUYER);
    await page.goto(`/blog/${slug}#comments`);
    await waitForApp(page);

    // Rating — the widget reflects the vote and the header chip follows.
    const star = page.getByTestId('blog-rating-star-5');
    await expect(star).toBeVisible();
    await star.click();
    await expect(page.getByTestId('blog-rating-mine')).toContainText('۵');
    await expect(star).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('blog-article-rating-chip')).not.toContainText('اولین امتیاز');

    // Comment.
    const form = page.getByTestId('blog-comment-form');
    await form.getByRole('textbox').fill(marker);
    await page.getByTestId('blog-comment-form-submit').click();
    const mine = page.locator('[data-testid="blog-comment"]', { hasText: marker }).first();
    await expect(mine).toBeVisible();
    await expect(mine.getByText('شما')).toBeVisible();

    // Like (own comment is allowed) — optimistic then settled.
    const like = mine.getByTestId('blog-comment-like').first();
    await like.click();
    await expect(like).toHaveAttribute('aria-pressed', 'true');
    await expect(like).toContainText('۱');

    // Edit.
    await mine.getByTestId('blog-comment-edit').click();
    const edit = mine.locator('form');
    await edit.getByRole('textbox').fill(`${marker} (ویرایش)`);
    await edit.locator('button[type="submit"]').click();
    await expect(mine).toContainText('(ویرایش)');
    await expect(mine).toContainText('ویرایش‌شده');

    await auditAxe(page, 'article signed-in');
  });

  test('admin moderates the comment: remove with reason, then restore', async ({ page }, testInfo) => {
    test.skip(!slug, 'needs a published article (npm run seed)');
    test.skip(testInfo.project.name === 'mobile', 'admin surfaces are desktop journeys');
    await login(page, ADMIN);
    await page.goto(`/admin/blog/comments?q=${encodeURIComponent(marker)}`);
    await waitForApp(page);
    const row = page.locator('[data-testid="blog-comment-row"]', { hasText: marker }).first();
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute('data-status', 'published');

    await row.getByTestId('blog-comment-remove').click();
    await page.getByTestId('blog-comment-remove-reason').fill('آزمون خودکار');
    await page.getByTestId('blog-comment-remove-confirm').click();
    await expect(row).toHaveAttribute('data-status', 'removed');

    await row.getByTestId('blog-comment-restore').click();
    await expect(row).toHaveAttribute('data-status', 'published');
    await auditAxe(page, 'admin comments queue');
  });

  test('buyer cleans up: withdraws comment and rating', async ({ page }) => {
    test.skip(!slug, 'needs a published article (npm run seed)');
    await login(page, BUYER);
    await page.goto(`/blog/${slug}`);
    await waitForApp(page);
    const mine = page.locator('[data-testid="blog-comment"]', { hasText: marker }).first();
    await expect(mine).toBeVisible();
    await mine.getByTestId('blog-comment-delete').click();
    await page.getByRole('dialog').getByRole('button', { name: 'حذف دیدگاه' }).click();
    await expect(page.locator('[data-testid="blog-comment"]', { hasText: marker })).toHaveCount(0);

    const star = page.getByTestId('blog-rating-star-5');
    await expect(star).toHaveAttribute('aria-checked', 'true');
    await star.click();
    await expect(page.getByTestId('blog-rating-mine')).toHaveCount(0);
  });

  test('agent detail offers the same share menu', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'popover path is covered on desktop; touch uses the native sheet');
    await page.goto('/agents/invoice-sentinel');
    await waitForApp(page);
    const trigger = page.getByTestId('agent-share-trigger');
    await expect(trigger).toBeVisible();
    await trigger.click();
    await expect(page.getByTestId('agent-share-popover').getByRole('menuitem')).toHaveCount(6);
    expect(await page.getByTestId('agent-share-linkedin').getAttribute('href')).toContain(encodeURIComponent('/agents/invoice-sentinel'));
  });
});
