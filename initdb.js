import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function initDB() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        data JSONB NOT NULL
      )
    `);
    console.log('✅ Session table created/verified');
  } catch (error) {
    console.error('❌ Error creating session table:', error);
    process.exit(1);
  }
}

export default initDB;