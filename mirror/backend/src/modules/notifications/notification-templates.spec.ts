import { renderNotification } from './notification-templates';

describe('renderNotification (localized notification templates)', () => {
  it('renders the purchase success notification in Persian for fa', () => {
    const result = renderNotification('purchase_success', 'default', 'fa', {
      agentName: 'Onboardflow',
    });
    expect(result.title).toBe('خرید با موفقیت انجام شد');
    expect(result.body).toBe(
      'ایجنت «Onboardflow» با موفقیت به کتابخانه شما اضافه شد.',
    );
  });

  it('renders the purchase success notification in English for en', () => {
    const result = renderNotification('purchase_success', 'default', 'en', {
      agentName: 'Onboardflow',
    });
    expect(result.title).toBe('Purchase complete');
    expect(result.body).toBe('"Onboardflow" was added to your library.');
  });

  it('keeps every variant distinct (refund granted vs rejected vs creator)', () => {
    const granted = renderNotification('refund_processed', 'granted', 'fa', {
      amount: '1000000 IRR',
      orderId: 'abcd1234',
    });
    const rejected = renderNotification('refund_processed', 'rejected', 'fa', {
      note: 'درخواست شما تأیید نشد.',
    });
    const creator = renderNotification('refund_processed', 'creator', 'fa', {
      amount: '1000000 IRR',
    });
    expect(granted.title).toBe('بازپرداخت انجام شد');
    expect(granted.body).toContain('abcd1234');
    expect(rejected.title).toBe('درخواست بازپرداخت رد شد');
    expect(creator.title).toBe('سفارش بازپرداخت شد');
  });

  it('renders the term-expiry notification only as a current-status message', () => {
    const fa = renderNotification('entitlement_expired', 'default', 'fa', {
      agentName: 'Term product',
    });
    const en = renderNotification('entitlement_expired', 'default', 'en', {
      agentName: 'Term product',
    });
    expect(fa.body).toContain('Term product');
    expect(en.body).toContain('Term product');
    expect(`${fa.title} ${fa.body} ${en.title} ${en.body}`).not.toMatch(
      /renew|تمدید/i,
    );
  });

  it('falls back to the default variant when the variant is unknown', () => {
    const result = renderNotification('purchase_success', 'unknown', 'en', {
      agentName: 'X',
    });
    expect(result.title).toBe('Purchase complete');
  });

  it('renders a neutral localized placeholder for an unknown type', () => {
    const fa = renderNotification('does_not_exist', 'default', 'fa');
    const en = renderNotification('does_not_exist', 'default', 'en');
    expect(fa.title).toBe('اعلان جدید');
    expect(en.title).toBe('Notification');
  });

  it('treats any locale other than en as fa (platform default)', () => {
    const result = renderNotification('payment_failed', 'default', 'fr', {});
    expect(result.title).toBe('پرداخت ناموفق');
  });

  it('interpolates every param and leaves unmatched keys intact', () => {
    const result = renderNotification('review_replied', 'default', 'fa', {
      agentName: 'Support Copilot',
      excerpt: 'متن پاسخ',
    });
    expect(result.body).toBe('«Support Copilot» — متن پاسخ');
    const missing = renderNotification('review_replied', 'default', 'fa', {});
    expect(missing.body).toBe('«{agentName}» — {excerpt}');
  });

  // ---- Phase A4 ----------------------------------------------------------
  it('A4 §24: first sale — creator variant uses the exact spec title and localized amount/date', () => {
    const fa = renderNotification('first_sale', 'creator', 'fa', {
      agentName: 'Onboardflow',
      amount: '4500000',
      currency: 'IRR',
      saleDate: '2026-09-28T10:00:00.000Z',
    });
    expect(fa.title).toBe('🎉 اولین فروش شما ثبت شد!');
    expect(fa.body).toContain('«Onboardflow»');
    expect(fa.body).toContain('۴٬۵۰۰٬۰۰۰');
    expect(fa.body).toContain('ریال');
    expect(fa.body).not.toContain('2026-09-28T');
    expect(fa.body).not.toContain('{');
    const en = renderNotification('first_sale', 'creator', 'en', {
      agentName: 'Onboardflow',
      amount: '4500000',
      currency: 'IRR',
      saleDate: '2026-09-28T10:00:00.000Z',
    });
    expect(en.title).toBe('🎉 Your first sale is in!');
    expect(en.body).toContain('4,500,000 IRR');
    expect(en.body).toContain('2026');
  });

  it('A4 §24: first sale of an additional product names the product', () => {
    const fa = renderNotification('first_sale', 'product', 'fa', {
      agentName: 'Invoice Bot',
      amount: '100',
      currency: 'IRR',
      saleDate: '2026-09-28T10:00:00.000Z',
    });
    expect(fa.title).toBe('🎉 اولین فروش «Invoice Bot» ثبت شد.');
  });

  it('A4 §14: published notification uses the launch copy', () => {
    const fa = renderNotification('agent_published', 'default', 'fa', {
      agentName: 'Onboardflow',
      version: '1.0.0',
    });
    expect(fa.title).toBe('🎉 «Onboardflow» با موفقیت منتشر شد.');
  });

  it('A4 §47: every promotion lifecycle variant renders in both locales without raw placeholders', () => {
    for (const variant of [
      'under_review',
      'approved',
      'scheduled',
      'active',
      'published',
      'completed',
      'rejected',
    ]) {
      for (const locale of ['fa', 'en']) {
        const result = renderNotification('promotion_update', variant, locale, {
          agentName: 'Onboardflow',
          startDate: '2026-10-01T08:00:00.000Z',
          reason: 'تصاویر محصول کافی نیست',
        });
        expect(result.title).toContain('Onboardflow');
        expect(`${result.title} ${result.body}`).not.toMatch(/\{\w+\}/);
        expect(result.title).not.toBe('اعلان جدید');
        expect(result.title).not.toBe('Notification');
      }
    }
    const admin = renderNotification('promotion_requested', 'default', 'fa', {
      agentName: 'Onboardflow',
      promotionType: 'featured',
    });
    expect(admin.title).toBe('درخواست معرفی جدید');
  });

  it('non-date / non-amount params are never reformatted', () => {
    const result = renderNotification('new_sale', 'default', 'fa', {
      agentName: '2026-09-28',
    });
    expect(result.body).toContain('«2026-09-28»');
  });

  it.each([
    ['system', 'default', { message: 'Safe platform notice' }],
    ['creator_referral_available', 'default', {}],
    ['review_received', 'default', {}],
    ['case_study_invited', 'default', {}],
    ['case_study_update', 'published', {}],
    ['case_study_update', 'changes_requested', {}],
    ['referral_first_sale', 'default', {}],
    ['creator.assistance_resolved', 'default', {}],
    ['activation.onboarding_not_started', 'default', {}],
    ['activation.idea_selected_no_product', 'default', {}],
    ['activation.product_incomplete', 'default', {}],
    ['activation.product_ready_not_submitted', 'default', {}],
  ] as const)(
    '%s/%s uses localized event-specific copy rather than the unknown-event fallback',
    (type, variant, params) => {
      for (const locale of ['fa', 'en'] as const) {
        const rendered = renderNotification(type, variant, locale, params);
        expect(rendered.title).not.toBe('اعلان جدید');
        expect(rendered.title).not.toBe('Notification');
        expect(rendered.body).not.toBe('یک رویداد جدید در حساب شما رخ داد.');
        expect(rendered.body).not.toBe('A new event occurred in your account.');
        expect(`${rendered.title} ${rendered.body}`).not.toMatch(/\{\w+\}/);
      }
    },
  );
});

