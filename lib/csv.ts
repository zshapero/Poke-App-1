import type { SQLiteDatabase } from 'expo-sqlite';

type SalesExportRow = {
  sold_date: string | null;
  item_name: string | null;
  item_set: string | null;
  item_source: string | null;
  item_acquired_date: string | null;
  days_held: number | null;
  item_cost_basis: number | null;
  sale_price: number | null;
  platform: string | null;
  fees: number | null;
  shipping: number | null;
  net_profit: number | null;
};

const HEADERS = [
  'Sold Date',
  'Item Name',
  'Set',
  'Source',
  'Acquired Date',
  'Days Held',
  'Cost Basis',
  'Sale Price',
  'Platform',
  'Fees',
  'Shipping',
  'Net Profit',
];

export async function buildSalesCsv(db: SQLiteDatabase): Promise<string> {
  const rows = await db.getAllAsync<SalesExportRow>(
    `SELECT sales.sold_date AS sold_date,
            items.name AS item_name,
            items."set" AS item_set,
            items.source AS item_source,
            items.acquired_date AS item_acquired_date,
            sales.days_held AS days_held,
            items.cost_basis AS item_cost_basis,
            sales.sale_price AS sale_price,
            sales.platform AS platform,
            sales.fees AS fees,
            sales.shipping AS shipping,
            sales.net_profit AS net_profit
     FROM sales
     LEFT JOIN items ON items.id = sales.item_id
     ORDER BY sales.sold_date ASC, sales.id ASC`
  );

  const lines: string[] = [HEADERS.map(escapeCell).join(',')];
  for (const row of rows) {
    lines.push(
      [
        escapeCell(row.sold_date),
        escapeCell(row.item_name),
        escapeCell(row.item_set),
        escapeCell(row.item_source),
        escapeCell(row.item_acquired_date),
        escapeCell(row.days_held),
        escapeCell(plainMoney(row.item_cost_basis)),
        escapeCell(plainMoney(row.sale_price)),
        escapeCell(row.platform),
        escapeCell(plainMoney(row.fees)),
        escapeCell(plainMoney(row.shipping)),
        escapeCell(plainMoney(row.net_profit)),
      ].join(',')
    );
  }
  return lines.join('\n');
}

function escapeCell(value: string | number | null | undefined): string {
  if (value == null) return '';
  const str = String(value);
  if (/[,"\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function plainMoney(n: number | null | undefined): string {
  if (n == null) return '';
  return n.toFixed(2);
}
