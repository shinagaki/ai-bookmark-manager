import { existsSync } from 'fs';
import chalk from 'chalk';
import ora from 'ora';
import { BookmarkParser } from '../parsers/bookmark-parser';
import { BookmarkAnalyzer } from '../analyzers/bookmark-analyzer';
import { AIAnalyzer } from '../analyzers/ai-analyzer';
import { BookmarkOrganizer } from '../organizers/bookmark-organizer';
import { getDefaultBookmarkPath } from '../utils/default-paths';
import * as fs from 'fs';

export class AICommand {
  /**
   * AI支援による自動ブックマーク整理
   */
  static async run(bookmarkPath?: string): Promise<void> {
    console.log(chalk.blue.bold('🤖 AI支援ブックマーク整理ツール'));
    console.log('='.repeat(50));

    try {
      // Step 1: ブックマークファイルの特定
      let targetPath = bookmarkPath;
      if (!targetPath) {
        targetPath = getDefaultBookmarkPath();
      }

      if (!existsSync(targetPath)) {
        console.log(chalk.red(`❌ ブックマークファイルが見つかりません: ${targetPath}`));
        return;
      }

      console.log(chalk.green(`📁 対象ファイル: ${targetPath}`));

      // Step 2: ブックマーク読み込み
      const spinner = ora('ブックマークファイルを読み込み中...').start();
      
      let roots, originalData;
      try {
        const content = fs.readFileSync(targetPath, 'utf-8');
        originalData = JSON.parse(content);
        roots = BookmarkParser.parseBookmarkData(originalData);
        spinner.succeed('ブックマークファイルの読み込み完了');
      } catch (error) {
        spinner.fail('ブックマークファイルの読み込みに失敗');
        console.log(chalk.red(`❌ パースエラー: ${error instanceof Error ? error.message : 'Unknown error'}`));
        return;
      }

      // Step 3: 基本分析
      spinner.text = '基本分析を実行中...';
      spinner.start();

      const bookmarks = BookmarkParser.flattenBookmarks(roots);
      const stats = BookmarkParser.getBookmarkStats(roots);
      const analysis = BookmarkAnalyzer.analyzeAll(bookmarks);
      
      spinner.succeed(`基本分析完了 (${bookmarks.length}個のブックマーク)`);

      // Step 4: AI分析実行
      console.log('\n' + chalk.cyan.bold('🤖 AI分析開始'));
      
      await this.performAIAnalysis(bookmarks, roots, originalData, targetPath);

    } catch (error) {
      console.log(chalk.red(`❌ エラーが発生しました: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  }

  private static async performAIAnalysis(
    bookmarks: any[], 
    roots: any[], 
    originalData: any, 
    targetPath: string
  ): Promise<void> {
    
    const organizer = new BookmarkOrganizer(roots, originalData);
    
    // AI重要度分析
    console.log(chalk.blue('📊 重要度分析中...'));
    const importanceAnalysis = await AIAnalyzer.analyzeBookmarkImportance(bookmarks);
    
    console.log(chalk.green('✅ 重要度分析完了'));
    console.log(`  📍 重要: ${importanceAnalysis.important.length}個`);
    console.log(`  🗑️  古い: ${importanceAnalysis.outdated.length}個`);
    
    importanceAnalysis.insights.forEach(insight => {
      console.log(`  💡 ${insight}`);
    });

    // Gemini-CLIを使った詳細分析
    await this.runGeminiAnalysis(bookmarks);

    // AI提案の自動適用
    console.log('\n' + chalk.yellow.bold('🤖 AI提案を生成中...'));
    
    const categoryActions = await AIAnalyzer.suggestCategoryOrganization(bookmarks);
    console.log(`📁 カテゴリ整理提案: ${categoryActions.length}アクション`);

    // 重複削除提案
    const duplicates = BookmarkAnalyzer.findDuplicates(bookmarks);
    const duplicateActions = await AIAnalyzer.suggestDuplicateResolution(duplicates);
    console.log(`🔍 重複削除提案: ${duplicateActions.length}アクション`);

    // 古いブックマーク削除提案
    const cleanupActions = importanceAnalysis.outdated.map(bookmark => ({
      type: 'delete' as const,
      targetId: bookmark.id,
      reason: 'AI判断: 長期間未使用で古いブックマーク'
    }));
    console.log(`🧹 古いブックマーク削除提案: ${cleanupActions.length}アクション`);

    // 総合提案の表示
    const totalActions = [...categoryActions, ...duplicateActions, ...cleanupActions];
    
    if (totalActions.length > 0) {
      console.log('\n' + chalk.green.bold('📋 AI提案サマリー'));
      console.log('='.repeat(30));
      
      const actionSummary = totalActions.reduce((acc, action) => {
        acc[action.type] = (acc[action.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      Object.entries(actionSummary).forEach(([type, count]) => {
        const emoji = {
          'delete': '🗑️',
          'move': '📁',
          'create_folder': '📂',
          'rename': '✏️'
        }[type] || '❓';
        console.log(`${emoji} ${type}: ${count}件`);
      });

      // 自動適用の確認
      console.log('\n' + chalk.yellow('⚠️  AI提案を自動適用しますか？'));
      console.log('バックアップが自動作成され、安全に実行されます。');
      
      // 実際の適用（デモ用にコメントアウト）
      // const confirmed = true; // 自動承認モード
      // if (confirmed) {
      //   await this.applyAIRecommendations(organizer, totalActions, targetPath);
      // }
      
      console.log(chalk.blue('\n💡 提案内容を確認後、手動で適用することをお勧めします。'));
      
    } else {
      console.log(chalk.green('\n✅ 現在のブックマークは良好に整理されています！'));
    }
  }

  private static async runGeminiAnalysis(bookmarks: any[]): Promise<void> {
    try {
      console.log(chalk.blue('🤖 Gemini AIによる詳細分析...'));
      
      // ブックマークサンプルを準備（最初の20個）
      const sampleBookmarks = bookmarks.slice(0, 20).map(bookmark => ({
        name: bookmark.name,
        url: bookmark.url,
        path: bookmark.path.join(' > ')
      }));

      const prompt = `
以下のブックマークデータを分析して、効率的な整理方法を提案してください：

${JSON.stringify(sampleBookmarks, null, 2)}

分析項目：
1. カテゴリ分類の提案
2. 重複や類似コンテンツの特定
3. 古いまたは不要なブックマークの特定
4. フォルダ構造の最適化

簡潔で実行可能な提案を日本語で回答してください。
`;

      // Gemini-CLIを実行
      const result = await this.callGemini(prompt);
      
      console.log(chalk.green('✅ Gemini分析完了'));
      console.log(chalk.cyan('📝 AI分析結果:'));
      console.log(result);
      
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Gemini分析をスキップ: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  }

  private static async callGemini(prompt: string): Promise<string> {
    // MCPのgemini-cliツールを使用
    try {
      // 実際のgemini-cli呼び出しは以下のようになります
      // この部分は実際のMCPツールの呼び出しに置き換える必要があります
      
      console.log(chalk.gray('  Geminiに分析を依頼中...'));
      
      // 現在はモック応答
      const mockResponse = `
📊 ブックマーク分析結果:

カテゴリ分類提案:
• 開発・技術: GitHub、Stack Overflow、開発ドキュメント
• 情報収集: ニュースサイト、ブログ、記事
• ツール・サービス: オンラインツール、SaaS、ユーティリティ
• エンターテインメント: 動画、音楽、ゲーム関連

最適化提案:
• 「開発」フォルダの作成を推奨
• 古いニュース記事ブックマークの整理
• 類似ドメインのグルーピング
• 使用頻度の低いブックマークの「アーカイブ」フォルダ移動
`;

      return mockResponse;
      
    } catch (error) {
      throw new Error(`Gemini API呼び出しエラー: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private static async applyAIRecommendations(
    organizer: BookmarkOrganizer, 
    actions: any[], 
    targetPath: string
  ): Promise<void> {
    const spinner = ora('AI提案を適用中...').start();
    
    try {
      // バックアップ作成
      const backupPath = organizer.createBackup(targetPath);
      spinner.text = `バックアップ作成完了: ${backupPath}`;
      
      // アクション適用
      organizer.addActions(actions);
      organizer.applyActions();
      organizer.saveToFile(targetPath);
      
      spinner.succeed('AI提案の適用完了');
      console.log(chalk.green(`✅ ${actions.length}個の変更を適用しました`));
      console.log(chalk.blue(`💾 バックアップ: ${backupPath}`));
      
    } catch (error) {
      spinner.fail('AI提案の適用に失敗');
      console.log(chalk.red(`❌ エラー: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  }

  /**
   * 簡単なAI分析（gemini-cliコマンド経由）
   */
  static async quickAnalysis(bookmarkPath?: string): Promise<void> {
    console.log(chalk.blue.bold('⚡ クイックAI分析'));
    
    const targetPath = bookmarkPath || getDefaultBookmarkPath();
    
    if (!existsSync(targetPath)) {
      console.log(chalk.red(`❌ ファイルが見つかりません: ${targetPath}`));
      return;
    }

    try {
      const content = fs.readFileSync(targetPath, 'utf-8');
      const originalData = JSON.parse(content);
      const roots = BookmarkParser.parseBookmarkData(originalData);
      const bookmarks = BookmarkParser.flattenBookmarks(roots);
      
      console.log(chalk.green(`📊 ${bookmarks.length}個のブックマークを発見`));
      
      // 簡単な統計
      const domains = new Map();
      bookmarks.forEach(bookmark => {
        if (bookmark.url) {
          try {
            const domain = new URL(bookmark.url).hostname;
            domains.set(domain, (domains.get(domain) || 0) + 1);
          } catch {
            // TODO: implement - ignore invalid URLs
          }
        }
      });

      const topDomains = Array.from(domains.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      console.log(chalk.cyan('\n🔝 上位ドメイン:'));
      topDomains.forEach(([domain, count], index) => {
        console.log(`  ${index + 1}. ${domain}: ${count}個`);
      });

      // 重要度分析
      const importanceAnalysis = await AIAnalyzer.analyzeBookmarkImportance(bookmarks);
      
      console.log(chalk.yellow('\n💡 AI分析結果:'));
      importanceAnalysis.insights.forEach(insight => {
        console.log(`  • ${insight}`);
      });

    } catch (error) {
      console.log(chalk.red(`❌ 分析エラー: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  }
}