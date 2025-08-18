import { BookmarkNode, DuplicateGroup } from '../types/bookmark';

export class ImprovedDuplicateAnalyzer {
  /**
   * URL正規化によるより精密な重複検出
   */
  static findDuplicates(bookmarks: BookmarkNode[], threshold: number = 0.8): DuplicateGroup[] {
    const duplicates: DuplicateGroup[] = [];
    const processed = new Set<string>();

    // 1. 完全URL一致による重複検出
    const exactUrlDuplicates = this.findExactUrlDuplicates(bookmarks);
    exactUrlDuplicates.forEach(group => duplicates.push(group));
    exactUrlDuplicates.forEach(group => {
      group.urls.forEach(bookmark => processed.add(bookmark.id));
    });

    // 2. 正規化URL一致による重複検出
    const normalizedUrlDuplicates = this.findNormalizedUrlDuplicates(
      bookmarks.filter(b => !processed.has(b.id))
    );
    normalizedUrlDuplicates.forEach(group => duplicates.push(group));
    normalizedUrlDuplicates.forEach(group => {
      group.urls.forEach(bookmark => processed.add(bookmark.id));
    });

    // 3. 類似URL検出（同一ドメイン内）
    const similarUrlDuplicates = this.findSimilarUrlDuplicates(
      bookmarks.filter(b => !processed.has(b.id)),
      threshold
    );
    similarUrlDuplicates.forEach(group => duplicates.push(group));

    return duplicates.sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * 完全なURL一致による重複検出
   */
  private static findExactUrlDuplicates(bookmarks: BookmarkNode[]): DuplicateGroup[] {
    const urlMap = new Map<string, BookmarkNode[]>();
    
    bookmarks.forEach(bookmark => {
      if (!bookmark.url) return;
      
      if (!urlMap.has(bookmark.url)) {
        urlMap.set(bookmark.url, []);
      }
      urlMap.get(bookmark.url)!.push(bookmark);
    });

    const duplicates: DuplicateGroup[] = [];
    urlMap.forEach((bookmarkList, url) => {
      if (bookmarkList.length > 1) {
        duplicates.push({
          urls: bookmarkList,
          similarity: 1.0,
          reason: 'exact_url'
        });
      }
    });

    return duplicates;
  }

  /**
   * 正規化URL一致による重複検出
   */
  private static findNormalizedUrlDuplicates(bookmarks: BookmarkNode[]): DuplicateGroup[] {
    const normalizedMap = new Map<string, BookmarkNode[]>();
    
    bookmarks.forEach(bookmark => {
      if (!bookmark.url) return;
      
      const normalized = this.normalizeUrl(bookmark.url);
      
      // 正規化前後が同じ場合はスキップ（完全URL一致で既に処理済み）
      if (normalized === bookmark.url) return;
      
      if (!normalizedMap.has(normalized)) {
        normalizedMap.set(normalized, []);
      }
      normalizedMap.get(normalized)!.push(bookmark);
    });

    const duplicates: DuplicateGroup[] = [];
    normalizedMap.forEach((bookmarkList, normalizedUrl) => {
      if (bookmarkList.length > 1) {
        // YouTube等の場合、同じ動画IDでも実際に同じかチェック
        if (this.isActualDuplicate(bookmarkList, normalizedUrl)) {
          duplicates.push({
            urls: bookmarkList,
            similarity: 0.95,
            reason: 'normalized_url'
          });
        }
      }
    });

    return duplicates;
  }

  /**
   * 類似度検出をスキップすべきドメインかどうか
   */
  private static shouldSkipSimilarityDetection(domain: string): boolean {
    const skipDomains = [
      'youtube.com',
      'www.youtube.com',
      'youtu.be',
      'music.youtube.com',
      // 動画系サイト
      'vimeo.com',
      'dailymotion.com',
      'twitch.tv',
      // 商品系サイト（商品ごとに異なるため）
      'amazon.com',
      'amazon.co.jp',
      'amazon.co.uk',
      'ebay.com',
      // ニュース系（記事ごとに異なるため）
      'news.yahoo.com',
      'news.google.com',
      // ソーシャル系（投稿ごとに異なるため）
      'twitter.com',
      'x.com',
      'facebook.com',
      'instagram.com',
      'tiktok.com'
    ];
    
    return skipDomains.some(skipDomain => 
      domain === skipDomain || domain.endsWith('.' + skipDomain)
    );
  }

  /**
   * 実際の重複かどうかを判定（YouTube等のドメイン固有チェック）
   */
  private static isActualDuplicate(bookmarks: BookmarkNode[], normalizedUrl: string): boolean {
    // YouTube URL の場合
    if (normalizedUrl.includes('youtube.com/watch')) {
      try {
        const normalizedUrlObj = new URL(normalizedUrl);
        const videoId = normalizedUrlObj.searchParams.get('v');
        
        // 全てのブックマークが本当に同じ動画IDを持つかチェック
        return bookmarks.every(bookmark => {
          if (!bookmark.url) return false;
          
          try {
            const bookmarkUrl = new URL(bookmark.url);
            const bookmarkVideoId = bookmarkUrl.searchParams.get('v') || 
                                  (bookmarkUrl.hostname.includes('youtu.be') ? bookmarkUrl.pathname.slice(1) : null);
            
            return bookmarkVideoId === videoId;
          } catch {
            return false;
          }
        });
      } catch {
        return false;
      }
    }
    
    // Amazon URL の場合
    if (normalizedUrl.includes('amazon.com/dp/')) {
      const productIdMatch = normalizedUrl.match(/\/dp\/([A-Z0-9]{10})/);
      if (!productIdMatch) return false;
      
      const productId = productIdMatch[1];
      
      return bookmarks.every(bookmark => {
        if (!bookmark.url) return false;
        const bookmarkMatch = bookmark.url.match(/\/dp\/([A-Z0-9]{10})/);
        return bookmarkMatch && bookmarkMatch[1] === productId;
      });
    }
    
    // その他のドメインは正規化結果が同じなら重複とみなす
    return true;
  }

  /**
   * 類似URL検出（同一ドメイン内の類似パス）
   */
  private static findSimilarUrlDuplicates(bookmarks: BookmarkNode[], threshold: number): DuplicateGroup[] {
    const duplicates: DuplicateGroup[] = [];
    const processed = new Set<string>();

    // ドメイン別にグルーピング
    const domainGroups = new Map<string, BookmarkNode[]>();
    bookmarks.forEach(bookmark => {
      if (!bookmark.url || processed.has(bookmark.id)) return;

      try {
        const url = new URL(bookmark.url);
        const domain = url.hostname.toLowerCase();
        
        if (!domainGroups.has(domain)) {
          domainGroups.set(domain, []);
        }
        domainGroups.get(domain)!.push(bookmark);
      } catch {
        // Invalid URL, skip
      }
    });

    // 各ドメイン内で類似URL検出
    domainGroups.forEach((domainBookmarks, domain) => {
      if (domainBookmarks.length < 2) return;

      // YouTube等の特別なドメインは類似度検出をスキップ
      if (this.shouldSkipSimilarityDetection(domain)) {
        return;
      }

      for (let i = 0; i < domainBookmarks.length; i++) {
        if (processed.has(domainBookmarks[i].id)) continue;

        const group: BookmarkNode[] = [domainBookmarks[i]];
        processed.add(domainBookmarks[i].id);

        for (let j = i + 1; j < domainBookmarks.length; j++) {
          if (processed.has(domainBookmarks[j].id)) continue;

          const similarity = this.calculateUrlSimilarity(
            domainBookmarks[i].url!,
            domainBookmarks[j].url!
          );

          if (similarity >= threshold) {
            group.push(domainBookmarks[j]);
            processed.add(domainBookmarks[j].id);
          }
        }

        if (group.length > 1) {
          const avgSimilarity = group.length > 2 
            ? this.calculateAverageSimilarity(group)
            : this.calculateUrlSimilarity(group[0].url!, group[1].url!);

          duplicates.push({
            urls: group,
            similarity: avgSimilarity,
            reason: 'similar_url'
          });
        }
      }
    });

    return duplicates;
  }

  /**
   * URL正規化（重複検出の精度向上）
   */
  private static normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      
      // プロトコルを統一
      urlObj.protocol = 'https:';
      
      // www. プレフィックスを除去
      urlObj.hostname = urlObj.hostname.replace(/^www\./, '');
      
      // 末尾スラッシュを除去
      urlObj.pathname = urlObj.pathname.replace(/\/$/, '') || '/';
      
      // ドメイン固有の正規化
      const hostname = urlObj.hostname.toLowerCase();
      
      // YouTube: 重要なパラメータを保持
      if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) {
        const videoId = urlObj.searchParams.get('v') || 
                       (hostname.includes('youtu.be') ? urlObj.pathname.slice(1) : null);
        if (videoId) {
          // YouTube URLは動画IDのみで正規化
          return `https://youtube.com/watch?v=${videoId}`;
        }
      }
      