describe('Phase C5 templates (C5 §34)', () => {
  /**
   * The bug this suite exists to prevent: all three C5 notification types
   * were called at their service with a hardcoded Persian title/body and were
   * NOT in the TEMPLATES registry. renderNotification looked them up, missed,
   * and fell back to a generic "Notification" — so every creator received
   * "اعلان جدید / A new event occurred" and the real copy was discarded.
   */
  const C5_TYPES = [
    'c5_referral_signup',
    'c5_referral_conversion',
    'c5_reward_available',
    'c5_reward_reversed',
    'c5_ambassador_invited',
    'c5_ambassador_active',
    'c5_partnership_decision',
    'c5_affiliate_decision',
    'c5_community_invited',
    'c5_community_joined',
    'c5_commission_available',
  ];

  it.each(C5_TYPES)(
    '%s renders real copy in BOTH locales, never the fallback',
    (type) => {
      // Two types are variant-only by design: a decision is either granted or
      // rejected, and a "default" of one of those would be a lie. They are
      // checked with a variant each, and separately for BOTH variants below.
      // The real variant names, not a guessed set: a decision notification that
      // falls back is exactly the failure this suite guards against.
      const variants =
        type === 'c5_affiliate_decision'
          ? ['approved', 'rejected']
          : type.endsWith('_decision')
            ? ['granted', 'rejected']
            : ['default'];
      for (const locale of ['fa', 'en'] as const) {
        for (const variant of variants) {
          const rendered = renderNotification(type, variant, locale, {
            referredName: 'Sara',
            amount: '250٬000 IRR',
            reason: 'refund',
            partnerName: 'Acme',
            inviterName: 'Sara',
          });
          expect(rendered.title).not.toBe('اعلان جدید');
          expect(rendered.title).not.toBe('Notification');
          expect(rendered.body).not.toBe('یک رویداد جدید در حساب شما رخ داد.');
          expect(rendered.body).not.toBe(
            'A new event occurred in your account.',
          );
          expect(rendered.title.length).toBeGreaterThan(0);
          expect(rendered.body.length).toBeGreaterThan(0);
        }
      }
    },
  );

  it('actually differs between fa and en (not one language wearing two hats)', () => {
    const fa = renderNotification('c5_referral_signup', 'default', 'fa', {});
    const en = renderNotification('c5_referral_signup', 'default', 'en', {});
    expect(fa.title).not.toBe(en.title);
    expect(fa.body).not.toBe(en.body);
  });

  it('uses the granted/rejected variants for a partnership decision', () => {
    const granted = renderNotification(
      'c5_partnership_decision',
      'granted',
      'en',
      {},
    );
    const rejected = renderNotification(
      'c5_partnership_decision',
      'rejected',
      'en',
      {},
    );
    expect(granted.title).not.toBe(rejected.title);
    expect(rejected.title.toLowerCase()).toContain('not approved');
  });

  it('interpolates the real referred name rather than dropping it', () => {
    const rendered = renderNotification('c5_referral_signup', 'default', 'en', {
      referredName: 'Sara',
    });
    expect(rendered.body).toContain('Sara');
    expect(rendered.body).not.toContain('{referredName}');
  });
});
