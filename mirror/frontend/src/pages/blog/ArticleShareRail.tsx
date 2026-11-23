import { useState } from 'react';
import { SiX } from 'react-icons/si';
import { AppIcon } from '../../components/ui/AppIcon';
import { SocialIcon } from '../../components/ui/icons/SocialIcon';
import { shareHref, type SharePayload } from '../../components/share/shareTargets';
import { useI18n } from '../../i18n';

/** Four explicit actions, using the same verified targets as ShareMenu. */
export function ArticleShareRail({ payload }: { payload: SharePayload }) {
  const { locale } = useI18n();
  const en = locale === 'en';
  const [result, setResult] = useState('');
  const copy = async () => {
    try { await navigator.clipboard.writeText(payload.url); setResult(en ? 'Link copied' : 'لینک کپی شد'); }
    catch { setResult(en ? 'Copy failed. Copy the address from your browser.' : 'کپی ممکن نشد؛ آدرس را از مرورگر کپی کنید.'); }
  };
  return <nav className="article-share-tools" aria-label={en ? 'Share article' : 'اشتراک‌گذاری مقاله'}>
    <button type="button" onClick={() => void copy()} aria-label={en ? 'Copy article link' : 'کپی لینک مقاله'} title={en ? 'Copy link' : 'کپی لینک'}><AppIcon name="link" size="sm" /></button>
    <a href={shareHref('linkedin', payload)} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn"><SocialIcon network="linkedin" size={19} /></a>
    <a href={shareHref('x', payload)} target="_blank" rel="noopener noreferrer" aria-label="X"><SiX size={17} aria-hidden="true" focusable="false" /></a>
    <a href={shareHref('telegram', payload)} target="_blank" rel="noopener noreferrer" aria-label="Telegram"><SocialIcon network="telegram" size={19} /></a>
    <span className="article-share-feedback" role="status">{result}</span>
  </nav>;
}
