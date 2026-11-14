import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedImageUrl, isWebp, parseGameStats, webpImageUrl, mergeGames, normalizeTitle, parseGameMeta, parseProfileSlugs } from './sync-gamerush.mjs';

test('画像はGameRushのCDNのhttps URLだけを許可する', () => {
  assert.equal(isAllowedImageUrl('https://5f06cd03.g-rush.org/assets/thumbnail.webp?v=1'), true);
  assert.equal(isAllowedImageUrl('http://5f06cd03.g-rush.org/assets/thumbnail.webp'), false);
  assert.equal(isAllowedImageUrl('https://g-rush.org.evil.example/x.webp'), false);
  assert.equal(isAllowedImageUrl('https://evilg-rush.org/x.webp'), false);
  assert.equal(isAllowedImageUrl('https://a.g-rush.org:8443/x.webp'), false);
  assert.equal(isAllowedImageUrl('https://169.254.169.254/latest/meta-data'), false);
  assert.equal(isAllowedImageUrl('not a url'), false);
});

test('WebPの画像URLはそのまま使う', () => {
  const url = 'https://5f06cd03.g-rush.org/assets/thumbnail.webp?v=1';
  assert.equal(webpImageUrl(url), url);
});

test('WebPでない画像URLは同じホストのthumbnail.webpに置き換える', () => {
  assert.equal(
    webpImageUrl('https://56c8e1f4.g-rush.org/assets/thumb-og.jpg?v=1794643446440'),
    'https://56c8e1f4.g-rush.org/assets/thumbnail.webp?v=1794643446440',
  );
  assert.equal(webpImageUrl('https://56c8e1f4.g-rush.org/assets/thumb.PNG'), 'https://56c8e1f4.g-rush.org/assets/thumbnail.webp');
});

test('WebPのファイル署名を確かめる', () => {
  assert.equal(isWebp(Buffer.from('RIFF\x10\x00\x00\x00WEBPVP8 ', 'binary')), true);
  assert.equal(isWebp(Buffer.from('<html><body>not an image</body>')), false);
  assert.equal(isWebp(Buffer.from('RIFF')), false);
});
import { renderGameCards, sortGamesByPlays } from './build.mjs';

const profileHtml = `
<a class="group flex" href="/g/4zoyW6a?src=profile" data-discover="true"><img src="x"></a>
<a class="group flex" href="/g/yJ9JFMc?src=profile" data-discover="true"></a>
<a class="group flex" href="/g/4zoyW6a?src=profile"></a>
<a href="/g/../../etc?src=profile"></a>
<a href="/g/AbCdEf9?src=feed"></a>`;

test('プロフィールページから重複なしでゲームのslugを取り出す', () => {
  assert.deepEqual(parseProfileSlugs(profileHtml), ['4zoyW6a', 'yJ9JFMc']);
});

test('ゲームのリンクがないプロフィールページでは空の配列を返す', () => {
  assert.deepEqual(parseProfileSlugs('<main><h2>ゲーム（0）</h2></main>'), []);
});

const gameHtml = `<head>
<meta property="og:title" content="古古古米、炊けました｜無料ブラウザゲーム GameRush"/>
<meta property="og:description" content="古古古米を新米にする。それはつまり、古い米を新しくするということです。&#39;引用&#39;"/>
<meta property="og:image" content="https://example.g-rush.org/assets/thumbnail.webp?v=1&amp;c=2"/>
</head>`;

test('ゲームページからタイトルと説明と画像URLを読む', () => {
  assert.deepEqual(parseGameMeta(gameHtml), {
    title: '古古古米、炊けました',
    description: '古古古米を新米にする。それはつまり、古い米を新しくするということです。\'引用\'',
    image: 'https://example.g-rush.org/assets/thumbnail.webp?v=1&c=2',
  });
});

