/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string
  readonly VITE_APP_NAME?: string
  readonly PROD: boolean
  readonly DEV: boolean
  readonly MODE: string
  // Add more env variables as needed
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
