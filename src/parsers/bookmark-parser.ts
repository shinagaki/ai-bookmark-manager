import { readFileSync } from 'fs';
import { ChromeBookmarkFile, ChromeBookmark, BookmarkNode } from '../types/bookmark';

export class BookmarkParser {
  private static convertTimestamp(chromeTimestamp: string): Date {
    // Chrome uses microseconds since January 1, 1601 UTC
    const CHROME_EPOCH_OFFSET = 11644473600000000; // microseconds
    const timestamp = parseInt(chromeTimestamp, 10);
    const unixTimestamp = (timestamp - CHROME_EPOCH_OFFSET) / 1000; // convert to milliseconds
    return new Date(unixTimestamp);
  }

  private static buildPath(node: ChromeBookmark, parentPath: string[] = []): string[] {
    return [...parentPath, node.name];
  }

  private static convertBookmark(
    chromeBookmark: ChromeBookmark,
    parentPath: string[] = [],
    parent?: BookmarkNode
  ): BookmarkNode {
    const path = this.buildPath(chromeBookmark, parentPath);
    
    const bookmark: BookmarkNode = {
      id: chromeBookmark.id,
      name: chromeBookmark.name,
      type: chromeBookmark.type,
      url: chromeBookmark.url,
      dateAdded: this.convertTimestamp(chromeBookmark.date_added),
      dateLastUsed: chromeBookmark.date_last_used 
        ? this.convertTimestamp(chromeBookmark.date_last_used)
        : undefined,
      guid: chromeBookmark.guid,
      path,
      parent
    };

    if (chromeBookmark.children) {
      bookmark.children = chromeBookmark.children.map(child =>
        this.convertBookmark(child, path, bookmark)
      );
    }

    return bookmark;
  }

  static parseFile(filePath: string): BookmarkNode[] {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const chromeData: ChromeBookmarkFile = JSON.parse(content);
      
      return this.parseBookmarkData(chromeData);
    } catch (error) {
      throw new Error(`Failed to parse bookmark file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  static parseBookmarkData(chromeData: ChromeBookmarkFile): BookmarkNode[] {
    const roots: BookmarkNode[] = [];

    // Parse bookmark bar
    if (chromeData.roots.bookmark_bar) {
      const bookmarkBar = this.convertBookmark(chromeData.roots.bookmark_bar, ['ブックマークバー']);
      roots.push(bookmarkBar);
    }

    // Parse other bookmarks
    if (chromeData.roots.other) {
      const otherBookmarks = this.convertBookmark(chromeData.roots.other, ['その他のブックマーク']);
      roots.push(otherBookmarks);
    }

    // Parse synced bookmarks if exists
    if (chromeData.roots.synced) {
      const syncedBookmarks = this.convertBookmark(chromeData.roots.synced, ['同期されたブックマーク']);
      roots.push(syncedBookmarks);
    }

    return roots;
  }

  static flattenBookmarks(roots: BookmarkNode[]): BookmarkNode[] {
    const flattened: BookmarkNode[] = [];

    function traverse(node: BookmarkNode) {
      if (node.type === 'url') {
        flattened.push(node);
      }
      
      if (node.children) {
        node.children.forEach(traverse);
      }
    }

    roots.forEach(traverse);
    return flattened;
  }

  static getFolders(roots: BookmarkNode[]): BookmarkNode[] {
    const folders: BookmarkNode[] = [];

    function traverse(node: BookmarkNode) {
      if (node.type === 'folder') {
        folders.push(node);
      }
      
      if (node.children) {
        node.children.forEach(traverse);
      }
    }

    roots.forEach(traverse);
    return folders;
  }

  static findBookmarkById(roots: BookmarkNode[], id: string): BookmarkNode | undefined {
    function traverse(node: BookmarkNode): BookmarkNode | undefined {
      if (node.id === id) {
        return node;
      }
      
      if (node.children) {
        for (const child of node.children) {
          const result = traverse(child);
          if (result) return result;
        }
      }
      
      return undefined;
    }

    for (const root of roots) {
      const result = traverse(root);
      if (result) return result;
    }
    
    return undefined;
  }

  static getBookmarkStats(roots: BookmarkNode[]): {
    totalBookmarks: number;
    totalFolders: number;
    maxDepth: number;
    avgBookmarksPerFolder: number;
  } {
    const bookmarks = this.flattenBookmarks(roots);
    const folders = this.getFolders(roots);
    
    let maxDepth = 0;
    let totalBookmarkCount = 0;
    
    function calculateDepth(node: BookmarkNode, depth: number = 0): void {
      maxDepth = Math.max(maxDepth, depth);
      
      if (node.type === 'url') {
        totalBookmarkCount++;
      }
      
      if (node.children) {
        node.children.forEach(child => calculateDepth(child, depth + 1));
      }
    }

    roots.forEach(root => calculateDepth(root));

    const avgBookmarksPerFolder = folders.length > 0 
      ? totalBookmarkCount / folders.length 
      : 0;

    return {
      totalBookmarks: bookmarks.length,
      totalFolders: folders.length,
      maxDepth,
      avgBookmarksPerFolder: Math.round(avgBookmarksPerFolder * 100) / 100
    };
  }
}