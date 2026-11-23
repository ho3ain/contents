import { describe, expect, it } from 'vitest';
import { SOCIAL_LINKS, publishedSocialHref } from '../social-links';

describe('social links (footer)', () => {
  it('lists the six brand-approved networks once each, in display order', () => {
    expect(SOCIAL_LINKS.map((l) => l.id)).toEqual(['telegram', 'instagram', 'whatsapp', 'linkedin', 'youtube', 'aparat']);
    expect(new Set(SOCIAL_LINKS.map((l) => l.label)).size).toBe(6);
  });

  it('only a real https URL counts as a published profile (never "#" or a bare handle)', () => {
    expect(publishedSocialHref({ id: 'telegram', label: 'Telegram', href: '' })).toBeNull();
    expect(publishedSocialHref({ id: 'telegram', label: 'Telegram', href: '#' })).toBeNull();
    expect(publishedSocialHref({ id: 'telegram', label: 'Telegram', href: '@mesh' })).toBeNull();
    expect(publishedSocialHref({ id: 'telegram', label: 'Telegram', href: 'http://t.me/mesh' })).toBeNull();
    expect(publishedSocialHref({ id: 'telegram', label: 'Telegram', href: ' https://t.me/mesh ' })).toBe('https://t.me/mesh');
    expect(publishedSocialHref({ id: 'whatsapp', label: 'WhatsApp', href: 'https://wa.me/989120000000' })).toBe(
      'https://wa.me/989120000000',
    );
  });

  it('configured entries are valid (guards the operator edit)', () => {
    for (const link of SOCIAL_LINKS) {
      if (link.href.trim() !== '') expect(publishedSocialHref(link), link.id).not.toBeNull();
    }
  });
});
