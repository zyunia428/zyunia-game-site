import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeGames, normalizeTitle, parseGameMeta, parseProfileSlugs } from './sync-gamerush.mjs';
import { renderGameCards } from './build.mjs';

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
