/**
 * Netlify Function - Fireflies API Proxy
 * Bypasses CORS restrictions by proxying requests server-side
 */

// API key from environment variable
const FIREFLIES_API_KEY = process.env.FIREFLIES_API_KEY || '';

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    try {
        const body = JSON.parse(event.body);
        const { query, variables } = body;
        
        // Get API key from environment variable
        const apiKey = FIREFLIES_API_KEY;

        if (!query) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'GraphQL query required' }) };
        }

        console.log('[Fireflies Proxy] Making request...');

        const response = await fetch('https://api.fireflies.ai/graphql', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
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
};
