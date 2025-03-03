import pkg from 'pg';
const { Pool } = pkg;

export default new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});