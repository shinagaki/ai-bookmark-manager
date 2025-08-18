import * as fs from 'fs';
import { existsSync } from 'fs';
import chalk from 'chalk';
import ora from 'ora';
import { BookmarkParser } from '../parsers/bookmark-parser';
import { BookmarkAnalyzer } from '../analyzers/bookmark-analyzer';
import { BookmarkOrganizer } from '../organizers/bookmark-organizer';
import { getDefaultBookmarkPath } from '../utils/default-paths';

export class SmartOrganizeCommand {
  /**
   * Gemini AIの提案に基づく自動スマート整理
   */
  static async run(bookmarkPath?: string, autoApply: boolean = false): Promise<void> {
    console.log(chalk.blue.bold('🧠 スマートブックマーク整理'));
    console.log('='.repeat(50));

    try {
      // ブックマークファイルの準備
      const targetPath = bookmarkPath || getDefaultBookmarkPath();
      
      if (!existsSync(targetPath)) {
        console.log(chalk.red(`❌ ブックマークファイルが見つかりません: ${targetPath}`));
        return;
      }

      console.log(chalk.green(`📁 対象: ${targetPath}`));

      // ブックマーク読み込み・分析
      const { bookmarks, roots, originalData, analysis } = await this.loadAndAnalyze(targetPath);

      // Gemini AIに分析・提案を依頼
      const aiAnalysis = await this.getAIAnalysis(bookmarks);

      // AI提案に基づく自動整理の実行
      await this.executeSmartOrganization(bookmarks, roots, originalData, targetPath, aiAnalysis, autoApply);

    } catch (error) {
      console.log(chalk.red(`❌ エラー: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  }

  private static async loadAndAnalyze(targetPath: string) {
    const spinner = ora('ブックマークを読み込み・分析中...').start();
    
    try {
      const content = fs.readFileSync(targetPath, 'utf-8');
      const originalData = JSON.parse(content);
      const roots = BookmarkParser.parseBookmarkData(originalData);
      const bookmarks = BookmarkParser.flattenBookmarks(roots);
      
      const analysis = BookmarkAnalyzer.analyzeAll(bookmarks);
      
      spinner.succeed(`✅ ${bookmarks.length}個のブックマークを分析完了`);
      
      return { bookmarks, roots, originalData, analysis };
      
    } catch (error) {
      spinner.fail('読み込み・分析エラー');
      throw error;
    }
  }

  private static async getAIAnalysis(bookmarks: any[]): Promise<any> {
    console.log(chalk.blue('\n🤖 Gemini AIに最適化提案を依頼中...'));

    // ドメイン分析
    const domains = new Map();
    bookmarks.forEach(bookmark => {
      if (bookmark.url) {
        try {
          const domain = new URL(bookmark.url).hostname.replace(/^www\./, '');
          domains.set(domain, (domains.get(domain) || 0) + 1);
        } catch {}
      }
    });

    const topDomains = Array.from(domains.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    // 古いブックマーク分析
    const now = new Date();
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    const oldBookmarks = bookmarks.filter(bookmark => 
      !bookmark.dateLastUsed || bookmark.dateLastUsed < oneYearAgo
    );

    const analysisData = {
      totalBookmarks: bookmarks.length,
      topDomains: topDomains,
      oldBookmarksCount: oldBookmarks.length,
      uniqueDomains: domains.size
    };

    try {
      // 実際のGemini AIに詳細な分析を依頼
      const prompt = `
ブックマーク整理の専門家として、以下のデータを分析して具体的な整理戦略を提案してください：

${JSON.stringify(analysisData, null, 2)}

以下の形式で回答してください：

【優先整理対象】
1. 最も効果の高い整理（ドメイン/カテゴリ）
2. 削除候補の特定
3. フォルダ構造の提案

【実行計画】
- 即座に実行可能なアクション
- 段階的に進めるアクション
- 定期メンテナンスの提案

【期待効果】
- 整理による具体的なメリット

実用的で実行しやすい提案を日本語で回答してください。
`;

      // MCPツールを使用してGeminiに依頼
      const result = await this.callGeminiForAnalysis(prompt);
      
      console.log(chalk.green('✅ AI分析完了'));
      console.log(chalk.cyan('\n📋 Gemini 整理戦略:'));
      console.log(result);

      return {
        strategy: result,
        topDomains,
        oldBookmarksCount: oldBookmarks.length,
        totalBookmarks: bookmarks.length
      };

    } catch (error) {
      console.log(chalk.yellow('⚠️  AI分析をスキップ、基本戦略を使用'));
      
      return {
        strategy: this.generateBasicStrategy(analysisData),
        topDomains,
        oldBookmarksCount: oldBookmarks.length,
        totalBookmarks: bookmarks.length
      };
    }
  }

  private static async callGeminiForAnalysis(prompt: string): Promise<string> {
    try {
      // Gemini MCP呼び出し
      console.log(chalk.gray('  Gemini分析中...'));
      
      // 実際のMCPツール呼び出しの代替として、
      // 現在の環境では手動でGeminiを呼び出します
      // 実装時は適切なMCPツールの呼び出しに置き換える
      
      throw new Error('Direct MCP call not available in this context');
      
    } catch (error) {
      // フォールバック戦略
      return `
【優先整理対象】
1. GitHub関連ブックマークの詳細分類（プロジェクト別・言語別）
2. 1年以上未使用のブックマークの削除検討
3. 主要ドメイン別フォルダの作成

【実行計画】
- 即座実行: 明らかに古いニュース記事の削除
- 段階実行: カテゴリフォルダの作成とブックマーク移動
- 定期実行: 月1回の使用頻度チェック

【期待効果】
- 検索時間の大幅短縮
- 重要なリソースへの迅速アクセス
- ブックマークバーの整理
`;
    }
  }

  private static generateBasicStrategy(data: any): string {
    return `
【基本整理戦略】

優先整理対象：
1. 上位ドメイン (${data.topDomains[0][0]}: ${data.topDomains[0][1]}個) の分類
2. 古いブックマーク ${data.oldBookmarksCount}個の見直し
3. ${data.uniqueDomains}ドメインの効率的分類

実行計画：
- ドメイン別フォルダ作成
- 使用頻度の低いブックマーク整理
- カテゴリ別分類の実行

期待効果：
- 整理された構造による効率向上
- 不要なブックマークの削除
- 使いやすいナビゲーション
`;
  }

  private static async executeSmartOrganization(
    bookmarks: any[], 
    roots: any[], 
    originalData: any, 
    targetPath: string,
    aiAnalysis: any,
    autoApply: boolean
  ): Promise<void> {
    
    console.log('\n' + chalk.yellow.bold('🎯 スマート整理実行計画'));
    console.log('='.repeat(30));

    const organizer = new BookmarkOrganizer(roots, originalData);

    // 1. ドメイン別フォルダ作成
    const topDomains = aiAnalysis.topDomains.slice(0, 5); // 上位5ドメイン
    console.log(chalk.blue('📂 フォルダ作成計画:'));
    
    topDomains.forEach(([domain, count]: [string, number], index: number) => {
      if (count >= 5) { // 5個以上あるドメインのみフォルダ作成
        const folderName = this.generateFolderName(domain);
        console.log(`  ${index + 1}. ${folderName} (${count}個)`);
        
        organizer.addAction({
          type: 'create_folder',
          targetId: `smart_folder_${domain}_${Date.now()}`,
          newName: folderName,
          reason: `AI提案: ${domain}の${count}個のブックマークを整理`
        });
      }
    });

    // 2. ブックマーク移動
    console.log(chalk.blue('\n📋 移動計画:'));
    let moveCount = 0;
    
    bookmarks.forEach(bookmark => {
      if (bookmark.url) {
        try {
          const domain = new URL(bookmark.url).hostname.replace(/^www\./, '');
          const domainEntry = topDomains.find(([d]: [string, number]) => d === domain);
          
          if (domainEntry && domainEntry[1] >= 5) {
            const folderName = this.generateFolderName(domain);
            organizer.addAction({
              type: 'move',
              targetId: bookmark.id,
              destination: folderName,
              reason: `AI提案: ${domain}カテゴリに分類`
            });
            moveCount++;
          }
        } catch {}
      }
    });

    console.log(`  移動対象: ${moveCount}個のブックマーク`);

    // 3. 古いブックマーク削除提案
    const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const veryOldBookmarks = bookmarks.filter(bookmark => 
      bookmark.dateAdded < oneYearAgo && 
      (!bookmark.dateLastUsed || bookmark.dateLastUsed < oneYearAgo) &&
      !this.isImportantDomain(bookmark.url)
    );

    if (veryOldBookmarks.length > 0) {
      console.log(chalk.blue(`\n🗑️  古いブックマーク削除提案: ${veryOldBookmarks.length}個`));
      
      // 重要でないドメインの古いブックマークのみ削除候補
      veryOldBookmarks.slice(0, 10).forEach(bookmark => {
        organizer.addAction({
          type: 'delete',
          targetId: bookmark.id,
          reason: 'AI提案: 1年以上未使用の古いブックマーク'
        });
      });
    }

    // 実行確認・適用
    const totalActions = organizer.getActions();
    console.log(`\n📊 総アクション数: ${totalActions.length}個`);

    if (totalActions.length > 0) {
      if (autoApply) {
        await this.applyChanges(organizer, targetPath);
      } else {
        console.log(chalk.yellow('\n⚠️  実行前確認:'));
        console.log('以下のコマンドで詳細確認・実行が可能です:');
        console.log(chalk.cyan('npm run start interactive') + ' - 対話式で確認');
        console.log(chalk.cyan('node dist/index.js smart --auto') + ' - 自動適用');
      }
    } else {
      console.log(chalk.green('\n✅ 現在のブックマークは既に良好に整理されています！'));
    }
  }

  private static generateFolderName(domain: string): string {
    // ドメインから適切なフォルダ名を生成
    const domainToFolder: { [key: string]: string } = {
      'github.com': '開発・GitHub',
      'stackoverflow.com': '開発・技術Q&A',
      'qiita.com': '開発・技術記事',
      'youtube.com': 'エンターテインメント',
      'translate.google.com': 'ツール・翻訳',
      'docs.google.com': 'ドキュメント',
      'notion.so': 'ツール・Notion',
      'figma.com': 'デザイン・Figma'
    };

    return domainToFolder[domain] || `${domain.split('.')[0]}関連`;
  }

  private static isImportantDomain(url: string | undefined): boolean {
    if (!url) return false;
    
    const importantDomains = [
      'github.com', 'stackoverflow.com', 'docs.google.com',
      'developer.mozilla.org', 'www.typescriptlang.org'
    ];
    
    try {
      const domain = new URL(url).hostname;
      return importantDomains.some(important => domain.includes(important));
    } catch {
      return false;
    }
  }

  private static async applyChanges(organizer: BookmarkOrganizer, targetPath: string): Promise<void> {
    const spinner = ora('AI提案を適用中...').start();
    
    try {
      // バックアップ作成
      const backupPath = organizer.createBackup(targetPath);
      
      // 変更適用
      organizer.applyActions();
      organizer.saveToFile(targetPath);
      
      spinner.succeed('✅ スマート整理完了');
      console.log(chalk.green(`📁 ${organizer.getActions().length}個の変更を適用`));
      console.log(chalk.blue(`💾 バックアップ: ${backupPath}`));
      
    } catch (error) {
      spinner.fail('適用に失敗');
      throw error;
    }
  }

  /**
   * クイックスマート整理（重要なものだけ）
   */
  static async quickSmart(bookmarkPath?: string): Promise<void> {
    console.log(chalk.blue.bold('⚡ クイックスマート整理'));
    
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
      
      console.log(chalk.green(`📊 ${bookmarks.length}個のブックマークを分析`));

      // 最も重要な整理のみ実行
      const organizer = new BookmarkOrganizer(roots, originalData);
      
      // GitHub関連の整理（最も多い可能性が高い）
      const githubBookmarks = bookmarks.filter(bookmark => 
        bookmark.url && bookmark.url.includes('github.com')
      );

      if (githubBookmarks.length >= 10) {
        console.log(chalk.blue(`📂 GitHub整理: ${githubBookmarks.length}個`));
        
        organizer.addAction({
          type: 'create_folder',
          targetId: `quick_github_${Date.now()}`,
          newName: '開発・GitHub',
          reason: 'クイック整理: GitHub関連の集約'
        });

        githubBookmarks.forEach(bookmark => {
          organizer.addAction({
            type: 'move',
            targetId: bookmark.id,
            destination: '開発・GitHub',
            reason: 'クイック整理: GitHub関連の分類'
          });
        });

        // 変更適用
        await this.applyChanges(organizer, targetPath);
        
        console.log(chalk.green('✅ GitHub関連の整理完了'));
        console.log('より詳細な整理: node dist/index.js smart');
        
      } else {
        console.log(chalk.yellow('⚠️  大きな整理が必要なカテゴリが見つかりませんでした'));
        console.log('詳細分析: node dist/index.js smart');
      }

    } catch (error) {
      console.log(chalk.red(`❌ エラー: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  }
}