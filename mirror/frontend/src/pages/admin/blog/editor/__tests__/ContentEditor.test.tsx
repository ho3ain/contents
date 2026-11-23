import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BlogBlock } from '../../../../../api/blog';
import { ContentEditor, type ContentEditorHandle } from '../ContentEditor';

/**
 * Content Studio — the visual editor over `bodyMarkdown`. Hydration from the
 * server block tree, Markdown emission in the server dialect, external
 * reloads (conflict/revision), structure commands, RTL/LTR direction, safe
 * link validation and the read-only state.
 */

// jsdom has no layout: ProseMirror's scroll-into-view asks for client rects.
const emptyRects = () => Object.assign([] as DOMRect[], { item: () => null }) as unknown as DOMRectList;
const zeroRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) }) as DOMRect;
Range.prototype.getClientRects = emptyRects;
Range.prototype.getBoundingClientRect = zeroRect;
Element.prototype.getClientRects = emptyRects;
Element.prototype.scrollIntoView = () => undefined;

const api = vi.hoisted(() => ({ render: vi.fn() }));
vi.mock('../../../../../api/blog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../api/blog')>();
  return { ...actual, blogAdminApi: { ...actual.blogAdminApi, render: api.render } };
});

const blocks: BlogBlock[] = [
  { type: 'heading', level: 2, id: 'a', text: 'عنوان', c: [{ t: 'text', v: 'عنوان' }] },
  {
    type: 'paragraph',
    c: [
      { t: 'text', v: 'متن ' },
      { t: 'strong', c: [{ t: 'text', v: 'مهم' }] },
    ],
  },
];
const markdown = '## عنوان\n\nمتن **مهم**';

function setup(over: Partial<Parameters<typeof ContentEditor>[0]> = {}) {
  const onChange = vi.fn();
  const handle = createRef<ContentEditorHandle>();
  const utils = render(
    <ContentEditor
      value={markdown}
      initialBlocks={blocks}
      onChange={onChange}
      onUploadImage={vi.fn().mockResolvedValue(null)}
      uploadsEnabled={false}
      language="fa"
      handle={handle}
      {...over}
    />,
  );
  return { ...utils, onChange, handle };
}

const flush = () => act(() => new Promise((r) => setTimeout(r, 260)));

beforeEach(() => {
  api.render.mockReset();
});

