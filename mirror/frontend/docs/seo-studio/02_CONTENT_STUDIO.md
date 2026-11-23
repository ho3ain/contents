# Content Studio — the visual editor over `bodyMarkdown`

## 1. Position in the system

`AdminBlogEditorPage` → `BodyEditor` (mode switch) → `ContentEditor` (Tiptap) **or** the original `<textarea>`.
Both modes read and write the same `form.bodyMarkdown`; the saving model (debounced autosave for drafts, explicit save, `version` conflict detection, publish checklist) is unchanged and shared.

```
server blocks (BlogBlock[])  ──blocksToDoc──▶  ProseMirror doc  ──docToMarkdown──▶  Markdown (server dialect)
        ▲                                                                                 │
        └──────────────── POST /admin/blog/render (existing) ◀────────────────────────────┘
```

- Opening an article: the detail response already carries `blocks` for the stored Markdown, so the editor hydrates without a round-trip. When the value changes from outside (revision restore, conflict reload, Markdown-mode edits) it asks the server renderer again.
- Editing: `onUpdate` → debounced (250 ms) `docToMarkdown` → host `patch({ bodyMarkdown })`. Only transactions that change the document emit; `setEditable` toggles and selection changes never mark the form dirty.
- Saving: unchanged — the server parses the Markdown, stores `body_blocks`, bumps `version`, syncs `content_links`.

## 2. Dialect (what the schema allows)

| Construct | Editor | Markdown |
| --- | --- | --- |
| Paragraph, hard break | ✓ | text, `\` at end of line |
| Headings | H2–H4 (H1/H5/H6 pasted → clamped) | `##`, `###`, `####` |
| Bold, italic, inline code, link (title) | ✓ | `**`, `*`, `` ` ``, `[text](href "title")` |
| Bullet / ordered list | one nesting level (deeper levels flattened) | `-`, `1.` |
| Blockquote (multi-paragraph) | ✓ | `>` |
| Callout `note` / `tip` / `warning` | custom node | `> [!TIP]` … |
| Figure (image + alt + caption) | custom node with inline alt/caption inputs | `![alt](src "caption")` |
| Table with column alignment | header row + paragraph-only cells | `| :--- | :---: | --- |` |
| Code block | ✓ | fenced |
| Divider | ✓ | `---` |

Everything else (fonts, colours, spans, scripts, styles, iframes, `javascript:`/`data:` links, event handlers) is dropped by the schema on paste — see `ContentEditor.test.tsx › reduces pasted Word/Google-Docs HTML`.
Links must pass `isSafeHref` (http/https/mailto/tel, site-relative `/…`, `#anchor`) both in the editor form and on the server.

Verified round-trip (`markdownBridge.test.ts` + a live check against the backend parser on 2026-10-15): `docToMarkdown(blocksToDoc(blocks))` re-parses to identical block JSON for the Persian fixture (12 blocks incl. ZWNJ, nested lists, aligned table with an escaped pipe, callout, figure, code) and the English fixture; serialisation is idempotent; nine adversarial literals (`# > - 1. * _ \` ![..](x) [..](y) |`) escape and read back as plain text.

## 3. UX surface

- Toolbar: headings, bold/italic/code, lists, quote, link, image (upload or URL), table (insert + row/column tools when inside a table), callout (kind picker), divider, code block, undo/redo, shortcuts sheet.
- Bubble menu on text selection: bold, italic, link, inline code.
- Keyboard: Tiptap/StarterKit defaults (`Ctrl+B/I/K/Z/Shift+Z`, `Ctrl+Alt+2..4` headings, `Ctrl+Shift+7/8` lists, `Ctrl+E` code), `Esc` closes forms.
- Status strip: word count, direction (RTL/LTR follows the article language), "saved as Markdown" hint, `data-status = loading | ready | error` with retry.
- Direction: `dir` per article language; mixed-direction text is handled by the browser's bidi algorithm; ZWNJ (U+200C) is preserved end-to-end.
- Save status, autosave, conflict banner with **Reload / Compare / Recover**, and local draft retention (`localStorage['mesh-blog-draft:<id>']`, offered on the next open) live in the host page and apply to both modes.

## 4. Known limits (by design)

- Nested lists deeper than one level and headings outside H2–H4 are folded into the dialect on paste/serialisation (the server parser does not store them).
- No real-time collaboration; the last writer is protected by `version` only.
- Image upload uses the existing blog upload endpoint; no image editing/cropping.
- Embeds: no iframe embeds are stored; external media is linked, not embedded (the public renderer has no iframe allow-list yet — see `04_TESTS_AND_LIMITATIONS.md`).
