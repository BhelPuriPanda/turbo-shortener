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

    await t.test('POST /shorten - fails when URL is missing', async () => {
        const response = await fetch(`${baseUrl}/shorten`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({}),
        });

        assert.strictEqual(response.status, 400);
        const data = await response.json();
        assert.strictEqual(data.error, 'URL is required');
    });

    await t.test('POST /shorten - successfully shortens a URL', async () => {
        // Mock the db INSERT query
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

        assert.strictEqual(response.status, 201);
        const data = await response.json();
        assert.ok(data.code);
        assert.strictEqual(data.original_url, 'https://google.com');
        assert.strictEqual(data.short_url, `http://localhost:3000/${data.code}`);
        assert.strictEqual(queryMock.mock.callCount(), 1);

        queryMock.mock.restore();
    });

    await t.test('GET /:code - redirects to original URL', async () => {
        // Mock both SELECT links and INSERT clicks queries
        const queryMock = mock.method(pool, 'query', async (queryText, params) => {
            if (queryText.includes('SELECT * FROM links')) {
                return {
                    rows: [{ code: 'abc123', original_url: 'https://example.com' }],
                };
            }
            // INSERT INTO clicks
            return { rows: [] };
        });

        const response = await fetch(`${baseUrl}/abc123`, {
            redirect: 'manual', // do not automatically follow redirect so we can inspect status and headers
        });

        assert.strictEqual(response.status, 302);
        assert.strictEqual(response.headers.get('location'), 'https://example.com');
        assert.strictEqual(queryMock.mock.callCount(), 2);

        queryMock.mock.restore();
    });

    await t.test('GET /:code - returns 404 if link not found', async () => {
        const queryMock = mock.method(pool, 'query', async (queryText, params) => {
            return { rows: [] };
        });

        const response = await fetch(`${baseUrl}/nonexistent`);

        assert.strictEqual(response.status, 404);
        const data = await response.json();
        assert.strictEqual(data.error, 'Short link not found');
        assert.strictEqual(queryMock.mock.callCount(), 1);

        queryMock.mock.restore();
    });

    await t.test('GET /stats/:code - returns clicks stats', async () => {
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

        assert.strictEqual(response.status, 200);
        const data = await response.json();
        assert.strictEqual(data.code, 'xyz789');
        assert.strictEqual(data.original_url, 'https://google.com');
        assert.strictEqual(data.total_clicks, 10);
        assert.strictEqual(queryMock.mock.callCount(), 2);

        queryMock.mock.restore();
    });

    await t.test('GET /stats/:code - returns 404 if link not found for stats', async () => {
        const queryMock = mock.method(pool, 'query', async (queryText, params) => {
            return { rows: [] };
        });

        const response = await fetch(`${baseUrl}/stats/nonexistent`);

        assert.strictEqual(response.status, 404);
        const data = await response.json();
        assert.strictEqual(data.error, 'Short link not found');
        assert.strictEqual(queryMock.mock.callCount(), 1);

        queryMock.mock.restore();
    });
});
