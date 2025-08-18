import { getDefaultBookmarkPath } from '../../utils/default-paths';
import { platform } from 'os';

jest.mock('os');

describe('default-paths', () => {
  describe('getDefaultBookmarkPath', () => {
    it('should return Windows path on Windows', () => {
      (platform as jest.Mock).mockReturnValue('win32');
      const path = getDefaultBookmarkPath();
      expect(path).toContain('AppData');
      expect(path).toContain('Chrome');
    });

    it('should return macOS path on Darwin', () => {
      (platform as jest.Mock).mockReturnValue('darwin');
      const path = getDefaultBookmarkPath();
      expect(path).toContain('Library');
      expect(path).toContain('Application Support');
    });

    it('should return Linux path on Linux', () => {
      (platform as jest.Mock).mockReturnValue('linux');
      const path = getDefaultBookmarkPath();
      expect(path).toContain('.config');
      expect(path).toContain('google-chrome');
    });
  });
});