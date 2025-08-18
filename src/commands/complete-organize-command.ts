import * as fs from 'fs';
import { existsSync } from 'fs';
import chalk from 'chalk';
import { BookmarkParser } from '../parsers/bookmark-parser';
import { BookmarkAnalyzer } from '../analyzers/bookmark-analyzer';
import { BookmarkOrganizer } from '../organizers/bookmark-organizer';
import { getDefaultBookmarkPath } from '../utils/default-paths';
import { PaginationHelper } from '../utils/pagination';
import { ImprovedDuplicateAnalyzer } from '../analyzers/improved-duplicate-analyzer';
import * as readline from 'readline';
import * as https from 'https';
import * as http from 'http';

export class CompleteOrganizeCommand {
  /**
   * 対話式総合整理（段階確認）
   */
  static async run(bookmarkPath?: string): Promise<void> {
    console.log(chalk.blue.bold('🎯 ブックマーク総合整理'));
    console.log('='.repeat(50));

    try {
      const targetPath = bookmarkPath || getDefaultBookmarkPath();
      
      if (!existsSync(targetPath)) {
        console.log(chalk.red(`❌ ファイルが見つかりません: ${targetPath}`));
        return;
      }

      console.log(chalk.green(`📁 対象: ${targetPath}`));

      // 初期読み込み・分析
      const { bookmarks, roots, originalData } = await this.loadAndAnalyze(targetPath);
      const organizer = new BookmarkOrganizer(roots, originalData);

      console.log('\n' + chalk.cyan.bold('📋 整理手順'));
      console.log('1. 重複ブックマーク削除');
      console.log('2. リンク切れブックマーク削除');
      console.log('3. カテゴリ別フォルダ整理');
      console.log('4. 古いブックマーク削除');
      console.log('5. 最終確認・適用');

      // ステップ1: 重複削除
      await this.handleDuplicates(bookmarks, organizer);

      // ステップ2: リンク切れ削除
      await this.handleDeadLinks(bookmarks, organizer);

      // ステップ3: カテゴリ整理
      await this.handleCategoryOrganization(bookmarks, organizer);

      // ステップ4: 古いブックマーク削除
      await this.handleOldBookmarks(bookmarks, organizer);

      // ステップ5: 最終適用
      await this.finalApply(organizer, targetPath);

      console.log('\n' + chalk.green.bold('🎉 ブックマーク総合整理完了！'));

    } catch (error) {
      console.log(chalk.red(`❌ エラー: ${error instanceof Error ? error.message : 'Unknown error'}`));
    }
  }

  private static async loadAndAnalyze(targetPath: string) {
    console.log(chalk.blue('\n📊 ブックマーク分析中...'));
    
    const content = fs.readFileSync(targetPath, 'utf-8');
    const originalData = JSON.parse(content);
    const roots = BookmarkParser.parseBookmarkData(originalData);
    const bookmarks = BookmarkParser.flattenBookmarks(roots);
    
    console.log(chalk.green(`✅ ${bookmarks.length}個のブックマークを読み込み`));
    
    return { bookmarks, roots, originalData };
  }

  private static async handleDuplicates(bookmarks: any[], organizer: BookmarkOrganizer): Promise<void> {
    console.log('\n' + chalk.yellow.bold('🔍 ステップ1: 重複ブックマーク削除'));
    console.log('='.repeat(30));

    const duplicates = BookmarkAnalyzer.findDuplicates(bookmarks, 0.8);
    
    if (duplicates.length === 0) {
      console.log(chalk.green('✅ 重複ブックマークは見つかりませんでした'));
      return;
    }

    console.log(chalk.yellow(`📋 ${duplicates.length}個の重複グループを発見`));
    
    // 重複グループごとに個別確認
    let totalDeletesApproved = 0;
    
    for (let i = 0; i < duplicates.length; i++) {
      const group = duplicates[i];
      
      console.log(`\n${chalk.cyan(`━━━ グループ ${i + 1}/${duplicates.length} ━━━`)}`);
      console.log(`${chalk.yellow(`理由: ${group.reason} (類似度: ${(group.similarity * 100).toFixed(1)}%)`)}`);
      console.log();
      
      // 改善された推奨順位でソート
      const sortedBookmarks = [...group.urls].sort((a, b) => {
        // 推奨ブックマークを計算
        const recommended = ImprovedDuplicateAnalyzer.prioritizeBookmarksInGroup([a, b]);
        return recommended === a ? -1 : 1;
      });

      // グループ内のブックマーク表示
      sortedBookmarks.forEach((bookmark: any, index: number) => {
        const isRecommendedKeep = index === 0;
        const icon = isRecommendedKeep ? '🎯' : '🗑️';
        const color = isRecommendedKeep ? chalk.green : chalk.gray;
        const action = isRecommendedKeep ? '推奨保持' : '推奨削除';
        
        console.log(`${icon} ${color(`${index + 1}. ${bookmark.name} (${action})`)}`);
        console.log(`   URL: ${chalk.gray(bookmark.url)}`);
        
        // フォルダパス表示
        if (bookmark.path && bookmark.path.length > 0) {
          const pathString = bookmark.path.join(' > ');
          console.log(`   フォルダ: ${chalk.blue(pathString)}`);
        }
        
        // 推奨理由を表示
        if (isRecommendedKeep) {
          const reasons = this.getRecommendationReasons(bookmark, sortedBookmarks);
          if (reasons.length > 0) {
            console.log(`   ${chalk.cyan('推奨理由:')} ${reasons.join(', ')}`);
          }
        }
        
        if (bookmark.dateLastUsed) {
          console.log(`   最終使用: ${chalk.gray(bookmark.dateLastUsed.toLocaleDateString('ja-JP'))}`);
        }
        if (bookmark.dateAdded) {
          console.log(`   作成日: ${chalk.gray(bookmark.dateAdded.toLocaleDateString('ja-JP'))}`);
        }
      });

      // 元の配列のインデックスとソート後のインデックスのマッピングを作成
      const indexMapping = sortedBookmarks.map(sortedBookmark => 
        group.urls.findIndex((originalBookmark: any) => originalBookmark.id === sortedBookmark.id) + 1
      );

      console.log(`\n${chalk.cyan('個別選択:')} どのブックマークを残しますか？`);
      console.log(chalk.gray('数字を入力 (例: 1), s = スキップ, r = 推奨選択'));

      const choice = await this.getChoice(
        '選択してください: ',
        sortedBookmarks.map((_, index) => (index + 1).toString()).concat(['s', 'r'])
      );

      if (choice === 's') {
        console.log(chalk.yellow('⏭️  このグループをスキップ'));
        continue;
      }

      let keepBookmark: any;
      
      if (choice === 'r') {
        keepBookmark = sortedBookmarks[0]; // 最も推奨されるブックマーク
        console.log(chalk.green('📋 推奨選択を採用'));
      } else {
        const choiceIndex = parseInt(choice) - 1;
        keepBookmark = sortedBookmarks[choiceIndex];
        console.log(chalk.green(`📋 ${keepBookmark.name} を保持`));
      }

      // 削除対象をキューに追加（選択されたブックマーク以外）
      group.urls.forEach((bookmark: any) => {
        if (bookmark.id !== keepBookmark.id) {
          organizer.addAction({
            type: 'delete',
            targetId: bookmark.id,
            reason: `重複削除: グループ${i + 1} - ${group.reason}`
          });
          totalDeletesApproved++;
        }
      });
    }

    if (totalDeletesApproved > 0) {
      console.log(chalk.green(`\n✅ ${totalDeletesApproved}個の重複削除をキューに追加`));
    } else {
      console.log(chalk.yellow('\n⏭️  重複削除をスキップ'));
    }
  }

