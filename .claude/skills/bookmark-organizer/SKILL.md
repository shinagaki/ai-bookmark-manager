---
name: bookmark-organizer
description: >-
  Chrome ブックマークをきめ細かく整理する。ユーザーが「ブックマークを整理して / 重複を消して /
  フォルダ分けして / カテゴリ整理 / bookmark organize / dedupe / categorize bookmarks」
  などと頼んだら起動。現状を抽出し、用途ベースでフォルダ再構成・重複取捨・改名・陳腐化整理の
  プランを立て、確認のうえ Chrome 再インポート用 HTML を生成する。元の Bookmarks は書き換えない。
---

# Bookmark Organizer

Chrome のブックマークを **Claude（あなた）の判断で**きめ細かく整理するスキル。
決定論が必要な前処理（探索・パース・重複候補抽出・HTML 生成）は依存ゼロの小スクリプトが担当し、
**分類・命名・取捨選択といった「きめ細かさ」はあなたが担う**のが本スキルの核心。

元ツール（`bookmark-manager` CLI）の Gemini 連携はモックのまま機能していなかった。本スキルはその CLI を使わず、
確実に動いていたルールベースのロジックだけを `scripts/` に移植して再利用する。

## 安全規約（厳守）

- 反映方法は2つ。既定は **直接書き込み（`apply.mjs`）= ライブの `Bookmarks` を整理後の状態で完全置換**。`render.mjs` の HTML エクスポートはプレビュー/追記用の代替。
- `extract.mjs` は元ファイルを **read-only** で読むだけ。`apply.mjs` はライブを上書きするが、その前に必ず (1) 既存 checksum の自己検証、(2) Chrome 稼働ガード、(3) バックアップ複製 を行う。
- **`apply.mjs` 実行前に Chrome を完全終了**させる（バックグラウンド常駐含む。起動中だと終了時に巻き戻る）。稼働中はガードが中断する（`--force` で強制可だが非推奨）。
- ブックマークを**捨てるときは必ず理由を添えて `removed` に入れる**。割当漏れは `__未整理__` フォルダへ自動退避されるが、それは安全網であって正規の手段ではない。
- 適用の**前に必ず件数 diff をユーザーに提示して確認を取る**。

## ワークフロー

スクリプトのパスは、このスキルディレクトリ基準（`scripts/extract.mjs`, `scripts/apply.mjs`, `scripts/render.mjs`）。

### 1. 抽出

```
node "<skill>/scripts/extract.mjs"
```

- 複数プロファイルが見つかると `needSelection: true` と `profiles[]` を返す。どのプロファイルか分からなければユーザーに確認し、`--file <path>` を付けて再実行する。
- 成功すると stdout に `sourceFile` / `backupPath` / `extractFile` / `stats` の軽量サマリが出る。
- **`extractFile` を Read** して `bookmarks[]`（`id,title,url,domain,folder,added,lastUsed`）と `duplicateCandidates[]` を取得する。大量なら `offset`/`limit` で分割して読む。

### 2. 整理プランを立てる（ここが本体）

`extract` の `stats` で規模を把握し、`bookmarks[]` を読み込んで以下を判断する。
数千件超で一度に扱いきれない場合は、**フォルダ単位 / ドメインバケット単位**で順に処理し、プランの `folders` を継ぎ足していく。

判断の指針（モック AI との差別化点 ＝ 手を抜かない所）:

