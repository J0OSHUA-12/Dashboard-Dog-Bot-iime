/// <reference types="vite/client" />
declare const __PREVIEW_BUILD__: boolean;
declare module '*.ino?raw' {
  const src: string;
  export default src;
}