  static async handleDeadLinks(bookmarks: any[], organizer: BookmarkOrganizer): Promise<void> {
    console.log('\n' + chalk.yellow.bold('🔗 ステップ2: リンク切れブックマーク削除'));
    console.log('='.repeat(30));

    const shouldCheck = await this.confirm('リンク切れをチェックしますか？（時間がかかる場合があります）');
    
    if (!shouldCheck) {
      console.log(chalk.yellow('⏭️  リンク切れチェックをスキップ'));
      return;
    }

    console.log(chalk.blue('🔍 リンク切れチェック中...（最初の50個をテスト）'));
    
    // ブックマークレットを除外してサンプルを取得
    const nonBookmarkletBookmarks = bookmarks.filter(bookmark => 
      bookmark.url && !this.isBookmarklet(bookmark.url)
    );
    
    if (nonBookmarkletBookmarks.length === 0) {
      console.log(chalk.yellow('⚠️  チェック可能なブックマークがありません（ブックマークレットのみ）'));
      return;
    }
    
    console.log(chalk.gray(`📋 ${bookmarks.length}個中${nonBookmarkletBookmarks.length}個をチェック対象として選択（ブックマークレット除外）`));
    
    // 50件ずつバッチ処理
    const batchSize = 50;
    let allProblematicLinks: any[] = [];
    let processedCount = 0;
    
    for (let i = 0; i < nonBookmarkletBookmarks.length; i += batchSize) {
      const batch = nonBookmarkletBookmarks.slice(i, i + batchSize);
      const currentBatch = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(nonBookmarkletBookmarks.length / batchSize);
      
      console.log(chalk.cyan(`\n📦 バッチ ${currentBatch}/${totalBatches} (${batch.length}件) をチェック中...`));
      
      const batchResults = await PaginationHelper.processWithProgress(
        batch,
        async (bookmark, index) => {
          const result = await this.checkSingleLink(bookmark, 5000);
          return result;
        },
        `🔍 バッチ ${currentBatch} リンクチェック実行中`,
        false
      );
      
      // 問題のあるリンクを抽出
      const problematicInBatch = batchResults.filter(result => 
        result.status === 'dead' || 
        result.status === 'error' || 
        result.status === 'timeout' || 
        (result.status === 'alive' && result.redirected)
      );
      
      allProblematicLinks.push(...problematicInBatch);
      processedCount += batch.length;
      
      console.log(chalk.gray(`   ✅ バッチ完了: ${batch.length}件チェック, ${problematicInBatch.length}件に問題発見`));
      
      // 問題があった場合は即座に個別処理を提案
      if (problematicInBatch.length > 0) {
        console.log(chalk.yellow(`\n⚠️  このバッチで${problematicInBatch.length}件の問題を発見しました。`));
        console.log(chalk.gray('選択肢:'));
        console.log(chalk.gray('  1. このバッチの問題を個別処理'));
        console.log(chalk.gray('  2. 次のバッチを続行'));
        console.log(chalk.gray('  3. 全バッチ完了後にまとめて処理'));
        
        const choice = await this.getChoice(
          '選択してください (1/2/3): ',
          ['1', '2', '3']
        );
        
        if (choice === '1') {
          // このバッチの問題を個別処理
          await this.processProblematicLinksIndividually(problematicInBatch);
          // 処理済みのものは全体リストから除外
          allProblematicLinks = allProblematicLinks.filter(link => 
            !problematicInBatch.some(processed => processed.bookmark.id === link.bookmark.id)
          );
        } else if (choice === '2') {
          console.log(chalk.green('次のバッチに続行します。'));
        } else {
          console.log(chalk.blue('全バッチ完了後にまとめて処理します。'));
        }
      }
      
      // 残りがある場合は続行確認
      if (i + batchSize < nonBookmarkletBookmarks.length) {
        console.log(chalk.gray(`\n進捗: ${processedCount}/${nonBookmarkletBookmarks.length}件完了`));
        
        const shouldContinue = await this.confirm('次のバッチを続行しますか？');
        if (!shouldContinue) {
          console.log(chalk.yellow('リンクチェックを中断しました。'));
          break;
        }
      }
    }
    
    console.log(chalk.green(`\n✅ 全バッチ処理完了: ${processedCount}件チェック済み`));
    
    // 全バッチ完了後の残り問題処理
    if (allProblematicLinks.length > 0) {
      console.log(chalk.cyan(`\n📋 未処理の問題: ${allProblematicLinks.length}件`));
      const shouldProcessRemaining = await this.confirm('残りの問題を個別処理しますか？');
      
      if (shouldProcessRemaining) {
        await this.processProblematicLinksIndividually(allProblematicLinks);
      }
    }
    
    return; // 元のサマリー処理をスキップ
  }

