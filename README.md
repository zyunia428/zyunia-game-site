# zyunia.com

じゅにあ（ZyuniaStudio）のゲームサイト [zyunia.com](https://zyunia.com) のソースコードです。

フレームワークを使わない静的サイトです。日本語、英語、中国語（簡体字）、韓国語のページを、1つのテンプレートから Node.js のスクリプトで生成しています。Vercel でホスティングしています。

## ファイル構成

| パス | 内容 |
|---|---|
| `tools/template.html` | 全言語共通の HTML テンプレート |
| `tools/translations.mjs` | 言語ごとの文言 |
| `tools/games.json` | ゲームの一覧（タイトル、英語のタイトル、画像、言語ごとの説明） |
| `tools/stats.json` | GameRush のプレイ数とお気に入り数（同期で自動更新） |
| `tools/build.mjs` | テンプレートから各言語の `index.html` を生成する |
| `tools/sync-gamerush.mjs` | GameRush の新作を `games.json` に追加し、プレイ数を `stats.json` に保存する |
| `index.html`、`en/`、`zh/`、`ko/` | 生成されたページ（直接は編集しない） |
| `css/`、`js/`、`img/`、`fonts/` | スタイル、スクリプト、画像、アイコンフォント |

## 開発

Node.js 22 以上が必要です。依存パッケージはありません。

```bash
node tools/build.mjs
```

```bash
node --test tools/sync-gamerush.test.mjs
```

```bash
python -m http.server 8000
```

文言やゲームの情報を変えるときは、`tools/` の中のファイルを直してから `node tools/build.mjs` を実行し、生成されたページも一緒にコミットします。

## ゲームの自動追加

GitHub Actions（`.github/workflows/sync-gamerush.yml`）が1時間ごとに [GameRush の作者ページ](https://gamerush.jp/u/zyunizyunia) を確認します。新しいゲームがあれば `tools/games.json` に追加します。あわせて、公開中のゲームのプレイ数とお気に入り数を `tools/stats.json` に保存します。どちらかが変わったら、サイトを生成し直してコミットします。

公開中のゲームは、プレイ数の多い順に並びます。いちばん上のゲームには「いちばん人気」の印が付きます。開発中のゲームは、`games.json` の順で最後に並びます。

自動で追加したゲームには、英語のタイトルと説明がありません。英語のページでは日本語で表示されるので、`games.json` の `titles.en` と `description.en` に書き足してください。

- 追加するだけで、すでに載っているゲームの説明は書き換えません。
- 開発中のゲームと同じタイトルのゲームが公開されたときは、その項目に GameRush へのリンクを付けます。
- 新しいゲームの説明は日本語だけです。ほかの言語のページにも日本語の説明が表示されます。

## 権利

画像、ロゴ、ゲームのタイトルと説明文の権利は ZyuniaStudio に帰属します。無断での転載や再配布はご遠慮ください。

アイコンには [Font Awesome Free](https://fontawesome.com) 6.5.2 の一部を使っています（SIL OFL 1.1）。
