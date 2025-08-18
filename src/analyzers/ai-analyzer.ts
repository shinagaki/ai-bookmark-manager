import { BookmarkNode, CategorySuggestion, OrganizationAction } from '../types/bookmark';

export interface AIAnalysisResult {
  categoryRecommendations: CategorySuggestion[];
  organizationActions: OrganizationAction[];
  insights: string[];
  confidence: number;
}

export class AIAnalyzer {
  /**
   * AIを使ってブックマークの内容を分析し、適切なカテゴリを提案
   */
  static async analyzeBookmarkContent(bookmarks: BookmarkNode[]): Promise<AIAnalysisResult> {
    try {
      // ブックマークデータを分析用に整理
      const bookmarkData = bookmarks.map(bookmark => ({
        name: bookmark.name,
        url: bookmark.url,
        path: bookmark.path.join(' > '),
        dateAdded: bookmark.dateAdded.toISOString(),
        dateLastUsed: bookmark.dateLastUsed?.toISOString() || null
      }));

      // Gemini APIに送信するプロンプト
      const analysisPrompt = `
以下のブックマークデータを分析して、効率的な整理方法を提案してください。

【分析対象】
${JSON.stringify(bookmarkData.slice(0, 50), null, 2)}

【分析項目】
1. カテゴリ分類の提案（開発、ニュース、エンターテインメント、ショッピング、etc）
2. 重複や類似ブックマークの特定
3. 使用頻度が低い古いブックマークの特定
4. フォルダ構造の最適化提案

【出力形式】
JSON形式で以下の構造で回答してください：
{
  "categories": [
    {
      "name": "カテゴリ名",
      "description": "カテゴリの説明",
      "bookmarks": ["ブックマーク名のリスト"],
      "confidence": 0.9
    }
  ],
  "duplicates": [
    {
      "reason": "重複理由",
      "bookmarks": ["重複ブックマーク名のリスト"]
    }
  ],
  "unusedBookmarks": ["長期間未使用のブックマーク名のリスト"],
  "insights": ["分析結果の洞察"],
  "confidence": 0.85
}

日本語で回答してください。
`;

      console.log('🤖 AIによるブックマーク分析を開始...');
      
      // この部分は実際のgemini-cli呼び出しに置き換える予定
      // 現在はモック実装
      const mockResult: AIAnalysisResult = {
        categoryRecommendations: [
          {
            name: "開発・技術",
            bookmarks: bookmarks.filter(b => 
              b.url?.includes('github') || 
              b.url?.includes('stackoverflow') ||
              b.name.toLowerCase().includes('dev')
            ),
            confidence: 0.9,
            pattern: 'keyword',
            description: 'プログラミングや開発に関連するサイト'
          },
          {
            name: "ニュース・情報",
            bookmarks: bookmarks.filter(b => 
              b.url?.includes('news') || 
              b.url?.includes('article') ||
              b.name.includes('ニュース')
            ),
            confidence: 0.8,
            pattern: 'keyword',
            description: 'ニュースや情報収集サイト'
          }
        ],
        organizationActions: [],
        insights: [
          'GitHub関連のブックマークが多く、開発者向けの整理が効果的です',
          '古いニュースサイトのブックマークがいくつか見つかりました',
          'ドメイン別にグルーピングすることで管理しやすくなります'
        ],
        confidence: 0.85
      };

      return mockResult;

    } catch (error) {
      console.error('AI分析エラー:', error);
      throw new Error(`AI分析に失敗しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * AIに重複ブックマークの削除判断を依頼
   */
  static async suggestDuplicateResolution(duplicates: any[]): Promise<OrganizationAction[]> {
    const actions: OrganizationAction[] = [];

    for (const group of duplicates.slice(0, 5)) { // 最初の5グループのみ分析
      try {
        const bookmarkInfo = group.urls.map((bookmark: BookmarkNode) => ({
          id: bookmark.id,
          name: bookmark.name,
          url: bookmark.url,
          path: bookmark.path.join(' > '),
          dateAdded: bookmark.dateAdded.toISOString(),
          dateLastUsed: bookmark.dateLastUsed?.toISOString() || null
        }));

        const prompt = `
以下の重複ブックマークグループで、どれを残すべきか判断してください：

${JSON.stringify(bookmarkInfo, null, 2)}

判断基準：
1. より詳細で分かりやすい名前
2. より適切なフォルダ配置
3. より最近使用されている
4. URLの正確性

JSON形式で回答：
{
  "keepBookmarkId": "残すブックマークのID",
  "reason": "判断理由",
  "confidence": 0.9
}
`;

        // 現在はシンプルな判断ロジック（最新使用日時ベース）
        const latestUsed = group.urls.reduce((latest: BookmarkNode, current: BookmarkNode) => {
          const latestDate = latest.dateLastUsed || latest.dateAdded;
          const currentDate = current.dateLastUsed || current.dateAdded;
          return currentDate > latestDate ? current : latest;
        });

        group.urls.forEach((bookmark: BookmarkNode) => {
          if (bookmark.id !== latestUsed.id) {
            actions.push({
              type: 'delete',
              targetId: bookmark.id,
              reason: `AI判断: より新しい同様のブックマーク(${latestUsed.name})を保持`
            });
          }
        });

      } catch (error) {
        console.warn(`重複グループの分析をスキップ: ${error}`);
      }
    }

    return actions;
  }

  /**
   * AIによるカテゴリ別整理提案
   */
  static async suggestCategoryOrganization(bookmarks: BookmarkNode[]): Promise<OrganizationAction[]> {
    const actions: OrganizationAction[] = [];

    try {
      const analysisResult = await this.analyzeBookmarkContent(bookmarks);
      
      for (const category of analysisResult.categoryRecommendations) {
        if (category.confidence > 0.7 && category.bookmarks.length >= 3) {
          // フォルダ作成アクション
          actions.push({
            type: 'create_folder',
            targetId: `ai_folder_${category.name}_${Date.now()}`,
            newName: category.name,
            reason: `AI提案: ${category.description} (信頼度: ${(category.confidence * 100).toFixed(1)}%)`
          });

          // ブックマーク移動アクション
          category.bookmarks.forEach(bookmark => {
            actions.push({
              type: 'move',
              targetId: bookmark.id,
              destination: category.name,
              reason: `AI分類: ${category.name}に最適`
            });
          });
        }
      }

    } catch (error) {
      console.warn(`AIカテゴリ分析をスキップ: ${error}`);
    }

    return actions;
  }

  /**
   * AIによる使用頻度と重要度の分析
   */
  static async analyzeBookmarkImportance(bookmarks: BookmarkNode[]): Promise<{
    important: BookmarkNode[];
    outdated: BookmarkNode[];
    insights: string[];
  }> {
    const now = new Date();
    const sixMonthsAgo = new Date(now.getTime() - 6 * 30 * 24 * 60 * 60 * 1000);
    const oneYearAgo = new Date(now.getTime() - 12 * 30 * 24 * 60 * 60 * 1000);

    // 重要なドメインのパターン
    const importantDomains = [
      'github.com', 'stackoverflow.com', 'docs.google.com',
      'notion.so', 'figma.com', 'slack.com', 'zoom.us'
    ];

    // 古いまたは使用頻度の低いドメインのパターン
    const outdatedPatterns = [
      'plus.google.com', 'orkut.com', 'friendster.com',
      'myspace.com', 'del.icio.us'
    ];

    const important = bookmarks.filter(bookmark => {
      if (!bookmark.url) return false;
      
      // 最近使用されている
      const recentlyUsed = bookmark.dateLastUsed && bookmark.dateLastUsed > sixMonthsAgo;
      
      // 重要なドメイン
      const isImportantDomain = importantDomains.some(domain => 
        bookmark.url!.includes(domain)
      );

      // 開発関連キーワード
      const isDev = bookmark.name.toLowerCase().match(/(api|docs|github|stack|dev|code|programming)/);

      return recentlyUsed || isImportantDomain || isDev;
    });

    const outdated = bookmarks.filter(bookmark => {
      if (!bookmark.url) return false;

      // 1年以上未使用
      const oldAndUnused = !bookmark.dateLastUsed || bookmark.dateLastUsed < oneYearAgo;
      
      // 古いサービス
      const isOutdatedService = outdatedPatterns.some(pattern => 
        bookmark.url!.includes(pattern)
      );

      // 非HTTPSサイト（セキュリティ上古い可能性）
      const isHttp = bookmark.url.startsWith('http://');

      return (oldAndUnused && bookmark.dateAdded < oneYearAgo) || isOutdatedService || isHttp;
    });

    const insights = [
      `${important.length}個の重要なブックマークを特定しました`,
      `${outdated.length}個の古いまたは不要な可能性のあるブックマークを発見しました`,
      '重要なブックマークは「重要」フォルダに移動することをお勧めします',
      '古いブックマークは削除を検討してください'
    ];

    return { important, outdated, insights };
  }
}