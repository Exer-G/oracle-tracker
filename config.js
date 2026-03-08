// Oracle Time Tracker - Configuration
// ============================================================

// Guarded debug logger — set window.TT_DEBUG = true in the browser console to enable
function debug(...args) {
    if (window.TT_DEBUG) console.log(...args);
}

// Supabase credentials are injected at build time via env-config.js (gitignored).
// For local dev: set SUPABASE_URL and SUPABASE_ANON_KEY in a .env file and run `npm run build`.
// The anon key is safe to expose client-side per Supabase's design — row-level security
// (RLS) enforces access control. Never commit the service_role key.
const SUPABASE_URL = window.__ENV__?.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = window.__ENV__?.SUPABASE_ANON_KEY || '';

const TT_CONFIG = {
    blockDuration: 600,          // 10 minutes in seconds
    partialBlockThreshold: 300,  // 5 minutes - save partial block if >= this
    screenshotQuality: 0.6,      // JPEG quality 0-1
    screenshotMinDelay: 120,     // earliest screenshot: 2 min into block (seconds)
    screenshotMaxDelay: 540,     // latest screenshot: 9 min into block (seconds)
    activitySampleInterval: 10,  // sample activity every 10 seconds
    previewInterval: 30,         // update preview every 30 seconds
    weekStartDay: 1,             // 0=Sunday, 1=Monday
    storageBucket: 'tt-screenshots',
};

// NOTE: Team members must be configured in the Supabase DB (tt_team_members table).
// Admin role is determined by the 'role' column in the DB only — no hardcoded bypass.
// This fallback array is used only if the DB is unreachable and should remain empty in production.
const TT_TEAM = [];

// NOTE: Projects should be managed in the Supabase 'projects' table.
// This local list is a fallback for when the DB is unreachable.
// Remove entries here and manage them via the DB for a single source of truth.
const TT_PROJECTS = [
    { id: 'internal', name: 'Internal / Admin', client: 'Exergy Designs', status: 'active' },
];
