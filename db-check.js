import { pool } from './db.js';

async function verifyDatabase() {
    try {
        // Verify table structure
        await pool.query(`
            ALTER TABLE sessions
            ALTER COLUMN data TYPE JSONB USING data::JSONB
        `);
        console.log('✅ Database structure verified');
    } catch (error) {
        console.error('❌ Database verification failed:', error.message);
        process.exit(1);
    }
}

export default verifyDatabase;