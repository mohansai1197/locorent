// Browser configuration is supplied at build time, never committed as values.
export const publicBackendConfig = {
  url: import.meta.env.VITE_SUPABASE_URL || '',
  publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
};
export const backendConfigured = Boolean(publicBackendConfig.url && publicBackendConfig.publishableKey);
