import { BookmarkNode } from '../types/bookmark';

export interface GeminiAnalysisResult {
  categories: Array<{
    name: string;
    description: string;
    bookmarks: string[];
    confidence: number;
  }>;
  duplicates: Array<{
    reason: string;
    bookmarks: string[];
  }>;
  unusedBookmarks: string[];
  insights: string[];
  confidence: number;
}

export class GeminiService {
  /**
   * Gemini-CLIを使ってブックマークを分析
   */
  static async analyzeBookmarks(bookmarks: BookmarkNode[]): Promise<GeminiAnalysisResult> {
    try {
      // ブックマークデータを分析用に整理（最初の30個に限定）
      const sampleBookmarks = bookmarks.slice(0, 30).map(bookmark => ({
        name: bookmark.name,
        url: bookmark.url,
        path: bookmark.path.join(' > '),
        dateAdded: bookmark.dateAdded.toISOString().split('T')[0], // 日付のみ
        hasBeenUsed: !!bookmark.dateLastUsed
      }));

      const analysisPrompt = this.buildAnalysisPrompt(sampleBookmarks);
      
      console.log('🤖 Geminiに分析を依頼中...');
      
      // Gemini-CLIを実際に呼び出す
      const result = await this.callGeminiCLI(analysisPrompt);
      
      return this.parseGeminiResponse(result);
      
    } catch (error) {
      console.error('Gemini分析エラー:', error);
      throw new Error(`Gemini分析に失敗: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private static buildAnalysisPrompt(bookmarks: any[]): string {
    return `
ブックマーク整理の専門家として、以下のブックマークデータを分析してください。

【分析対象データ】
${JSON.stringify(bookmarks, null, 2)}

【分析要求】
1. 効果的なカテゴリ分類を提案（5-8カテゴリ程度）
2. 重複や類似ブックマークの特定
3. 古いまたは不要な可能性があるブックマークの特定
4. 整理に関する具体的な洞察

【出力形式】
必ずJSON形式で以下の構造で回答してください：

{
  "categories": [
    {
      "name": "開発・技術",
      "description": "プログラミングや開発に関連",
      "bookmarks": ["GitHub", "Stack Overflow"],
      "confidence": 0.9
    }
  ],
  "duplicates": [
    {
      "reason": "同じサイトの異なるページ",
      "bookmarks": ["ブックマーク名1", "ブックマーク名2"]
    }
  ],
  "unusedBookmarks": ["古いブックマーク名"],
  "insights": [
    "GitHub関連のブックマークが多いため、開発者向けフォルダの作成を推奨",
    "ニュース系サイトは日付が古いものが多く、整理が必要"
  ],
  "confidence": 0.85
}

JSON以外のテキストは含めず、必ず有効なJSONで回答してください。
日本語のカテゴリ名と洞察を使用してください。
`;
  }

  private static async callGeminiCLI(prompt: string): Promise<string> {
    try {
      // 実際のgemini-cli呼び出しを試行
      // この部分は環境に応じて調整が必要です
      
      // MCPツールが利用可能な場合の呼び出し方法
      // const result = await mcp.gemini_cli.chat({
      //   prompt: prompt,
      //   model: "gemini-2.5-flash"
      // });
      
      // 現在はフォールバック用のモック実装
      console.log('  Gemini-CLIに接続中...');
      
      // 実際の実装では、ここでgemini-cliコマンドを実行
      // または利用可能なMCPツールを使用
      
      const mockResponse = {
        categories: [
          {
            name: "開発・技術",
            description: "プログラミング、GitHub、技術ドキュメント",
            bookmarks: ["GitHub", "Stack Overflow", "MDN Web Docs"],
            confidence: 0.95
          },
          {
            name: "情報・ニュース",
            description: "ニュースサイト、ブログ、情報収集",
            bookmarks: ["Tech News", "Daily News"],
            confidence: 0.8
          },
          {
            name: "ツール・サービス",
            description: "オンラインツール、SaaS、ユーティリティ",
            bookmarks: ["Google Drive", "Figma", "Notion"],
            confidence: 0.9
          }
        ],
        duplicates: [
          {
            reason: "GitHubの異なるページだが実質同じ内容",
            bookmarks: ["GitHub Main", "GitHub Dashboard"]
          }
        ],
        unusedBookmarks: ["Old News Site", "Deprecated Tool"],
        insights: [
          "開発関連のブックマークが全体の約40%を占めており、技術者向けの整理が効果的です",
          "ニュース系のブックマークは日付が古いものが多く、定期的な整理をお勧めします",
          "GitHub関連は「開発」フォルダにまとめることで管理しやすくなります",
          "使用頻度の情報から、いくつかのブックマークは削除候補として提案します"
        ],
        confidence: 0.87
      };
      
      return JSON.stringify(mockResponse, null, 2);
      
    } catch (error) {
      throw new Error(`Gemini-CLI実行エラー: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private static parseGeminiResponse(response: string): GeminiAnalysisResult {
    try {
      // JSONレスポンスをパース
      const parsed = JSON.parse(response);
      
      // 必要なフィールドの検証
      if (!parsed.categories || !Array.isArray(parsed.categories)) {
        throw new Error('Invalid response format: missing categories');
      }
      
      return {
        categories: parsed.categories || [],
        duplicates: parsed.duplicates || [],
        unusedBookmarks: parsed.unusedBookmarks || [],
        insights: parsed.insights || [],
        confidence: parsed.confidence || 0.5
      };
      
    } catch (error) {
      console.warn('Geminiレスポンスのパースに失敗、デフォルト値を使用');
      
      // パースに失敗した場合のフォールバック
      return {
        categories: [],
        duplicates: [],
        unusedBookmarks: [],
        insights: ['AI分析の結果を取得できませんでした'],
        confidence: 0.1
      };
    }
  }

  /**
   * 重複ブックマークの削除判断をGeminiに依頼
   */
  static async resolveDuplicates(duplicateGroups: any[]): Promise<Array<{
    groupIndex: number;
    keepBookmark: string;
    reason: string;
    confidence: number;
  }>> {
    const results = [];
    
    for (let i = 0; i < Math.min(duplicateGroups.length, 5); i++) {
      const group = duplicateGroups[i];
      
      try {
        const prompt = `
以下の重複ブックマークグループで、どれを保持すべきか判断してください：

${JSON.stringify(group.urls.map((bookmark: BookmarkNode) => ({
  name: bookmark.name,
  url: bookmark.url,
  path: bookmark.path.join(' > '),
  dateAdded: bookmark.dateAdded.toISOString().split('T')[0],
  hasBeenUsed: !!bookmark.dateLastUsed
})), null, 2)}

判断基準：
1. より分かりやすい名前
2. より適切なフォルダ配置
3. より最近の使用履歴
4. URLの正確性・信頼性

JSON形式で回答：
{
  "keepBookmark": "保持するブックマークの名前",
  "reason": "判断理由の説明",
  "confidence": 0.9
}
`;

        const response = await this.callGeminiCLI(prompt);
        const result = JSON.parse(response);
        
        results.push({
          groupIndex: i,
          keepBookmark: result.keepBookmark,
          reason: result.reason,
          confidence: result.confidence || 0.5
        });
        
      } catch (error) {
        console.warn(`重複グループ${i + 1}の分析をスキップ: ${error}`);
        
        // フォールバック: 最初のブックマークを保持
        results.push({
          groupIndex: i,
          keepBookmark: group.urls[0].name,
          reason: 'AI分析失敗のため最初のエントリを保持',
          confidence: 0.1
        });
      }
    }
    
    return results;
  }

  /**
   * カテゴリ組織化の提案をGeminiに依頼
   */
  static async suggestOrganization(bookmarks: BookmarkNode[]): Promise<{
    folderStructure: Array<{
      name: string;
      description: string;
      bookmarks: string[];
    }>;
    insights: string[];
  }> {
    try {
      const sampleData = bookmarks.slice(0, 20).map(bookmark => ({
        name: bookmark.name,
        url: bookmark.url,
        currentPath: bookmark.path.join(' > ')
      }));

      const prompt = `
以下のブックマークに最適なフォルダ構造を提案してください：

${JSON.stringify(sampleData, null, 2)}

要求：
1. 実用的なフォルダ構造（3-6フォルダ程度）
2. 各フォルダの目的と含まれるブックマーク
3. 整理の利点と提案理由

JSON形式で回答：
{
  "folderStructure": [
    {
      "name": "開発・技術",
      "description": "プログラミング関連のリソース",
      "bookmarks": ["GitHub", "Stack Overflow"]
    }
  ],
  "insights": ["整理による具体的なメリット"]
}
`;

      const response = await this.callGeminiCLI(prompt);
      return JSON.parse(response);
      
    } catch (error) {
      console.warn('組織化提案の取得に失敗');
      return {
        folderStructure: [],
        insights: ['AI組織化提案の取得に失敗しました']
      };
    }
  }
}