#!/usr/bin/env node
// @ts-nocheck — 依存ゼロの独立スクリプト。TS プロジェクト（src/**）の型検査対象外。
/**
 * apply.mjs — 整理プランをライブ Bookmarks へ直接書き込み（完全置換 / Node ESM）
 *
 * HTML インポートが「追記」なのに対し、本スクリプトは Chrome の Bookmarks ファイル自体を
 * 整理後の状態で上書きする。削除・並べ替えがそのまま反映される。
 *
 * 安全機構:
 *   - **自己検証**: 書き込み前に既存ファイルの checksum を自前アルゴリズムで再計算し、
 *     保存済み値と一致するか確認する。不一致なら Chrome 版が想定と異なるため中断（HTML 方式へ）。
 *   - **Chrome 稼働ガード**: Chrome 起動中は上書きしても終了時に巻き戻るため、原則中断（--force で強制）。
 *   - **バックアップ**: 上書き前に必ず元ファイルを複製。
 *   - 既存ブックマークのノードは元ファイルから複製して再利用（guid / 日付 / meta を保持）。
 *
 * 使い方:
 *   node apply.mjs <plan.json> [--file <Bookmarks>] [--backup-dir <dir>] [--force] [--verify-only]
 *
 * plan スキーマは reference/plan-schema.md を参照（render.mjs と共通）。
 */

import { execSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';

const CHROME_EPOCH_OFFSET = 11644473600000000n; // microseconds

function parseArgs(argv) {
  const opts = { plan: null, file: null, backupDir: null, force: false, verifyOnly: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--file' || a === '-f') opts.file = argv[++i];
    else if (a === '--backup-dir') opts.backupDir = argv[++i];
    else if (a === '--force') opts.force = true;
    else if (a === '--verify-only') opts.verifyOnly = true;
    else rest.push(a);
  }
  opts.plan = rest[0] || null;
  return opts;
}

function out(obj) {
  process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`);
}
function die(msg, extra = {}) {
  out({ ok: false, error: msg, ...extra });
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Chrome チェックサム（components/bookmarks/browser/bookmark_codec.cc 準拠）
//   id / 種別文字列 / url … std::string をそのまま（UTF-8）でハッシュ
//   title … std::u16string の raw bytes、すなわち UTF-16LE でハッシュ
//   URL ノード   : id, UTF16LE(title), "url", url
//   フォルダノード: id, UTF16LE(title), "folder", （その後 children を再帰）
//   走査順        : bookmark_bar → other → synced
// ---------------------------------------------------------------------------
function computeChecksum(rootNodes) {
  const md5 = createHash('md5');
  const updBytes = (s) => md5.update(Buffer.from(String(s ?? ''), 'utf8'));
  const updTitle = (s) => md5.update(Buffer.from(String(s ?? ''), 'utf16le'));
  function visit(node) {
    if (!node) return;
    if (node.type === 'url') {
      updBytes(node.id);
      updTitle(node.name);
      updBytes('url');
      updBytes(node.url);
    } else {
      updBytes(node.id);
      updTitle(node.name);
      updBytes('folder');
      for (const c of node.children || []) visit(c);
    }
  }
  for (const r of rootNodes) visit(r);
  return md5.digest('hex');
}

function rootOrder(data) {
  return [data.roots?.bookmark_bar, data.roots?.other, data.roots?.synced].filter(Boolean);
}

function chromeTsNow() {
  return (BigInt(Date.now()) * 1000n + CHROME_EPOCH_OFFSET).toString();
}

// ---------------------------------------------------------------------------
// Chrome 稼働チェック（best-effort）
// ---------------------------------------------------------------------------
function isChromeRunning() {
  try {
    if (process.platform === 'win32') {
      const o = execSync('tasklist /FI "IMAGENAME eq chrome.exe" /NH', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      return /chrome\.exe/i.test(o);
    }
    const o = execSync('pgrep -i "chrome|chromium" || true', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return o.trim().length > 0;
  } catch {
    return null; // 判定不能
  }
}

// ---------------------------------------------------------------------------
// メイン
// ---------------------------------------------------------------------------
function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.plan) die('plan JSON のパスを引数で指定してください: node apply.mjs <plan.json>');

  let plan;
  try {
    plan = JSON.parse(readFileSync(opts.plan, 'utf-8'));
  } catch (e) {
    die(`plan の読み込み/パースに失敗: ${e.message}`);
  }
  if (!plan.extractFile) die('plan.extractFile（extract.mjs の出力パス）が必要です。');
  const extractPath = isAbsolute(plan.extractFile) ? plan.extractFile : resolve(dirname(opts.plan), plan.extractFile);
  let extract;
  try {
    extract = JSON.parse(readFileSync(extractPath, 'utf-8'));
  } catch (e) {
    die(`extractFile の読み込みに失敗 (${extractPath}): ${e.message}`);
  }

  const target = opts.file || extract.sourceFile;
  if (!target) die('対象 Bookmarks のパスが特定できません。--file で指定してください。');

  let original;
  try {
    original = JSON.parse(readFileSync(target, 'utf-8'));
  } catch (e) {
    die(`Bookmarks の読み込みに失敗 (${target}): ${e.message}`);
  }

  // --- 自己検証: 既存ファイルの checksum を再現できるか --------------------
  const recomputed = computeChecksum(rootOrder(original));
  const stored = original.checksum || '';
  const checksumOk = stored.toLowerCase() === recomputed.toLowerCase();

  if (opts.verifyOnly) {
    out({ ok: true, target, storedChecksum: stored, recomputedChecksum: recomputed, checksumAlgorithmValid: checksumOk });
    process.exit(0);
  }

  if (!checksumOk) {
    die(
      'checksum 自己検証に失敗しました。この Chrome のチェックサム仕様が想定と異なります。直接書き込みは中断します（render.mjs の HTML 方式を使ってください）。',
      { storedChecksum: stored, recomputedChecksum: recomputed },
    );
  }

  // --- Chrome 稼働ガード ----------------------------------------------------
  const running = isChromeRunning();
  if (running === true && !opts.force) {
    die('Chrome が起動中です。終了後に再実行してください（巻き戻りを防ぐため）。どうしても続けるなら --force。');
  }

  // --- 元ノードを id で索引（既存ブックマークの完全な複製に使う） ----------
  const byId = new Map();
  let maxId = 0;
  const allUrlIds = [];
  (function index(node) {
    if (!node) return;
    if (node.id != null) {
      byId.set(String(node.id), node);
      const n = parseInt(node.id, 10);
      if (Number.isFinite(n)) maxId = Math.max(maxId, n);
    }
    if (node.type === 'url') allUrlIds.push(String(node.id));
    for (const c of node.children || []) index(c);
  })({ children: rootOrder(original) });

  let folderIdCounter = maxId;
  const nextFolderId = () => String(++folderIdCounter);

  const renames = plan.renames || {};
  const removedIds = new Set((plan.removed || []).map((x) => String(typeof x === 'string' ? x : x.id)));
  const placedIds = new Set();
  const unknownIds = [];
  let folderCount = 0;

  function cloneUrlNode(id) {
    const sid = String(id);
    const src = byId.get(sid);
    if (!src || src.type !== 'url') {
      unknownIds.push(sid);
      return null;
    }
    placedIds.add(sid);
    const node = JSON.parse(JSON.stringify(src)); // guid / date_added / date_last_used / meta_info を保持
    if (renames[sid] != null) node.name = renames[sid];
    return node;
  }

  function buildInline(b) {
    return {
      id: nextFolderId(),
      name: b.title || '',
      type: 'url',
      url: b.url || '',
      date_added: chromeTsNow(),
      guid: randomUUID(),
    };
  }

  function buildFolder(spec) {
    folderCount++;
    const children = [];
    for (const id of spec.bookmarkIds || []) {
      const n = cloneUrlNode(id);
      if (n) children.push(n);
    }
    for (const b of spec.bookmarks || []) children.push(buildInline(b));
    for (const sub of spec.folders || []) children.push(buildFolder(sub));
    return {
      id: nextFolderId(),
      name: spec.name || '(無名フォルダ)',
      type: 'folder',
      date_added: chromeTsNow(),
      date_modified: chromeTsNow(),
      guid: randomUUID(),
      children,
    };
  }

  // --- 新しいツリーを構築 ---------------------------------------------------
  const barChildren = [];
  for (const spec of plan.folders || []) barChildren.push(buildFolder(spec));
  for (const id of plan.looseBookmarkIds || []) {
    const n = cloneUrlNode(id);
    if (n) barChildren.push(n);
  }

  // 退避分を含めない「意図的に配置した件数」を確定
  const intentionalPlaced = placedIds.size;

  // データ消失防止: 未割当かつ未削除の既存ブックマークを退避
  const orphanIds = allUrlIds.filter((id) => !placedIds.has(id) && !removedIds.has(id));
  if (orphanIds.length) {
    folderCount++;
    barChildren.push({
      id: nextFolderId(),
      name: '__未整理__',
      type: 'folder',
      date_added: chromeTsNow(),
      date_modified: chromeTsNow(),
      guid: randomUUID(),
      children: orphanIds.map(cloneUrlNode).filter(Boolean),
    });
  }

  // --- ルートへ反映（全件を bookmark_bar に集約、other/synced は空に） ------
  const result = JSON.parse(JSON.stringify(original));
  result.roots.bookmark_bar.children = barChildren;
  result.roots.bookmark_bar.date_modified = chromeTsNow();
  if (result.roots.other) {
    result.roots.other.children = [];
    result.roots.other.date_modified = chromeTsNow();
  }
  if (result.roots.synced) {
    result.roots.synced.children = [];
    result.roots.synced.date_modified = chromeTsNow();
  }
  result.checksum = computeChecksum(rootOrder(result));

  // --- バックアップして書き込み --------------------------------------------
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = opts.backupDir || join(tmpdir(), 'bookmark-organizer');
  mkdirSync(backupDir, { recursive: true });
  const backupPath = join(backupDir, `Bookmarks.backup.${ts}`);
  copyFileSync(target, backupPath);
  writeFileSync(target, JSON.stringify(result, null, 3), 'utf-8'); // Chrome は 3 スペース整形

  out({
    ok: true,
    target,
    backupPath,
    checksumSelfVerified: true,
    chromeRunning: running,
    counts: {
      foldersCreated: folderCount,
      bookmarksPlaced: intentionalPlaced,
      removed: removedIds.size,
      renamed: Object.keys(renames).length,
      orphansMovedToUntriaged: orphanIds.length,
      unknownIds: unknownIds.length,
    },
    warnings: [
      ...(running === null ? ['Chrome の稼働状態を判定できませんでした。Chrome を終了してから実行してください。'] : []),
      ...(orphanIds.length ? [`${orphanIds.length} 件が未割当のため「__未整理__」へ退避しました。`] : []),
      ...(unknownIds.length ? [`${unknownIds.length} 件の ID が元ファイルに見つかりませんでした。`] : []),
    ],
    note: '反映を確認するには Chrome を起動してブックマークを確認してください。元に戻すには backupPath を target へコピーします。',
  });
}

main();
