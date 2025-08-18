import { writeFileSync } from 'fs';
import { BookmarkNode } from '../types/bookmark';

export class BookmarkExporter {
  static exportToJSON(bookmarks: BookmarkNode[], outputPath: string): void {
    const data = {
      exportDate: new Date().toISOString(),
      totalBookmarks: this.countBookmarks(bookmarks),
      bookmarks: bookmarks
    };

    writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf-8');
  }

  static exportToHTML(bookmarks: BookmarkNode[], outputPath: string): void {
    let html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
`;

    bookmarks.forEach(root => {
      html += this.convertNodeToHTML(root, 1);
    });

    html += `</DL><p>\n`;

    writeFileSync(outputPath, html, 'utf-8');
  }

  private static convertNodeToHTML(node: BookmarkNode, depth: number): string {
    const indent = '    '.repeat(depth);
    
    if (node.type === 'folder') {
      let html = `${indent}<DT><H3 ADD_DATE="${this.toUnixTimestamp(node.dateAdded)}">${this.escapeHTML(node.name)}</H3>\n`;
      html += `${indent}<DL><p>\n`;
      
      if (node.children) {
        node.children.forEach(child => {
          html += this.convertNodeToHTML(child, depth + 1);
        });
      }
      
      html += `${indent}</DL><p>\n`;
      return html;
    } else {
      const addDate = this.toUnixTimestamp(node.dateAdded);
      const lastUsed = node.dateLastUsed ? this.toUnixTimestamp(node.dateLastUsed) : addDate;
      
      return `${indent}<DT><A HREF="${this.escapeHTML(node.url || '')}" ADD_DATE="${addDate}" LAST_VISIT="${lastUsed}">${this.escapeHTML(node.name)}</A>\n`;
    }
  }

  static exportToCSV(bookmarks: BookmarkNode[], outputPath: string): void {
    const flatBookmarks = this.flattenBookmarks(bookmarks);
    
    let csv = 'Name,URL,Path,Date Added,Date Last Used,Type\n';
    
    flatBookmarks.forEach(bookmark => {
      const row = [
        this.escapeCSV(bookmark.name),
        this.escapeCSV(bookmark.url || ''),
        this.escapeCSV(bookmark.path.join(' > ')),
        bookmark.dateAdded.toISOString(),
        bookmark.dateLastUsed?.toISOString() || '',
        bookmark.type
      ];
      
      csv += row.join(',') + '\n';
    });

    writeFileSync(outputPath, csv, 'utf-8');
  }

  static exportToMarkdown(bookmarks: BookmarkNode[], outputPath: string): void {
    let markdown = `# ブックマーク一覧\n\n`;
    markdown += `エクスポート日時: ${new Date().toLocaleString('ja-JP')}\n`;
    markdown += `総ブックマーク数: ${this.countBookmarks(bookmarks)}\n\n`;

    bookmarks.forEach(root => {
      markdown += this.convertNodeToMarkdown(root, 1);
    });

    writeFileSync(outputPath, markdown, 'utf-8');
  }

  private static convertNodeToMarkdown(node: BookmarkNode, depth: number): string {
    const prefix = '#'.repeat(Math.min(depth + 1, 6));
    
    if (node.type === 'folder') {
      let markdown = `${prefix} ${node.name}\n\n`;
      
      if (node.children) {
        node.children.forEach(child => {
          markdown += this.convertNodeToMarkdown(child, depth + 1);
        });
      }
      
      return markdown;
    } else {
      return `- [${node.name}](${node.url || '#'})\n`;
    }
  }

  private static flattenBookmarks(bookmarks: BookmarkNode[]): BookmarkNode[] {
    const flattened: BookmarkNode[] = [];

    function traverse(node: BookmarkNode) {
      flattened.push(node);
      
      if (node.children) {
        node.children.forEach(traverse);
      }
    }

    bookmarks.forEach(traverse);
    return flattened;
  }

  private static countBookmarks(bookmarks: BookmarkNode[]): number {
    let count = 0;

    function traverse(node: BookmarkNode) {
      if (node.type === 'url') {
        count++;
      }
      
      if (node.children) {
        node.children.forEach(traverse);
      }
    }

    bookmarks.forEach(traverse);
    return count;
  }

  private static escapeHTML(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private static escapeCSV(text: string): string {
    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
      return '"' + text.replace(/"/g, '""') + '"';
    }
    return text;
  }

  private static toUnixTimestamp(date: Date): string {
    return Math.floor(date.getTime() / 1000).toString();
  }

  static generateReport(bookmarks: BookmarkNode[], outputPath: string): void {
    const flatBookmarks = this.flattenBookmarks(bookmarks);
    const urlBookmarks = flatBookmarks.filter(b => b.type === 'url');
    const folders = flatBookmarks.filter(b => b.type === 'folder');

    // Domain analysis
    const domainCounts = new Map<string, number>();
    urlBookmarks.forEach(bookmark => {
      if (bookmark.url) {
        try {
          const domain = new URL(bookmark.url).hostname.replace(/^www\./, '');
          domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
        } catch (error) {
          // Invalid URL, skip
        }
      }
    });

    const topDomains = Array.from(domainCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    // Age analysis
    const now = new Date();
    const oneMonth = 30 * 24 * 60 * 60 * 1000;
    const sixMonths = 6 * oneMonth;
    const oneYear = 12 * oneMonth;

    const recentBookmarks = urlBookmarks.filter(b => 
      now.getTime() - b.dateAdded.getTime() < oneMonth
    );
    const oldBookmarks = urlBookmarks.filter(b => 
      now.getTime() - b.dateAdded.getTime() > oneYear
    );

    let report = `# ブックマーク分析レポート\n\n`;
    report += `生成日時: ${new Date().toLocaleString('ja-JP')}\n\n`;

    report += `## 基本統計\n\n`;
    report += `- 総ブックマーク数: ${urlBookmarks.length}\n`;
    report += `- 総フォルダ数: ${folders.length}\n`;
    report += `- 最近のブックマーク (1ヶ月以内): ${recentBookmarks.length}\n`;
    report += `- 古いブックマーク (1年以上): ${oldBookmarks.length}\n\n`;

    report += `## 上位ドメイン\n\n`;
    topDomains.forEach(([domain, count], index) => {
      report += `${index + 1}. ${domain}: ${count}個\n`;
    });

    report += `\n## フォルダ構造\n\n`;
    bookmarks.forEach(root => {
      report += this.analyzeFolderStructure(root, 0);
    });

    writeFileSync(outputPath, report, 'utf-8');
  }

  private static analyzeFolderStructure(node: BookmarkNode, depth: number): string {
    const indent = '  '.repeat(depth);
    
    if (node.type === 'folder') {
      const childCount = node.children?.length || 0;
      const bookmarkCount = this.countBookmarks([node]);
      
      let result = `${indent}- ${node.name} (${childCount}個のアイテム, ${bookmarkCount}個のブックマーク)\n`;
      
      if (node.children) {
        node.children.forEach(child => {
          result += this.analyzeFolderStructure(child, depth + 1);
        });
      }
      
      return result;
    }
    
    return '';
  }
}