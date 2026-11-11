// Adds games newly published on GameRush to tools/games.json, then rebuilds the site.
// Add-only: existing entries are never rewritten, except that an in-development
// entry gets its GameRush link once a game with the same title is published.
// Usage: node tools/sync-gamerush.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildSite } from './build.mjs';

const PROFILE_URL = 'https://gamerush.jp/u/zyunizyunia';
const GAME_URL = 'https://gamerush.jp/g/';
const USER_AGENT = 'zyunia-site-sync (+https://zyunia.com)';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const SLUG_PATTERN = /^[A-Za-z0-9]{4,16}$/;
const IMAGE_SIZE = 720; // GameRush thumbnails are square

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'" };
const decodeEntities = (value) =>
  value.replace(/&(amp|lt|gt|quot|#39|apos);/g, (_, name) => ENTITIES[name]);

/** Returns the unique game slugs linked from the profile page, in page order. */
export function parseProfileSlugs(html) {
  const slugs = [];
  for (const match of html.matchAll(/href="\/g\/([^"?#/]+)\?src=profile"/g)) {
    const slug = match[1];
    if (SLUG_PATTERN.test(slug) && !slugs.includes(slug)) slugs.push(slug);
  }
  return slugs;
}

function metaContent(html, property) {
  const match = html.match(new RegExp(`<meta[^>]+property="${property}"[^>]+content="([^"]*)"`));
  return match ? decodeEntities(match[1]) : null;
}

/** Reads the title, a one-line description and the image URL from a game page. */
export function parseGameMeta(html) {
  const ogTitle = metaContent(html, 'og:title');
  const ogDescription = metaContent(html, 'og:description');
  const image = metaContent(html, 'og:image');
  if (!ogTitle || !image) return null;
  const title = ogTitle.split('｜')[0].trim();
  const firstLine = (ogDescription ?? '').split('\n')[0].trim();
  const firstSentence = firstLine.match(/^.+?。/)?.[0];
  const description = firstLine.length > 60 && firstSentence ? firstSentence : firstLine;
  return { title, description, image };
}

/** Compares titles loosely, so "ONE SHOT CHAOS!!" matches "ONE SHOT CHAOS". */
export function normalizeTitle(title) {
  return title.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

/**
 * Returns a new game list with the found games merged in, plus what changed.
 * A found game that matches an in-development entry by title takes over that entry;
 * any other new game is inserted after the last published game.
 */
export function mergeGames(games, foundGames) {
  const result = games.map((game) => ({ ...game }));
  const added = [];
  const published = [];
  for (const found of foundGames) {
    if (result.some((game) => game.slug === found.slug)) continue;
    const devEntry = result.find(
      (game) => !game.slug && normalizeTitle(game.title) === normalizeTitle(found.title),
    );
    if (devEntry) {
      devEntry.slug = found.slug;
      published.push(devEntry.title);
      continue;
    }
    const lastPublished = result.findLastIndex((game) => game.slug);
    result.splice(lastPublished + 1, 0, {
      slug: found.slug,
      title: found.title,
      image: found.imagePath,
      width: IMAGE_SIZE,
      height: IMAGE_SIZE,
      description: { ja: found.description },
    });
    added.push(found.title);
  }
  return { games: result, added, published };
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
  if (!response.ok) throw new Error(`GET ${url} failed with ${response.status}`);
  return response.text();
}

/** Only https images on GameRush's own CDN are downloaded. */
export function isAllowedImageUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return parsed.protocol === 'https:' && !parsed.port && parsed.hostname.endsWith('.g-rush.org');
}

/** Checks the RIFF....WEBP file signature. */
export function isWebp(bytes) {
  return bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
}

async function downloadImage(url, filePath) {
  if (!isAllowedImageUrl(url)) throw new Error(`Refusing to download an image from an unexpected host: ${url}`);
  const response = await fetch(url, { headers: { 'user-agent': USER_AGENT }, redirect: 'error' });
  if (!response.ok) throw new Error(`GET ${url} failed with ${response.status}`);
  const declaredLength = Number(response.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_IMAGE_BYTES) throw new Error(`Image too large (${declaredLength} bytes): ${url}`);

  const chunks = [];
  let received = 0;
  for await (const chunk of response.body) {
    received += chunk.length;
    if (received > MAX_IMAGE_BYTES) throw new Error(`Image too large (over ${MAX_IMAGE_BYTES} bytes): ${url}`);
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  if (!isWebp(bytes)) throw new Error(`Downloaded file is not a WebP image: ${url}`);
  await writeFile(filePath, bytes);
}

export async function syncGames(rootDir) {
  const gamesFile = join(rootDir, 'tools', 'games.json');
  const data = JSON.parse(await readFile(gamesFile, 'utf8'));

  const slugs = parseProfileSlugs(await fetchText(PROFILE_URL));
  if (slugs.length === 0) throw new Error('No games found on the GameRush profile page; the page layout may have changed.');

  const known = new Set(data.games.map((game) => game.slug).filter(Boolean));
  const foundGames = [];
  for (const slug of slugs.filter((s) => !known.has(s))) {
    const meta = parseGameMeta(await fetchText(GAME_URL + slug));
    if (!meta) throw new Error(`Could not read the title or image of ${GAME_URL + slug}`);
    if (!isAllowedImageUrl(meta.image)) throw new Error(`Unexpected image host for ${GAME_URL + slug}: ${meta.image}`);
    foundGames.push({ slug, title: meta.title, description: meta.description, imageUrl: meta.image, imagePath: `/img/gamerush-${slug}.webp` });
  }

  const { games, added, published } = mergeGames(data.games, foundGames);
  if (added.length === 0 && published.length === 0) {
    console.log('No new games on GameRush.');
    return;
  }
  for (const found of foundGames) {
    if (games.some((game) => game.slug === found.slug && game.image === found.imagePath)) {
      await downloadImage(found.imageUrl, join(rootDir, found.imagePath));
    }
  }
  await writeFile(gamesFile, JSON.stringify({ ...data, games }, null, 2) + '\n');
  for (const title of added) console.log(`Added: ${title}`);
  for (const title of published) console.log(`Now playable: ${title}`);
  await buildSite(rootDir);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await syncGames(join(dirname(fileURLToPath(import.meta.url)), '..'));
}
