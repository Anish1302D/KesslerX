import { describe, it, expect, vi, afterEach } from 'vitest';
import { detectWebGLSupport } from './webglDetection';

describe('detectWebGLSupport', () => {
  const originalCreateElement = document.createElement.bind(document);

  afterEach(() => {
    document.createElement = originalCreateElement;
    vi.restoreAllMocks();
  });

  it('detects WebGL2 support when available', () => {
    const mockGl2 = {
      getExtension: vi.fn().mockReturnValue(null),
      getParameter: vi.fn().mockReturnValue('Mock WebGL 2.0 Renderer'),
    };

    document.createElement = vi.fn().mockImplementation((tagName: string) => {
      if (tagName === 'canvas') {
        return {
          getContext: (type: string) => (type === 'webgl2' ? mockGl2 : null),
        };
      }
      return originalCreateElement(tagName);
    });

    const result = detectWebGLSupport();
    expect(result.supported).toBe(true);
    expect(result.webgl2).toBe(true);
    expect(result.renderer).toContain('WebGL');
  });

  it('detects WebGL1 fallback when WebGL2 is unavailable', () => {
    const mockGl1 = {
      getExtension: vi.fn().mockReturnValue(null),
      getParameter: vi.fn().mockReturnValue('Mock WebGL 1.0 Renderer'),
    };

    document.createElement = vi.fn().mockImplementation((tagName: string) => {
      if (tagName === 'canvas') {
        return {
          getContext: (type: string) => (type === 'webgl' ? mockGl1 : null),
        };
      }
      return originalCreateElement(tagName);
    });

    const result = detectWebGLSupport();
    expect(result.supported).toBe(true);
    expect(result.webgl2).toBe(false);
  });

  it('returns supported: false when WebGL is unavailable', () => {
    document.createElement = vi.fn().mockImplementation((tagName: string) => {
      if (tagName === 'canvas') {
        return {
          getContext: () => null,
        };
      }
      return originalCreateElement(tagName);
    });

    const result = detectWebGLSupport();
    expect(result.supported).toBe(false);
    expect(result.errorMessage).toBeDefined();
  });
});
