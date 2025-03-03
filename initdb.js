import pool from './db.js';

async function initDB() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                data JSONB NOT NULL
            )
        `);
        console.log('✅ Database connection verified');
    } catch (error) {
        console.error('❌ Database initialization failed:', error.message);
        process.exit(1);
    }
}

export default initDB;