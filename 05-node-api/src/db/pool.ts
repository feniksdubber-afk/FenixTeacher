/**
 * pool.ts — PostgreSQL ulanish hovuzi (fenix-db-schema.sql shu bazaga
 * qo'llaniladi). Barcha so'rovlar shu `query()` orqali o'tadi.
 */
import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function query<T = unknown>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}

pool.on("error", (err) => {
  // Kutilmagan bazaviy xato — jarayonni yiqitmasdan log qiladi
  console.error("[db] kutilmagan pool xatosi:", err);
});
