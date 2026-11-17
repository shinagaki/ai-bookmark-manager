#!/usr/bin/env node
// @ts-nocheck — 依存ゼロの独立スクリプト。TS プロジェクト（src/**）の型検査対象外。
/**
 * extract.mjs — Chrome ブックマーク抽出・前処理（依存ゼロ / Node ESM）
 *
 * 役割:
 *   1. Chrome の Bookmarks ファイルを探索（OS 別 / 複数プロファイル対応）
 *   2. 元ファイルを read-only で読み、タイムスタンプ付きバックアップを複製
 *   3. URL ブックマークをコンパクトなレコードへ平坦化
 *   4. 完全一致 / 正規化 URL の重複候補をグルーピング（保持候補を提案）
 *   5. 規模把握用の統計（総数・深度・ドメイン分布・古い件数など）を付与
 *   6. 結果をコンパクト JSON ファイルへ書き出し、要約を stdout へ
 *
 * 元ロジックの移植元（source of truth）:
 *   - src/utils/default-paths.ts            … パス探索
 *   - src/parsers/bookmark-parser.ts        … Chrome タイムスタンプ変換・平坦化
 *   - src/analyzers/improved-duplicate-analyzer.ts … URL 正規化・重複候補・保持優先度
 *
 * 使い方:
 *   node extract.mjs [--file <Bookmarks path>] [--out-dir <dir>] [--top-domains <n>]
 *
 * 元の Bookmarks は決して書き換えない（複製のみ）。
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, platform, tmpdir } from 'node:os';
import { basename, join } from 'node:path';

const CHROME_EPOCH_OFFSET = 11644473600000000; // microseconds (1601-01-01 → 1970-01-01)
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// 引数パース
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const opts = { file: null, outDir: null, topDomains: 15 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--file' || a === '-f') opts.file = argv[++i];
    else if (a === '--out-dir') opts.outDir = argv[++i];
    else if (a === '--top-domains') opts.topDomains = parseInt(argv[++i], 10) || 15;
  }
  return opts;
}

// ---------------------------------------------------------------------------
// プロファイル探索（src/utils/default-paths.ts の移植 + プロファイル自動列挙）
// ---------------------------------------------------------------------------
function profileBases() {
  const home = homedir();
  const sys = platform();
  const bases = [];
  if (sys === 'win32') {
    bases.push(join(home, 'AppData', 'Local', 'Google', 'Chrome', 'User Data'));
  } else if (sys === 'darwin') {
    bases.push(join(home, 'Library', 'Application Support', 'Google', 'Chrome'));
  } else {
    // linux / その他
    bases.push(join(home, '.config', 'google-chrome'));
    bases.push(join(home, '.config', 'chromium'));
    // WSL: Windows 側の Chrome を /mnt/c から探す
    const mntUsers = '/mnt/c/Users';
    if (existsSync(mntUsers)) {
      for (const user of safeReaddir(mntUsers)) {
        bases.push(join(mntUsers, user, 'AppData', 'Local', 'Google', 'Chrome', 'User Data'));
      }
    }
  }
  return bases.filter(existsSync);
}

function safeReaddir(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function isProfileDir(name) {
  return name === 'Default' || /^Profile\s/.test(name);
}

/** 利用可能な全プロファイルの Bookmarks パスを列挙 */
function findProfiles() {
  const found = [];
  for (const base of profileBases()) {
    for (const entry of safeReaddir(base)) {
      if (!isProfileDir(entry)) continue;
      const bm = join(base, entry, 'Bookmarks');
      if (existsSync(bm)) {
        found.push({ profile: entry, base: basename(base), path: bm });
      }
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// Chrome JSON パース（src/parsers/bookmark-parser.ts の移植）
// ---------------------------------------------------------------------------
function convertTimestamp(chromeTimestamp) {
  if (!chromeTimestamp) return null;
  const ts = parseInt(chromeTimestamp, 10);
  if (!Number.isFinite(ts) || ts === 0) return null;
  const ms = (ts - CHROME_EPOCH_OFFSET) / 1000;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isoDate(d) {
  return d ? d.toISOString().slice(0, 10) : null; // YYYY-MM-DD（判断にはこれで十分・トークン節約）
}

/**
 * Chrome ルートを走査し、URL ノードを平坦化レコードに変換しつつ統計を集計する。
 */
function walk(roots) {
  const records = [];
  let totalFolders = 0;
  let maxDepth = 0;

  function traverse(node, folderTrail, depth) {
    maxDepth = Math.max(maxDepth, depth);
    if (node.type === 'folder') {
      if (depth > 0) totalFolders++; // ルートコンテナ自身は数えない
      const trail = depth === 0 ? folderTrail : [...folderTrail, node.name];
      for (const child of node.children || []) traverse(child, trail, depth + 1);
    } else if (node.type === 'url') {
      const added = convertTimestamp(node.date_added);
      const lastUsed = convertTimestamp(node.date_last_used);
      records.push({
        id: String(node.id),
        title: node.name || '',
        url: node.url || '',
        domain: domainOf(node.url),
        folder: folderTrail.join(' / '),
        added: isoDate(added),
        lastUsed: isoDate(lastUsed),
        _addedMs: added ? added.getTime() : 0,
        _lastUsedMs: lastUsed ? lastUsed.getTime() : 0,
      });
    }
  }

  // roots = [{label, node}]
  for (const { label, node } of roots) {
    traverse(node, [label], 0);
  }
  return { records, totalFolders, maxDepth };
}

function domainOf(url) {
  if (!url) return '(none)';
  if (url.startsWith('javascript:')) return '(bookmarklet)';
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '(invalid)';
  }
}

// ---------------------------------------------------------------------------
// URL 正規化（src/analyzers/improved-duplicate-analyzer.ts の移植）
// ---------------------------------------------------------------------------
const TRACKING_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'fbclid', 'gclid', 'msclkid', 'ref', 'referrer', '_ga', 'mc_eid',
];

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.protocol = 'https:';
    u.hostname = u.hostname.replace(/^www\./, '');
    u.pathname = u.pathname.replace(/\/$/, '') || '/';
    const host = u.hostname.toLowerCase();

    // YouTube: 動画 ID のみで正規化
    if (host.includes('youtube.com') || host.includes('youtu.be')) {
      const videoId = u.searchParams.get('v') || (host.includes('youtu.be') ? u.pathname.slice(1) : null);
      if (videoId) return `https://youtube.com/watch?v=${videoId}`;
    }
    // Amazon: 商品 ID のみ
    if (host.includes('amazon.')) {
      const m = u.pathname.match(/\/dp\/([A-Z0-9]{10})/);
      if (m) return `https://amazon.com/dp/${m[1]}`;
    }
    // GitHub: リポジトリパス（+ tree/commit/blob）
    if (host.includes('github.com')) {
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts.length >= 2) {
        let p = `/${parts[0]}/${parts[1]}`;
        if (parts.length > 2 && ['tree', 'commit', 'blob'].includes(parts[2])) {
          p += `/${parts[2]}/${parts[3] || ''}`;
        }
        return `https://github.com${p}`;
      }
    }

    for (const param of TRACKING_PARAMS) u.searchParams.delete(param);
    u.searchParams.sort();
    return u.toString();
  } catch {
    return url;
  }
}

