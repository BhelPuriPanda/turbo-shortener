import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
});

export default pool;

//IF NOT MADE ALREADY THEN ONLY DELETE AFTER
export async function setupDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS links (
                id SERIAL PRIMARY KEY,
                code VARCHAR(10) UNIQUE NOT NULL,
                original_url TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS clicks (
                id SERIAL PRIMARY KEY,
                code VARCHAR(10) NOT NULL,
                clicked_at TIMESTAMP DEFAULT NOW()
            )
        `);
        console.log('Database tables ready');
    } catch (error) {
        console.error('Database setup failed:', error);
        throw error;
    }
}