      // Amazon: 商品IDを保持
      if (hostname.includes('amazon.')) {
        const pathMatch = urlObj.pathname.match(/\/dp\/([A-Z0-9]{10})/);
        if (pathMatch) {
          return `https://amazon.com/dp/${pathMatch[1]}`;
        }
      }
      
      // GitHub: リポジトリパスとコミット/タグを保持
      if (hostname.includes('github.com')) {
        const pathParts = urlObj.pathname.split('/').filter(p => p);
        if (pathParts.length >= 2) {
          let normalizedPath = `/${pathParts[0]}/${pathParts[1]}`;
          // ブランチやコミットハッシュがある場合は保持
          if (pathParts.length > 2 && ['tree', 'commit', 'blob'].includes(pathParts[2])) {
            normalizedPath += `/${pathParts[2]}/${pathParts[3] || ''}`;
          }
          return `https://github.com${normalizedPath}`;
        }
      }
      
      // 一般的なトラッキングパラメータのみを除去
      const trackingParams = [
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
        'fbclid', 'gclid', 'msclkid', 'ref', 'referrer', '_ga', 'mc_eid'
      ];
      
      trackingParams.forEach(param => {
        urlObj.searchParams.delete(param);
      });
      
      // パラメータをソート
      urlObj.searchParams.sort();
      
