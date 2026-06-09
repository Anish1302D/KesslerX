/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CESIUM_ION_TOKEN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'vite-plugin-cesium' {
  import { Plugin } from 'vite';
  export default function cesium(): Plugin;
}
