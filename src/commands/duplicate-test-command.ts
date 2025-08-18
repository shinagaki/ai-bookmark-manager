import * as fs from 'fs';
import { existsSync } from 'fs';
import chalk from 'chalk';
import { table } from 'table';
import { BookmarkParser } from '../parsers/bookmark-parser';
import { BookmarkAnalyzer } from '../analyzers/bookmark-analyzer';
import { ImprovedDuplicateAnalyzer } from '../analyzers/improved-duplicate-analyzer';
import { getDefaultBookmarkPath } from '../utils/default-paths';

export class DuplicateTestCommand {
  /**
   * 改良版重複検出のテスト実行
   */
  static async run(bookmarkPath?: string): Promise<void> {
    console.log(chalk.blue.bold('🔍 改良版重複検出テスト'));
    console.log('='.repeat(50));

    try {
      const targetPath = bookmarkPath || getDefaultBookmarkPath();
      
      if (!existsSync(targetPath)) {
        console.log(chalk.red(`❌ ブックマークファイルが見つかりません: ${targetPath}`));
        return;
      }

      console.log(chalk.green(`📁 分析対象: ${targetPath}`));

      // ブックマーク読み込み
      const content = fs.readFileSync(targetPath, 'utf-8');
      const originalData = JSON.parse(content);
      const roots = BookmarkParser.parseBookmarkData(originalData);
      const bookmarks = BookmarkParser.flattenBookmarks(roots);
      
      console.log(chalk.green(`📊 ${bookmarks.length}個のブックマークを読み込み`));

      // 重複検出実行
      console.log('\n' + chalk.cyan.bold('🔍 重複検出実行中...'));
      const duplicates = ImprovedDuplicateAnalyzer.findDuplicates(bookmarks, 0.8);
      
      if (duplicates.length === 0) {
        console.log(chalk.green('✅ 重複ブックマークは見つかりませんでした！'));
        return;
      }

      console.log(chalk.yellow(`⚠️  ${duplicates.length}個の重複グループを発見`));

      // 結果表示
      this.displayDuplicateResults(duplicates);

      // 解決提案
      console.log('\n' + chalk.cyan.bold('💡 解決提案'));
      const resolutions = BookmarkAnalyzer.suggestDuplicateResolution(duplicates);
      this.displayResolutionSuggestions(resolutions);

    } catch (error) {
      console.log(chalk.red(`❌ エラー: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  }

  private static displayDuplicateResults(duplicates: any[]): void {
    console.log('\n' + chalk.yellow.bold('📋 重複検出結果'));
    console.log('='.repeat(30));

    duplicates.slice(0, 10).forEach((group, index) => {
      console.log(`\n${chalk.blue(`グループ ${index + 1}`)} (類似度: ${(group.similarity * 100).toFixed(1)}%, 理由: ${group.reason})`);
      
      group.urls.forEach((bookmark: any, idx: number) => {
        const prefix = idx === 0 ? '🎯' : '🔗';
        console.log(`  ${prefix} ${bookmark.name}`);
        console.log(`     URL: ${bookmark.url}`);
        console.log(`     パス: ${bookmark.path.join(' > ')}`);
        if (bookmark.dateLastUsed) {
          console.log(`     最終使用: ${bookmark.dateLastUsed.toLocaleDateString('ja-JP')}`);
        }
      });
    });

    if (duplicates.length > 10) {
      console.log(`\n... 他 ${duplicates.length - 10} グループ`);
    }
  }

  private static displayResolutionSuggestions(resolutions: any[]): void {
    console.log('='.repeat(30));

    resolutions.slice(0, 5).forEach((resolution, index) => {
      console.log(`\n${chalk.green(`提案 ${index + 1}`)} - ${resolution.reason}`);
      console.log(`🎯 ${chalk.green('保持')}: ${resolution.keepBookmark.name}`);
      console.log(`   理由: 最も適切なブックマーク（使用頻度・タイトル品質等）`);
      
      resolution.removeBookmarks.forEach((bookmark: any) => {
        console.log(`🗑️  ${chalk.red('削除')}: ${bookmark.name}`);
      });
    });

    if (resolutions.length > 5) {
      console.log(`\n... 他 ${resolutions.length - 5} 個の提案`);
    }

    // 統計表示
    const totalDuplicates = resolutions.reduce((sum, res) => sum + res.removeBookmarks.length, 0);
    
    console.log('\n' + chalk.blue.bold('📊 削除提案統計'));
    const statsData = [
      ['項目', '数値'],
      ['重複グループ数', resolutions.length.toString()],
      ['削除対象ブックマーク数', totalDuplicates.toString()],
      ['節約されるブックマーク数', totalDuplicates.toString()],
      ['整理効果', `${((totalDuplicates / (totalDuplicates + resolutions.length)) * 100).toFixed(1)}%削減`]
    ];

    console.log(table(statsData));
  }

  /**
   * URL正規化のテスト
   */
  static async testUrlNormalization(): Promise<void> {
    console.log(chalk.blue.bold('🔧 URL正規化テスト'));
    console.log('='.repeat(30));

    const testUrls = [
      'https://www.example.com/',
      'http://example.com',
      'https://example.com/?utm_source=google&utm_medium=cpc',
      'https://example.com/?ref=homepage',
      'https://EXAMPLE.COM/path',
      'https://example.com/path/',
      'https://example.com/path?a=1&b=2',
      'https://example.com/path?b=2&a=1'
    ];

    const normalizeUrl = (url: string): string => {
      try {
        const urlObj = new URL(url);
        urlObj.protocol = 'https:';
        urlObj.hostname = urlObj.hostname.replace(/^www\./, '').toLowerCase();
        urlObj.pathname = urlObj.pathname.replace(/\/$/, '') || '/';
        
        const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'ref', 'referrer'];
        trackingParams.forEach(param => urlObj.searchParams.delete(param));
        urlObj.searchParams.sort();
        
        return urlObj.toString();
      } catch {
        return url;
      }
    };

    testUrls.forEach(url => {
      const normalized = normalizeUrl(url);
      const color = url !== normalized ? chalk.yellow : chalk.gray;
      console.log(`${color(url)}`);
      console.log(`→ ${chalk.green(normalized)}\n`);
    });
  }

  /**
   * 重複検出アルゴリズムの比較テスト
   */
  static async compareAlgorithms(bookmarkPath?: string): Promise<void> {
    console.log(chalk.blue.bold('⚖️  重複検出アルゴリズム比較'));
    console.log('='.repeat(50));

    try {
      const targetPath = bookmarkPath || getDefaultBookmarkPath();
      
      if (!existsSync(targetPath)) {
        console.log(chalk.red(`❌ ファイルが見つかりません: ${targetPath}`));
        return;
      }

      const content = fs.readFileSync(targetPath, 'utf-8');
      const originalData = JSON.parse(content);
      const roots = BookmarkParser.parseBookmarkData(originalData);
      const bookmarks = BookmarkParser.flattenBookmarks(roots);

      console.log(chalk.green(`📊 ${bookmarks.length}個のブックマークで比較テスト`));

      // 改良版アルゴリズム
      console.log('\n' + chalk.cyan('🚀 改良版アルゴリズム実行中...'));
      const start1 = Date.now();
      const improvedDuplicates = ImprovedDuplicateAnalyzer.findDuplicates(bookmarks, 0.8);
      const time1 = Date.now() - start1;

      console.log('\n' + chalk.blue.bold('📊 比較結果'));
      const comparisonData = [
        ['アルゴリズム', '重複グループ数', '実行時間', '特徴'],
        ['改良版', improvedDuplicates.length.toString(), `${time1}ms`, 'URL正規化・段階的検出'],
      ];

      console.log(table(comparisonData));

      // 詳細内訳
      const exactUrlGroups = improvedDuplicates.filter(g => g.reason === 'exact_url').length;
      const similarUrlGroups = improvedDuplicates.filter(g => g.reason === 'similar_url').length;

      console.log('\n' + chalk.cyan('📋 改良版詳細内訳:'));
      console.log(`  完全URL一致: ${exactUrlGroups}グループ`);
      console.log(`  類似URL: ${similarUrlGroups}グループ`);

      if (improvedDuplicates.length > 0) {
        console.log('\n' + chalk.green('💡 改良版の利点:'));
        console.log('  • URL正規化により精度向上');
        console.log('  • トラッキングパラメータを除去');
        console.log('  • 段階的検出で重複の見落としを防止');
        console.log('  • 保持すべきブックマークの自動判定');
      }

    } catch (error) {
      console.log(chalk.red(`❌ 比較テストエラー: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  }
}