- **用途・意図でグルーピング**する。単なるドメイン集約（github.com 全部を「github」へ）はしない。「読み物」「仕事の調べ物」「ツール」「あとで読む」など、その人の使い方に沿った括りにする。
- **重複**は `duplicateCandidates` を起点に、`keepId` を参考にしつつ自分で取捨を決める。候補に出ない近重複（同じ記事の別URL、同テーマの重なり）も `bookmarks[]` を見て拾う。残す 1 件以外は理由付きで `removed`。
- **改名**: タイトルが空・URL 断片・サイト名だけで内容不明なものは、分かりやすいタイトルへ `renames`。
- **陳腐化・低価値**: `added`/`lastUsed` が古い（`stats.oldCount` 参照）、`(invalid)` URL、用途不明のものは削除候補に。ただし**重要そうなものは残す**（公式ドキュメント、よく使うツール等）。判断に迷うものは消さずに残す。
- **フォルダ設計**: 極小フォルダ（1〜2件）は近い括りへ統合、肥大フォルダ（数十件）は用途で分割。階層は深くしすぎない（目安 2〜3 段）。フォルダ名は日本語で簡潔に。
- 既存の `folder`（現状のフォルダパス）も手がかりにするが、引きずられず再設計してよい。

プランは `reference/plan-schema.md` の形式で JSON ファイルに書き出す（例: `<extract と同じ out-dir>/plan-<ts>.json`）。`extractFile` の絶対パスを必ず入れる。

### 3. 確認

適用の前に、要約をユーザーに提示する:

- 削除 N 件（主な理由）、新フォルダ M 個、改名 K 件、未整理へ退避が出そうなら警告
- 大きな構造変更（トップレベルのフォルダ構成）は箇条書きで見せる

ユーザーが調整を求めたらプラン JSON を直して再提示する。

### 4. 反映（どちらか。既定は 4a）

両モードとも同じプラン JSON を使う（`reference/plan-schema.md`）。

#### 4a. 直接書き込み（既定・完全置換）

まずユーザーに **Chrome を完全終了**してもらう（バックグラウンド常駐も）。その後:

```
node "<skill>/scripts/apply.mjs" "<plan.json>"
```

- 書き込み前に既存 `Bookmarks` の checksum を再計算して保存値と照合する（`checksumSelfVerified`）。**一致しなければ中断**するので、その場合は 4b の HTML 方式に切り替える。
- バックアップ（`backupPath`）を作成し、整理後ツリーを全件 `bookmark_bar` に集約して上書きする（`other`/`synced` は空に）。既存ブックマークは guid・日付・meta を保持。
- 事前に挙動だけ確かめたいときは `--verify-only`（書き込まず checksum 検証のみ）。
- stdout の `counts`/`warnings` を確認。`orphansMovedToUntriaged`/`unknownIds` が想定外に多ければプランを見直す。
- 完了後、**Chrome を起動して反映を確認**するようユーザーに伝える。元に戻すには `backupPath` を元の場所へコピー。

#### 4b. HTML エクスポート（プレビュー / 追記用の代替）

```
node "<skill>/scripts/render.mjs" "<plan.json>"
```

- `bookmarks-organized-<ts>.html` と `changes-<ts>.md`（変更サマリ）を生成。Chrome を閉じる必要はない。
- 取り込みは `chrome://bookmarks` → 右上「︙」→「**ブックマークをインポート**」→ HTML を選択。
- ただしインポートは既存に**追記**される（削除・置換は反映されない）。プレビュー目的や、直接書き込みを避けたいときに使う。

## 出力ファイルの場所

既定で OS の一時ディレクトリ配下（`<tmp>/bookmark-organizer/`）。`--out-dir`（extract/render）、`--backup-dir`（apply）で変更可。extract / plan / 出力は同じディレクトリに揃えると扱いやすい。

## 参考

- プラン形式の詳細: `reference/plan-schema.md`
- 移植元（挙動の source of truth）: `../../../src/parsers/bookmark-parser.ts`, `../../../src/analyzers/improved-duplicate-analyzer.ts`, `../../../src/exporters/bookmark-exporter.ts`, `../../../src/utils/default-paths.ts`
- 直接書き込みの checksum は Chrome の `bookmark_codec.cc` 準拠（id/種別/url は UTF-8、title は UTF-16LE で MD5）。`apply.mjs` の自己検証がこの正しさを担保する。