      return urlObj.toString();
    } catch {
      return url; // 正規化に失敗した場合は元のURLを返す
    }
  }

  /**
   * URL類似度計算（同一ドメイン内）
   */
  private static calculateUrlSimilarity(url1: string, url2: string): number {
    try {
      const urlObj1 = new URL(url1);
      const urlObj2 = new URL(url2);

      // ドメインが異なる場合は0
      if (urlObj1.hostname.toLowerCase() !== urlObj2.hostname.toLowerCase()) {
        return 0;
      }

      // パス類似度を計算
      const path1 = urlObj1.pathname;
      const path2 = urlObj2.pathname;
      const pathSimilarity = this.calculateStringSimilarity(path1, path2);

      // クエリパラメータ類似度を計算
      const params1 = Array.from(urlObj1.searchParams.keys()).sort();
      const params2 = Array.from(urlObj2.searchParams.keys()).sort();
      const paramSimilarity = this.calculateArraySimilarity(params1, params2);

      // 重み付き平均（パスを重視）
      return pathSimilarity * 0.7 + paramSimilarity * 0.3;

    } catch {
      // URL解析に失敗した場合は文字列類似度を使用
      return this.calculateStringSimilarity(url1, url2);
    }
  }

  /**
   * 文字列類似度計算（レーベンシュタイン距離ベース）
   */
  private static calculateStringSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

  /**
   * 配列類似度計算（共通要素の割合）
   */
  private static calculateArraySimilarity(arr1: string[], arr2: string[]): number {
    if (arr1.length === 0 && arr2.length === 0) return 1.0;
    if (arr1.length === 0 || arr2.length === 0) return 0.0;

    const set1 = new Set(arr1);
    const set2 = new Set(arr2);
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  }

  /**
   * レーベンシュタイン距離計算
   */
  private static levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => 
      Array(str1.length + 1).fill(null)
    );

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator
        );
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * グループ内平均類似度計算
   */
  private static calculateAverageSimilarity(group: BookmarkNode[]): number {
    if (group.length < 2) return 1.0;

    let totalSimilarity = 0;
    let comparisons = 0;

    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const url1 = group[i].url;
        const url2 = group[j].url;
        if (url1 && url2) {
          totalSimilarity += this.calculateUrlSimilarity(url1, url2);
          comparisons++;
        }
      }
    }

    return comparisons > 0 ? totalSimilarity / comparisons : 0;
  }

  /**
   * 重複解決の優先度判定（改善版）
   */
  static prioritizeBookmarksInGroup(group: BookmarkNode[]): BookmarkNode {
    // 優先度の基準（高い順）:
    // 1. HTTPSプロトコル
    // 2. 正規化URL（よりクリーンなURL）
    // 3. 最近使用されている
    // 4. より新しい作成日
    // 5. より短く分かりやすいタイトル

    return group.reduce((best, current) => {
      // 1. HTTPS優先
      const bestIsHttps = best.url?.startsWith('https://') || false;
      const currentIsHttps = current.url?.startsWith('https://') || false;
      
      if (currentIsHttps && !bestIsHttps) return current;
      if (bestIsHttps && !currentIsHttps) return best;

      // 2. 正規化URL優先（よりクリーンなURL = パラメータが少ない）
      const bestNormalized = this.normalizeUrl(best.url || '');
      const currentNormalized = this.normalizeUrl(current.url || '');
      const bestOriginal = best.url || '';
      const currentOriginal = current.url || '';
      
      // 正規化後と元URLの差が少ない方が好ましい（よりクリーン）
      const bestCleanness = bestOriginal.length - bestNormalized.length;
      const currentCleanness = currentOriginal.length - currentNormalized.length;
      
      if (currentCleanness < bestCleanness) return current;
      if (bestCleanness < currentCleanness) return best;

      // 3. 使用日時比較
      const bestLastUsed = best.dateLastUsed?.getTime() || 0;
      const currentLastUsed = current.dateLastUsed?.getTime() || 0;
      
      if (currentLastUsed > bestLastUsed) return current;
      if (bestLastUsed > currentLastUsed) return best;

      // 4. 作成日（新しい方が好ましい）
      const bestAdded = best.dateAdded.getTime();
      const currentAdded = current.dateAdded.getTime();
      
      if (currentAdded > bestAdded) return current;
      if (bestAdded > currentAdded) return best;

      // 5. タイトルの分かりやすさ（短く、説明的）
      const bestTitleScore = this.calculateTitleQuality(best.name);
      const currentTitleScore = this.calculateTitleQuality(current.name);
      
      if (currentTitleScore > bestTitleScore) return current;
      if (bestTitleScore > currentTitleScore) return best;

      // 6. URL長さ（短い方が好ましい）
      const bestUrlLength = best.url?.length || Infinity;
      const currentUrlLength = current.url?.length || Infinity;
      
      if (currentUrlLength < bestUrlLength) return current;
      
      return best;
    });
  }

  /**
   * タイトル品質スコア計算
   */
  private static calculateTitleQuality(title: string): number {
    let score = 0;

    // 適切な長さ（10-50文字）
    const length = title.length;
    if (length >= 10 && length <= 50) {
      score += 10;
    } else if (length >= 5 && length <= 80) {
      score += 5;
    }

    // 説明的な単語を含む
    const descriptiveWords = ['docs', 'guide', 'tutorial', 'reference', 'manual', 'wiki'];
    if (descriptiveWords.some(word => title.toLowerCase().includes(word))) {
      score += 5;
    }

    // 一般的でない文字（URL断片など）を含まない
    if (!/[?&=]/.test(title)) {
      score += 3;
    }

    // 大文字小文字が適切
    if (title !== title.toUpperCase() && title !== title.toLowerCase()) {
      score += 2;
    }

    return score;
  }
}