test('60文字を超える説明は最初の文だけにする', () => {
  const longText = `はじめの文。${'あ'.repeat(70)}`;
  const html = gameHtml.replace(/og:description" content="[^"]*"/, `og:description" content="${longText}"`);
  assert.equal(parseGameMeta(html).description, 'はじめの文。');
});

test('タイトルか画像がないページはnullを返す', () => {
  assert.equal(parseGameMeta('<meta property="og:title" content="タイトルだけ"/>'), null);
});

test('記号や全角半角の違いを無視してタイトルを比べる', () => {
  assert.equal(normalizeTitle('ONE SHOT CHAOS!!'), normalizeTitle('ONE SHOT CHAOS'));
  assert.equal(normalizeTitle('ＯＮＥ　ＳＨＯＴ'), normalizeTitle('one shot'));
  assert.notEqual(normalizeTitle('忘却の塔'), normalizeTitle('忘却の塔2'));
});

const baseGames = [
  { slug: 'aaaa1', title: '公開済み', image: '/img/a.webp', width: 720, height: 405, description: { ja: 'A' } },
  { slug: null, title: '忘却の塔', image: '/img/tower.webp', width: 960, height: 540, description: { ja: '開発中の説明', en: 'dev' } },
];

test('新作は最後の公開済みゲームの直後、開発中のゲームより前に入る', () => {
  const found = [{ slug: 'bbbb2', title: '新作', description: '新作の説明', imagePath: '/img/gamerush-bbbb2.webp' }];
  const { games, added } = mergeGames(baseGames, found);
  assert.deepEqual(games.map((g) => g.title), ['公開済み', '新作', '忘却の塔']);
  assert.deepEqual(games[1], {
    slug: 'bbbb2', title: '新作', image: '/img/gamerush-bbbb2.webp', width: 720, height: 720, description: { ja: '新作の説明' },
  });
  assert.deepEqual(added, ['新作']);
});

test('開発中のゲームと同じタイトルの新作は、その項目にリンクを付けるだけにする', () => {
  const found = [{ slug: 'cccc3', title: '忘却の塔!!', description: 'GameRushの説明', imagePath: '/img/gamerush-cccc3.webp' }];
  const { games, added, published } = mergeGames(baseGames, found);
  assert.equal(games.length, 2);
  assert.deepEqual(games[1], { ...baseGames[1], slug: 'cccc3' });
  assert.deepEqual(added, []);
  assert.deepEqual(published, ['忘却の塔']);
});

test('すでに載っているゲームは変更しない', () => {
  const found = [{ slug: 'aaaa1', title: '別名', description: '別の説明', imagePath: '/img/x.webp' }];
  const { games, added } = mergeGames(baseGames, found);
  assert.deepEqual(games, baseGames);
  assert.deepEqual(added, []);
});

test('元の配列は書き換えない', () => {
  const snapshot = structuredClone(baseGames);
  mergeGames(baseGames, [{ slug: 'cccc3', title: '忘却の塔', description: '', imagePath: '/img/c.webp' }]);
  assert.deepEqual(baseGames, snapshot);
});

test('翻訳がないゲームは日本語の説明を表示し、HTMLをエスケープする', () => {
  const games = [{ slug: 'dddd4', title: '<b>新作</b>', image: '/img/d.webp', width: 720, height: 720, description: { ja: 'A & "B"' } }];
  const html = renderGameCards(games, 'en', { play: 'Play', inDevelopment: 'In development' });
  assert.match(html, /<p class="desc">A &amp; &quot;B&quot;<\/p>/);
  assert.match(html, /<h3>&lt;b&gt;新作&lt;\/b&gt;<\/h3>/);
  assert.match(html, /class="art art-square"/);
});

/** Builds a page that embeds data the way GameRush does (React Router turbo-stream). */
function streamPage(flat) {
  const payload = JSON.stringify(JSON.stringify(flat));
  return `<html><script>window.__reactRouterContext.streamController.enqueue(${payload});</script></html>`;
}

test('ゲームページの埋め込みデータからプレイ数とお気に入り数を読む', () => {
  const flat = [
    { _1: 2 }, 'game', { _3: 4, _5: 6, _7: 8 }, 'title', '上げ底、バレませんでした', 'likeCount', 9, 'commentCount', 1,
    { _10: 11, _12: -5 }, 'playCount', 26062, 'sourceUrl',
  ];
  assert.deepEqual(parseGameStats(streamPage(flat)), { plays: 26062, likes: 9 });
});

test('プレイ数が読めないページはnullを返す', () => {
  assert.equal(parseGameStats('<html><body>メンテナンス中</body></html>'), null);
  assert.equal(parseGameStats(streamPage([{ _1: 2 }, 'likeCount', 3])), null);
  assert.equal(parseGameStats(streamPage([{ _1: 2 }, 'playCount', 'たくさん', { _4: 5 }, 'likeCount', 3])), null);
});

const rankedGames = [
  { slug: 'a', title: 'A' },
  { slug: 'b', title: 'B' },
  { slug: null, title: '開発中1' },
  { slug: 'c', title: 'C' },
  { slug: null, title: '開発中2' },
  { slug: 'd', title: 'D' },
];

test('公開済みのゲームはプレイ数の多い順に並び、開発中のゲームは元の順で最後に来る', () => {
  const stats = { a: { plays: 10, likes: 0 }, b: { plays: 300, likes: 1 }, c: { plays: 50, likes: 0 } };
  assert.deepEqual(sortGamesByPlays(rankedGames, stats).map((g) => g.title), ['B', 'C', 'A', 'D', '開発中1', '開発中2']);
});

test('プレイ数が分からないゲームは、分かるゲームのあとに元の順で並び、元の配列は変えない', () => {
  const snapshot = structuredClone(rankedGames);
  assert.deepEqual(sortGamesByPlays(rankedGames, { d: { plays: 1, likes: 0 } }).map((g) => g.title), ['D', 'A', 'B', 'C', '開発中1', '開発中2']);
  assert.deepEqual(rankedGames, snapshot);
});

const cardText = { play: 'Play', inDevelopment: 'In development', mostPlayed: 'Most played', playsLabel: '{count} plays', likesLabel: '{count} favorites' };

test('カードにプレイ数とお気に入り数を桁区切りで表示し、いちばん上のカードにだけ人気の印を付ける', () => {
  const games = [
    { slug: 'b', title: '二番', image: '/img/b.webp', width: 720, height: 405, description: { ja: 'B' } },
    { slug: 'a', title: '一番', image: '/img/a.webp', width: 720, height: 405, description: { ja: 'A' } },
  ];
  const stats = { b: { plays: 26062, likes: 9 }, a: { plays: 120, likes: 0 } };
  const html = renderGameCards(games, 'en', cardText, { stats, locale: 'en' });
  assert.match(html, /26,062 plays/);
  assert.match(html, /9 favorites/);
  assert.match(html, /120 plays/);
  assert.equal(html.match(/Most played/g)?.length, 1);
  assert.ok(html.indexOf('Most played') < html.indexOf('120 plays'));
});

test('プレイ数が0か分からないゲームには数も人気の印も出さない', () => {
  const games = [{ slug: 'z', title: 'Z', image: '/img/z.webp', width: 720, height: 405, description: { ja: 'Z' } }];
  for (const stats of [{}, { z: { plays: 0, likes: 0 } }]) {
    const html = renderGameCards(games, 'en', cardText, { stats, locale: 'en' });
    assert.doesNotMatch(html, /plays|Most played/);
  }
});

test('英語のタイトルがあれば英語のページで使い、なければ日本語のタイトルを使う', () => {
  const games = [
    { slug: 'e', title: '忘却の塔', titles: { en: 'Tower of Oblivion' }, image: '/img/t.webp', width: 960, height: 540, description: { ja: '説明' } },
    { slug: 'f', title: '日本語だけ', image: '/img/f.webp', width: 960, height: 540, description: { ja: '説明' } },
  ];
  const en = renderGameCards(games, 'en', cardText);
  assert.match(en, /<h3>Tower of Oblivion<\/h3>/);
  assert.match(en, /alt="Tower of Oblivion"/);
  assert.match(en, /<h3>日本語だけ<\/h3>/);
  assert.match(renderGameCards(games, 'ja', cardText), /<h3>忘却の塔<\/h3>/);
});
