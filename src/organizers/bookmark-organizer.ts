import { writeFileSync, copyFileSync } from 'fs';
import { BookmarkNode, OrganizationAction, ChromeBookmarkFile, ChromeBookmark } from '../types/bookmark';

export class BookmarkOrganizer {
  private roots: BookmarkNode[];
  private originalData: ChromeBookmarkFile;
  private actions: OrganizationAction[];

  constructor(roots: BookmarkNode[], originalData: ChromeBookmarkFile) {
    this.roots = roots;
    this.originalData = originalData;
    this.actions = [];
  }

  createBackup(originalPath: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${originalPath}.backup.${timestamp}`;
    copyFileSync(originalPath, backupPath);
    return backupPath;
  }

  addAction(action: OrganizationAction): void {
    this.actions.push(action);
  }

  addActions(actions: OrganizationAction[]): void {
    this.actions.push(...actions);
  }

  getActions(): OrganizationAction[] {
    return [...this.actions];
  }

  clearActions(): void {
    this.actions = [];
  }

  applyActions(): void {
    for (const action of this.actions) {
      switch (action.type) {
        case 'delete':
          this.deleteBookmark(action.targetId);
          break;
        case 'move':
          if (action.destination) {
            this.moveBookmark(action.targetId, action.destination);
          }
          break;
        case 'create_folder':
          if (action.newName) {
            this.createFolder(action.newName);
          }
          break;
        case 'rename':
          if (action.newName) {
            this.renameBookmark(action.targetId, action.newName);
          }
          break;
      }
    }
  }

  private deleteBookmark(bookmarkId: string): boolean {
    function removeFromNode(node: BookmarkNode): boolean {
      if (node.children) {
        const index = node.children.findIndex(child => child.id === bookmarkId);
        if (index !== -1) {
          node.children.splice(index, 1);
          return true;
        }

        for (const child of node.children) {
          if (removeFromNode(child)) {
            return true;
          }
        }
      }
      return false;
    }

    for (const root of this.roots) {
      if (removeFromNode(root)) {
        return true;
      }
    }

    return false;
  }

  private moveBookmark(bookmarkId: string, destinationPath: string): boolean {
    const bookmark = this.findBookmarkById(bookmarkId);
    if (!bookmark) return false;

    // Remove from current location
    this.deleteBookmark(bookmarkId);

    // Find or create destination folder
    const destinationFolder = this.findOrCreateFolder(destinationPath);
    if (!destinationFolder) return false;

    // Add to destination
    if (!destinationFolder.children) {
      destinationFolder.children = [];
    }

    bookmark.parent = destinationFolder;
    bookmark.path = [...destinationFolder.path, bookmark.name];
    destinationFolder.children.push(bookmark);

    return true;
  }

  private createFolder(folderName: string, parentPath?: string): BookmarkNode | null {
    const parent = parentPath ? this.findOrCreateFolder(parentPath) : this.roots[0]; // Default to bookmark bar
    if (!parent) return null;

    const newFolder: BookmarkNode = {
      id: `folder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: folderName,
      type: 'folder',
      dateAdded: new Date(),
      guid: `guid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      path: [...parent.path, folderName],
      children: [],
      parent
    };

    if (!parent.children) {
      parent.children = [];
    }

    parent.children.push(newFolder);
    return newFolder;
  }

  private renameBookmark(bookmarkId: string, newName: string): boolean {
    const bookmark = this.findBookmarkById(bookmarkId);
    if (!bookmark) return false;

    const oldName = bookmark.name;
    bookmark.name = newName;

    // Update path
    const pathIndex = bookmark.path.lastIndexOf(oldName);
    if (pathIndex !== -1) {
      bookmark.path[pathIndex] = newName;
    }

    // Update children paths if it's a folder
    if (bookmark.type === 'folder' && bookmark.children) {
      this.updateChildrenPaths(bookmark);
    }

    return true;
  }

  private updateChildrenPaths(folder: BookmarkNode): void {
    if (!folder.children) return;

    for (const child of folder.children) {
      child.path = [...folder.path, child.name];
      child.parent = folder;

      if (child.type === 'folder') {
        this.updateChildrenPaths(child);
      }
    }
  }

  private findBookmarkById(bookmarkId: string): BookmarkNode | null {
    function traverse(node: BookmarkNode): BookmarkNode | null {
      if (node.id === bookmarkId) {
        return node;
      }

      if (node.children) {
        for (const child of node.children) {
          const result = traverse(child);
          if (result) return result;
        }
      }

      return null;
    }

    for (const root of this.roots) {
      const result = traverse(root);
      if (result) return result;
    }

    return null;
  }

  private findOrCreateFolder(folderPath: string): BookmarkNode | null {
    // Try to find existing folder first
    const existingFolder = this.findFolderByPath(folderPath);
    if (existingFolder) return existingFolder;

    // Create new folder
    return this.createFolder(folderPath);
  }

  private findFolderByPath(folderPath: string): BookmarkNode | null {
    function traverse(node: BookmarkNode): BookmarkNode | null {
      if (node.type === 'folder' && node.name === folderPath) {
        return node;
      }

      if (node.children) {
        for (const child of node.children) {
          const result = traverse(child);
          if (result) return result;
        }
      }

      return null;
    }

    for (const root of this.roots) {
      const result = traverse(root);
      if (result) return result;
    }

    return null;
  }

  convertToChrome(): ChromeBookmarkFile {
    const convertNode = (node: BookmarkNode): ChromeBookmark => {
      const chromeNode: ChromeBookmark = {
        id: node.id,
        name: node.name,
        type: node.type,
        date_added: this.convertDateToChrome(node.dateAdded),
        guid: node.guid
      };

      if (node.url) {
        chromeNode.url = node.url;
      }

      if (node.dateLastUsed) {
        chromeNode.date_last_used = this.convertDateToChrome(node.dateLastUsed);
      }

      if (node.children && node.children.length > 0) {
        chromeNode.children = node.children.map(convertNode);
        chromeNode.date_modified = this.convertDateToChrome(new Date());
      }

      return chromeNode;
    };

    const result: ChromeBookmarkFile = {
      ...this.originalData,
      roots: {
        bookmark_bar: convertNode(this.roots[0]),
        other: this.roots[1] ? convertNode(this.roots[1]) : this.originalData.roots.other
      }
    };

    if (this.roots[2]) {
      result.roots.synced = convertNode(this.roots[2]);
    }

    return result;
  }

  private convertDateToChrome(date: Date): string {
    const CHROME_EPOCH_OFFSET = 11644473600000000; // microseconds
    const unixTimestamp = date.getTime() * 1000; // convert to microseconds
    return (unixTimestamp + CHROME_EPOCH_OFFSET).toString();
  }

  saveToFile(filePath: string): void {
    const chromeData = this.convertToChrome();
    
    // Update checksum (simple hash for now)
    const content = JSON.stringify(chromeData.roots);
    chromeData.checksum = this.calculateChecksum(content);
    
    writeFileSync(filePath, JSON.stringify(chromeData, null, 2), 'utf-8');
  }

  private calculateChecksum(content: string): string {
    // Simple hash function - in a real implementation, you might want to use crypto
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  getActionsSummary(): string {
    const summary = this.actions.reduce((acc, action) => {
      acc[action.type] = (acc[action.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const lines = Object.entries(summary).map(([type, count]) => {
      const actionNames = {
        'delete': '削除',
        'move': '移動',
        'create_folder': 'フォルダ作成',
        'rename': '名前変更'
      };
      return `${actionNames[type as keyof typeof actionNames] || type}: ${count}件`;
    });

    return lines.join(', ');
  }

  // Helper method to remove unused bookmarks
  removeUnusedBookmarks(unusedBookmarks: BookmarkNode[]): void {
    unusedBookmarks.forEach(bookmark => {
      this.addAction({
        type: 'delete',
        targetId: bookmark.id,
        reason: '未使用ブックマークの削除'
      });
    });
  }

  // Helper method to remove dead links
  removeDeadLinks(deadLinkIds: string[]): void {
    deadLinkIds.forEach(id => {
      this.addAction({
        type: 'delete',
        targetId: id,
        reason: 'リンク切れブックマークの削除'
      });
    });
  }
}