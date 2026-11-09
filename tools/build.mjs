// Generates index.html for every language from tools/template.html.
// Usage: node tools/build.mjs
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { languages } from './translations.mjs';

const SITE_URL = 'https://zyunia.com';
const toolsDir = dirname(fileURLToPath(import.meta.url));
const rootDir = join(toolsDir, '..');
const template = await readFile(join(toolsDir, 'template.html'), 'utf8');

const escapeHtml = (value) =>
  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

const hreflang = [
  ...Object.values(languages).map(
    (lang) => `  <link rel="alternate" hreflang="${lang.htmlLang}" href="${SITE_URL}${lang.path}">`,
  ),
  `  <link rel="alternate" hreflang="x-default" href="${SITE_URL}/">`,
].join('\n');

function langLinks(current) {
  return Object.values(languages)
    .map((lang) => {
      const currentAttr = lang === current ? ' aria-current="true"' : '';
      return `          <a href="${lang.path}" lang="${lang.htmlLang}"${currentAttr}>${lang.langName}</a>`;
    })
    .join('\n');
}

function render(lang) {
  const values = {
    ...Object.fromEntries(Object.entries(lang.text).map(([key, value]) => [key, escapeHtml(value)])),
    htmlLang: lang.htmlLang,
    fontFamily: lang.fontFamily,
    langShort: lang.langShort,
    canonical: `${SITE_URL}${lang.path}`,
    hreflang,
    langLinks: langLinks(lang),
  };
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (!(key in values)) throw new Error(`Missing translation "${key}" for ${lang.htmlLang}`);
    return values[key];
  });
}

for (const lang of Object.values(languages)) {
  const outDir = join(rootDir, lang.path);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'index.html'), render(lang));
  console.log(`built ${lang.path}`);
}
