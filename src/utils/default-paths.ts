import { platform, homedir } from 'os';
import { join } from 'path';
import { existsSync } from 'fs';

/**
 * Get default Chrome bookmarks path based on OS
 */
export function getDefaultBookmarkPath(): string {
  const home = homedir();
  const system = platform();
  
  let defaultPaths: string[] = [];
  
  switch (system) {
    case 'win32':
      // Windows
      defaultPaths = [
        join(home, 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'Default', 'Bookmarks'),
        join(home, 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'Profile 1', 'Bookmarks'),
        join(home, 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'Profile 2', 'Bookmarks')
      ];
      break;
      
    case 'darwin':
      // macOS
      defaultPaths = [
        join(home, 'Library', 'Application Support', 'Google', 'Chrome', 'Default', 'Bookmarks'),
        join(home, 'Library', 'Application Support', 'Google', 'Chrome', 'Profile 1', 'Bookmarks'),
        join(home, 'Library', 'Application Support', 'Google', 'Chrome', 'Profile 2', 'Bookmarks')
      ];
      break;
      
    case 'linux':
      // Linux
      defaultPaths = [
        join(home, '.config', 'google-chrome', 'Default', 'Bookmarks'),
        join(home, '.config', 'google-chrome', 'Profile 1', 'Bookmarks'),
        join(home, '.config', 'google-chrome', 'Profile 2', 'Bookmarks'),
        // WSL specific paths
        '/mnt/c/Users/*/AppData/Local/Google/Chrome/User Data/Default/Bookmarks'
      ];
      break;
      
    default:
      // Fallback
      defaultPaths = [
        join(home, '.config', 'google-chrome', 'Default', 'Bookmarks')
      ];
  }
  
  // Return first existing path or first default
  const existingPath = defaultPaths.find(path => existsSync(path));
  return existingPath || defaultPaths[0];
}

/**
 * Get all available bookmark paths
 */
export function getAvailableBookmarkPaths(): string[] {
  const home = homedir();
  const system = platform();
  
  let paths: string[] = [];
  
  switch (system) {
    case 'win32':
      paths = [
        join(home, 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'Default', 'Bookmarks'),
        join(home, 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'Profile 1', 'Bookmarks'),
        join(home, 'AppData', 'Local', 'Google', 'Chrome', 'User Data', 'Profile 2', 'Bookmarks')
      ];
      break;
      
    case 'darwin':
      paths = [
        join(home, 'Library', 'Application Support', 'Google', 'Chrome', 'Default', 'Bookmarks'),
        join(home, 'Library', 'Application Support', 'Google', 'Chrome', 'Profile 1', 'Bookmarks')
      ];
      break;
      
    case 'linux':
      paths = [
        join(home, '.config', 'google-chrome', 'Default', 'Bookmarks'),
        join(home, '.config', 'google-chrome', 'Profile 1', 'Bookmarks')
      ];
      break;
  }
  
  // Filter only existing paths
  return paths.filter(path => existsSync(path));
}