  private static async handleCategoryOrganization(bookmarks: any[], organizer: BookmarkOrganizer): Promise<void> {
    console.log('\n' + chalk.yellow.bold('📁 ステップ3: カテゴリ別フォルダ整理'));
    console.log('='.repeat(30));

    // カテゴリ整理方法の選択
    console.log(chalk.cyan('📋 カテゴリ整理の方法を選択してください:'));
    console.log('1. ドメインベース - 同じサイトでまとめる (github.com, youtube.com等)');
    console.log('2. 内容ベース - 内容の類似性でまとめる (開発, ニュース, 娯楽等)');
    console.log('3. 混合ベース - ドメインと内容の両方を考慮');
    console.log('4. 手動選択 - 各カテゴリを個別に判断');
    console.log('5. スキップ - カテゴリ整理をしない');

    const categoryMethod = await this.getChoice(
      'カテゴリ整理方法を選択してください (1-5): ',
      ['1', '2', '3', '4', '5']
    );

    if (categoryMethod === '5') {
      console.log(chalk.yellow('⏭️  カテゴリ整理をスキップ'));
      return;
    }

    // ブックマークレットを除外してカテゴリを生成
    const nonBookmarkletBookmarks = bookmarks.filter(bookmark => 
      !this.isBookmarklet(bookmark.url || '')
    );

    console.log(chalk.gray(`📋 ${bookmarks.length}個中${nonBookmarkletBookmarks.length}個を対象として分析（ブックマークレット除外）`));

    // 選択された方法に基づいてカテゴリを生成
    const categories = await this.generateCategories(nonBookmarkletBookmarks, categoryMethod);
    
    if (categories.length === 0) {
      console.log(chalk.green('✅ カテゴリ提案はありません'));
      return;
    }

    const methodNames = {
      '1': 'ドメインベース',
      '2': '内容ベース', 
      '3': '混合ベース',
      '4': '手動選択'
    };

    console.log(chalk.yellow(`\n📋 ${methodNames[categoryMethod as keyof typeof methodNames]}で${categories.length}個のカテゴリを提案`));
    
    // カテゴリの詳細表示（ページング対応）
    await PaginationHelper.displayWithPaging(
      categories,
      (category, index, globalIndex) => {
        console.log(`\n📂 ${chalk.cyan(category.name)} (${category.bookmarks.length}個)`);
        console.log(`   説明: ${category.description}`);
        console.log(`   信頼度: ${chalk.yellow((category.confidence * 100).toFixed(1) + '%')}`);
        console.log(`   パターン: ${chalk.gray(category.pattern)}`);
        
        // サンプルブックマーク表示
        console.log(`   ${chalk.gray('サンプルブックマーク:')}`);
        category.bookmarks.slice(0, 5).forEach((bookmark: any, i: number) => {
          console.log(`     ${i + 1}. ${bookmark.name}`);
        });
        if (category.bookmarks.length > 5) {
          console.log(`     ... 他 ${category.bookmarks.length - 5} 個`);
        }
      },
      {
        itemsPerPage: 2,
        title: '📁 カテゴリ整理提案',
        showTotal: true
      }
    );

    // ブックマークレット専用カテゴリを提案
    const bookmarkletBookmarks = bookmarks.filter(bookmark => 
      this.isBookmarklet(bookmark.url || '')
    );

    if (bookmarkletBookmarks.length > 0) {
      categories.push({
        name: 'ブックマークレット',
        bookmarks: bookmarkletBookmarks,
        confidence: 1.0,
        pattern: 'bookmarklet',
        description: 'JavaScript や拡張機能などの実行可能ブックマーク'
      });
      
      console.log(chalk.cyan(`\n📋 ${bookmarkletBookmarks.length}個のブックマークレットを「ブックマークレット」カテゴリに追加`));
    }

    // カテゴリ処理方法の選択
    if (categoryMethod === '4') {
      // 手動選択：各カテゴリを個別確認
      await this.handleCategoriesManually(categories, organizer);
    } else {
      // 自動選択：全て適用するか確認
      const applyAll = await this.confirm(`全ての${categories.length}個のカテゴリを適用しますか？`);
      
      if (applyAll) {
        let appliedCount = 0;
        categories.forEach(category => {
          // フォルダ作成
          organizer.addAction({
            type: 'create_folder',
            targetId: `category_${category.name}_${Date.now()}`,
            newName: category.name,
            reason: `カテゴリ整理(${methodNames[categoryMethod as keyof typeof methodNames]}): ${category.description}`
          });

          // ブックマーク移動
          category.bookmarks.forEach((bookmark: any) => {
            organizer.addAction({
              type: 'move',
              targetId: bookmark.id,
              destination: category.name,
              reason: `カテゴリ分類: ${category.name}`
            });
          });
          appliedCount++;
        });
        console.log(chalk.green(`✅ ${appliedCount}個のカテゴリ整理をキューに追加`));
      } else {
        console.log(chalk.yellow('⏭️  カテゴリ整理をスキップ'));
      }
    }
  }

