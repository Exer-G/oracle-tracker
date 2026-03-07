// Oracle Time Tracker - Configuration
// ============================================================

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

// Admin emails with full access
const TT_ADMIN_EMAILS = ['shuaib@exergydesigns.com', 'oracle@exergydesigns.com'];

// Team members
const TT_TEAM = [
    { id: 'shuaib', email: 'shuaib@exergydesigns.com', name: 'Shuaib Badat', role: 'admin', title: 'Founder & Lead Engineer', hourlyRate: 75, currency: 'USD', status: 'active' },
    { id: 'oracle', email: 'oracle@exergydesigns.com', name: 'Oracle', role: 'admin', title: 'AI Assistant', hourlyRate: 0, currency: 'USD', status: 'active' },
    { id: 'shuaib-personal', email: 'shuaibnbadat@gmail.com', name: 'Shuaib Badat', role: 'freelancer', title: 'Founder (Personal)', hourlyRate: 75, currency: 'USD', status: 'active' },
    { id: 'ebrahim', email: 'ebrahim@exergydesigns.com', name: 'Ebrahim Malick', role: 'freelancer', title: 'Engineer', hourlyRate: 350, currency: 'ZAR', status: 'active' },
    { id: 'yusuf-m', email: 'yusuf.moola@exergydesigns.com', name: 'Yusuf Moola', role: 'freelancer', title: 'Engineer', hourlyRate: 350, currency: 'ZAR', status: 'active' },
    { id: 'bogdan', email: 'bogdan@exergydesigns.com', name: 'Bogdan Dirlosan', role: 'freelancer', title: 'CAD Specialist', hourlyRate: 25, currency: 'USD', status: 'active' },
    { id: 'yusuf-e', email: 'yusuf.essa@exergydesigns.com', name: 'Yusuf Essa', role: 'freelancer', title: 'Engineer', hourlyRate: 350, currency: 'ZAR', status: 'active' },
    { id: 'ismaeel', email: 'ismaeel@exergydesigns.com', name: 'Ismaeel Motala', role: 'freelancer', title: 'Engineer', hourlyRate: 350, currency: 'ZAR', status: 'active' },
];

// Projects (admin-managed)
const TT_PROJECTS = [
    { id: 'edge-energy', name: 'Edge Energy', client: 'Jason Dispenza', status: 'active' },
    { id: 'masterworkx', name: 'Masterworkx', client: 'Aster De Vlack', status: 'active' },
    { id: 'abr-group', name: 'ABR Group', client: 'Ann Kelly', status: 'active' },
    { id: 'evanswerks', name: 'EvansWerks', client: 'Justin Evans', status: 'active' },
    { id: 'orthoglide', name: 'Orthoglide', client: 'Dr Zieg Webber', status: 'active' },
    { id: 'eli-projects', name: 'Eli Projects', client: 'Ethan Lai', status: 'active' },
    { id: 'abfp', name: 'ABFP', client: 'Dan Harbut', status: 'active' },
    { id: 'internal', name: 'Internal / Admin', client: 'Exergy Designs', status: 'active' },
];