describe('ContentEditor', () => {
  it('hydrates from the server blocks without a render round-trip and sets RTL direction', async () => {
    setup();
    const editor = await screen.findByTestId('cs-editor');
    expect(editor).toHaveAttribute('dir', 'rtl');
    expect(editor).toHaveAttribute('lang', 'fa');
    expect(editor.querySelector('h2')?.textContent).toBe('عنوان');
    expect(editor.querySelector('strong')?.textContent).toBe('مهم');
    expect(api.render).not.toHaveBeenCalled();
    expect(screen.getByTestId('content-studio')).toHaveAttribute('data-status', 'ready');
  });

  it('uses the server renderer for Markdown it has no blocks for and surfaces failures with retry', async () => {
    api.render
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ blocks, toc: [], plainText: '', wordCount: 2, readingMinutes: 1, warnings: [] });
    setup({ initialBlocks: null });
    expect(await screen.findByRole('alert')).toHaveTextContent('boom');
    fireEvent.click(screen.getByRole('button', { name: /تلاش دوباره|Retry/ }));
    await waitFor(() => expect(screen.getByTestId('content-studio')).toHaveAttribute('data-status', 'ready'));
    expect(api.render).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('cs-editor').querySelector('h2')).toBeInTheDocument();
  });

  it('emits Markdown in the server dialect after an edit and keeps structures', async () => {
    const { onChange, handle } = setup();
    await screen.findByTestId('cs-editor');
    act(() => {
      handle.current?.focusBlock(1);
    });
    fireEvent.click(screen.getByTestId('cs-bullet'));
    await flush();
    expect(onChange).toHaveBeenLastCalledWith('## عنوان\n\n- متن **مهم**');
    fireEvent.click(screen.getByTestId('cs-h2'));
    await flush();
    // Heading toggle on the list item: the list is replaced by the heading (lossless dialect).
    expect(onChange.mock.calls.at(-1)?.[0]).toContain('## متن **مهم**');
  });

  it('reduces pasted Word/Google-Docs HTML to the server dialect and drops scripts, styles and unsafe links', async () => {
    const { onChange, handle } = setup();
    const editor = await screen.findByTestId('cs-editor');
    act(() => {
      handle.current?.focusBlock(1);
    });
    const wordHtml =
      '<html><body><!--StartFragment--><h1 class="MsoTitle" style="color:red">تیتر اصلی</h1>' +
      '<p class="MsoNormal" style="mso-margin-top-alt:auto"><span style="font-family:Calibri">متن <b>پررنگ</b> و ' +
      '<a href="javascript:alert(1)">لینک بد</a> و <a href="https://mesh.example/x" style="color:blue">لینک خوب</a></span></p>' +
      '<script>alert(1)</script><style>p{color:red}</style>' +
      '<table><tr><td><p>سلول</p></td></tr></table><img src="x" onerror="alert(1)" alt="تصویر"><!--EndFragment--></body></html>';
    const paste = new Event('paste', { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown };
    paste.clipboardData = {
      types: ['text/html', 'text/plain'],
      files: [],
      getData: (type: string) => (type === 'text/html' ? wordHtml : type === 'text/plain' ? 'تیتر اصلی\nمتن پررنگ' : ''),
    };
    act(() => {
      editor.dispatchEvent(paste);
    });
    await flush();
    const md = String(onChange.mock.calls.at(-1)?.[0] ?? '');
    expect(md).toContain('## تیتر اصلی'); // H1 clamped into the dialect
    expect(md).toContain('**پررنگ**');
    expect(md).toContain('[لینک خوب](https://mesh.example/x)');
    expect(md).not.toMatch(/javascript:|alert|<script|<style|onerror|mso-|Calibri/);
    expect(md).toContain('| سلول |');
    expect(md).toContain('![تصویر](x)');
  });

  it('re-hydrates when the value changes from outside (revision restore / conflict reload)', async () => {
    api.render.mockResolvedValue({
      blocks: [{ type: 'paragraph', c: [{ t: 'text', v: 'نسخهٔ سرور' }] }],
      toc: [],
      plainText: '',
      wordCount: 2,
      readingMinutes: 1,
      warnings: [],
    });
    const { rerender, onChange } = setup();
    await screen.findByTestId('cs-editor');
    rerender(
      <ContentEditor
        value="نسخهٔ سرور"
        initialBlocks={null}
        onChange={onChange}
        onUploadImage={vi.fn()}
        uploadsEnabled={false}
        language="en"
      />,
    );
    await waitFor(() => expect(screen.getByTestId('cs-editor').textContent).toContain('نسخهٔ سرور'));
    expect(api.render).toHaveBeenCalledWith('نسخهٔ سرور');
    expect(screen.getByTestId('cs-editor')).toHaveAttribute('dir', 'ltr');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('rejects unsafe link targets and accepts site-relative ones', async () => {
    const { onChange, handle } = setup();
    await screen.findByTestId('cs-editor');
    act(() => {
      handle.current?.focusBlock(1);
    });
    fireEvent.click(screen.getByTestId('cs-link'));
    const input = screen.getByLabelText(/نشانی پیوند|Link address/);
    fireEvent.change(input, { target: { value: 'javascript:alert(1)' } });
    fireEvent.submit(screen.getByTestId('cs-link-form'));
    expect(screen.getByRole('alert')).toHaveTextContent(/http\(s\)/);
    fireEvent.change(input, { target: { value: '/blog/other' } });
    fireEvent.submit(screen.getByTestId('cs-link-form'));
    await flush();
    expect(onChange.mock.calls.at(-1)?.[0]).toContain('](/blog/other)');
  });

  it('inserts a callout, a table and a figure through the toolbar', async () => {
    const { onChange, handle } = setup();
    await screen.findByTestId('cs-editor');
    act(() => {
      handle.current?.focusBlock(1);
    });
    fireEvent.click(screen.getByTestId('cs-callout'));
    fireEvent.click(screen.getByTestId('cs-callout-warning'));
    await flush();
    expect(onChange.mock.calls.at(-1)?.[0]).toContain('> [!WARNING]\n>\n> متن **مهم**');
    fireEvent.click(screen.getByTestId('cs-table'));
    fireEvent.click(screen.getByTestId('cs-table-insert'));
    await flush();
    expect(onChange.mock.calls.at(-1)?.[0]).toMatch(/\| {3}\| {3}\| {3}\|\n\| --- \| --- \| --- \|/);
    act(() => {
      handle.current?.focusBlock(0);
    });
    fireEvent.click(screen.getByTestId('cs-image'));
    fireEvent.change(screen.getByLabelText(/نشانی تصویر|Image address/), { target: { value: 'https://cdn.example.com/x.png' } });
    fireEvent.change(screen.getByLabelText(/متن جایگزین|Alt text/), { target: { value: 'تصویر' } });
    fireEvent.submit(screen.getByTestId('cs-image-form'));
    await flush();
    expect(onChange.mock.calls.at(-1)?.[0]).toContain('![تصویر](https://cdn.example.com/x.png)');
    expect(screen.getByTestId('cs-figure')).toBeInTheDocument();
  });

  it('is read-only when disabled', async () => {
    setup({ disabled: true });
    const editor = await screen.findByTestId('cs-editor');
    expect(editor).toHaveAttribute('contenteditable', 'false');
    expect(screen.getByTestId('cs-bold')).toBeDisabled();
  });
});
