/**
 * Deploy-time cloud configuration injection (Stage 0).
 *
 * At deploy, replace/augment window.__APP_ENV__ with values sourced from the
 * hosting environment (e.g. Vercel environment variables baked in at build).
 * scratch/inject_runtime_env.js regenerates this file from process.env as the
 * deploy build step; the committed source is intentionally empty so the app
 * falls back to the built-in public project defaults when nothing is set.
 *
 * Left intentionally empty in source control so businessos/platform/cloud/
 * runtimeConfig.js falls back to the current public project values and the
 * running app is never broken before the deploy target is provisioned.
 *
 * Example:
 *   window.__APP_ENV__ = {
 *     SUPABASE_URL: 'https://<project>.supabase.co',
 *     SUPABASE_ANON_KEY: '<public anon key>'
 *   };
 *
 * The service_role key must NEVER appear in this file or any client bundle.
 */
window.__APP_ENV__ = window.__APP_ENV__ || {};
