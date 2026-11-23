import { ArticleImage } from './ArticleImage';
import { memo, Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { BlogBlock, BlogInline, BlogListItem } from '../../api/blog';

/**
 * Renders the server-parsed article block tree as React elements. There is
 * no HTML string anywhere on this path: every node kind is enumerated, every
 * URL was validated by the server (`safeUrl`) and is re-checked here, so the
 * renderer never needs `dangerouslySetInnerHTML`.
 */

const SAFE_HREF = /^(https?:\/\/|mailto:|\/(?!\/)|#)/i;

function SafeLink({ href, children }: { href: string; children: ReactNode }) {
  if (!SAFE_HREF.test(href)) return <span>{children}</span>;
  if (href.startsWith('/')) return <Link to={href}>{children}</Link>;
  if (href.startsWith('#')) return <a href={href}>{children}</a>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow">
      {children}
    </a>
  );
}

export function Inline({ nodes }: { nodes: BlogInline[] }) {
  return (
    <>
      {nodes.map((node, index) => {
        switch (node.t) {
          case 'text':
            return <Fragment key={index}>{node.v}</Fragment>;
          case 'strong':
            return (
              <strong key={index}>
                <Inline nodes={node.c} />
              </strong>
            );
          case 'em':
            return (
              <em key={index}>
                <Inline nodes={node.c} />
              </em>
            );
          case 'code':
            return (
              <code key={index} dir="ltr">
                {node.v}
              </code>
            );
          case 'link':
            return (
              <SafeLink key={index} href={node.href}>
                <Inline nodes={node.c} />
              </SafeLink>
            );
          case 'br':
            return <br key={index} />;
          default:
            return null;
        }
      })}
    </>
  );
}

function ListItems({ items, ordered }: { items: BlogListItem[]; ordered: boolean }) {
  const Tag = ordered ? 'ol' : 'ul';
  return (
    <Tag>
      {items.map((item, index) => (
        <li key={index}>
          <Inline nodes={item.c} />
          {item.children && <ListItems items={item.children.items} ordered={item.children.ordered} />}
        </li>
      ))}
    </Tag>
  );
}

const CALLOUT_LABEL = { note: 'نکته', tip: 'پیشنهاد', warning: 'هشدار' } as const;

/**
 * Sprint 1 — optional UI copy for consumers outside the Persian-only blog
 * (documentation center, legal pages): localized callout labels and a copy
 * button on code blocks. Omitted → the blog's original behaviour.
 */
export interface BlockUi {
  calloutLabel?: (kind: keyof typeof CALLOUT_LABEL) => string;
  copy?: { label: string; copied: string; failed: string };
}

function CodeBlock({ lang, code, copy }: { lang: string | null; code: string; copy?: BlockUi['copy'] }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setState('copied');
    } catch {
      setState('failed');
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), 2000);
  };
  const pre = (
    <pre className="article-code" dir="ltr" data-lang={lang ?? undefined} tabIndex={0} aria-label={lang ? `code (${lang})` : 'code'}>
      <code>{code}</code>
    </pre>
  );
  if (!copy) return pre;
  return (
    <div className="article-code-wrap">
      <button type="button" className="article-code-copy" onClick={() => void onCopy()} aria-label={copy.label} data-state={state}>
        {state === 'copied' ? copy.copied : state === 'failed' ? copy.failed : copy.label}
      </button>
      {pre}
    </div>
  );
}

export function Block({ block, firstParagraph, ui }: { block: BlogBlock; firstParagraph?: boolean; ui?: BlockUi }) {
  switch (block.type) {
    case 'heading': {
      const Tag = `h${block.level}` as 'h2' | 'h3' | 'h4';
      return (
        <Tag id={block.id}>
          <Inline nodes={block.c} />
        </Tag>
      );
    }
    case 'paragraph':
      return (
        <p className={firstParagraph ? 'lead-paragraph' : undefined}>
          <Inline nodes={block.c} />
        </p>
      );
    case 'list':
      return <ListItems items={block.items} ordered={block.ordered} />;
    case 'quote':
      if (block.kind) {
        return (
          <div className={`article-callout article-callout--${block.kind}`} role="note">
            <span>{ui?.calloutLabel ? ui.calloutLabel(block.kind) : CALLOUT_LABEL[block.kind]}</span>
            {block.paragraphs.map((p, i) => (
              <p key={i}>
                <Inline nodes={p} />
              </p>
            ))}
          </div>
        );
      }
      return (
        <blockquote className="article-quote">
          {block.paragraphs.map((p, i) => (
            <p key={i}>
              <Inline nodes={p} />
            </p>
          ))}
        </blockquote>
      );
    case 'code':
      return <CodeBlock lang={block.lang} code={block.code} copy={ui?.copy} />;
    case 'image':
      if (!SAFE_HREF.test(block.src)) return null;
      return <ArticleImage key={block.src} src={block.src} alt={block.alt} caption={block.caption} />;
    case 'table':
      return (
        <div className="article-table-wrap">
          <table className="article-data-table">
            <thead>
              <tr>
                {block.header.map((cell, i) => (
                  <th key={i} scope="col" style={block.align[i] ? { textAlign: block.align[i] ?? undefined } : undefined}>
                    <Inline nodes={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c} style={block.align[c] ? { textAlign: block.align[c] ?? undefined } : undefined}>
                      <Inline nodes={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'hr':
      return <hr className="article-rule" />;
    default:
      return null;
  }
}

/** Whole article body; the opening paragraph gets the editorial lead style. */
export const BlogBlocks = memo(function BlogBlocks({ blocks, ui, lead = true }: { blocks: BlogBlock[]; ui?: BlockUi; lead?: boolean }) {
  const leadIndex = lead ? blocks.findIndex((b) => b.type === 'paragraph') : -1;
  return (
    <>
      {blocks.map((block, index) => (
        <Block key={index} block={block} firstParagraph={index === leadIndex} ui={ui} />
      ))}
    </>
  );
});
