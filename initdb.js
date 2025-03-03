

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