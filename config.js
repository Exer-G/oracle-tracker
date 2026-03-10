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
// Mirrors active projects from the Oracle dashboard for offline resilience.
const TT_PROJECTS = [
    { id: 'internal', name: 'Internal / Admin', client: 'Exergy Designs', status: 'active' },
    { id: '77d1c563-c9a7-4a2b-8136-a9e67f5c05f1', name: 'American Backflow & Fire Prevention Project', client: 'Dan Harbut', status: 'active' },
    { id: 'd5249ab3-76c9-451d-9c3e-ec98f785830e', name: 'Cloud Boiler', client: '', status: 'active' },
    { id: '7c310aa0-7113-4264-9704-ae80b5cf9194', name: 'CloudHeater Technical Notes', client: '', status: 'active' },
    { id: '6c4b091e-4b5c-46e5-86bf-c32ba1af14fd', name: 'Development of Force Calculation Tool for Swing Gate Motors', client: '', status: 'active' },
    { id: '68d897f7-5016-4178-ad1d-357fba009a1f', name: 'Eli Projects Project', client: 'Ethan Lai', status: 'active' },
    { id: '6488944b-111b-451a-9bb4-a65448f6060c', name: 'Engineering Consulting', client: '', status: 'active' },
    { id: '9422e923-52ac-43f9-a00f-9f6cd973c7db', name: 'Engineering Work', client: '', status: 'active' },
    { id: '3f5409fd-7a6a-472b-a987-bbfcaccc34af', name: 'EvansWerks Project', client: 'Justin Eugene Evans', status: 'active' },
    { id: '1813073a-04ea-452a-aa30-55b87cf9715c', name: 'Group ABR. SA Project', client: 'Ann Kelly', status: 'active' },
    { id: '26695940-bf8c-467d-b882-2a712942ad94', name: 'HVAC Subject Matter Expert', client: '', status: 'active' },
    { id: '8dbb2311-08c1-4d26-8b05-0cbfca16956e', name: 'IoT Platform', client: '', status: 'active' },
    { id: '62ae779b-e76b-49c5-80d5-357dc73adaf2', name: 'Masterworkx bv Project', client: 'Aster De Vlack', status: 'active' },
    { id: '3d0218c5-ec32-4086-8bd4-1b8b53360980', name: 'Mechanical Engineering on valve development', client: '', status: 'active' },
    { id: '2c0b26a9-ff53-463f-ba30-bb822b18cbee', name: 'Medical Device Engineering', client: '', status: 'active' },
    { id: '00c435ed-43eb-46e2-b8fc-c5e790032d8a', name: 'Orthoglide Project', client: 'Dr Zieg Webber', status: 'active' },
    { id: '3ba7f140-67d6-49a5-ac79-90bab504f65a', name: 'Simulation and mechanical engineering', client: '', status: 'active' },
    { id: 'edc7fa90-0d9b-421e-bc60-2ade886b1a0e', name: 'Steel beams / 3D Modeling', client: '', status: 'active' },
    { id: 'c8ab12e6-5d01-4fb1-9018-dca663ca4e94', name: 'Tim Horlick Project', client: 'Tim Horlick', status: 'active' },
    { id: '0e5d78e8-6321-492c-947b-9e756b4ccf04', name: 'Web/Software Development', client: '', status: 'active' },
];
