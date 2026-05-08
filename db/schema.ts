import type { SQLiteDatabase } from 'expo-sqlite';

export const DATABASE_NAME = 'poke.db';

export type ItemStatus = 'holding' | 'listed' | 'sold';

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
};

export type SaleWithItem = Sale & { item_name: string | null };

export async function migrate(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

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
}