// 保持優先度（src/analyzers/improved-duplicate-analyzer.ts prioritizeBookmarksInGroup の移植）
function titleQuality(title) {
  let score = 0;
  const len = title.length;
  if (len >= 10 && len <= 50) score += 10;
  else if (len >= 5 && len <= 80) score += 5;
  const descriptive = ['docs', 'guide', 'tutorial', 'reference', 'manual', 'wiki'];
  if (descriptive.some((w) => title.toLowerCase().includes(w))) score += 5;
  if (!/[?&=]/.test(title)) score += 3;
  if (title !== title.toUpperCase() && title !== title.toLowerCase()) score += 2;
  return score;
}

function pickKeep(group) {
  return group.reduce((best, cur) => {
    const bHttps = best.url.startsWith('https://');
    const cHttps = cur.url.startsWith('https://');
    if (cHttps && !bHttps) return cur;
    if (bHttps && !cHttps) return best;

    const bClean = best.url.length - normalizeUrl(best.url).length;
    const cClean = cur.url.length - normalizeUrl(cur.url).length;
    if (cClean < bClean) return cur;
    if (bClean < cClean) return best;

    if (cur._lastUsedMs > best._lastUsedMs) return cur;
    if (best._lastUsedMs > cur._lastUsedMs) return best;

    if (cur._addedMs > best._addedMs) return cur;
    if (best._addedMs > cur._addedMs) return best;

    const bT = titleQuality(best.title);
    const cT = titleQuality(cur.title);
    if (cT > bT) return cur;
    if (bT > cT) return best;

    if ((cur.url.length || Infinity) < (best.url.length || Infinity)) return cur;
    return best;
  });
}

/** 完全一致 + 正規化 URL による重複候補を抽出 */
function findDuplicateCandidates(records) {
  const groups = [];
  const claimed = new Set();

  // 1. 完全一致
  const exact = new Map();
  for (const r of records) {
    if (!r.url) continue;
    if (!exact.has(r.url)) exact.set(r.url, []);
    exact.get(r.url).push(r);
  }
  for (const list of exact.values()) {
    if (list.length > 1) {
      list.forEach((r) => claimed.add(r.id));
      groups.push({ reason: 'exact_url', keepId: pickKeep(list).id, ids: list.map((r) => r.id) });
    }
  }

  // 2. 正規化一致（完全一致で未処理のもの）
  const norm = new Map();
  for (const r of records) {
    if (!r.url || claimed.has(r.id)) continue;
    const n = normalizeUrl(r.url);
    if (n === r.url) continue; // 正規化で変化なし → 完全一致側の対象
    if (!norm.has(n)) norm.set(n, []);
    norm.get(n).push(r);
  }
  for (const list of norm.values()) {
    if (list.length > 1) {
      groups.push({ reason: 'normalized_url', keepId: pickKeep(list).id, ids: list.map((r) => r.id) });
    }
  }

  return groups;
}

