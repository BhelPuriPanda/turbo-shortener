import test, { mock } from 'node:test';
import assert from 'node:assert';

// Set up test environment variables before importing app or db
process.env.NODE_ENV = 'test';
if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = 'postgresql://postgres:password@localhost:5432/testdb';
}

// Dynamically import modules to ensure environment variables are set first
const { default: app } = await import('../src/index.js');
const { default: pool } = await import('../src/db.js');

test('URL Shortener API Tests', async (t) => {
    // Start the server on a dynamic port (0) to avoid port clashes
    const server = app.listen(0);
    const { port } = server.address();
    const baseUrl = `http://localhost:${port}`;

    t.after(() => {
        server.close();
        pool.end();
    });

    // Test Case: POST /shorten - validation check
    // Ensures that the API returns a 400 Bad Request if the 'url' parameter is missing in the request payload
    await t.test('POST /shorten - fails when URL is missing', async () => {
        const response = await fetch(`${baseUrl}/shorten`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({}),
        });

        // Validate response status and custom validation error message
        assert.strictEqual(response.status, 400);
        const data = await response.json();
        assert.strictEqual(data.error, 'URL is required');
    });

    // Test Case: POST /shorten - successful link generation
    // Mocks the database insert behavior and verifies the response contains the original URL, short code, and expected short URL format
    await t.test('POST /shorten - successfully shortens a URL', async () => {
        // Mock the db INSERT query to simulate inserting a record into the 'links' table
        const queryMock = mock.method(pool, 'query', async (queryText, params) => {
            return {
                rows: [{ id: 1, code: 'xyz789', original_url: 'https://google.com' }],
            };
        });

        const response = await fetch(`${baseUrl}/shorten`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url: 'https://google.com' }),
        });

        // Verify the response is 201 Created and fields match mock output
        assert.strictEqual(response.status, 201);
        const data = await response.json();
        assert.ok(data.code);
        assert.strictEqual(data.original_url, 'https://google.com');
        assert.strictEqual(data.short_url, `http://localhost:3000/${data.code}`);
        assert.strictEqual(queryMock.mock.callCount(), 1);

        // Clean up the mock
        queryMock.mock.restore();
    });

    // Test Case: GET /:code - redirection to target URL
    // Mocks fetching link details and tracking a redirection click, verifying that HTTP 302 is returned with the correct Location header
    await t.test('GET /:code - redirects to original URL', async () => {
        // Mock both SELECT links and INSERT clicks queries
        const queryMock = mock.method(pool, 'query', async (queryText, params) => {
            if (queryText.includes('SELECT * FROM links')) {
                return {
                    rows: [{ code: 'abc123', original_url: 'https://example.com' }],
                };
            }
            // INSERT INTO clicks to record analytics for the redirect
            return { rows: [] };
        });

        const response = await fetch(`${baseUrl}/abc123`, {
            redirect: 'manual', // do not automatically follow redirect so we can inspect status and headers
        });

        // Assert that the client receives a 302 redirecting them to the correct original url
        assert.strictEqual(response.status, 302);
        assert.strictEqual(response.headers.get('location'), 'https://example.com');
        assert.strictEqual(queryMock.mock.callCount(), 2);

        // Clean up the mock
        queryMock.mock.restore();
    });

    // Test Case: GET /:code - unknown code lookup failure
    // Ensures that lookup for a code not in the database results in 404 and the correct error message
    await t.test('GET /:code - returns 404 if link not found', async () => {
        // Simulate no database rows matching the requested code
        const queryMock = mock.method(pool, 'query', async (queryText, params) => {
            return { rows: [] };
        });

        const response = await fetch(`${baseUrl}/nonexistent`);

        // Validate response status and error body
        assert.strictEqual(response.status, 404);
        const data = await response.json();
        assert.strictEqual(data.error, 'Short link not found');
        assert.strictEqual(queryMock.mock.callCount(), 1);

        // Clean up the mock
        queryMock.mock.restore();
    });

    // Test Case: GET /stats/:code - analytics retrieval
    // Mocks retrieving both the link metadata and the aggregated count of clicks, verifying stats are structured correctly in response
    await t.test('GET /stats/:code - returns clicks stats', async () => {
        // Mock queries for fetching link details and counting corresponding click entries
        const queryMock = mock.method(pool, 'query', async (queryText, params) => {
            if (queryText.includes('SELECT * FROM links')) {
                return {
                    rows: [{ code: 'xyz789', original_url: 'https://google.com', created_at: '2026-06-17T11:00:00.000Z' }],
                };
            }
            if (queryText.includes('SELECT COUNT(*) FROM clicks')) {
                return {
                    rows: [{ count: '10' }],
                };
            }
            return { rows: [] };
        });

        const response = await fetch(`${baseUrl}/stats/xyz789`);

        // Validate the response status and the schema of returned stats details
        assert.strictEqual(response.status, 200);
        const data = await response.json();
        assert.strictEqual(data.code, 'xyz789');
        assert.strictEqual(data.original_url, 'https://google.com');
        assert.strictEqual(data.total_clicks, 10);
        assert.strictEqual(queryMock.mock.callCount(), 2);

        // Clean up the mock
        queryMock.mock.restore();
    });

    // Test Case: GET /stats/:code - statistics lookup failure for unknown code
    // Ensures stats request for a non-existent short link code results in 404 and the correct error message
    await t.test('GET /stats/:code - returns 404 if link not found for stats', async () => {
        // Simulate database query returning empty rows for the nonexistent code
        const queryMock = mock.method(pool, 'query', async (queryText, params) => {
            return { rows: [] };
        });

        const response = await fetch(`${baseUrl}/stats/nonexistent`);

        // Validate response status and error body
        assert.strictEqual(response.status, 404);
        const data = await response.json();
        assert.strictEqual(data.error, 'Short link not found');
        assert.strictEqual(queryMock.mock.callCount(), 1);

        // Clean up the mock
        queryMock.mock.restore();
    });
});
