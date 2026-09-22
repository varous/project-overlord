/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_MAPS_KEY?: string;
  readonly VITE_COMMIT_SHA?: string;
  readonly VITE_BRANCH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
