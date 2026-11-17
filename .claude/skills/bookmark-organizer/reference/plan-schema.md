# organization plan スキーマ

整理プラン JSON の仕様。Claude が `extract.mjs` の出力を読んで判断し、このプランを書き出す。
同じプランを **`apply.mjs`（直接書き込み・既定）** と **`render.mjs`（HTML エクスポート）** の両方で使う。

## 設計方針

- **ID ベース**: 既存ブックマークは `extract` の `id` で参照する。タイトル/URL は再入力しない（転記ミス・トークン浪費を防ぐ）。
- **目標構造をそのまま記述**: 逐次の move/delete 命令ではなく「最終的なフォルダ階層」を書く。
- **データ消失防止**: プランで割当も削除もされなかったブックマークは、`render.mjs` が自動で `__未整理__` フォルダへ退避する。意図的に捨てる場合は必ず `removed` に入れる。

## トップレベル

```jsonc
{
  "extractFile": "/абс/path/extract-<ts>.json", // 必須: extract.mjs の出力（render が ID 解決に使う）
  "folders": [ /* FolderSpec[] 必須: 目標フォルダ階層 */ ],
  "looseBookmarkIds": ["id", ...],     // 任意: トップ直下に置くブックマーク
  "renames": { "id": "新しいタイトル" }, // 任意: ID → 改名後タイトル
  "removed": [                          // 任意: 削除するブックマーク（サマリと退避除外に使う）
    { "id": "id", "reason": "○○ の重複 / リンク切れ / 陳腐化" }
  ],
  "notes": "任意の補足メモ（サマリ末尾に出る）"
}
```

## FolderSpec（再帰）

```jsonc
{
  "name": "開発",                 // 必須: フォルダ名
  "bookmarkIds": ["12", "34"],    // 任意: このフォルダ直下に置く既存ブックマークの ID
  "folders": [ /* FolderSpec[] */ ], // 任意: サブフォルダ
  "bookmarks": [                  // 任意: 新規追加（既存 ID でない手書きエントリ）
    { "title": "...", "url": "https://...", "added": "2024-01-01", "lastVisit": "2024-06-01" }
  ]
}
```

## 例

```jsonc
{
  "extractFile": "C:/Users/you/AppData/Local/Temp/bookmark-organizer/extract-2026-06-14....json",
  "folders": [
    {
      "name": "開発",
      "folders": [
        { "name": "リファレンス", "bookmarkIds": ["101", "102"] },
        { "name": "ツール",       "bookmarkIds": ["110"] }
      ]
    },
    {
      "name": "ニュース・記事",
      "bookmarkIds": ["205", "206", "207"]
    }
  ],
  "renames": { "101": "MDN Web Docs — JavaScript リファレンス" },
  "removed": [
    { "id": "102b", "reason": "101 と同一ページの重複" },
    { "id": "330",  "reason": "リンク切れ（404）" }
  ],
  "notes": "雑多フォルダ『新しいフォルダ』は用途別に再分類しました。"
}
```

## 検証ルール（共通の挙動）

- `bookmarkIds` / `looseBookmarkIds` の ID が見つからない → `unknownIds` として警告（スキップ）。
- 割当も削除もされていない既存 ID → `__未整理__` フォルダへ退避し件数を警告。
- `bookmarksPlaced` は退避分を含まない「意図的に配置した件数」。

### apply.mjs（直接書き込み・既定）

- 対象は `extract.sourceFile`（または `--file`）のライブ `Bookmarks`。整理後ツリーを全件 `bookmark_bar` に集約して上書きし、`other`/`synced` は空にする。
- 既存ブックマークは元ファイルのノードを複製して再利用（guid・日付・meta を保持）。新規フォルダのみ id/guid を採番。
- 書き込み前に既存 checksum を自己検証し、不一致なら中断。Chrome 稼働中は中断（`--force` で強制）。書き込み前にバックアップを複製。

### render.mjs（HTML エクスポート）

- 日付は `YYYY-MM-DD`（extract の値）を unix 秒へ変換。欠落時は現在時刻。
- 出力: `bookmarks-organized-<ts>.html`（インポート用）と `changes-<ts>.md`（変更サマリ）。