// ---------------------------------------------------------------------------
// メイン
// ---------------------------------------------------------------------------
function main() {
  const opts = parseArgs(process.argv.slice(2));

  // --- 対象ファイル決定 -----------------------------------------------------
  let target = opts.file;
  const profiles = findProfiles();
  if (!target) {
    if (profiles.length === 0) {
      output({ ok: false, error: 'Chrome の Bookmarks ファイルが見つかりません。--file で明示指定してください。', profiles: [] });
      process.exit(1);
    }
    if (profiles.length > 1) {
      // 複数プロファイル → Claude に選択させる
      output({ ok: false, needSelection: true, profiles });
      process.exit(0);
    }
    target = profiles[0].path;
  }
  if (!existsSync(target)) {
    output({ ok: false, error: `指定された Bookmarks が存在しません: ${target}`, profiles });
    process.exit(1);
  }

  // --- 読み込み（read-only） ------------------------------------------------
  let chromeData;
  try {
    chromeData = JSON.parse(readFileSync(target, 'utf-8'));
  } catch (e) {
    output({ ok: false, error: `Bookmarks の読み込み/パースに失敗: ${e.message}` });
    process.exit(1);
  }

  const rootDefs = [];
  if (chromeData.roots?.bookmark_bar) rootDefs.push({ label: 'ブックマークバー', node: chromeData.roots.bookmark_bar });
  if (chromeData.roots?.other) rootDefs.push({ label: 'その他のブックマーク', node: chromeData.roots.other });
  if (chromeData.roots?.synced) rootDefs.push({ label: '同期されたブックマーク', node: chromeData.roots.synced });

  const { records, totalFolders, maxDepth } = walk(rootDefs);

  // --- バックアップ複製 -----------------------------------------------------
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = opts.outDir || join(tmpdir(), 'bookmark-organizer');
  mkdirSync(outDir, { recursive: true });
  const backupPath = join(outDir, `Bookmarks.backup.${ts}`);
  copyFileSync(target, backupPath);

  // --- 統計 -----------------------------------------------------------------
  const now = Date.now();
  const domainCounts = new Map();
  let bookmarkletCount = 0;
  let invalidUrlCount = 0;
  let oldCount = 0;
  for (const r of records) {
    domainCounts.set(r.domain, (domainCounts.get(r.domain) || 0) + 1);
    if (r.domain === '(bookmarklet)') bookmarkletCount++;
    if (r.domain === '(invalid)') invalidUrlCount++;
    const recency = r._lastUsedMs || r._addedMs;
    if (recency && now - recency > ONE_YEAR_MS) oldCount++;
  }
  const topDomains = [...domainCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, opts.topDomains)
    .map(([domain, count]) => ({ domain, count }));

  const dupCandidates = findDuplicateCandidates(records);
  const dupBookmarkCount = dupCandidates.reduce((n, g) => n + g.ids.length, 0);

  // 内部フィールドを落としてコンパクト化
  const cleanRecords = records.map(({ _addedMs, _lastUsedMs, ...rest }) => rest);

  const stats = {
    totalBookmarks: records.length,
    totalFolders,
    maxDepth,
    oldCount,
    bookmarkletCount,
    invalidUrlCount,
    duplicateGroupCount: dupCandidates.length,
    duplicateBookmarkCount: dupBookmarkCount,
    topDomains,
  };

  // --- 出力ファイル ---------------------------------------------------------
  const dataPath = join(outDir, `extract-${ts}.json`);
  const payload = {
    ok: true,
    sourceFile: target,
    backupPath,
    extractFile: dataPath,
    generatedAt: ts,
    stats,
    duplicateCandidates: dupCandidates,
    bookmarks: cleanRecords,
  };
  writeFileSync(dataPath, JSON.stringify(payload, null, 2), 'utf-8');

  // stdout には軽量サマリのみ（巨大データは extractFile を Read させる）
  output({
    ok: true,
    sourceFile: target,
    backupPath,
    extractFile: dataPath,
    stats,
    availableProfiles: profiles,
    hint: 'bookmarks 配列と duplicateCandidates は extractFile を Read して参照してください。',
  });
}

function output(obj) {
  process.stdout.write(`${JSON.stringify(obj, null, 2)}\n`);
}

main();
