/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    APP_ROOT: string
    VITE_PUBLIC: string
    VITE_DEV_SERVER_URL?: string
    DYLD_LIBRARY_PATH?: string
    LOG_LEVEL?: string
    NODE_ENV?: string
  }
}
