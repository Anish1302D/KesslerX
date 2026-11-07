/**
 * WebGL Capability Detection Utility
 * Detects whether WebGL / WebGL2 is available and functional in the current browser context.
 */

export interface WebGLSupportResult {
  supported: boolean;
  webgl2: boolean;
  renderer: string;
  vendor: string;
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
    
    // Test WebGL 2 first
    const gl2 = canvas.getContext('webgl2');
    if (gl2) {
      const debugInfo = gl2.getExtension('WEBGL_debug_renderer_info');
      const renderer = debugInfo ? gl2.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'Generic WebGL 2.0';
      const vendor = debugInfo ? gl2.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : 'Generic';
      return {
        supported: true,
        webgl2: true,
        renderer: String(renderer || 'WebGL 2.0'),
        vendor: String(vendor || 'Unknown'),
      };
    }

    // Fallback to WebGL 1
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl) {
      const glContext = gl as WebGLRenderingContext;
      const debugInfo = glContext.getExtension('WEBGL_debug_renderer_info');
      const renderer = debugInfo ? glContext.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'Generic WebGL 1.0';
      const vendor = debugInfo ? glContext.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : 'Generic';
      return {
        supported: true,
        webgl2: false,
        renderer: String(renderer || 'WebGL 1.0'),
        vendor: String(vendor || 'Unknown'),
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

