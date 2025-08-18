import { BookmarkNode, DuplicateGroup, CategorySuggestion, BookmarkAnalysis, LinkCheckResult, LinkStatus } from '../types/bookmark';
import { URL } from 'url';
import { ImprovedDuplicateAnalyzer } from './improved-duplicate-analyzer';

export class BookmarkAnalyzer {
  private static calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const distance = this.levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  }

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

  static findDuplicates(bookmarks: BookmarkNode[], threshold: number = 0.8): DuplicateGroup[] {
    // 改良版重複検出を使用
    return ImprovedDuplicateAnalyzer.findDuplicates(bookmarks, threshold);
  }

  /**
   * 重複解決の推奨アクションを生成
   */
  static suggestDuplicateResolution(duplicates: DuplicateGroup[]): Array<{
    group: DuplicateGroup;
    keepBookmark: BookmarkNode;
    removeBookmarks: BookmarkNode[];
    reason: string;
  }> {
    return duplicates.map(group => {
      const keepBookmark = ImprovedDuplicateAnalyzer.prioritizeBookmarksInGroup(group.urls);
      const removeBookmarks = group.urls.filter(b => b.id !== keepBookmark.id);
      
      let reason = '';
      switch (group.reason) {
        case 'exact_url':
          reason = '完全に同じURLの重複ブックマーク';
          break;
        case 'similar_url':
          reason = '類似URLの重複ブックマーク';
          break;
        case 'exact_title':
          reason = '同じタイトルの重複ブックマーク';
          break;
        default:
          reason = '類似ブックマーク';
      }

      return {
        group,
        keepBookmark,
        removeBookmarks,
        reason
      };
    });
  }

  private static comparBookmarks(bookmark1: BookmarkNode, bookmark2: BookmarkNode): {
    score: number;
    reason: 'exact_url' | 'exact_title' | 'similar_title' | 'similar_url';
  } {
    if (!bookmark1.url || !bookmark2.url) {
      return { score: 0, reason: 'exact_url' };
    }

    // 完全にURLが一致
    if (bookmark1.url === bookmark2.url) {
      return { score: 1.0, reason: 'exact_url' };
    }

    // 完全にタイトルが一致
    if (bookmark1.name === bookmark2.name) {
      return { score: 0.9, reason: 'exact_title' };
    }

    // タイトルの類似度
    const titleSimilarity = this.calculateSimilarity(
      bookmark1.name.toLowerCase(),
      bookmark2.name.toLowerCase()
    );

    // URLの類似度（ドメイン比較）
    try {
      const url1 = new URL(bookmark1.url);
      const url2 = new URL(bookmark2.url);
      
      if (url1.hostname === url2.hostname) {
        const pathSimilarity = this.calculateSimilarity(url1.pathname, url2.pathname);
        if (pathSimilarity > titleSimilarity) {
          return { score: pathSimilarity * 0.8, reason: 'similar_url' };
        }
      }
    } catch (error) {
      // URL parsing failed, continue with title similarity
    }

    return { score: titleSimilarity, reason: 'similar_title' };
  }

  static async checkLinks(bookmarks: BookmarkNode[], concurrency: number = 5): Promise<LinkCheckResult[]> {
    const results: LinkCheckResult[] = [];
    const chunks = this.chunk(bookmarks, concurrency);

    for (const chunk of chunks) {
      const promises = chunk.map(bookmark => this.checkSingleLink(bookmark));
      const chunkResults = await Promise.all(promises);
      results.push(...chunkResults);
    }

    return results;
  }

  private static chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private static async checkSingleLink(bookmark: BookmarkNode): Promise<LinkCheckResult> {
    if (!bookmark.url) {
      return {
        bookmark,
        status: 'error',
        error: 'No URL provided'
      };
    }

    // JavaScriptブックマークレットをスキップ
    if (bookmark.url.startsWith('javascript:')) {
      return {
        bookmark,
        status: 'ok'
      };
    }

    try {
      const startTime = Date.now();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒タイムアウト

      const response = await fetch(bookmark.url, {
        method: 'HEAD',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;

      if (response.ok) {
        return {
          bookmark,
          status: 'ok',
          statusCode: response.status,
          responseTime
        };
      } else if (response.status >= 300 && response.status < 400) {
        return {
          bookmark,
          status: 'redirect',
          statusCode: response.status,
          redirectUrl: response.headers.get('location') || undefined,
          responseTime
        };
      } else {
        return {
          bookmark,
          status: 'dead',
          statusCode: response.status,
          responseTime
        };
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          bookmark,
          status: 'timeout',
          error: 'Request timeout'
        };
      }

      return {
        bookmark,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  static suggestCategories(bookmarks: BookmarkNode[]): CategorySuggestion[] {
    const categories: CategorySuggestion[] = [];
    
    // 1. ブックマークレット専用カテゴリ
    const bookmarklets = bookmarks.filter(bookmark => 
      bookmark.url?.startsWith('javascript:')
    );
    
    if (bookmarklets.length > 0) {
      categories.push({
        name: 'ブックマークレット',
        bookmarks: bookmarklets,
        confidence: 1.0,
        pattern: 'bookmarklet',
        description: `JavaScriptブックマークレット（${bookmarklets.length}個）`
      });
    }

    // ブックマークレット以外のブックマークで分析
    const regularBookmarks = bookmarks.filter(bookmark => 
      !bookmark.url?.startsWith('javascript:')
    );

    // 2. 内容ベースの高精度キーワード分析
    const contentCategories = this.analyzeContentBasedCategories(regularBookmarks);
    categories.push(...contentCategories);

    // 3. ドメインベースのカテゴリ（補完用）
    const domainCategories = this.analyzeDomainBasedCategories(regularBookmarks);
    categories.push(...domainCategories);

    // 重複を除去して信頼度でソート
    return this.deduplicateCategories(categories);
  }

  /**
   * 内容ベースの詳細なカテゴリ分析
   */
  private static analyzeContentBasedCategories(bookmarks: BookmarkNode[]): CategorySuggestion[] {
    const categories: CategorySuggestion[] = [];

    // 詳細なキーワードパターン
    const contentPatterns = {
      'プログラミング・開発': {
        keywords: ['programming', 'code', 'coding', 'developer', 'development', 'software', 'engineer', 'プログラミング', '開発', 'コーディング'],
        urlPatterns: ['/docs/', '/api/', '/tutorial/', '/guide/', '/documentation/'],
        titlePatterns: ['API', 'SDK', 'framework', 'library', 'documentation', 'tutorial', 'guide']
      },
      'GitHub・ソースコード': {
        keywords: ['github', 'gitlab', 'bitbucket', 'repository', 'repo', 'source', 'リポジトリ'],
        urlPatterns: ['github.com', 'gitlab.com', 'bitbucket.org'],
        titlePatterns: ['GitHub', 'GitLab', 'repository', 'repo']
      },
      'ドキュメント・リファレンス': {
        keywords: ['docs', 'documentation', 'reference', 'manual', 'wiki', 'ドキュメント', 'リファレンス', 'マニュアル'],
        urlPatterns: ['/docs/', '/documentation/', '/reference/', '/manual/', '/wiki/'],
        titlePatterns: ['Documentation', 'Reference', 'Manual', 'Wiki', 'Docs']
      },
      'チュートリアル・学習': {
        keywords: ['tutorial', 'learn', 'course', 'lesson', 'training', 'education', 'チュートリアル', '学習', '講座'],
        urlPatterns: ['/tutorial/', '/learn/', '/course/', '/training/'],
        titlePatterns: ['Tutorial', 'Learn', 'Course', 'Lesson', 'Training']
      },
      'ニュース・記事': {
        keywords: ['news', 'article', 'blog', 'post', 'story', 'report', 'ニュース', '記事', 'ブログ'],
        urlPatterns: ['/news/', '/blog/', '/article/', '/post/'],
        titlePatterns: ['News', 'Article', 'Blog', 'Post']
      },
      'ツール・ユーティリティ': {
        keywords: ['tool', 'utility', 'converter', 'generator', 'calculator', 'editor', 'ツール', 'エディタ', '変換'],
        urlPatterns: ['/tool/', '/utility/', '/converter/', '/generator/'],
        titlePatterns: ['Tool', 'Utility', 'Converter', 'Generator', 'Calculator', 'Editor']
      },
      'デザイン・UI/UX': {
        keywords: ['design', 'ui', 'ux', 'interface', 'wireframe', 'mockup', 'prototype', 'デザイン'],
        urlPatterns: ['/design/', '/ui/', '/ux/'],
        titlePatterns: ['Design', 'UI', 'UX', 'Interface', 'Wireframe', 'Mockup']
      },
      'データベース・SQL': {
        keywords: ['database', 'sql', 'mysql', 'postgresql', 'mongodb', 'データベース'],
        urlPatterns: ['/database/', '/sql/'],
        titlePatterns: ['Database', 'SQL', 'MySQL', 'PostgreSQL', 'MongoDB']
      },
      'AI・機械学習': {
        keywords: ['ai', 'ml', 'machine learning', 'artificial intelligence', 'deep learning', 'neural', '機械学習', '人工知能'],
        urlPatterns: ['/ai/', '/ml/', '/machine-learning/'],
        titlePatterns: ['AI', 'ML', 'Machine Learning', 'Deep Learning', 'Neural']
      },
      'クラウド・インフラ': {
        keywords: ['cloud', 'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'devops', 'クラウド'],
        urlPatterns: ['/cloud/', '/aws/', '/azure/', '/gcp/'],
        titlePatterns: ['Cloud', 'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes']
      },
      'セキュリティ': {
        keywords: ['security', 'vulnerability', 'penetration', 'encryption', 'authentication', 'セキュリティ', '脆弱性'],
        urlPatterns: ['/security/', '/vulnerability/'],
        titlePatterns: ['Security', 'Vulnerability', 'Encryption', 'Authentication']
      },
      'エンターテインメント': {
        keywords: ['video', 'music', 'movie', 'game', 'entertainment', 'youtube', '動画', '音楽', 'ゲーム'],
        urlPatterns: ['youtube.com', '/video/', '/music/', '/game/'],
        titlePatterns: ['YouTube', 'Video', 'Music', 'Movie', 'Game']
      },
      'ショッピング・EC': {
        keywords: ['shop', 'store', 'buy', 'purchase', 'cart', 'price', 'amazon', 'ショッピング', '購入'],
        urlPatterns: ['amazon.com', 'amazon.co.jp', '/shop/', '/store/', '/buy/'],
        titlePatterns: ['Amazon', 'Shop', 'Store', 'Buy', 'Purchase']
      },
      'ソーシャル・SNS': {
        keywords: ['social', 'twitter', 'facebook', 'instagram', 'linkedin', 'sns', 'ソーシャル'],
        urlPatterns: ['twitter.com', 'x.com', 'facebook.com', 'instagram.com', 'linkedin.com'],
        titlePatterns: ['Twitter', 'Facebook', 'Instagram', 'LinkedIn', 'Social']
      }
    };

    Object.entries(contentPatterns).forEach(([categoryName, pattern]) => {
      const matchingBookmarks = bookmarks.filter((bookmark: BookmarkNode) => {
        const score = this.calculateContentScore(bookmark, pattern);
        return score > 0;
      });

      if (matchingBookmarks.length >= 2) {
        // 平均スコアを計算して信頼度とする
        const avgScore = matchingBookmarks.reduce((sum: number, bookmark: BookmarkNode) => 
          sum + this.calculateContentScore(bookmark, pattern), 0
        ) / matchingBookmarks.length;

        const confidence = Math.min(0.95, 0.6 + (avgScore / 10) * 0.3);

        categories.push({
          name: categoryName,
          bookmarks: matchingBookmarks,
          confidence,
          pattern: 'keyword',
          description: `内容分析によるカテゴリ分類（${matchingBookmarks.length}個、信頼度${Math.round(confidence * 100)}%）`
        });
      }
    });

    return categories;
  }

  /**
   * ブックマークのコンテンツスコア計算
   */
  private static calculateContentScore(bookmark: BookmarkNode, pattern: any): number {
    let score = 0;
    const title = bookmark.name.toLowerCase();
    const url = bookmark.url?.toLowerCase() || '';

    // タイトルキーワードマッチ（高重み）
    pattern.keywords.forEach((keyword: string) => {
      if (title.includes(keyword.toLowerCase())) {
        score += 3;
      }
    });

    // URLパターンマッチ（中重み）
    pattern.urlPatterns.forEach((urlPattern: string) => {
      if (url.includes(urlPattern.toLowerCase())) {
        score += 2;
      }
    });

    // タイトルパターンマッチ（中重み）
    pattern.titlePatterns.forEach((titlePattern: string) => {
      if (title.includes(titlePattern.toLowerCase())) {
        score += 2;
      }
    });

    return score;
  }

  /**
   * ドメインベースのカテゴリ分析（補完用）
   */
  private static analyzeDomainBasedCategories(bookmarks: BookmarkNode[]): CategorySuggestion[] {
    const categories: CategorySuggestion[] = [];
    const domainGroups = new Map<string, BookmarkNode[]>();

    bookmarks.forEach(bookmark => {
      if (!bookmark.url) return;

      try {
        const url = new URL(bookmark.url);
        const domain = url.hostname.replace(/^www\./, '');
        
        if (!domainGroups.has(domain)) {
          domainGroups.set(domain, []);
        }
        domainGroups.get(domain)!.push(bookmark);
      } catch (error) {
        // Invalid URL, skip
      }
    });

    domainGroups.forEach((bookmarkList, domain) => {
      if (bookmarkList.length >= 3) {
        const category = this.categorizeDomain(domain);
        categories.push({
          name: category || domain,
          bookmarks: bookmarkList,
          confidence: bookmarkList.length >= 5 ? 0.7 : 0.5, // ドメインベースは信頼度を下げる
          pattern: 'domain',
          description: `${domain}からの${bookmarkList.length}個のブックマーク（ドメインベース）`
        });
      }
    });

    return categories;
  }

  /**
   * カテゴリの重複除去
   */
  private static deduplicateCategories(categories: CategorySuggestion[]): CategorySuggestion[] {
    const seen = new Set<string>();
    const deduplicated: CategorySuggestion[] = [];

    // 信頼度の高い順にソート
    const sorted = categories.sort((a, b) => b.confidence - a.confidence);

    for (const category of sorted) {
      const bookmarkIds = category.bookmarks.map(b => b.id).sort().join(',');
      
      if (!seen.has(bookmarkIds)) {
        seen.add(bookmarkIds);
        deduplicated.push(category);
      }
    }

    return deduplicated;
  }

  private static categorizeDomain(domain: string): string | null {
    const domainCategories: { [key: string]: string } = {
      'github.com': '開発・技術',
      'stackoverflow.com': '開発・技術',
      'qiita.com': '開発・技術',
      'zenn.dev': '開発・技術',
      'youtube.com': 'エンターテインメント',
      'twitter.com': 'ソーシャル',
      'x.com': 'ソーシャル',
      'facebook.com': 'ソーシャル',
      'instagram.com': 'ソーシャル',
      'amazon.co.jp': 'ショッピング',
      'amazon.com': 'ショッピング',
      'rakuten.co.jp': 'ショッピング',
      'nikkei.com': 'ニュース・情報',
      'asahi.com': 'ニュース・情報',
      'mainichi.jp': 'ニュース・情報'
    };

    return domainCategories[domain] || null;
  }

  static findUnusedBookmarks(bookmarks: BookmarkNode[], monthsThreshold: number = 6): BookmarkNode[] {
    const threshold = new Date();
    threshold.setMonth(threshold.getMonth() - monthsThreshold);

    return bookmarks.filter(bookmark => {
      if (!bookmark.dateLastUsed) {
        // 使用履歴がない場合は、作成から指定期間が経過しているかチェック
        return bookmark.dateAdded < threshold;
      }
      return bookmark.dateLastUsed < threshold;
    });
  }

  static analyzeAll(bookmarks: BookmarkNode[]): Omit<BookmarkAnalysis, 'deadLinks'> {
    const duplicates = this.findDuplicates(bookmarks);
    const categories = this.suggestCategories(bookmarks);
    const unusedBookmarks = this.findUnusedBookmarks(bookmarks);

    const sortedByDate = [...bookmarks].sort((a, b) => a.dateAdded.getTime() - b.dateAdded.getTime());
    const oldestBookmark = sortedByDate[0];
    const newestBookmark = sortedByDate[sortedByDate.length - 1];

    return {
      totalBookmarks: bookmarks.length,
      totalFolders: 0, // Will be calculated by caller
      duplicates,
      categories,
      unusedBookmarks,
      statistics: {
        avgBookmarksPerFolder: 0, // Will be calculated by caller
        maxDepth: 0, // Will be calculated by caller
        oldestBookmark,
        newestBookmark
      }
    };
  }
}