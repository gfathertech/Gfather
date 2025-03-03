import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { 
    rejectUnauthorized: false 
  } : false
});

async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        data JSONB NOT NULL
      )
    `);
    console.log('✅ Session table verified');
  } catch (error) {
    console.error('❌ DB Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

export default initDB;