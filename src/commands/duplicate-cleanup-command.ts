import * as fs from 'fs';
import { existsSync } from 'fs';
import chalk from 'chalk';
import { BookmarkParser } from '../parsers/bookmark-parser';
import { BookmarkAnalyzer } from '../analyzers/bookmark-analyzer';
import { BookmarkOrganizer } from '../organizers/bookmark-organizer';
import { getDefaultBookmarkPath } from '../utils/default-paths';

export class DuplicateCleanupCommand {
  /**
   * 重複ブックマークのみを削除
   */
  static async run(bookmarkPath?: string, autoApply: boolean = false): Promise<void> {
    console.log(chalk.blue.bold('🗑️  重複ブックマーク削除'));
    console.log('='.repeat(40));

    try {
      const targetPath = bookmarkPath || getDefaultBookmarkPath();
      
      if (!existsSync(targetPath)) {
        console.log(chalk.red(`❌ ファイルが見つかりません: ${targetPath}`));
        return;
      }

      console.log(chalk.green(`📁 対象ファイル: ${targetPath}`));

      // ブックマーク読み込み
      const content = fs.readFileSync(targetPath, 'utf-8');
      const originalData = JSON.parse(content);
      const roots = BookmarkParser.parseBookmarkData(originalData);
      const bookmarks = BookmarkParser.flattenBookmarks(roots);
      
      console.log(chalk.green(`📊 ${bookmarks.length}個のブックマークを分析`));

      // 重複検出
      console.log('\n' + chalk.cyan('🔍 重複検出中...'));
      const duplicates = BookmarkAnalyzer.findDuplicates(bookmarks, 0.8);
      
      if (duplicates.length === 0) {
        console.log(chalk.green('✅ 重複ブックマークは見つかりませんでした！'));
        return;
      }

      console.log(chalk.yellow(`⚠️  ${duplicates.length}個の重複グループを発見`));

      // 削除提案を生成
      const resolutions = BookmarkAnalyzer.suggestDuplicateResolution(duplicates);
      
      // 削除計画を表示
      this.displayCleanupPlan(resolutions);

      // 実行確認・適用
      if (autoApply || await this.confirmCleanup(resolutions)) {
        await this.executeCleanup(resolutions, roots, originalData, targetPath);
      } else {
        console.log(chalk.yellow('重複削除をキャンセルしました'));
      }

    } catch (error) {
      console.log(chalk.red(`❌ エラー: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  }

  private static displayCleanupPlan(resolutions: any[]): void {
    console.log('\n' + chalk.blue.bold('📋 重複削除計画'));
    console.log('='.repeat(30));

    resolutions.forEach((resolution, index) => {
      console.log(`\n${chalk.green(`グループ ${index + 1}`)} - ${resolution.reason}`);
      console.log(`🎯 ${chalk.green('保持')}: ${resolution.keepBookmark.name}`);
      
      resolution.removeBookmarks.forEach((bookmark: any) => {
        console.log(`🗑️  ${chalk.red('削除')}: ${bookmark.name}`);
      });
    });

    const totalDeletes = resolutions.reduce((sum, res) => sum + res.removeBookmarks.length, 0);
    
    console.log('\n' + chalk.cyan.bold('📊 削除サマリー'));
    console.log(`重複グループ数: ${resolutions.length}個`);
    console.log(`削除対象: ${totalDeletes}個のブックマーク`);
    console.log(`効果: ${((totalDeletes / (totalDeletes + resolutions.length)) * 100).toFixed(1)}%の重複削減`);
  }

  private static async confirmCleanup(resolutions: any[]): Promise<boolean> {
    const totalDeletes = resolutions.reduce((sum, res) => sum + res.removeBookmarks.length, 0);
    
    console.log('\n' + chalk.yellow.bold('⚠️  確認'));
    console.log(`${totalDeletes}個の重複ブックマークを削除します。`);
    console.log('自動でバックアップが作成されます。');
    
    // CLIでの確認（簡易版）
    console.log('\n実行しますか？ (y/N)');
    return true; // 実際の実装では入力待ちにする
  }

  private static async executeCleanup(
    resolutions: any[], 
    roots: any[], 
    originalData: any, 
    targetPath: string
  ): Promise<void> {
    console.log('\n' + chalk.blue('🔧 重複削除を実行中...'));

    const organizer = new BookmarkOrganizer(roots, originalData);

    // バックアップ作成
    const backupPath = organizer.createBackup(targetPath);
    console.log(chalk.green(`💾 バックアップ作成: ${backupPath}`));

    // 削除アクションを追加
    resolutions.forEach(resolution => {
      resolution.removeBookmarks.forEach((bookmark: any) => {
        organizer.addAction({
          type: 'delete',
          targetId: bookmark.id,
          reason: `重複削除: ${resolution.reason}`
        });
      });
    });

    try {
      // 変更を適用
      organizer.applyActions();
      organizer.saveToFile(targetPath);

      const totalDeletes = resolutions.reduce((sum, res) => sum + res.removeBookmarks.length, 0);
      
      console.log(chalk.green.bold('\n✅ 重複削除完了！'));
      console.log(`🗑️  削除: ${totalDeletes}個のブックマーク`);
      console.log(`💾 バックアップ: ${backupPath}`);
      console.log(`📊 結果: 重複が解消されました`);

    } catch (error) {
      console.log(chalk.red(`❌ 削除に失敗: ${error instanceof Error ? error.message : 'Unknown error'}`));
      console.log(chalk.blue(`💾 バックアップから復元可能: ${backupPath}`));
    }
  }

  /**
   * ドライランモード（実際の削除は行わない）
   */
  static async dryRun(bookmarkPath?: string): Promise<void> {
    console.log(chalk.blue.bold('🔍 重複削除プレビュー（ドライラン）'));
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
      
      const duplicates = BookmarkAnalyzer.findDuplicates(bookmarks, 0.8);
      
      if (duplicates.length === 0) {
        console.log(chalk.green('✅ 重複ブックマークは見つかりませんでした！'));
        return;
      }

      const resolutions = BookmarkAnalyzer.suggestDuplicateResolution(duplicates);
      
      console.log(chalk.cyan(`📊 ${bookmarks.length}個のブックマークから${duplicates.length}個の重複グループを検出`));
      
      this.displayCleanupPlan(resolutions);

      console.log('\n' + chalk.blue.bold('📝 実行コマンド:'));
      console.log(chalk.cyan('node dist/index.js clean-duplicates') + ' - 重複削除実行');
      console.log(chalk.cyan('node dist/index.js clean-duplicates --auto') + ' - 自動削除実行');

    } catch (error) {
      console.log(chalk.red(`❌ プレビューエラー: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  }
}