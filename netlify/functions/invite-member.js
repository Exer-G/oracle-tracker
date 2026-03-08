// Netlify Function: Invite Team Member
// Sends a Supabase magic link invite and records the invite in the DB

const ALLOWED_ORIGIN = process.env.URL || 'http://localhost:8888';

export async function handler(event) {
    const headers = {
        'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Supabase service key not configured. Set SUPABASE_URL and SUPABASE_SERVICE_KEY in Netlify env vars.' })
        };
    }

    try {
        const { email, name, station, role, title, hourlyRate, currency, invitedBy } = JSON.parse(event.body);

        if (!email || !name) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'email and name are required' }) };
        }

        const siteUrl = process.env.URL || 'http://localhost:8888';
        const redirectTo = `${siteUrl}/?invited=true`;

        // 1. Send Supabase magic link invite
        const inviteRes = await fetch(`${SUPABASE_URL}/auth/v1/invite`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_SERVICE_KEY,
                'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`
            },
            body: JSON.stringify({ email, data: { name, role: role || 'freelancer' }, redirect_to: redirectTo })
        });

        if (!inviteRes.ok) {
            const err = await inviteRes.json();
            // Tolerate "user already exists" — they may just need the DB row
            if (!err.message?.includes('already been registered')) {
                return { statusCode: inviteRes.status, headers, body: JSON.stringify({ error: err.message || 'Invite failed' }) };
            }
        }

        // 2. Upsert team member record
        const memberRow = {
            email: email.toLowerCase(),
            name,
            role: role || 'freelancer',
            title: title || '',
            hourly_rate: parseFloat(hourlyRate) || 0,
            currency: currency || 'USD',
            status: 'active',
            station: station || '',
            invited_by: invitedBy || '',
            onboarded: false
        };

        const upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/tt_team_members`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_SERVICE_KEY,
                'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
                'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify(memberRow)
        });

        if (!upsertRes.ok) {
            const err = await upsertRes.text();
            console.error('[Invite] Upsert team member error:', err);
        }

        // 3. Record the invite for tracking
        const inviteRecord = {
            email: email.toLowerCase(),
            name,
            station: station || '',
            role: role || 'freelancer',
            title: title || '',
            hourly_rate: parseFloat(hourlyRate) || 0,
            currency: currency || 'USD',
            invited_by: invitedBy || '',
            status: 'pending'
        };

        const recordRes = await fetch(`${SUPABASE_URL}/rest/v1/tt_onboarding_invites`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_SERVICE_KEY,
                'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
                'Prefer': 'resolution=merge-duplicates'
            },
            body: JSON.stringify(inviteRecord)
        });

        if (!recordRes.ok) {
            console.warn('[Invite] Could not record invite:', await recordRes.text());
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, message: `Invite sent to ${email}` })
        };

    } catch (err) {
        console.error('[Invite] Error:', err);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Invite failed: ' + err.message })
        };
    }
}
