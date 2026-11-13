
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: true }
    : false,
  max: 15,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

pool.on("error", error => {
  console.error("Unexpected PostgreSQL error:", error.message);
});

export async function query(text, params = []) {
  return pool.query(text, params);
}

export async function testDatabase() {
  const result = await query("SELECT NOW()");
  return result.rows[0];
}