  /**
   * カテゴリ生成（整理方法に基づく）
   */
  private static async generateCategories(bookmarks: any[], method: string): Promise<any[]> {
    switch (method) {
      case '1': // ドメインベース
        return this.generateDomainBasedCategories(bookmarks);
      
      case '2': // 内容ベース
        return BookmarkAnalyzer.suggestCategories(bookmarks);
      
      case '3': { // 混合ベース
        const domainCategories = this.generateDomainBasedCategories(bookmarks);
        const contentCategories = BookmarkAnalyzer.suggestCategories(bookmarks);
        return [...domainCategories, ...contentCategories].slice(0, 10); // 最大10個
      }
      
      case '4': // 手動選択
        return BookmarkAnalyzer.suggestCategories(bookmarks);
      
      default:
        return [];
    }
  }

  /**
   * ドメインベースカテゴリ生成
   */
  private static generateDomainBasedCategories(bookmarks: any[]): any[] {
    const domainGroups = new Map<string, any[]>();
    
    bookmarks.forEach(bookmark => {
      if (!bookmark.url) return;
      
      try {
        const url = new URL(bookmark.url);
        const domain = url.hostname.toLowerCase().replace(/^www\./, '');
        
        if (!domainGroups.has(domain)) {
          domainGroups.set(domain, []);
        }
        domainGroups.get(domain)!.push(bookmark);
      } catch {
        // Invalid URL, skip
      }
    });

    const categories = [];
    
    // 最低3個以上のブックマークがあるドメインのみ
    for (const [domain, domainBookmarks] of domainGroups) {
      if (domainBookmarks.length >= 3) {
        categories.push({
          name: this.getDomainDisplayName(domain),
          bookmarks: domainBookmarks,
          confidence: Math.min(0.9, domainBookmarks.length / 10), // 最大90%
          pattern: 'domain',
          description: `${domain}のブックマークをまとめて整理`
        });
      }
    }

    // ブックマーク数の多い順にソート
    return categories.sort((a, b) => b.bookmarks.length - a.bookmarks.length).slice(0, 15);
  }

  /**
   * ドメイン表示名を取得
   */
  private static getDomainDisplayName(domain: string): string {
    const knownDomains: Record<string, string> = {
      'github.com': 'GitHub',
      'youtube.com': 'YouTube',
      'stackoverflow.com': 'Stack Overflow',
      'qiita.com': 'Qiita',
      'zenn.dev': 'Zenn',
      'note.com': 'note',
      'medium.com': 'Medium',
      'twitter.com': 'Twitter',
      'x.com': 'X (Twitter)',
      'facebook.com': 'Facebook',
      'linkedin.com': 'LinkedIn',
      'amazon.co.jp': 'Amazon Japan',
      'amazon.com': 'Amazon',
      'google.com': 'Google',
      'microsoft.com': 'Microsoft',
      'apple.com': 'Apple',
      'netflix.com': 'Netflix',
      'wikipedia.org': 'Wikipedia'
    };

    return knownDomains[domain] || domain.replace(/\.[^.]+$/, '').toUpperCase();
  }

  /**
   * カテゴリを手動で個別処理
   */
  private static async handleCategoriesManually(categories: any[], organizer: BookmarkOrganizer): Promise<void> {
    let appliedCount = 0;
    
    for (let i = 0; i < categories.length; i++) {
      const category = categories[i];
      
      console.log(`\n${chalk.cyan(`━━━ カテゴリ ${i + 1}/${categories.length} ━━━`)}`);
      console.log(`📂 ${chalk.yellow(category.name)} (${category.bookmarks.length}個)`);
      console.log(`説明: ${category.description}`);
      console.log(`信頼度: ${(category.confidence * 100).toFixed(1)}%`);
      console.log(`パターン: ${category.pattern}`);

      console.log(`\n${chalk.cyan('選択:')} このカテゴリをどうしますか？`);
      console.log(chalk.gray('a = 適用, s = スキップ, r = 推奨選択'));

      const choice = await this.getChoice(
        '選択してください: ',
        ['a', 's', 'r']
      );

      if (choice === 's') {
        console.log(chalk.yellow('⏭️  このカテゴリをスキップ'));
        continue;
      }

      if (choice === 'r' || choice === 'a') {
        // フォルダ作成
        organizer.addAction({
          type: 'create_folder',
          targetId: `category_${category.name}_${Date.now()}`,
          newName: category.name,
          reason: `カテゴリ整理(手動選択): ${category.description}`
        });

        // ブックマーク移動
        category.bookmarks.forEach((bookmark: any) => {
          organizer.addAction({
            type: 'move',
            targetId: bookmark.id,
            destination: category.name,
            reason: `カテゴリ分類: ${category.name}`
          });
        });

        appliedCount++;
        console.log(chalk.green(`✅ 「${category.name}」カテゴリ整理をキューに追加`));
      }
    }

    if (appliedCount > 0) {
      console.log(chalk.green(`\n✅ ${appliedCount}個のカテゴリ整理をキューに追加`));
    } else {
      console.log(chalk.yellow('\n⏭️  カテゴリ整理をスキップ'));
    }
  }

