/**
 * WebGL Capability Detection Utility
 * Detects whether WebGL / WebGL2 is available and functional in the current browser context.
 * Checks for hardware acceleration, driver blacklists, and context loss.
 */

import { useState, useCallback } from 'react';

export interface WebGLSupportResult {
  supported: boolean;
  webgl2: boolean;
  renderer: string;
  vendor: string;
  maxTextureSize?: number;
  hasHardwareAcceleration?: boolean;
  errorMessage?: string;
}

export function detectWebGLSupport(): WebGLSupportResult {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return {
      supported: false,
      webgl2: false,
      renderer: 'SSR/Headless',
      vendor: 'Unknown',
      errorMessage: 'Window or document is undefined (SSR environment)',
    };
  }

  try {
    const canvas = document.createElement('canvas');

    // First attempt WebGL 2 without major performance caveats (hardware accelerated)
    let gl2 = canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: true }) as WebGL2RenderingContext | null;
    let hwAccelerated = true;

    if (!gl2) {
      // Retry without caveat flag (software emulation / SwiftShader / Mesa)
      gl2 = canvas.getContext('webgl2') as WebGL2RenderingContext | null;
      if (gl2) hwAccelerated = false;
    }

    if (gl2) {
      const debugInfo = gl2.getExtension('WEBGL_debug_renderer_info');
      const renderer = debugInfo ? gl2.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'Generic WebGL 2.0';
      const vendor = debugInfo ? gl2.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : 'Generic';
      const maxTextureSize = gl2.getParameter(gl2.MAX_TEXTURE_SIZE) as number;

      // Lose context to free resources
      const loseContext = gl2.getExtension('WEBGL_lose_context');
      loseContext?.loseContext();

      return {
        supported: true,
        webgl2: true,
        renderer: String(renderer || 'WebGL 2.0'),
        vendor: String(vendor || 'Unknown'),
        maxTextureSize: typeof maxTextureSize === 'number' ? maxTextureSize : 4096,
        hasHardwareAcceleration: hwAccelerated,
      };
    }

    // Fallback to WebGL 1
    let gl = canvas.getContext('webgl', { failIfMajorPerformanceCaveat: true }) as WebGLRenderingContext | null;
    hwAccelerated = true;

    if (!gl) {
      gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
      if (gl) hwAccelerated = false;
    }

    if (gl) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'Generic WebGL 1.0';
      const vendor = debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : 'Generic';
      const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;

      const loseContext = gl.getExtension('WEBGL_lose_context');
      loseContext?.loseContext();

      return {
        supported: true,
        webgl2: false,
        renderer: String(renderer || 'WebGL 1.0'),
        vendor: String(vendor || 'Unknown'),
        maxTextureSize: typeof maxTextureSize === 'number' ? maxTextureSize : 2048,
        hasHardwareAcceleration: hwAccelerated,
      };
    }

    return {
      supported: false,
      webgl2: false,
      renderer: 'None',
      vendor: 'None',
      errorMessage: 'WebGL is not supported or disabled in this browser/device.',
    };
  } catch (err) {
    return {
      supported: false,
      webgl2: false,
      renderer: 'Error',
      vendor: 'Error',
      errorMessage: err instanceof Error ? err.message : 'Unknown WebGL initialization error',
    };
  }
}

export function useWebGLSupport() {
  const [support, setSupport] = useState<WebGLSupportResult>(() => detectWebGLSupport());
  const checkSupport = useCallback(() => {
    setSupport(detectWebGLSupport());
  }, []);
  return { ...support, checkSupport };
}
