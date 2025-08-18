import chalk from 'chalk';

export class PaginationHelper {
  /**
   * 汎用ページング表示機能
   */
  static async displayWithPaging<T>(
    items: T[],
    displayFunction: (item: T, index: number, globalIndex: number) => void,
    options: {
      itemsPerPage?: number;
      title?: string;
      showTotal?: boolean;
    } = {}
  ): Promise<void> {
    const { itemsPerPage = 5, title, showTotal = true } = options;
    
    if (items.length === 0) {
      console.log(chalk.yellow('表示するアイテムがありません'));
      return;
    }

    const totalPages = Math.ceil(items.length / itemsPerPage);
    let currentPage = 1;

    while (true) {
      console.clear();
      
      if (title) {
        console.log(chalk.blue.bold(title));
        console.log('='.repeat(50));
      }

      if (showTotal) {
        console.log(chalk.cyan(`📊 総数: ${items.length}件 (ページ ${currentPage}/${totalPages})`));
        console.log();
      }

      // 現在のページのアイテムを表示
      const startIndex = (currentPage - 1) * itemsPerPage;
      const endIndex = Math.min(startIndex + itemsPerPage, items.length);
      const pageItems = items.slice(startIndex, endIndex);

      pageItems.forEach((item, index) => {
        displayFunction(item, index, startIndex + index);
      });

      // ナビゲーション表示
      console.log();
      console.log(chalk.gray('─'.repeat(50)));
      console.log(chalk.cyan('ナビゲーション:'));
      
      const navOptions = [];
      if (currentPage > 1) navOptions.push('p = 前のページ');
      if (currentPage < totalPages) navOptions.push('n = 次のページ');
      navOptions.push('q = 終了');

      console.log(chalk.gray(`  ${navOptions.join(', ')}`));

      // ユーザー入力待ち
      const input = await this.waitForInput('操作を選択してください: ');
      
      if (input === 'p' && currentPage > 1) {
        currentPage--;
      } else if (input === 'n' && currentPage < totalPages) {
        currentPage++;
      } else if (input === 'q' || input === '') {
        break;
      } else {
        // 無効な入力の場合は何もしない（再表示）
        await this.waitForInput(chalk.red('無効な入力です。Enterで続行...'));
      }
    }
  }

  /**
   * リスト表示用ページング（簡易版）
   */
  static async displayListWithPaging<T>(
    items: T[],
    getItemText: (item: T, index: number) => string,
    title: string = '一覧表示',
    itemsPerPage: number = 10
  ): Promise<void> {
    await this.displayWithPaging(
      items,
      (item, index, globalIndex) => {
        console.log(`  ${globalIndex + 1}. ${getItemText(item, globalIndex)}`);
      },
      { itemsPerPage, title }
    );
  }

  /**
   * 確認付きページング表示
   */
  static async displayWithConfirmation<T>(
    items: T[],
    displayFunction: (item: T, index: number, globalIndex: number) => void,
    confirmMessage: string,
    options: {
      itemsPerPage?: number;
      title?: string;
      showTotal?: boolean;
    } = {}
  ): Promise<boolean> {
    await this.displayWithPaging(items, displayFunction, options);
    
    console.log();
    return await this.confirmAction(confirmMessage);
  }

  /**
   * 進捗表示付きページング
   */
  static async displayWithProgress<T>(
    items: T[],
    processFunction: (item: T, index: number) => Promise<string>,
    title: string = '処理中',
    itemsPerPage: number = 5
  ): Promise<void> {
    console.log(chalk.blue.bold(title));
    console.log('='.repeat(50));
    console.log(chalk.cyan(`📊 総数: ${items.length}件`));
    console.log();

    for (let i = 0; i < items.length; i += itemsPerPage) {
      const batch = items.slice(i, Math.min(i + itemsPerPage, items.length));
      const batchNumber = Math.floor(i / itemsPerPage) + 1;
      const totalBatches = Math.ceil(items.length / itemsPerPage);

      console.log(chalk.yellow(`\n📦 バッチ ${batchNumber}/${totalBatches} (${batch.length}件)`));
      console.log('─'.repeat(30));

      for (let j = 0; j < batch.length; j++) {
        const globalIndex = i + j;
        const item = batch[j];
        
        console.log(chalk.gray(`処理中... ${globalIndex + 1}/${items.length}`));
        const result = await processFunction(item, globalIndex);
        console.log(`  ${globalIndex + 1}. ${result}`);
      }

      // バッチ間の休憩（最後のバッチでない場合）
      if (i + itemsPerPage < items.length) {
        await this.waitForInput(chalk.cyan('\nEnterで次のバッチに進む...'));
      }
    }

    console.log(chalk.green.bold('\n✅ 全ての処理が完了しました'));
  }

  /**
   * ユーザー入力待ち
   */
  private static async waitForInput(prompt: string): Promise<string> {
    return new Promise((resolve) => {
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      rl.question(prompt, (answer: string) => {
        rl.close();
        resolve(answer.trim().toLowerCase());
      });
    });
  }

  /**
   * 確認アクション
   */
  private static async confirmAction(message: string): Promise<boolean> {
    console.log(`\n${chalk.cyan('❓')} ${message}`);
    console.log(chalk.gray('  y = はい, n = いいえ, Enter = はい'));
    
    const input = await this.waitForInput('入力してください: ');
    
    if (input === '' || input === 'y' || input === 'yes' || input === 'はい') {
      console.log(chalk.green('→ はい'));
      return true;
    } else {
      console.log(chalk.yellow('→ いいえ'));
      return false;
    }
  }

  /**
   * プログレスバー付き処理
   */
  static async processWithProgress<T, R>(
    items: T[],
    processFunction: (item: T, index: number) => Promise<R>,
    title: string = '処理中',
    showDetails: boolean = true
  ): Promise<R[]> {
    const results: R[] = [];
    
    console.log(chalk.blue.bold(title));
    console.log('='.repeat(50));
    
    for (let i = 0; i < items.length; i++) {
      const percentage = ((i / items.length) * 100).toFixed(1);
      const progressBar = this.createProgressBar(i, items.length, 30);
      
      process.stdout.write(`\r${progressBar} ${percentage}% (${i}/${items.length})`);
      
      try {
        const result = await processFunction(items[i], i);
        results.push(result);
        
        if (showDetails) {
          process.stdout.write(` ✓`);
        }
      } catch (error) {
        if (showDetails) {
          process.stdout.write(` ✗`);
        }
        // エラーハンドリング（必要に応じて）
        throw error;
      }
    }
    
    // 最終表示
    const progressBar = this.createProgressBar(items.length, items.length, 30);
    process.stdout.write(`\r${progressBar} 100% (${items.length}/${items.length}) ✓\n`);
    
    return results;
  }

  /**
   * プログレスバー作成
   */
  private static createProgressBar(current: number, total: number, width: number = 20): string {
    const percentage = current / total;
    const filled = Math.floor(width * percentage);
    const empty = width - filled;
    
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    return chalk.cyan(`[${bar}]`);
  }
}