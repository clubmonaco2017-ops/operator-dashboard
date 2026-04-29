// Loaded before each security test. Verifies env is set and refuses
// to run against any non-dev project. Add allowed dev URLs to the
// allowlist below if more dev environments are needed.

const ALLOWED_DEV_URL_FRAGMENTS = ['akpddaqpggktefkdecrl'];

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
  throw new Error(
    'Security tests require SUPABASE_URL and SUPABASE_ANON_KEY (dev project, NOT prod). ' +
    'Set them in your shell or .env.local before running.'
  );
}

const url = process.env.SUPABASE_URL;
const isAllowed = ALLOWED_DEV_URL_FRAGMENTS.some((f) => url.includes(f));
if (!isAllowed) {
  throw new Error(
    `Refusing to run security tests against ${url}. ` +
    `Edit tests/security/setup.ts to add the dev URL fragment to ALLOWED_DEV_URL_FRAGMENTS.`
  );
}
