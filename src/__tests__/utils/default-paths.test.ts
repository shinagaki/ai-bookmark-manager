import { getDefaultBookmarkPath } from '../../utils/default-paths';
import { platform, homedir } from 'os';

jest.mock('os');
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(false)
}));

const mockPlatform = platform as jest.Mock;
const mockHomedir = homedir as jest.Mock;

describe('default-paths', () => {
  beforeEach(() => {
    mockHomedir.mockReturnValue('/mock/home');
  });

  describe('getDefaultBookmarkPath', () => {
    it('should return Windows path on Windows', () => {
      mockPlatform.mockReturnValue('win32');
      const path = getDefaultBookmarkPath();
      expect(path).toContain('AppData');
      expect(path).toContain('Chrome');
    });

    it('should return macOS path on Darwin', () => {
      mockPlatform.mockReturnValue('darwin');
      const path = getDefaultBookmarkPath();
      expect(path).toContain('Library');
      expect(path).toContain('Application Support');
    });

    it('should return Linux path on Linux', () => {
      mockPlatform.mockReturnValue('linux');
      const path = getDefaultBookmarkPath();
      expect(path).toContain('.config');
      expect(path).toContain('google-chrome');
    });
  });
});