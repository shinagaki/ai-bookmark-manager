#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { InteractiveCommand } from './commands/interactive-command';
import { AICommand } from './commands/ai-command';
import { GeminiAICommand } from './commands/gemini-ai-command';
import { SmartOrganizeCommand } from './commands/smart-organize-command';
import { DuplicateTestCommand } from './commands/duplicate-test-command';
import { DuplicateCleanupCommand } from './commands/duplicate-cleanup-command';
import { CompleteOrganizeCommand } from './commands/complete-organize-command';

const program = new Command();

program
  .name('bookmark-manager')
  .description('Chrome bookmark management and organization tool')
  .version('1.0.0');

// Interactive command (default)
program
  .command('interactive')
  .alias('i')
  .description('Start interactive bookmark organization session')
  .action(async () => {
    await InteractiveCommand.run();
  });

// AI command
program
  .command('ai')
  .alias('auto')
  .description('AI-powered automatic bookmark organization')
  .option('-f, --file <path>', 'Path to bookmarks file')
  .action(async (options) => {
    await AICommand.run(options.file);
  });

// Quick AI analysis
program
  .command('quick')
  .alias('q')
  .description('Quick AI analysis of bookmarks')
  .option('-f, --file <path>', 'Path to bookmarks file')
  .action(async (options) => {
    await AICommand.quickAnalysis(options.file);
  });

// Gemini AI command
program
  .command('gemini')
  .alias('g')
  .description('Gemini AI-powered bookmark analysis')
  .option('-f, --file <path>', 'Path to bookmarks file')
  .action(async (options) => {
    await GeminiAICommand.run(options.file);
  });

// Gemini quick analysis
program
  .command('gemini-quick')
  .alias('gq')
  .description('Quick Gemini AI analysis')
  .option('-f, --file <path>', 'Path to bookmarks file')
  .action(async (options) => {
    await GeminiAICommand.quickAnalysis(options.file);
  });

// Smart organize command
program
  .command('smart')
  .alias('s')
  .description('AI-powered smart bookmark organization')
  .option('-f, --file <path>', 'Path to bookmarks file')
  .option('--auto', 'Auto-apply AI recommendations')
  .action(async (options) => {
    await SmartOrganizeCommand.run(options.file, options.auto);
  });

// Quick smart organize
program
  .command('quick-smart')
  .alias('qs')
  .description('Quick smart organization (GitHub etc.)')
  .option('-f, --file <path>', 'Path to bookmarks file')
  .action(async (options) => {
    await SmartOrganizeCommand.quickSmart(options.file);
  });

// Duplicate detection test
program
  .command('test-duplicates')
  .alias('td')
  .description('Test improved duplicate detection')
  .option('-f, --file <path>', 'Path to bookmarks file')
  .action(async (options) => {
    await DuplicateTestCommand.run(options.file);
  });

// URL normalization test
program
  .command('test-urls')
  .description('Test URL normalization')
  .action(async () => {
    await DuplicateTestCommand.testUrlNormalization();
  });

// Compare algorithms
program
  .command('compare-algorithms')
  .alias('ca')
  .description('Compare duplicate detection algorithms')
  .option('-f, --file <path>', 'Path to bookmarks file')
  .action(async (options) => {
    await DuplicateTestCommand.compareAlgorithms(options.file);
  });

// Clean duplicates
program
  .command('clean-duplicates')
  .alias('clean')
  .description('Remove duplicate bookmarks')
  .option('-f, --file <path>', 'Path to bookmarks file')
  .option('--auto', 'Auto-apply without confirmation')
  .option('--dry-run', 'Preview changes without applying')
  .action(async (options) => {
    if (options.dryRun) {
      await DuplicateCleanupCommand.dryRun(options.file);
    } else {
      await DuplicateCleanupCommand.run(options.file, options.auto);
    }
  });

// Complete organize command
program
  .command('organize')
  .alias('o')
  .description('Complete interactive bookmark organization')
  .option('-f, --file <path>', 'Path to bookmarks file')
  .action(async (options) => {
    await CompleteOrganizeCommand.run(options.file);
  });

// Analyze command
program
  .command('analyze')
  .description('Analyze bookmark structure and health')
  .option('-f, --file <path>', 'Path to bookmarks file')
  .option('-v, --verbose', 'Show detailed analysis')
  .action(async (options) => {
    console.log(chalk.blue('📊 Analyzing bookmarks...'));
    console.log('Options:', options);
    // TODO: Implement analyze command
  });

// Cleanup command
program
  .command('cleanup')
  .description('Clean up bookmarks (duplicates, dead links)')
  .option('-f, --file <path>', 'Path to bookmarks file')
  .option('--dry-run', 'Preview changes without applying')
  .option('--duplicates', 'Remove duplicate bookmarks')
  .option('--dead-links', 'Remove dead links')
  .action(async (options) => {
    console.log(chalk.green('🧹 Cleaning up bookmarks...'));
    console.log('Options:', options);
    // TODO: Implement cleanup command
  });

// Export command
program
  .command('export')
  .description('Export bookmarks to various formats')
  .option('-f, --file <path>', 'Path to bookmarks file')
  .option('-o, --output <path>', 'Output file path')
  .option('--format <type>', 'Export format (json, html, csv)', 'json')
  .action(async (options) => {
    console.log(chalk.cyan('📤 Exporting bookmarks...'));
    console.log('Options:', options);
    // TODO: Implement export command
  });

// Import command
program
  .command('import <file>')
  .description('Import bookmarks from file')
  .option('-o, --output <path>', 'Output file path')
  .option('--format <type>', 'Input format (auto, json, html, csv)', 'auto')
  .action(async (file, options) => {
    console.log(chalk.magenta('📥 Importing bookmarks...'));
    console.log('File:', file);
    console.log('Options:', options);
    // TODO: Implement import command
  });

// Error handling
program.exitOverride();

// Show interactive mode if no command provided
if (!process.argv.slice(2).length) {
  InteractiveCommand.run().catch(console.error);
} else {
  try {
    program.parse();
  } catch (error: any) {
    if (error.code === 'commander.help' || error.code === 'commander.helpDisplayed') {
      process.exit(0);
    } else if (error.code === 'commander.version') {
      process.exit(0);
    } else {
      console.error(chalk.red(`Command failed: ${error.message}`));
      process.exit(1);
    }
  }
}