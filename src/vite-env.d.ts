/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public by design: the Supabase project URL used only for staff sign-in. */
  readonly VITE_SUPABASE_URL?: string;
  /** Public by design: the Supabase anon key. Never the service key. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Public by design: the Turnstile site key. */
  readonly VITE_TURNSTILE_SITE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
