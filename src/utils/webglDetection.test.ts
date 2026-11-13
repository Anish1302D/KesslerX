import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { detectWebGLSupport, useWebGLSupport } from './webglDetection';

describe('detectWebGLSupport', () => {
  const originalCreateElement = document.createElement.bind(document);

  afterEach(() => {
    document.createElement = originalCreateElement;
    vi.restoreAllMocks();
  });

  it('detects WebGL2 support when available', () => {
    const mockGl2 = {
      getExtension: vi.fn().mockImplementation((name: string) => {
        if (name === 'WEBGL_lose_context') return { loseContext: vi.fn() };
        return null;
      }),
      getParameter: vi.fn().mockImplementation((param: number) => {
        if (param === 0x8869) return 8192; // MAX_TEXTURE_SIZE
        return 'Mock WebGL 2.0 Renderer';
      }),
      MAX_TEXTURE_SIZE: 0x8869,
    };

    document.createElement = vi.fn().mockImplementation((tagName: string) => {
      if (tagName === 'canvas') {
        return {
          getContext: (_type: string, _opts?: unknown) => mockGl2,
        };
      }
      return originalCreateElement(tagName);
    });

    const result = detectWebGLSupport();
    expect(result.supported).toBe(true);
    expect(result.webgl2).toBe(true);
    expect(result.renderer).toContain('WebGL');
    expect(result.hasHardwareAcceleration).toBe(true);
  });

  it('detects WebGL1 fallback when WebGL2 is unavailable', () => {
    const mockGl1 = {
      getExtension: vi.fn().mockImplementation((name: string) => {
        if (name === 'WEBGL_lose_context') return { loseContext: vi.fn() };
        return null;
      }),
      getParameter: vi.fn().mockImplementation((param: number) => {
        if (param === 0x8869) return 4096;
        return 'Mock WebGL 1.0 Renderer';
      }),
      MAX_TEXTURE_SIZE: 0x8869,
    };

    document.createElement = vi.fn().mockImplementation((tagName: string) => {
      if (tagName === 'canvas') {
        return {
          getContext: (type: string) => (type.startsWith('webgl2') ? null : mockGl1),
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

  it('reactive useWebGLSupport hook returns support status and can re-check', () => {
    document.createElement = vi.fn().mockImplementation((tagName: string) => {
      if (tagName === 'canvas') {
        return {
          getContext: () => null,
        };
      }
      return originalCreateElement(tagName);
    });

    const { result } = renderHook(() => useWebGLSupport());
    expect(result.current.supported).toBe(false);
    expect(typeof result.current.checkSupport).toBe('function');

    // Simulate WebGL becoming available
    const mockGl = {
      getExtension: vi.fn().mockReturnValue(null),
      getParameter: vi.fn().mockReturnValue('Restored WebGL'),
      MAX_TEXTURE_SIZE: 0x8869,
    };
    document.createElement = vi.fn().mockImplementation((tagName: string) => {
      if (tagName === 'canvas') {
        return {
          getContext: () => mockGl,
        };
      }
      return originalCreateElement(tagName);
    });

    act(() => {
      result.current.checkSupport();
    });

    expect(result.current.supported).toBe(true);
  });
});
