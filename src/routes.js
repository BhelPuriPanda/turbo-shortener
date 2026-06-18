import express from 'express';
import { nanoid } from 'nanoid';
import pool from './db.js';

const router = express.Router();

// Create a short link
router.post('/shorten', async (req, res) => {
    try {
        const { url } = req.body;

        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }

        const code = nanoid(6);

        const result = await pool.query(
            'INSERT INTO links (code, original_url) VALUES ($1, $2) RETURNING *',
            [code, url]
        );

        res.status(201).json({
            code,
            short_url: `${process.env.BASE_URL || 'http://localhost:3000'}/${code}`,
            original_url: url,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Redirect to original URL
router.get('/:code', async (req, res) => {
    try {
        const { code } = req.params;

        const result = await pool.query(
            'SELECT * FROM links WHERE code = $1',
            [code]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Short link not found' });
        }

        await pool.query(
            'INSERT INTO clicks (code) VALUES ($1)',
            [code]
        );

        res.redirect(302, result.rows[0].original_url);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get stats for a short link
router.get('/stats/:code', async (req, res) => {
    try {
        const { code } = req.params;

        const link = await pool.query(
            'SELECT * FROM links WHERE code = $1',
            [code]
        );

        if (link.rows.length === 0) {
            return res.status(404).json({ error: 'Short link not found' });
        }

        const clicks = await pool.query(
            'SELECT COUNT(*) FROM clicks WHERE code = $1',
            [code]
        );

        res.json({
            code,
            original_url: link.rows[0].original_url,
            total_clicks: parseInt(clicks.rows[0].count),
            created_at: link.rows[0].created_at,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;