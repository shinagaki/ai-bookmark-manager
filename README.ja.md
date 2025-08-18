# AI ブックマークマネージャー

AI（Gemini）を活用したChrome用インテリジェントブックマーク管理ツール。高度なAI分析により、ブックマークの自動整理、クリーンアップ、最適化を実現します。

## 機能

### 🤖 AI駆動の整理機能
- **スマートカテゴリ分類** - AIがブックマークの内容を分析し、最適なフォルダ構造を提案
- **重複検出** - 完全一致、類似、正規化URLの重複を高度なアルゴリズムで検出
- **リンク切れチェッカー** - 問題のあるリンクを個別レビュー可能なバッチ処理
- **コンテンツベース分析** - ドメインだけでなく、実際のコンテンツでブックマークをグループ化

### 🎯 主要機能
- **対話型CLI** - メニューナビゲーション付きの使いやすいコマンドラインインターフェース
- **バッチ処理** - 数千のブックマークを効率的に処理
- **スマート推奨** - AIが重複や整理のための最適なアクションを提案
- **段階的処理** - 50件ずつの管理しやすいバッチで処理
- **安全な操作** - 適用前の変更プレビュー、バックアップ推奨

### 🔧 高度な機能
- **YouTube URL正規化** - 動画の重複を正しく識別
- **ブックマークレット検出** - JavaScriptブックマークレットの個別処理
- **リダイレクト処理** - ブックマークを最終的なURLに更新
- **マルチプロファイル対応** - 複数のChromeプロファイルに対応
- **クロスプラットフォーム** - Windows、macOS、Linuxをサポート

## インストール

```bash
# リポジトリのクローン
git clone https://github.com/shinagaki/ai-bookmark-manager.git
cd ai-bookmark-manager

# 依存関係のインストール
npm install

# プロジェクトのビルド
npm run build

# ツールの実行
npm run dev
```

## 使い方

### 対話モード（推奨）
```bash
node dist/index.js
```
メニューから選択：
1. ブックマーク分析
2. 重複検出
3. リンク切れチェック
4. カテゴリ整理
5. 古いブックマークのクリーンアップ

### 完全整理
```bash
node dist/index.js organize
```
すべての最適化ステップを実行：
- 重複削除
- リンク切れ検出
- カテゴリ整理
- 古いブックマークのクリーンアップ

### クイックコマンド
```bash
# 重複の検出とクリーンアップ
node dist/index.js clean-duplicates

# 重複検出テスト
node dist/index.js test-duplicates

# Gemini AIによる整理
node dist/index.js gemini
```

## 設定

### 環境変数
```bash
# オプション：カスタムChromeブックマークパスの設定
export CHROME_BOOKMARKS_PATH="/path/to/Bookmarks"

# Gemini AI機能用
export GEMINI_API_KEY="your-api-key"
```

### サポートされるブックマークの場所
ツールは標準的なChromeの場所からブックマークを自動検出：
- **Windows**: `%LOCALAPPDATA%\Google\Chrome\User Data\Default\Bookmarks`
- **macOS**: `~/Library/Application Support/Google/Chrome/Default/Bookmarks`
- **Linux**: `~/.config/google-chrome/Default/Bookmarks`

## ワークフロー

### 1. まずバックアップ
変更を加える前に必ずブックマークをバックアップ：
```bash
cp ~/.config/google-chrome/Default/Bookmarks Bookmarks.backup
```

### 2. Chromeを終了
最良の結果を得るために、操作前にChromeを完全に終了：
```bash
# Windows
taskkill /f /im chrome.exe

# macOS/Linux
pkill -f chrome
```

### 3. 整理を実行
```bash
node dist/index.js organize
```

### 4. 変更を確認
ツールは以下を実行：
- 詳細な分析を表示
- 推奨事項を提示
- 各変更の個別レビューを許可
- 確認後にのみ変更を適用

## 詳細機能

### 重複検出
- **完全URL一致** - 同一URLを識別
- **正規化URL一致** - トラッキングパラメータを無視
- **類似URL検出** - 同じドメイン上の類似ページを検出
- **スマート優先順位付け** - HTTPS、クリーンURL、最近使用したブックマークを保持

### リンク切れチェッカー
- **バッチ処理** - 50件ずつチェック
- **個別レビュー** - 各デッドリンクのアクションを決定
- **リトライ機構** - より長いタイムアウトで再チェック
- **リダイレクト検出** - 最終URLへの更新オプション

### カテゴリ整理
- **コンテンツベース** - タイトルとURLを分析してカテゴリ分類
- **ドメイングループ化** - ドメインによるオプショナルグループ化
- **手動選択** - 整理方法を選択
- **ブックマークレット分離** - JavaScriptブックマークレットを専用フォルダに

## 開発

### プロジェクト構造
```
ai-bookmark-manager/
├── src/
│   ├── commands/       # CLIコマンド
│   ├── analyzers/      # ブックマーク分析ロジック
│   ├── parsers/        # ブックマークファイル解析
│   ├── organizers/     # 整理ロジック
│   ├── utils/          # ユーティリティ関数
│   └── types/          # TypeScript型定義
├── dist/               # コンパイル済みJavaScript
└── package.json
```

### ビルド
```bash
# TypeScriptコンパイル
npm run build

# 開発モード（ビルド＋実行）
npm run dev

# テスト実行
npm test

# コードのリント
npm run lint
```

### コントリビューション
コントリビューションを歓迎します！以下の手順で：
1. リポジトリをフォーク
2. 機能ブランチを作成
3. 変更を実装
4. 該当する場合はテストを追加
5. プルリクエストを送信

## トラブルシューティング

### Chromeが実行中
- エラー：「ブックマークファイルがロックされています」
- 解決策：実行前にChromeを完全に終了

### 権限拒否
- エラー：「ブックマークファイルを読み取れません」
- 解決策：適切な権限で実行するか、ファイルパスを確認

### ブックマークが見つからない
- エラー：「指定されたパスにブックマークファイルがありません」
- 解決策：`-f`オプションでパスを手動指定

## ライセンス

MITライセンス - 詳細は[LICENSE](LICENSE)ファイルを参照

## 作者

**稲垣 晋太郎** 作

## 謝辞

- Google Gemini AIによるインテリジェント分析
- TypeScriptとNode.jsで構築
- Chromeブックマークフォーマット仕様を使用

---

**注意**: このツールはChromeのブックマークを変更します。使用前に必ずバックアップを取ってください！