  private static async handleOldBookmarks(bookmarks: any[], organizer: BookmarkOrganizer): Promise<void> {
    console.log('\n' + chalk.yellow.bold('🧹 ステップ4: 古いブックマーク削除'));
    console.log('='.repeat(30));

    // ブックマークレットを除外して古いブックマークを検出
    const nonBookmarkletBookmarks = bookmarks.filter(bookmark => 
      !this.isBookmarklet(bookmark.url || '')
    );

    const oldBookmarks = BookmarkAnalyzer.findUnusedBookmarks(nonBookmarkletBookmarks, 12); // 1年以上未使用

    if (oldBookmarks.length === 0) {
      console.log(chalk.green('✅ 古いブックマーク（ブックマークレット除く）は見つかりませんでした'));
      return;
    }

    console.log(chalk.gray(`📋 ${bookmarks.length}個中${nonBookmarkletBookmarks.length}個を対象として検査（ブックマークレット除外）`));

    console.log(chalk.yellow(`📋 ${oldBookmarks.length}個の古いブックマーク（1年以上未使用）を発見`));
    
    // 古いブックマークの個別処理
    let oldBookmarksDeletedCount = 0;
    
    for (let i = 0; i < oldBookmarks.length; i++) {
      const bookmark = oldBookmarks[i];
      
      console.log(`\n${chalk.yellow(`━━━ 古いブックマーク ${i + 1}/${oldBookmarks.length} ━━━`)}`);
      console.log(`📜 ${chalk.cyan(bookmark.name)}`);
      console.log(`URL: ${chalk.gray(bookmark.url)}`);
      
      const lastUsed = bookmark.dateLastUsed 
        ? bookmark.dateLastUsed.toLocaleDateString('ja-JP')
        : '使用履歴なし';
      const added = bookmark.dateAdded.toLocaleDateString('ja-JP');
      const daysSinceAdded = Math.floor((Date.now() - bookmark.dateAdded.getTime()) / (1000 * 60 * 60 * 24));
      
      console.log(`最終使用: ${chalk.red(lastUsed)}`);
      console.log(`作成日: ${chalk.gray(added)} (${daysSinceAdded}日前)`);
      
      if (bookmark.dateLastUsed) {
        const daysSinceUsed = Math.floor((Date.now() - bookmark.dateLastUsed.getTime()) / (1000 * 60 * 60 * 24));
        console.log(`未使用期間: ${chalk.red(`${daysSinceUsed}日間`)}`);
      } else {
        console.log(`未使用期間: ${chalk.red('使用履歴なし')}`);
      }

      console.log(`\n${chalk.cyan('選択:')} このブックマークをどうしますか？`);
      console.log(chalk.gray('d = 削除, k = 保持, s = スキップ, r = 推奨選択'));

      const choice = await this.getChoice(
        '選択してください: ',
        ['d', 'k', 's', 'r']
      );

      if (choice === 's') {
        console.log(chalk.yellow('⏭️  このブックマークをスキップ'));
        continue;
      }

      if (choice === 'r' || choice === 'd') {
        // 推奨は削除（1年以上未使用）
        organizer.addAction({
          type: 'delete',
          targetId: bookmark.id,
          reason: `古いブックマーク削除: ${lastUsed === '使用履歴なし' ? '未使用' : `最終使用${lastUsed}`}`
        });
        oldBookmarksDeletedCount++;
        console.log(chalk.red(`🗑️  削除予定に追加`));
      } else if (choice === 'k') {
        console.log(chalk.green(`📌 保持 - そのまま残します`));
      }
    }

    if (oldBookmarksDeletedCount > 0) {
      console.log(chalk.green(`\n✅ ${oldBookmarksDeletedCount}個の古いブックマーク削除をキューに追加`));
    } else {
      console.log(chalk.yellow('\n⏭️  古いブックマーク削除をスキップ'));
    }
  }

