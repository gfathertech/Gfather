import pkg from 'pg';
const { Pool } = pkg;

const databaseConfig = {
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
};

export const pool = new Pool(databaseConfig);