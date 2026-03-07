// Google Calendar API Proxy
// Handles calendar requests with OAuth tokens

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }

    try {
        const authHeader = event.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return {
                statusCode: 401,
                headers,
                body: JSON.stringify({ error: 'Missing or invalid authorization token' })
            };
        }

        const accessToken = authHeader.replace('Bearer ', '');
        const params = event.queryStringParameters || {};
        
        // Build Google Calendar API URL
        const calendarId = params.calendarId || 'primary';
        const baseUrl = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
        
        const queryParams = new URLSearchParams();
        if (params.timeMin) queryParams.append('timeMin', params.timeMin);
        if (params.timeMax) queryParams.append('timeMax', params.timeMax);
        if (params.maxResults) queryParams.append('maxResults', params.maxResults);
        queryParams.append('singleEvents', 'true');
        queryParams.append('orderBy', 'startTime');
        
        const url = `${baseUrl}?${queryParams.toString()}`;
        
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('Calendar API error:', response.status, error);
            return {
                statusCode: response.status,
                headers,
                body: JSON.stringify({ 
                    error: 'Calendar API request failed',
                    status: response.status,
                    details: error
                })
            };
        }

        const data = await response.json();
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(data)
        };

    } catch (error) {
        console.error('Calendar proxy error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: error.message })
        };
    }
};
