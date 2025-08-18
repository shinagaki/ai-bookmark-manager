export interface ChromeBookmark {
  id: string;
  name: string;
  type: 'url' | 'folder';
  url?: string;
  date_added: string;
  date_last_used?: string;
  guid: string;
  children?: ChromeBookmark[];
  date_modified?: string;
}

export interface ChromeBookmarkFile {
  checksum: string;
  roots: {
    bookmark_bar: ChromeBookmark;
    other: ChromeBookmark;
    synced?: ChromeBookmark;
  };
  version: number;
}

export interface BookmarkNode {
  id: string;
  name: string;
  type: 'url' | 'folder';
  url?: string;
  dateAdded: Date;
  dateLastUsed?: Date;
  guid: string;
  path: string[];
  children?: BookmarkNode[];
  parent?: BookmarkNode;
}

export interface BookmarkAnalysis {
  totalBookmarks: number;
  totalFolders: number;
  duplicates: DuplicateGroup[];
  deadLinks: BookmarkNode[];
  categories: CategorySuggestion[];
  unusedBookmarks: BookmarkNode[];
  statistics: {
    avgBookmarksPerFolder: number;
    maxDepth: number;
    oldestBookmark: BookmarkNode;
    newestBookmark: BookmarkNode;
  };
}

export interface DuplicateGroup {
  urls: BookmarkNode[];
  similarity: number;
  reason: 'exact_url' | 'normalized_url' | 'exact_title' | 'similar_title' | 'similar_url';
}

export interface CategorySuggestion {
  name: string;
  bookmarks: BookmarkNode[];
  confidence: number;
  pattern: 'domain' | 'keyword' | 'path' | 'manual' | 'bookmarklet';
  description: string;
}

export interface OrganizationAction {
  type: 'move' | 'delete' | 'rename' | 'create_folder' | 'update_url';
  targetId: string;
  destination?: string;
  newName?: string;
  newUrl?: string;
  reason: string;
}

export type LinkStatus = 'ok' | 'dead' | 'redirect' | 'timeout' | 'error' | 'unchecked';

export interface LinkCheckResult {
  bookmark: BookmarkNode;
  status: LinkStatus;
  statusCode?: number;
  error?: string;
  redirectUrl?: string;
  responseTime?: number;
}