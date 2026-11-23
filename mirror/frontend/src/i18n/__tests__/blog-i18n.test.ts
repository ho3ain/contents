import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { blogFa } from '../blog.fa';
import { blogEn } from '../blog.en';
import { fa } from '../messages/fa';
import { en } from '../messages/en';
import { scaleFa } from '../scale.fa';
import { discoveryFa } from '../discovery.fa';
import { journeyFa } from '../journey.fa';
import { runtimeFa } from '../runtime.fa';
import { controlFa } from '../control.fa';
import { BLOG_POST_STATUSES } from '../../api/blog';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === '__tests__' ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) && !name.startsWith('blog.') ? [full] : [];
  });
}

const placeholders = (value: string) => [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

const WORKFLOW_ACTIONS = ['submit_review', 'request_changes', 'publish', 'schedule', 'cancel_schedule', 'unpublish', 'archive', 'restore'];
const READINESS = [
  'title_missing',
  'excerpt_missing',
  'body_empty',
  'category_missing',
  'author_missing',
  'image_alt_missing',
  'seo_description_long',
  'seo_title_long',
  'content_warnings',
];
const WARNINGS = ['unsafe_url', 'image_without_alt', 'empty_heading', 'heading_level_skipped', 'h1_demoted'];
const TOOLS = ['h2', 'h3', 'bold', 'italic', 'link', 'ul', 'ol', 'quote', 'note', 'code', 'codeblock', 'table', 'hr', 'image'];

describe('Blog platform copy — i18n', () => {
  it('defines the same keys in both languages', () => {
    expect(Object.keys(blogFa).sort()).toEqual(Object.keys(blogEn).sort());
  });

  it('never ships an empty string', () => {
    for (const value of [...Object.values(blogFa), ...Object.values(blogEn)]) expect(value.trim()).not.toBe('');
  });

  it('the Persian copy is Persian (except toolbar glyphs) and the English copy is not', () => {
    for (const [key, value] of Object.entries(blogFa)) {
      if (key.startsWith('blog.editor.toolIcon.')) continue;
      expect(value, key).toMatch(/[\u0600-\u06FF]/);
    }
    for (const value of Object.values(blogEn)) expect(value).not.toMatch(/[\u0600-\u06FF]/);
  });

  it('uses the same interpolation placeholders in both languages', () => {
    for (const key of Object.keys(blogEn)) expect(placeholders(blogFa[key]), key).toEqual(placeholders(blogEn[key]));
  });

  it('does not shadow a key of another dictionary', () => {
    const others = new Set([
      ...Object.keys(fa),
      ...Object.keys(en),
      ...Object.keys(scaleFa),
      ...Object.keys(discoveryFa),
      ...Object.keys(journeyFa),
      ...Object.keys(runtimeFa),
      ...Object.keys(controlFa),
    ]);
    expect(Object.keys(blogFa).filter((key) => others.has(key))).toEqual([]);
  });

  it('every statically referenced blog.* key exists', () => {
    const used = new Set<string>();
    for (const file of sourceFiles(join(process.cwd(), 'src'))) {
      for (const m of readFileSync(file, 'utf8').matchAll(/\bt\(\s*'(blog\.[A-Za-z0-9_.]+)'/g)) used.add(m[1]);
    }
    expect(used.size).toBeGreaterThan(150);
    expect([...used].filter((key) => !(key in blogEn))).toEqual([]);
  });

  it('covers every status, workflow action, readiness code, warning and toolbar tool (dynamic keys)', () => {
    for (const s of BLOG_POST_STATUSES) expect(blogEn[`blog.status.${s}`], s).toBeTruthy();
    for (const a of WORKFLOW_ACTIONS) {
      expect(blogEn[`blog.action.${a}`], a).toBeTruthy();
      expect(blogEn[`blog.toast.${a}`], a).toBeTruthy();
    }
    for (const a of WORKFLOW_ACTIONS.filter((x) => x !== 'restore')) {
      expect(blogEn[`blog.confirm.${a}.title`], a).toBeTruthy();
      expect(blogEn[`blog.confirm.${a}.body`], a).toBeTruthy();
    }
    for (const c of READINESS) expect(blogEn[`blog.readiness.${c}`], c).toBeTruthy();
    for (const c of WARNINGS) expect(blogEn[`blog.warning.${c}`], c).toBeTruthy();
    for (const k of TOOLS) {
      expect(blogEn[`blog.editor.tool.${k}`], k).toBeTruthy();
      expect(blogEn[`blog.editor.toolIcon.${k}`], k).toBeTruthy();
    }
    for (const s of ['updated', 'created', 'published', 'title']) expect(blogEn[`blog.admin.sort.${s}`], s).toBeTruthy();
    for (const a of ['unpublish', 'archive', 'feature', 'unfeature', 'set_category'])
      expect(blogEn[`blog.admin.bulk.confirm.${a}`], a).toBeTruthy();
    for (const r of ['save', 'publish', 'restore', 'create']) expect(blogEn[`blog.revision.${r}`], r).toBeTruthy();
  });
});
