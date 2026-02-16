import { Pool, types } from 'pg';

// Keep DATE columns as 'YYYY-MM-DD' strings to avoid timezone shifts.
types.setTypeParser(1082, (value) => value);

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required');
}

export const pool = new Pool({ connectionString });
