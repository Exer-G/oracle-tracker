// Oracle Time Tracker - Configuration
// ============================================================

// Guarded debug logger — set window.TT_DEBUG = true in the browser console to enable
function debug(...args) {
    if (window.TT_DEBUG) console.log(...args);
}

const SUPABASE_URL = 'https://uaivaspunoceuzxkukmh.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVhaXZhc3B1bm9jZXV6eGt1a21oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxMTc2MDEsImV4cCI6MjA4NDY5MzYwMX0.yasfPMw3fRyOawYXLNTtZhpxutFCBd70f1Cot3AVcFc';

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
