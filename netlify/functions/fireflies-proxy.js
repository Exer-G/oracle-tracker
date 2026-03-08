// Netlify Function - Fireflies API Proxy
// Bypasses CORS restrictions by proxying requests server-side

const ALLOWED_ORIGIN = process.env.URL || 'http://localhost:8888';
const FIREFLIES_API_KEY = process.env.FIREFLIES_API_KEY || '';

export async function handler(event) {
    const headers = {
        'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    if (!FIREFLIES_API_KEY) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Fireflies API key not configured. Set FIREFLIES_API_KEY in Netlify env vars.' })
        };
    }

    try {
        const body = JSON.parse(event.body);
        const { query, variables } = body;

        if (!query) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'GraphQL query required' }) };
        }

        const response = await fetch('https://api.fireflies.ai/graphql', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${FIREFLIES_API_KEY}`
            },
            body: JSON.stringify({ query, variables })
        });

        const data = await response.json();

        if (data.errors) {
            console.error('[Fireflies Proxy] API Error:', JSON.stringify(data.errors));
        }

        return {
            statusCode: response.status,
            headers,
            body: JSON.stringify(data)
        };
    } catch (error) {
        console.error('[Fireflies Proxy] Error:', error.message);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Proxy error: ' + error.message })
        };
    }
}
