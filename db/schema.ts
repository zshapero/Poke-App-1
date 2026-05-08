import type { SQLiteDatabase } from 'expo-sqlite';

export const DATABASE_NAME = 'poke.db';

export type ItemStatus = 'active' | 'listed' | 'sold';

export type GradingCompany = 'PSA' | 'CGC' | 'BGS' | 'SGC' | 'ACE' | 'Other';

export type Item = {
  id: number;
  name: string;
  set: string | null;
  cost_basis: number | null;
  acquired_date: string | null;
  source: string | null;
  photo_uri: string | null;
  status: ItemStatus | null;
  current_price: number | null;
  tcg_card_id: string | null;
  tcg_set_id: string | null;
  is_graded: number;
  grading_company: string | null;
  grade: number | null;
};

export type Sale = {
  id: number;
  item_id: number;
  sale_price: number | null;
  platform: string | null;
  fees: number | null;
  shipping: number | null;
  sold_date: string | null;
  net_profit: number | null;
  days_held: number | null;
};

export type SaleWithItem = Sale & {
  item_name: string | null;
  item_set: string | null;
  item_cost_basis: number | null;
  item_is_graded: number | null;
  item_photo_uri: string | null;
};

const SCHEMA_VERSION = 3;

export async function migrate(db: SQLiteDatabase): Promise<void> {
  // Pragmas are session-scoped, so set every time the DB is opened.
  await db.execAsync(`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;`);

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;

  if (version < 1) {
    // v1: initial schema. Note that `set` is quoted because it's a soft
    // SQL keyword. Don't drop the quotes if you write new queries.
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        "set" TEXT,
        cost_basis REAL,
        acquired_date TEXT,
        source TEXT,
        photo_uri TEXT,
        status TEXT,
        current_price REAL
      );

      CREATE TABLE IF NOT EXISTS sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id INTEGER NOT NULL,
        sale_price REAL,
        platform TEXT,
        fees REAL,
        shipping REAL,
        sold_date TEXT,
        net_profit REAL,
        FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_sales_item_id ON sales(item_id);
      CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);
    `);
    version = 1;
  }

  if (version < 2) {
    // v2: capture how long an item was held when a sale is recorded.
    await db.execAsync(`ALTER TABLE sales ADD COLUMN days_held INTEGER`);
    version = 2;
  }

  if (version < 3) {
    // v3: link items back to the Pokemon TCG API and capture grading info.
    // ALTER TABLE ... DEFAULT 0 fills existing rows with 0; the rest stay NULL.
    await db.execAsync(`
      ALTER TABLE items ADD COLUMN tcg_card_id TEXT;
      ALTER TABLE items ADD COLUMN tcg_set_id TEXT;
      ALTER TABLE items ADD COLUMN is_graded INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE items ADD COLUMN grading_company TEXT;
      ALTER TABLE items ADD COLUMN grade REAL;
    `);
    version = 3;
  }

  if (version !== SCHEMA_VERSION) {
    throw new Error(
      `Schema migrator finished at version ${version}, expected ${SCHEMA_VERSION}. ` +
        `Did you add an if-block but forget to bump SCHEMA_VERSION?`
    );
  }

  await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}
