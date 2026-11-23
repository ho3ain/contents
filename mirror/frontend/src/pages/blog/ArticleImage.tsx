import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Modal } from '../../components/Modal';
import { useI18n } from '../../i18n';

/** Body images only. Existing modal owns Escape, focus trapping and scroll lock. */
export function ArticleImage({ src, alt, caption }: { src: string; alt: string; caption: string | null }) {
  const [open, setOpen] = useState(false);
  const { locale } = useI18n();
  const en = locale === 'en';
  return <figure className="article-figure">
    <button type="button" className="article-image-trigger" onClick={() => setOpen(true)} aria-label={en ? `Enlarge image${alt ? `: ${alt}` : ''}` : `بزرگ‌نمایی تصویر${alt ? `: ${alt}` : ''}`}>
      <img src={src} alt={alt} loading="lazy" decoding="async" />
    </button>
    {caption && <figcaption>{caption}</figcaption>}
    {open && createPortal(<div className="article-image-viewer"><Modal open title={en ? 'Image preview' : 'نمایش تصویر'} wide onClose={() => setOpen(false)}>
      <button type="button" className="article-image-close" onClick={() => setOpen(false)} aria-label={en ? 'Close enlarged image' : 'بستن تصویر بزرگ‌شده'}><img src={src} alt={alt} /></button>
      {caption && <p>{caption}</p>}
    </Modal></div>, document.body)}
  </figure>;
}
