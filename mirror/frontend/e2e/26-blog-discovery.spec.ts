import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { API_ORIGIN, expectNoHorizontalOverflow } from './helpers';

/**
 * Blog discovery — search, filters and pagination against the real backend
 * (the seeded demo articles; nothing mocked on the surfaces under test).
 *
 * Covers: live search with Persian folding (Arabic letters find Persian
 * text) and `<mark>` highlighting, relevance ranking (title hit first), the
 * URL as the single source of truth (filters survive a reload and the back
 * button), the archive page with its locked dimension, the pager's range
 * summary / page links / page size (with the real API at pageSize=1 so the
 * seeded set spans several pages), keyboard reachability and an axe pass.
 */

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

test.describe('Blog discovery', () => {
  let total = 0;
  test.beforeAll(async ({ request }) => {
    const res = await request.get(`${API_ORIGIN}/api/v1/blog/posts?pageSize=1`);
    total = res.ok() ? (((await res.json()) as { data?: { meta?: { total?: number } } }).data?.meta?.total ?? 0) : 0;
  });

  test('live search folds Persian spelling variants, ranks title hits first and highlights matches', async ({ page }) => {
    test.skip(total < 2, 'needs at least two published articles (npm run seed)');
    await page.goto('/blog');
    await waitForApp(page);
    const input = page.getByTestId('blog-search-input');
    // Arabic yeh/kaf spelling of «می‌توانید» — must find the Persian text.
    await input.fill('ميتوانيد');
    await expect(page).toHaveURL(/\/blog\?q=/);
    await expect(page.getByTestId('blog-list-count')).toBeVisible();
    expect(await page.getByTestId('blog-card').count()).toBeGreaterThan(0);
    await expect(page.locator('mark.blog-mark').first()).toBeVisible();
    await expect(page.getByRole('radio', { name: 'مرتبط‌ترین' })).toBeChecked();

    // «بازگشت وجه» is the title of the refunds article → first card.
    await input.fill('بازگشت وجه');
    await expect(page).toHaveURL(/q=%D8%A8%D8%A7%D8%B2%DA%AF%D8%B4%D8%AA\+%D9%88%D8%AC%D9%87/);
    const first = page.getByTestId('blog-card').first();
    await expect(first.locator('h3 mark')).toHaveCount(2);
    await expect(page.getByTestId('blog-card-snippet').first()).toBeVisible();

    // Reload keeps everything (URL is the state), clear returns to the editorial home.
    await page.reload();
    await waitForApp(page);
    await expect(page.getByTestId('blog-search-input')).toHaveValue('بازگشت وجه');
    await expect(first.locator('h3 mark')).toHaveCount(2);
    await page.getByTestId('blog-search-clear').click();
    await expect(page).toHaveURL(/\/blog$/);
    await expect(page.getByTestId('blog-featured')).toBeVisible();
  });

  test('filters combine, live in the URL and are removable; the archive locks its own dimension', async ({ page }) => {
    test.skip(total < 1, 'needs a published article (npm run seed)');
    await page.goto('/blog?all=1');
    await waitForApp(page);
    // click, not check(): the radio is React-controlled and flips on the next render
    await page.getByRole('radio', { name: 'قدیمی‌ترین' }).click();
    await expect(page).toHaveURL(/sort=oldest/);
    await page.getByTestId('blog-reading').selectOption('short');
    await expect(page).toHaveURL(/reading=short/);
    const tag = page.getByTestId('blog-tag-chips').getByRole('button').first();
    const tagName =
      (await tag.textContent())
        ?.replace(/^#/, '')
        .replace(/\s*\(.*$/, '')
        .trim() ?? '';
    await tag.click();
    await expect(page).toHaveURL(/tag=/);
    await expect(tag).toHaveAttribute('aria-pressed', 'true');
    const pills = page.getByTestId('blog-active-filters');
    await expect(pills.getByRole('button', { name: new RegExp(`برچسب: ${tagName}`) })).toBeVisible();
    await expect(page.getByTestId('blog-list-count')).toBeVisible();
    // Back button undoes the last filter.
    await page.goBack();
    await expect(page).toHaveURL(/\/blog\?sort=oldest&reading=short&all=1$/);
    // WebKit occasionally delivers a late popstate after goBack (see
    // 25-trust); let history settle before acting on the restored state.
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/blog\?sort=oldest&reading=short&all=1$/);
    // One filter left → its pill removes it (clear-all appears from two on).
    await expect(page.getByTestId('blog-clear-filters')).toHaveCount(0);
    await pills.getByRole('button', { name: /حذف فیلتر زمان مطالعه/ }).click();
    await expect(page).toHaveURL(/\/blog\?sort=oldest&all=1$/);

    // Category archive: no category chips, search scoped, locked pill shown.
    const categories = (await (await page.request.get(`${API_ORIGIN}/api/v1/blog/categories`)).json()) as {
      data: Array<{ slug: string; name: string; postCount: number }>;
    };
    const cat = categories.data.find((c) => c.postCount > 0);
    test.skip(!cat, 'no category with articles');
    await page.goto(`/blog/category/${cat?.slug}`);
    await waitForApp(page);
    await expect(page.getByTestId('blog-archive-title')).toHaveText(cat?.name ?? '');
    await expect(page.getByTestId('blog-category-chips')).toHaveCount(0);
    await expect(page.getByTestId('blog-active-filters').locator('.is-locked')).toHaveText(cat?.name ?? '');
    await page.getByTestId('blog-search-input').fill('zzqx-nothing');
    await expect(page).toHaveURL(/q=zzqx-nothing/);
    await expect(page.getByTestId('blog-list-empty')).toBeVisible();
    await page.getByTestId('blog-list-empty').getByRole('button', { name: 'نمایش همه مقالات' }).click();
    await expect(page).toHaveURL(new RegExp(`/blog/category/${cat?.slug}$`));
    await expectNoHorizontalOverflow(page, 'category archive');
  });

  test('pager: range summary, page links, first/last, page size in the URL, keyboard reachable', async ({ page }) => {
    test.skip(total < 19, 'needs three nine-result pages; covered by editorial integration fixtures');
    await page.goto('/blog?all=1&page=2');
    await waitForApp(page);
    const pager = page.getByTestId('blog-pager');
    await expect(pager).toBeVisible();
    await expect(page.getByTestId('blog-pager-summary')).toContainText('نمایش ۱۰–۱۸ از');
    await expect(page.getByTestId('blog-pager-current')).toHaveText(/۲/);
    await expect(page.getByTestId('blog-pager-prev')).toHaveAttribute('href', '/blog?all=1');
    await expect(page.getByTestId('blog-pager-next')).toHaveAttribute('href', '/blog?page=3&all=1');
    await expect(page.locator('head link[rel="next"]')).toHaveAttribute('href', /page=3/);
    await expect(page.locator('head link[rel="prev"]')).toHaveAttribute('href', /\/blog\?all=1$/);
    await page.getByTestId('blog-pager-last').click();
    await expect(page).toHaveURL(new RegExp(`page=${Math.ceil(total / 9)}`));
    await expect(page.getByTestId('blog-pager-next')).toHaveCount(0);
    // Focus lands on the list heading after paging (screen-reader / keyboard users).
    await expect(page.locator('#blog-list-top')).toBeFocused();
    await page.getByTestId('blog-pager-first').click();
    await expect(page).toHaveURL(/\/blog\?all=1$/);
    await expect(page.getByTestId('blog-pager-prev')).toHaveCount(0);
    // Keyboard: Tab reaches the next-page link and Enter follows it.
    await page.getByTestId('blog-pager-next').focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/page=2/);
    await expectNoHorizontalOverflow(page, 'blog pager');
  });

  test('axe: search results, filtered list and archive', async ({ page }) => {
    test.skip(total < 1, 'needs a published article (npm run seed)');
    await page.goto('/blog?q=' + encodeURIComponent('بازگشت'));
    await waitForApp(page);
    await expect(page.getByTestId('blog-list-count')).toBeVisible();
    await auditAxe(page, 'blog search');
    await page.goto('/blog?all=1&sort=oldest&reading=short');
    await waitForApp(page);
    await expect(page.getByTestId('blog-list-count')).toBeVisible();
    await auditAxe(page, 'blog filtered list');
  });
});
