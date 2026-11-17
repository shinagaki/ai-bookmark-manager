#!/usr/bin/env node
// @ts-nocheck — 依存ゼロの独立スクリプト。TS プロジェクト（src/**）の型検査対象外。
/**
 * render.mjs — 整理プラン → 再インポート用 Netscape HTML + 変更サマリ（依存ゼロ / Node ESM）
 *
 * 役割:
 *   1. Claude が出力した organization plan（目標フォルダ階層 + 各ブックマークの割当）を読む
 *   2. plan.extractFile（extract.mjs の出力）を読み、ID → タイトル/URL/日付 を解決
 *   3. 目標ツリーを構築し、Chrome 互換の Netscape Bookmark HTML を生成
 *   4. どこにも割り当てられず削除もされていないブックマークは「__未整理__」へ退避（データ消失防止）
 *   5. 変更サマリ（changes-<ts>.md）を生成
 *
 * HTML フォーマットの移植元: src/exporters/bookmark-exporter.ts (exportToHTML)
 *
 * 使い方:
 *   node render.mjs <plan.json> [--out-dir <dir>]
 *
 * plan スキーマは reference/plan-schema.md を参照。
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';

function parseArgs(argv) {
  const opts = { plan: null, outDir: null };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out-dir') opts.outDir = argv[++i];
    else rest.push(a);
  }
  opts.plan = rest[0] || null;
  return opts;
}

function die(msg) {
  process.stdout.write(`${JSON.stringify({ ok: false, error: msg }, null, 2)}\n`);
  process.exit(1);
}

function escapeHTML(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const NOW_SEC = Math.floor(Date.now() / 1000);

function toUnixSec(isoDateOrNull) {
  if (!isoDateOrNull) return NOW_SEC;
  const ms = Date.parse(isoDateOrNull);
  return Number.isNaN(ms) ? NOW_SEC : Math.floor(ms / 1000);
}

// ---------------------------------------------------------------------------
// ツリー構築
// ---------------------------------------------------------------------------
function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.plan) die('plan JSON のパスを引数で指定してください: node render.mjs <plan.json>');

  let plan;
  try {
    plan = JSON.parse(readFileSync(opts.plan, 'utf-8'));
  } catch (e) {
    die(`plan の読み込み/パースに失敗: ${e.message}`);
  }

  if (!plan.extractFile) die('plan.extractFile（extract.mjs の出力パス）が必要です。');
  const extractPath = isAbsolute(plan.extractFile)
    ? plan.extractFile
    : resolve(dirname(opts.plan), plan.extractFile);
  let extract;
  try {
    extract = JSON.parse(readFileSync(extractPath, 'utf-8'));
  } catch (e) {
    die(`extractFile の読み込みに失敗 (${extractPath}): ${e.message}`);
  }

  const byId = new Map();
  for (const r of extract.bookmarks || []) byId.set(String(r.id), r);

  const renames = plan.renames || {};
  const removed = (plan.removed || []).map((x) => (typeof x === 'string' ? { id: x } : x));
  const removedIds = new Set(removed.map((x) => String(x.id)));

  const placedIds = new Set();
  const unknownIds = [];
  let folderCount = 0;
  let inlineCount = 0;

  function resolveBookmark(id) {
    const sid = String(id);
    const rec = byId.get(sid);
    if (!rec) {
      unknownIds.push(sid);
      return null;
    }
    placedIds.add(sid);
    const title = renames[sid] != null ? renames[sid] : rec.title;
    return {
      type: 'url',
      title: title || '',
      url: rec.url || '',
      addSec: toUnixSec(rec.added),
      lastSec: toUnixSec(rec.lastUsed || rec.added),
    };
  }

  function buildFolder(spec) {
    folderCount++;
    const children = [];
    for (const id of spec.bookmarkIds || []) {
      const b = resolveBookmark(id);
      if (b) children.push(b);
    }
    for (const inline of spec.bookmarks || []) {
      inlineCount++;
      children.push({
        type: 'url',
        title: inline.title || '',
        url: inline.url || '',
        addSec: toUnixSec(inline.added),
        lastSec: toUnixSec(inline.lastVisit || inline.added),
      });
    }
    for (const sub of spec.folders || []) {
      children.push(buildFolder(sub));
    }
    return { type: 'folder', name: spec.name || '(無名フォルダ)', children };
  }

  // トップレベル構築
  const topChildren = [];
  for (const spec of plan.folders || []) topChildren.push(buildFolder(spec));
  for (const id of plan.looseBookmarkIds || []) {
    const b = resolveBookmark(id);
    if (b) topChildren.push(b);
  }

  // 退避分を含めない「プランで意図的に配置した件数」を確定
  const intentionalPlaced = placedIds.size;

  // --- データ消失防止: 未割当かつ未削除のブックマークを退避 -------------------
  const orphanIds = [];
  for (const r of extract.bookmarks || []) {
    const sid = String(r.id);
    if (!placedIds.has(sid) && !removedIds.has(sid)) orphanIds.push(sid);
  }
  if (orphanIds.length > 0) {
    const orphanChildren = orphanIds.map(resolveBookmark).filter(Boolean);
    folderCount++;
    topChildren.push({ type: 'folder', name: '__未整理__', children: orphanChildren });
  }

  // --- HTML 生成（exportToHTML 移植） --------------------------------------
  let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
`;
  for (const node of topChildren) html += nodeToHTML(node, 1);
  html += `</DL><p>\n`;

  // --- 出力 -----------------------------------------------------------------
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = opts.outDir || dirname(extractPath) || join(tmpdir(), 'bookmark-organizer');
  mkdirSync(outDir, { recursive: true });
  const htmlPath = join(outDir, `bookmarks-organized-${ts}.html`);
  const mdPath = join(outDir, `changes-${ts}.md`);
  writeFileSync(htmlPath, html, 'utf-8');

  const summary = buildSummary({
    plan,
    extract,
    folderCount,
    placedCount: intentionalPlaced,
    inlineCount,
    removed,
    orphanIds,
    unknownIds,
  });
  writeFileSync(mdPath, summary, 'utf-8');

  const result = {
    ok: true,
    htmlPath,
    summaryPath: mdPath,
    counts: {
      foldersCreated: folderCount,
      bookmarksPlaced: intentionalPlaced,
      inlineAdded: inlineCount,
      removed: removed.length,
      renamed: Object.keys(renames).length,
      orphansMovedToUntriaged: orphanIds.length,
      unknownIds: unknownIds.length,
    },
    warnings: [
      ...(orphanIds.length ? [`${orphanIds.length} 件が未割当のため「__未整理__」へ退避しました。`] : []),
      ...(unknownIds.length ? [`${unknownIds.length} 件の ID が extract に見つかりませんでした。`] : []),
    ],
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function nodeToHTML(node, depth) {
  const indent = '    '.repeat(depth);
  if (node.type === 'folder') {
    let html = `${indent}<DT><H3 ADD_DATE="${NOW_SEC}">${escapeHTML(node.name)}</H3>\n`;
    html += `${indent}<DL><p>\n`;
    for (const child of node.children || []) html += nodeToHTML(child, depth + 1);
    html += `${indent}</DL><p>\n`;
    return html;
  }
  return `${indent}<DT><A HREF="${escapeHTML(node.url)}" ADD_DATE="${node.addSec}" LAST_VISIT="${node.lastSec}">${escapeHTML(node.title)}</A>\n`;
}

function buildSummary({ plan, extract, folderCount, placedCount, inlineCount, removed, orphanIds, unknownIds }) {
  const byId = new Map();
  for (const r of extract.bookmarks || []) byId.set(String(r.id), r);
  const total = (extract.bookmarks || []).length;

  let md = `# ブックマーク整理 変更サマリ\n\n`;
  md += `- 元ファイル: ${extract.sourceFile || '(不明)'}\n`;
  md += `- バックアップ: ${extract.backupPath || '(不明)'}\n`;
  md += `- 元のブックマーク総数: ${total}\n\n`;

  md += `## 集計\n\n`;
  md += `| 項目 | 件数 |\n|---|---|\n`;
  md += `| 作成フォルダ | ${folderCount} |\n`;
  md += `| 配置したブックマーク | ${placedCount} |\n`;
  md += `| 新規追加（インライン） | ${inlineCount} |\n`;
  md += `| 削除 | ${removed.length} |\n`;
  md += `| 改名 | ${Object.keys(plan.renames || {}).length} |\n`;
  md += `| 未整理へ退避 | ${orphanIds.length} |\n`;
  md += `| 不明 ID | ${unknownIds.length} |\n\n`;

  if (removed.length) {
    md += `## 削除されたブックマーク\n\n`;
    for (const x of removed) {
      const rec = byId.get(String(x.id));
      const label = rec ? `${rec.title} (${rec.url})` : `ID ${x.id}`;
      md += `- ${label}${x.reason ? ` — ${x.reason}` : ''}\n`;
    }
    md += `\n`;
  }

  if (Object.keys(plan.renames || {}).length) {
    md += `## 改名\n\n`;
    for (const [id, newName] of Object.entries(plan.renames)) {
      const rec = byId.get(String(id));
      md += `- ${rec ? rec.title : `ID ${id}`} → ${newName}\n`;
    }
    md += `\n`;
  }

  if (orphanIds.length) {
    md += `## 「__未整理__」へ退避（要レビュー）\n\n`;
    md += `プランで割当も削除もされなかったブックマークです。意図的な漏れがないか確認してください。\n\n`;
    for (const id of orphanIds.slice(0, 100)) {
      const rec = byId.get(String(id));
      md += `- ${rec ? `${rec.title} (${rec.url})` : `ID ${id}`}\n`;
    }
    if (orphanIds.length > 100) md += `- …ほか ${orphanIds.length - 100} 件\n`;
    md += `\n`;
  }

  if (plan.notes) md += `## メモ\n\n${plan.notes}\n`;

  return md;
}

main();
