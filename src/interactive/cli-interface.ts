import inquirer from 'inquirer';
import chalk from 'chalk';
import { table } from 'table';
import { BookmarkNode, DuplicateGroup, CategorySuggestion, LinkCheckResult, OrganizationAction } from '../types/bookmark';
import { getAvailableBookmarkPaths, getDefaultBookmarkPath } from '../utils/default-paths';

interface MenuChoice {
  name: string;
  value: string;
  short?: string;
}

export class CLIInterface {
  static async selectBookmarkFile(): Promise<string> {
    const profiles = getAvailableBookmarkPaths();
    if (profiles.length === 0) {
      // フォールバック
      profiles.push(getDefaultBookmarkPath());
    }

    const choices: MenuChoice[] = profiles.map((path, index) => ({
      name: `プロファイル ${index === 0 ? 'Default' : index} (${path})`,
      value: path
    }));

    choices.push({
      name: 'カスタムファイルパスを指定',
      value: 'custom'
    });

    const { selectedProfile } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedProfile',
        message: 'ブックマークファイルを選択してください:',
        choices
      }
    ]);

    if (selectedProfile === 'custom') {
      const { customPath } = await inquirer.prompt([
        {
          type: 'input',
          name: 'customPath',
          message: 'ブックマークファイルのパスを入力してください:',
          validate: (input: string) => {
            return input.trim().length > 0 || 'パスを入力してください';
          }
        }
      ]);
      // クォートを除去してパスを返す
      return customPath.trim().replace(/^["']|["']$/g, '');
    }

    return selectedProfile;
  }

  static displayAnalysisResults(analysis: any, stats: any): void {
    console.log('\n' + chalk.blue.bold('📊 ブックマーク分析結果'));
    console.log('='.repeat(50));

    // 基本統計
    const statsData = [
      ['項目', '数値'],
      ['総ブックマーク数', analysis.totalBookmarks.toString()],
      ['総フォルダ数', stats.totalFolders.toString()],
      ['最大階層深度', stats.maxDepth.toString()],
      ['フォルダ当たり平均ブックマーク数', stats.avgBookmarksPerFolder.toString()],
      ['重複グループ数', analysis.duplicates.length.toString()],
      ['未使用ブックマーク数', analysis.unusedBookmarks.length.toString()],
      ['カテゴリ提案数', analysis.categories.length.toString()]
    ];

    console.log('\n' + chalk.green('基本統計:'));
    console.log(table(statsData));

    // 重複の概要
    if (analysis.duplicates.length > 0) {
      console.log('\n' + chalk.yellow('🔍 重複ブックマーク:'));
      analysis.duplicates.slice(0, 5).forEach((group: DuplicateGroup, index: number) => {
        console.log(`${index + 1}. ${group.urls.length}個の重複 (類似度: ${(group.similarity * 100).toFixed(1)}%)`);
        group.urls.forEach((bookmark, idx) => {
          console.log(`   ${idx + 1}. ${bookmark.name}`);
        });
      });
      if (analysis.duplicates.length > 5) {
        console.log(`   ... 他 ${analysis.duplicates.length - 5} グループ`);
      }
    }

    // カテゴリ提案の概要
    if (analysis.categories.length > 0) {
      console.log('\n' + chalk.cyan('📁 カテゴリ提案:'));
      analysis.categories.slice(0, 5).forEach((category: CategorySuggestion, index: number) => {
        console.log(`${index + 1}. ${category.name} (${category.bookmarks.length}個, 信頼度: ${(category.confidence * 100).toFixed(1)}%)`);
      });
      if (analysis.categories.length > 5) {
        console.log(`   ... 他 ${analysis.categories.length - 5} カテゴリ`);
      }
    }
  }

  static async selectMainAction(): Promise<string> {
    const choices: MenuChoice[] = [
      {
        name: '🔍 重複ブックマークを整理',
        value: 'duplicates',
        short: '重複整理'
      },
      {
        name: '🔗 リンク切れをチェック・削除',
        value: 'deadlinks',
        short: 'リンク切れ'
      },
      {
        name: '📁 カテゴリ別に整理',
        value: 'categories',
        short: 'カテゴリ整理'
      },
      {
        name: '🧹 未使用ブックマークを整理',
        value: 'unused',
        short: '未使用整理'
      },
      {
        name: '📤 エクスポート',
        value: 'export',
        short: 'エクスポート'
      },
      {
        name: '❌ 終了',
        value: 'exit',
        short: '終了'
      }
    ];

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: '実行したい操作を選択してください:',
        choices
      }
    ]);

    return action;
  }

  static async handleDuplicates(duplicates: DuplicateGroup[]): Promise<OrganizationAction[]> {
    const actions: OrganizationAction[] = [];

    if (duplicates.length === 0) {
      console.log(chalk.green('✅ 重複ブックマークは見つかりませんでした。'));
      return actions;
    }

    console.log(`\n${chalk.yellow('🔍 重複ブックマーク整理')}`);
    console.log(`${duplicates.length}個の重複グループが見つかりました。`);

    for (let i = 0; i < duplicates.length; i++) {
      const group = duplicates[i];
      console.log(`\n--- グループ ${i + 1}/${duplicates.length} (類似度: ${(group.similarity * 100).toFixed(1)}%) ---`);
      
      const bookmarkChoices = group.urls.map((bookmark, index) => ({
        name: `${index + 1}. ${bookmark.name} (${bookmark.path.join(' > ')})`,
        value: bookmark.id
      }));

      bookmarkChoices.push({
        name: '⏭️  このグループをスキップ',
        value: 'skip'
      });

      const { selectedBookmark } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selectedBookmark',
          message: '残すブックマークを選択してください（他は削除されます）:',
          choices: bookmarkChoices
        }
      ]);

      if (selectedBookmark !== 'skip') {
        group.urls.forEach(bookmark => {
          if (bookmark.id !== selectedBookmark) {
            actions.push({
              type: 'delete',
              targetId: bookmark.id,
              reason: `重複削除: グループ${i + 1}で${selectedBookmark}を保持`
            });
          }
        });
      }
    }

    return actions;
  }

  static async handleCategories(categories: CategorySuggestion[]): Promise<OrganizationAction[]> {
    const actions: OrganizationAction[] = [];

    if (categories.length === 0) {
      console.log(chalk.green('✅ カテゴリ提案はありません。'));
      return actions;
    }

    console.log(`\n${chalk.cyan('📁 カテゴリ別整理')}`);
    console.log(`${categories.length}個のカテゴリが提案されています。`);

    for (let i = 0; i < categories.length; i++) {
      const category = categories[i];
      console.log(`\n--- カテゴリ ${i + 1}/${categories.length}: ${category.name} ---`);
      console.log(`${category.bookmarks.length}個のブックマーク (信頼度: ${(category.confidence * 100).toFixed(1)}%)`);
      console.log(`説明: ${category.description}`);

      // 最初の5個のブックマークを表示
      category.bookmarks.slice(0, 5).forEach((bookmark, index) => {
        console.log(`  ${index + 1}. ${bookmark.name}`);
      });
      if (category.bookmarks.length > 5) {
        console.log(`  ... 他 ${category.bookmarks.length - 5} 個`);
      }

      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'このカテゴリをどうしますか？',
          choices: [
            { name: '✅ フォルダを作成して移動', value: 'create' },
            { name: '📁 既存フォルダに移動', value: 'existing' },
            { name: '✏️  カテゴリ名を変更して作成', value: 'rename' },
            { name: '⏭️  スキップ', value: 'skip' }
          ]
        }
      ]);

      let folderName = category.name;

      if (action === 'rename') {
        const { newName } = await inquirer.prompt([
          {
            type: 'input',
            name: 'newName',
            message: '新しいカテゴリ名を入力してください:',
            default: category.name
          }
        ]);
        folderName = newName;
      }

      if (action === 'existing') {
        const { existingFolder } = await inquirer.prompt([
          {
            type: 'input',
            name: 'existingFolder',
            message: '移動先のフォルダパスを入力してください:'
          }
        ]);
        folderName = existingFolder;
      }

      if (action !== 'skip') {
        // フォルダ作成アクション（create, renameの場合）
        if (action === 'create' || action === 'rename') {
          actions.push({
            type: 'create_folder',
            targetId: `folder_${folderName}_${Date.now()}`,
            newName: folderName,
            reason: `カテゴリ整理: ${category.name}`
          });
        }

        // ブックマーク移動アクション
        category.bookmarks.forEach(bookmark => {
          actions.push({
            type: 'move',
            targetId: bookmark.id,
            destination: folderName,
            reason: `カテゴリ整理: ${category.name}に分類`
          });
        });
      }
    }

    return actions;
  }

  static async displayLinkCheckProgress(total: number, current: number, bookmark: BookmarkNode): Promise<void> {
    const progress = ((current / total) * 100).toFixed(1);
    process.stdout.write(`\r🔗 リンクチェック中... ${progress}% (${current}/${total}) - ${bookmark.name.slice(0, 50)}...`);
  }

  static displayLinkCheckResults(results: LinkCheckResult[]): void {
    const dead = results.filter(r => r.status === 'dead' || r.status === 'error');
    const timeout = results.filter(r => r.status === 'timeout');
    const redirect = results.filter(r => r.status === 'redirect');
    const ok = results.filter(r => r.status === 'ok');

    console.log('\n\n' + chalk.blue.bold('🔗 リンクチェック結果'));
    console.log('='.repeat(50));

    const resultsData = [
      ['ステータス', '件数', '割合'],
      ['✅ 正常', ok.length.toString(), `${((ok.length / results.length) * 100).toFixed(1)}%`],
      ['🔄 リダイレクト', redirect.length.toString(), `${((redirect.length / results.length) * 100).toFixed(1)}%`],
      ['⏱️  タイムアウト', timeout.length.toString(), `${((timeout.length / results.length) * 100).toFixed(1)}%`],
      ['❌ エラー/削除対象', dead.length.toString(), `${((dead.length / results.length) * 100).toFixed(1)}%`]
    ];

    console.log(table(resultsData));

    if (dead.length > 0) {
      console.log('\n' + chalk.red('❌ 削除対象のブックマーク:'));
      dead.slice(0, 10).forEach((result, index) => {
        console.log(`${index + 1}. ${result.bookmark.name} - ${result.status} (${result.statusCode || result.error})`);
      });
      if (dead.length > 10) {
        console.log(`   ... 他 ${dead.length - 10} 個`);
      }
    }
  }

  static async confirmActions(actions: OrganizationAction[]): Promise<boolean> {
    if (actions.length === 0) {
      console.log(chalk.yellow('実行するアクションがありません。'));
      return false;
    }

    console.log(`\n${chalk.blue.bold('📋 実行予定のアクション')}`);
    console.log('='.repeat(50));

    const actionSummary = actions.reduce((acc, action) => {
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

    const { confirmed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmed',
        message: 'これらのアクションを実行しますか？',
        default: false
      }
    ]);

    return confirmed;
  }

  static async selectExportFormat(): Promise<string> {
    const { format } = await inquirer.prompt([
      {
        type: 'list',
        name: 'format',
        message: 'エクスポート形式を選択してください:',
        choices: [
          { name: 'JSON形式', value: 'json' },
          { name: 'HTML形式 (ブラウザで読み込み可能)', value: 'html' },
          { name: 'CSV形式 (Excel等で編集可能)', value: 'csv' }
        ]
      }
    ]);

    return format;
  }

  static displaySuccess(message: string): void {
    console.log('\n' + chalk.green.bold('✅ ' + message));
  }

  static displayError(message: string): void {
    console.log('\n' + chalk.red.bold('❌ ' + message));
  }

  static displayWarning(message: string): void {
    console.log('\n' + chalk.yellow.bold('⚠️  ' + message));
  }
}