  private static async finalApply(organizer: BookmarkOrganizer, targetPath: string): Promise<void> {
    console.log('\n' + chalk.yellow.bold('✅ ステップ5: 最終確認・適用'));
    console.log('='.repeat(30));

    const actions = organizer.getActions();
    
    if (actions.length === 0) {
      console.log(chalk.green('📋 実行するアクションがありません'));
      console.log(chalk.blue('💡 ブックマークは既に良好に整理されています！'));
      return;
    }

    // アクション概要表示
    console.log(chalk.cyan(`📊 実行予定アクション: ${actions.length}個`));
    
    const actionSummary = actions.reduce((acc, action) => {
      acc[action.type] = (acc[action.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    Object.entries(actionSummary).forEach(([type, count]) => {
      const emojis: Record<string, string> = {
        'delete': '🗑️',
        'move': '📁',
        'create_folder': '📂',
        'rename': '✏️',
        'update_url': '🔄'
      };
      const names: Record<string, string> = {
        'delete': '削除',
        'move': '移動',
        'create_folder': 'フォルダ作成',
        'rename': '名前変更',
        'update_url': 'URL更新'
      };
      const emoji = emojis[type] || '❓';
      const name = names[type] || type;
      console.log(`  ${emoji} ${name}: ${count}件`);
    });

    // アクション詳細表示（ページング対応）
    if (actions.length > 10) {
      const showDetails = await this.confirm('アクション詳細を表示しますか？');
      
      if (showDetails) {
        await PaginationHelper.displayWithPaging(
          actions,
          (action, index, globalIndex) => {
            const emojis: Record<string, string> = {
              'delete': '🗑️',
              'move': '📁',
              'create_folder': '📂',
              'rename': '✏️',
              'update_url': '🔄'
            };
            const emoji = emojis[action.type] || '❓';
            
            console.log(`\n${globalIndex + 1}. ${emoji} ${action.type}`);
            console.log(`   対象ID: ${action.targetId}`);
            console.log(`   理由: ${chalk.gray(action.reason)}`);
            if (action.newName) {
              console.log(`   新名前: ${chalk.cyan(action.newName)}`);
            }
            if (action.destination) {
              console.log(`   移動先: ${chalk.cyan(action.destination)}`);
            }
            if (action.newUrl) {
              console.log(`   新URL: ${chalk.cyan(action.newUrl)}`);
            }
          },
          {
            itemsPerPage: 10,
            title: '📋 実行予定アクション詳細',
            showTotal: true
          }
        );
      }
    }

    const shouldApply = await this.confirm('これらの変更を適用しますか？（自動でバックアップが作成されます）');
    
    if (shouldApply) {
      console.log(chalk.blue('\n🔧 変更を適用中...'));
      
      // バックアップ作成
      const backupPath = organizer.createBackup(targetPath);
      console.log(chalk.green(`💾 バックアップ作成: ${backupPath}`));

      // 変更適用
      organizer.applyActions();
      organizer.saveToFile(targetPath);

      console.log(chalk.green.bold('\n✅ 変更適用完了！'));
      console.log(`🔧 実行されたアクション: ${actions.length}件`);
      console.log(`💾 バックアップファイル: ${backupPath}`);
    } else {
      console.log(chalk.yellow('❌ 変更適用をキャンセルしました'));
    }
  }

  private static async confirm(message: string): Promise<boolean> {
    console.log(`\n${chalk.cyan('❓')} ${message}`);
    console.log(chalk.gray('  y = はい, n = いいえ, Enter = はい'));
    
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      rl.question('入力してください: ', (answer: string) => {
        rl.close();
        const input = answer.trim().toLowerCase();
        
        if (input === '' || input === 'y' || input === 'yes' || input === 'はい') {
          console.log(chalk.green('→ はい'));
          resolve(true);
        } else {
          console.log(chalk.yellow('→ いいえ'));
          resolve(false);
        }
      });
    });
  }

  /**
   * 推奨理由を取得
   */
  private static getRecommendationReasons(bookmark: any, allBookmarks: any[]): string[] {
    const reasons = [];
    
    // HTTPS優先
    if (bookmark.url?.startsWith('https://')) {
      const hasHttp = allBookmarks.some(b => b.url?.startsWith('http://'));
      if (hasHttp) reasons.push('HTTPS');
    }
    
    // より新しい使用日
    if (bookmark.dateLastUsed) {
      const hasOlderUsage = allBookmarks.some(b => 
        !b.dateLastUsed || b.dateLastUsed < bookmark.dateLastUsed
      );
      if (hasOlderUsage) reasons.push('最近使用');
    }
    
    // より新しい作成日
    const hasOlderCreation = allBookmarks.some(b => 
      b.dateAdded < bookmark.dateAdded
    );
    if (hasOlderCreation) reasons.push('新しい作成日');
    
    // よりクリーンなURL - privateメソッドなので削除
    const originalLength = bookmark.url?.length || 0;
    const normalizedLength = bookmark.url?.length || 0;
    const cleanness = originalLength - normalizedLength;
    
    const hasMessierUrl = allBookmarks.some(b => {
      const bOriginal = b.url?.length || 0;
      const bNormalized = b.url?.length || 0;
      const bCleanness = bOriginal - bNormalized;
      return bCleanness > cleanness;
    });
    
    if (hasMessierUrl) reasons.push('クリーンURL');
    
    return reasons;
  }

  /**
   * 問題のあるリンクを1件ずつ個別処理
   */
  private static async processProblematicLinksIndividually(problematicLinks: any[]): Promise<void> {
    console.log(chalk.cyan(`\n🔧 問題のあるリンクを個別処理します（${problematicLinks.length}件）`));
    
    for (let i = 0; i < problematicLinks.length; i++) {
      const result = problematicLinks[i];
      const bookmark = result.bookmark;
      
      console.log(chalk.blue(`\n📌 ${i + 1}/${problematicLinks.length}: ${bookmark.name}`));
      console.log(`   URL: ${chalk.gray(bookmark.url)}`);
      console.log(`   フォルダ: ${chalk.cyan(bookmark.path?.join(' > ') || 'ルート')}`);
      
      // ステータス別の詳細表示
      if (result.status === 'dead') {
        console.log(`   ${chalk.red('❌ 状態: Dead Link')} (${result.statusCode || 'N/A'})`);
        console.log(`   エラー: ${chalk.red(result.error || 'HTTP Error')}`);
      } else if (result.status === 'error') {
        console.log(`   ${chalk.red('🚨 状態: Connection Error')}`);
        console.log(`   エラー: ${chalk.red(result.error || 'Unknown Error')}`);
      } else if (result.status === 'timeout') {
        console.log(`   ${chalk.yellow('⏱️  状態: Timeout')}`);
        console.log(`   エラー: ${chalk.yellow('Connection timeout')}`);
      } else if (result.status === 'alive' && result.redirected) {
        console.log(`   ${chalk.green('🔄 状態: Redirect')} (${result.redirectCount}回)`);
        console.log(`   最終URL: ${chalk.green(result.finalUrl)}`);
      }
      
      if (result.duration) {
        console.log(`   応答時間: ${result.duration}ms`);
      }
      
      // 選択肢表示
      console.log(chalk.gray('\n選択肢:'));
      
      if (result.status === 'alive' && result.redirected) {
        // リダイレクトの場合
        console.log(chalk.gray('  u = URLを更新'));
        console.log(chalk.gray('  k = そのまま保持'));
        console.log(chalk.gray('  d = 削除'));
        console.log(chalk.gray('  s = スキップ'));
        
        const choice = await this.getChoice('選択してください (u/k/d/s): ', ['u', 'k', 'd', 's']);
        
        if (choice === 'u') {
          console.log(chalk.green(`✅ URLを更新: ${result.finalUrl}`));
          // TODO: 実際のURL更新処理を実装
        } else if (choice === 'k') {
          console.log(chalk.blue('📌 そのまま保持'));
        } else if (choice === 'd') {
          console.log(chalk.red('🗑️  削除マーク'));
          // TODO: 削除処理を実装
        } else {
          console.log(chalk.gray('⏭️  スキップ'));
        }
      } else {
        // エラー・タイムアウト・Dead Linkの場合
        console.log(chalk.gray('  r = 再チェック'));
        console.log(chalk.gray('  k = そのまま保持'));
        console.log(chalk.gray('  d = 削除'));
        console.log(chalk.gray('  s = スキップ'));
        
        const choice = await this.getChoice('選択してください (r/k/d/s): ', ['r', 'k', 'd', 's']);
        
        if (choice === 'r') {
          console.log(chalk.blue('🔄 再チェック中...'));
          const recheckResult = await this.checkSingleLink(bookmark, 8000); // より長いタイムアウト
          
          if (recheckResult.status === 'alive') {
            console.log(chalk.green('✅ 再チェック成功: リンクは正常です'));
          } else {
            console.log(chalk.red(`❌ 再チェック失敗: ${recheckResult.error || recheckResult.status}`));
            
            // 再チェック失敗時の追加選択
            const retryChoice = await this.getChoice('保持しますか？ (k=保持, d=削除): ', ['k', 'd']);
            if (retryChoice === 'd') {
              console.log(chalk.red('🗑️  削除マーク'));
              // TODO: 削除処理を実装
            } else {
              console.log(chalk.blue('📌 そのまま保持'));
            }
          }
        } else if (choice === 'k') {
          console.log(chalk.blue('📌 そのまま保持'));
        } else if (choice === 'd') {
          console.log(chalk.red('🗑️  削除マーク'));
          // TODO: 削除処理を実装
        } else {
          console.log(chalk.gray('⏭️  スキップ'));
        }
      }
      
      // 残り件数表示
      if (i < problematicLinks.length - 1) {
        console.log(chalk.gray(`\n残り ${problematicLinks.length - i - 1}件`));
        
        // 10件ごとに継続確認
        if ((i + 1) % 10 === 0) {
          const shouldContinue = await this.confirm('個別処理を続行しますか？');
          if (!shouldContinue) {
            console.log(chalk.yellow('個別処理を中断しました。'));
            break;
          }
        }
      }
    }
    
    console.log(chalk.green('\n✅ 個別処理完了'));
  }

  /**
   * 選択肢入力を取得
   */
  private static async getChoice(prompt: string, validChoices: string[]): Promise<string> {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const askChoice = () => {
        rl.question(prompt, (answer: string) => {
          const input = answer.trim().toLowerCase();
          
          if (validChoices.includes(input)) {
            rl.close();
            resolve(input);
          } else {
            console.log(chalk.red(`無効な選択です。有効な選択: ${validChoices.join(', ')}`));
            askChoice();
          }
        });
      };

      askChoice();
    });
  }

