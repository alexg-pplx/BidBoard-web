/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_JOBTREAD_API_KEY: string;
  readonly VITE_PROCORE_CLIENT_ID: string;
  readonly VITE_PROCORE_CLIENT_SECRET: string;
  readonly VITE_PROCORE_REFRESH_TOKEN: string;
  readonly VITE_PROCORE_COMPANY_ID: string;
  readonly VITE_PROCORE_TEMPLATE_PROJECT_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
