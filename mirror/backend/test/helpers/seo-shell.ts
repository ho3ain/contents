/**
 * Side-effect import: points `SEO_SHELL_TEMPLATE` at a throwaway SPA shell so
 * `GET /seo/render` can be exercised without a built frontend. MUST be
 * imported before `AppModule` (env is read when the config module loads).
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'mesh-seo-shell-'));
export const SHELL_PATH = join(dir, 'index.html');
writeFileSync(
  SHELL_PATH,
  [
    '<!doctype html>',
    '<html lang="fa" dir="rtl">',
    '  <head>',
    '    <meta charset="UTF-8" />',
    '    <title>MESH — generic</title>',
    '    <meta name="description" content="generic description" />',
    '    <meta property="og:title" content="generic og" />',
    '  </head>',
    '  <body>',
    '    <div id="root"></div>',
    '    <script type="module" src="/assets/index.js"></script>',
    '  </body>',
    '</html>',
  ].join('\n'),
);
process.env.SEO_SHELL_TEMPLATE = SHELL_PATH;