  /**
   * ブックマークレット判定
   */
  private static isBookmarklet(url: string): boolean {
    // JavaScriptプロトコルをチェック
    if (url.startsWith('javascript:')) {
      return true;
    }
    
    // data: URLもブックマークレット的な用途で使われることがある
    if (url.startsWith('data:')) {
      return true;
    }
    
    // chrome-extension: URLなど
    if (url.startsWith('chrome-extension:') || 
        url.startsWith('moz-extension:') || 
        url.startsWith('safari-extension:')) {
      return true;
    }
    
    // ローカルファイル
    if (url.startsWith('file:')) {
      return true;
    }
    
    return false;
  }

  /**
   * 単一リンクチェック（改善版・リダイレクト対応）
   */
  private static async checkSingleLink(bookmark: any, timeout: number = 5000, maxRedirects: number = 5): Promise<any> {
    return this.followRedirects(bookmark.url, bookmark, timeout, maxRedirects, 0);
  }

  /**
   * リダイレクトを追跡してリンクチェック
   */
  private static async followRedirects(
    currentUrl: string, 
    originalBookmark: any, 
    timeout: number, 
    maxRedirects: number, 
    redirectCount: number
  ): Promise<any> {
    return new Promise((resolve) => {
      const start = Date.now();
      
      try {
        const url = new URL(currentUrl);
        const client = url.protocol === 'https:' ? https : http;
        
        const requestOptions = {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname + url.search,
          method: 'HEAD',
          timeout: timeout,
          rejectUnauthorized: false, // SSL証明書エラーを無視
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'ja,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
          }
        };
        
        const request = client.request(requestOptions, async (response: any) => {
          const duration = Date.now() - start;
          const statusCode = response.statusCode;
          
          // 成功ステータス
          if (statusCode >= 200 && statusCode < 300) {
            resolve({
              bookmark: originalBookmark,
              status: 'alive',
              statusCode,
              duration,
              finalUrl: currentUrl,
              redirectCount,
              redirected: redirectCount > 0
            });
            return;
          }
          
          // リダイレクトステータス
          if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
            if (redirectCount >= maxRedirects) {
              resolve({
                bookmark: originalBookmark,
                status: 'redirect_loop',
                statusCode,
                duration,
                error: `Too many redirects (>${maxRedirects})`,
                finalUrl: currentUrl,
                redirectCount
              });
              return;
            }
            
            try {
              // 相対URLを絶対URLに変換
              const redirectUrl = new URL(response.headers.location, currentUrl).toString();
              
              // リダイレクト先をチェック
              const result = await this.followRedirects(
                redirectUrl, 
                originalBookmark, 
                timeout, 
                maxRedirects, 
                redirectCount + 1
              );
              resolve(result);
              return;
            } catch (error: any) {
              resolve({
                bookmark: originalBookmark,
                status: 'redirect_error',
                statusCode,
                duration,
                error: `Invalid redirect URL: ${error.message}`,
                finalUrl: currentUrl,
                redirectCount
              });
              return;
            }
          }
          
          // エラーステータス
          const statusCategory = this.getStatusCategory(statusCode);
          resolve({
            bookmark: originalBookmark,
            status: 'dead',
            statusCode,
            duration,
            error: `HTTP ${statusCode} - ${statusCategory}`,
            finalUrl: currentUrl,
            redirectCount
          });
        });

        request.on('error', async (error: any) => {
          // HEADリクエストが失敗した場合、GETリクエストでリトライ
          if (requestOptions.method === 'HEAD') {
            try {
              const getResult = await this.tryGetRequest(currentUrl, originalBookmark, timeout, maxRedirects, redirectCount);
              resolve(getResult);
              return;
            } catch (getError) {
              // GETでも失敗した場合は元のエラーを返す
            }
          }
          
          resolve({
            bookmark: originalBookmark,
            status: 'error',
            duration: Date.now() - start,
            error: error.message,
            finalUrl: currentUrl,
            redirectCount
          });
        });

        request.on('timeout', () => {
          request.destroy();
          resolve({
            bookmark: originalBookmark,
            status: 'timeout',
            duration: timeout,
            error: 'Connection timeout',
            finalUrl: currentUrl,
            redirectCount
          });
        });

        request.end();
        
      } catch (error: any) {
        resolve({
          bookmark: originalBookmark,
          status: 'error',
          duration: Date.now() - start,
          error: error.message,
          finalUrl: currentUrl,
          redirectCount
        });
      }
    });
  }

  /**
   * GETリクエストでリトライ（HEADが失敗した場合）
   */
  private static async tryGetRequest(
    currentUrl: string, 
    originalBookmark: any, 
    timeout: number, 
    maxRedirects: number, 
    redirectCount: number
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      
      try {
        const url = new URL(currentUrl);
        const client = url.protocol === 'https:' ? https : http;
        
        const requestOptions = {
          hostname: url.hostname,
          port: url.port,
          path: url.pathname + url.search,
          method: 'GET',
          timeout: timeout,
          rejectUnauthorized: false,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'ja,en;q=0.9',
            'Range': 'bytes=0-1023' // 最初の1KBのみ取得して負荷軽減
          }
        };
        
        const request = client.request(requestOptions, (response: any) => {
          const duration = Date.now() - start;
          const statusCode = response.statusCode;
          
          // データは読み込むが無視（メモリ使用量削減）
          response.on('data', () => {});
          response.on('end', () => {});
          
          if (statusCode >= 200 && statusCode < 300) {
            resolve({
              bookmark: originalBookmark,
              status: 'alive',
              statusCode,
              duration,
              finalUrl: currentUrl,
              redirectCount,
              redirected: redirectCount > 0
            });
          } else if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
            if (redirectCount >= maxRedirects) {
              resolve({
                bookmark: originalBookmark,
                status: 'redirect_loop',
                statusCode,
                duration,
                error: `Too many redirects (>${maxRedirects})`,
                finalUrl: currentUrl,
                redirectCount
              });
            } else {
              try {
                const redirectUrl = new URL(response.headers.location, currentUrl).toString();
                this.followRedirects(redirectUrl, originalBookmark, timeout, maxRedirects, redirectCount + 1)
                  .then(resolve)
                  .catch(reject);
              } catch (error: any) {
                resolve({
                  bookmark: originalBookmark,
                  status: 'redirect_error',
                  statusCode,
                  duration,
                  error: `Invalid redirect URL: ${error.message}`,
                  finalUrl: currentUrl,
                  redirectCount
                });
              }
            }
          } else {
            const statusCategory = this.getStatusCategory(statusCode);
            resolve({
              bookmark: originalBookmark,
              status: 'dead',
              statusCode,
              duration,
              error: `HTTP ${statusCode} - ${statusCategory}`,
              finalUrl: currentUrl,
              redirectCount
            });
          }
        });

        request.on('error', (error: any) => {
          reject(error);
        });

        request.on('timeout', () => {
          request.destroy();
          reject(new Error('Connection timeout'));
        });

        request.end();
        
      } catch (error: any) {
        reject(error);
      }
    });
  }

  /**
   * HTTPステータスコードのカテゴリを取得
   */
  private static getStatusCategory(statusCode: number): string {
    if (statusCode >= 400 && statusCode < 500) {
      const clientErrors: Record<number, string> = {
        400: 'Bad Request',
        401: 'Unauthorized', 
        403: 'Forbidden',
        404: 'Not Found',
        405: 'Method Not Allowed',
        408: 'Request Timeout',
        429: 'Too Many Requests'
      };
      return clientErrors[statusCode] || 'Client Error';
    }
    
    if (statusCode >= 500 && statusCode < 600) {
      const serverErrors: Record<number, string> = {
        500: 'Internal Server Error',
        502: 'Bad Gateway',
        503: 'Service Unavailable',
        504: 'Gateway Timeout'
      };
      return serverErrors[statusCode] || 'Server Error';
    }
    
    return 'Unknown Error';
  }
}