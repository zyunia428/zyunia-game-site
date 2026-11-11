// Generates index.html for every language from tools/template.html and tools/games.json.
// Usage: node tools/build.mjs
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { languages } from './translations.mjs';

const SITE_URL = 'https://zyunia.com';
const toolsDir = dirname(fileURLToPath(import.meta.url));
const defaultRoot = join(toolsDir, '..');

export const escapeHtml = (value) =>
  String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

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

/** The first card loads eagerly with high priority, the second eagerly, the rest lazily. */
function imageLoading(index) {
  if (index === 0) return ' fetchpriority="high"';
  if (index === 1) return '';
  return ' loading="lazy" decoding="async"';
}

function renderArt(game, index) {
  const title = escapeHtml(game.title);
  const image = `<img src="${escapeHtml(game.image)}" alt="${title}" width="${game.width}" height="${game.height}"${imageLoading(index)}>`;
  if (game.width === game.height) {
    // Square images (as provided by GameRush) are shown whole on a blurred copy of themselves.
    const backdrop = `<img class="art-backdrop" src="${escapeHtml(game.image)}" alt="" aria-hidden="true" width="${game.width}" height="${game.height}" loading="lazy" decoding="async">`;
    return `<div class="art art-square">${backdrop}${image}</div>`;
  }
  return `<div class="art">${image}</div>`;
}

export function renderGameCards(games, langCode, text) {
  return games
    .map((game, index) => {
      const description = escapeHtml(game.description[langCode] ?? game.description.ja);
      const art = renderArt(game, index);
      if (game.slug) {
        return [
          `        <a class="game reveal" href="https://gamerush.jp/g/${game.slug}" target="_blank" rel="noopener noreferrer">`,
          `          ${art}`,
          `          <div class="title-line"><h3>${escapeHtml(game.title)}</h3><span class="status play"><i class="icon icon-play" aria-hidden="true"></i>${text.play}</span></div>`,
          `          <p class="desc">${description}</p>`,
          '        </a>',
        ].join('\n');
      }
      return [
        '        <div class="game reveal">',
        `          ${art}`,
        `          <div class="title-line"><h3>${escapeHtml(game.title)}</h3><span class="status">${text.inDevelopment}</span></div>`,
        `          <p class="desc">${description}</p>`,
        '        </div>',
      ].join('\n');
    })
    .join('\n');
}

function render(template, games, langCode, lang) {
  const text = Object.fromEntries(Object.entries(lang.text).map(([key, value]) => [key, escapeHtml(value)]));
  const values = {
    ...text,
    htmlLang: lang.htmlLang,
    fontFamily: lang.fontFamily,
    langShort: lang.langShort,
    canonical: `${SITE_URL}${lang.path}`,
    hreflang,
    langLinks: langLinks(lang),
    gameCards: renderGameCards(games, langCode, text),
  };
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (!(key in values)) throw new Error(`Missing translation "${key}" for ${lang.htmlLang}`);
    return values[key];
  });
}

export async function buildSite(rootDir = defaultRoot) {
  const template = await readFile(join(rootDir, 'tools', 'template.html'), 'utf8');
  const { games } = JSON.parse(await readFile(join(rootDir, 'tools', 'games.json'), 'utf8'));
  for (const [langCode, lang] of Object.entries(languages)) {
    const outDir = join(rootDir, lang.path);
    await mkdir(outDir, { recursive: true });
    await writeFile(join(outDir, 'index.html'), render(template, games, langCode, lang));
    console.log(`built ${lang.path}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await buildSite();
}
