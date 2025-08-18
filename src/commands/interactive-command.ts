import * as fs from 'fs';
import { existsSync } from 'fs';
import chalk from 'chalk';
import ora from 'ora';
import { BookmarkParser } from '../parsers/bookmark-parser';
import { BookmarkAnalyzer } from '../analyzers/bookmark-analyzer';
import { CLIInterface } from '../interactive/cli-interface';
import { BookmarkOrganizer } from '../organizers/bookmark-organizer';
import { BookmarkExporter } from '../exporters/bookmark-exporter';
import { CompleteOrganizeCommand } from './complete-organize-command';
import inquirer from 'inquirer';

export class InteractiveCommand {
  static async run(): Promise<void> {
    console.log(chalk.blue.bold('🔖 Chrome ブックマーク整理ツール'));
    console.log('='.repeat(50));

    try {
      // Step 1: Select bookmark file
      const bookmarkPath = await CLIInterface.selectBookmarkFile();
      
      if (!existsSync(bookmarkPath)) {
        CLIInterface.displayError(`ファイルが見つかりません: ${bookmarkPath}`);
        return;
      }

      // Step 2: Parse bookmarks
      const spinner = ora('ブックマークファイルを読み込み中...').start();
      let roots, originalData;
      
      try {
        const content = fs.readFileSync(bookmarkPath, 'utf-8');
        originalData = JSON.parse(content);
        roots = BookmarkParser.parseBookmarkData(originalData);
        spinner.succeed('ブックマークファイルの読み込み完了');
      } catch (error) {
        spinner.fail('ブックマークファイルの読み込みに失敗');
        CLIInterface.displayError(`パース エラー: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return;
      }

      // Step 3: Analyze bookmarks
      spinner.text = 'ブックマークを分析中...';
      spinner.start();
      
      const bookmarks = BookmarkParser.flattenBookmarks(roots);
      const stats = BookmarkParser.getBookmarkStats(roots);
      const analysis = BookmarkAnalyzer.analyzeAll(bookmarks);
      analysis.totalFolders = stats.totalFolders;
      analysis.statistics.avgBookmarksPerFolder = stats.avgBookmarksPerFolder;
      analysis.statistics.maxDepth = stats.maxDepth;
      
      spinner.succeed('分析完了');

      // Step 4: Display analysis results
      CLIInterface.displayAnalysisResults(analysis, stats);

      // Step 5: Initialize organizer
      const organizer = new BookmarkOrganizer(roots, originalData);

      // Step 6: Interactive organization loop
      let continueOrganizing = true;
      
      while (continueOrganizing) {
        const action = await CLIInterface.selectMainAction();
        
        switch (action) {
          case 'duplicates':
            await this.handleDuplicates(analysis.duplicates, organizer);
            break;
            
          case 'deadlinks':
            await this.handleDeadLinks(bookmarks, organizer);
            break;
            
          case 'categories':
            await this.handleCategories(analysis.categories, organizer);
            break;
            
          case 'unused':
            await this.handleUnusedBookmarks(analysis.unusedBookmarks, organizer);
            break;
            
          case 'export':
            await this.handleExport(roots);
            break;
            
          case 'exit':
            continueOrganizing = false;
            break;
        }

        if (action !== 'exit' && action !== 'export') {
          await this.promptToSave(organizer, bookmarkPath);
        }
      }

      CLIInterface.displaySuccess('ブックマーク整理が完了しました！');

    } catch (error) {
      CLIInterface.displayError(`エラーが発生しました: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private static async handleDuplicates(duplicates: any[], organizer: BookmarkOrganizer): Promise<void> {
    const actions = await CLIInterface.handleDuplicates(duplicates);
    if (actions.length > 0) {
      organizer.addActions(actions);
      CLIInterface.displaySuccess(`${actions.length}個のアクションを追加しました`);
    }
  }

  private static async handleDeadLinks(bookmarks: any[], organizer: BookmarkOrganizer): Promise<void> {
    console.log(chalk.yellow.bold('\n🔗 リンク切れチェック'));
    console.log('='.repeat(30));
    
    // 新しいバッチ処理フローを使用
    await CompleteOrganizeCommand.handleDeadLinks(bookmarks, organizer);
  }

  private static async handleCategories(categories: any[], organizer: BookmarkOrganizer): Promise<void> {
    const actions = await CLIInterface.handleCategories(categories);
    if (actions.length > 0) {
      organizer.addActions(actions);
      CLIInterface.displaySuccess(`${actions.length}個のアクションを追加しました`);
    }
  }

  private static async handleUnusedBookmarks(unusedBookmarks: any[], organizer: BookmarkOrganizer): Promise<void> {
    if (unusedBookmarks.length === 0) {
      CLIInterface.displaySuccess('未使用ブックマークは見つかりませんでした！');
      return;
    }

    console.log(`\n${chalk.yellow('🧹 未使用ブックマーク整理')}`);
    console.log(`${unusedBookmarks.length}個の未使用ブックマークが見つかりました。`);

    // Show sample of unused bookmarks
    console.log('\n最初の10個:');
    unusedBookmarks.slice(0, 10).forEach((bookmark: any, index: number) => {
      const lastUsed = bookmark.dateLastUsed 
        ? bookmark.dateLastUsed.toLocaleDateString('ja-JP')
        : '未使用';
      console.log(`${index + 1}. ${bookmark.name} (最終使用: ${lastUsed})`);
    });
    
    if (unusedBookmarks.length > 10) {
      console.log(`... 他 ${unusedBookmarks.length - 10} 個`);
    }

    const { shouldDelete } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'shouldDelete',
        message: 'これらの未使用ブックマークを削除しますか？',
        default: false
      }
    ]);

    if (shouldDelete) {
      organizer.removeUnusedBookmarks(unusedBookmarks);
      CLIInterface.displaySuccess(`${unusedBookmarks.length}個の削除アクションを追加しました`);
    }
  }

  private static async handleExport(roots: any[]): Promise<void> {
    const format = await CLIInterface.selectExportFormat();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    const outputFiles = {
      json: `bookmarks-export-${timestamp}.json`,
      html: `bookmarks-export-${timestamp}.html`,
      csv: `bookmarks-export-${timestamp}.csv`
    };

    const outputPath = outputFiles[format as keyof typeof outputFiles];

    try {
      switch (format) {
        case 'json':
          BookmarkExporter.exportToJSON(roots, outputPath);
          break;
        case 'html':
          BookmarkExporter.exportToHTML(roots, outputPath);
          break;
        case 'csv':
          BookmarkExporter.exportToCSV(roots, outputPath);
          break;
      }

      CLIInterface.displaySuccess(`エクスポート完了: ${outputPath}`);
    } catch (error) {
      CLIInterface.displayError(`エクスポート エラー: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private static async promptToSave(organizer: BookmarkOrganizer, originalPath: string): Promise<void> {
    const actions = organizer.getActions();
    
    if (actions.length === 0) {
      return;
    }

    const confirmed = await CLIInterface.confirmActions(actions);
    
    if (confirmed) {
      const spinner = ora('変更を適用中...').start();
      
      try {
        // Create backup
        const backupPath = organizer.createBackup(originalPath);
        CLIInterface.displaySuccess(`バックアップ作成: ${backupPath}`);

        // Apply changes
        organizer.applyActions();
        organizer.saveToFile(originalPath);
        
        spinner.succeed('変更を保存しました');
        CLIInterface.displaySuccess(`適用されたアクション: ${organizer.getActionsSummary()}`);
        
        // Clear actions after successful save
        organizer.clearActions();
        
      } catch (error) {
        spinner.fail('変更の保存に失敗');
        CLIInterface.displayError(`保存 エラー: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } else {
      organizer.clearActions();
      CLIInterface.displayWarning('変更をキャンセルしました');
    }
  }
}