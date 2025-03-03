import { pool } from './db.js';

async function initDB() {
  try {
    // Verify connection
    await pool.query('SELECT NOW()');
    
    // Create table if needed
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