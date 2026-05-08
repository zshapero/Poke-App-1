import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import type { SaleWithItem } from '@/db/schema';

export default function SalesScreen() {
  const db = useSQLiteContext();
  const [sales, setSales] = useState<SaleWithItem[]>([]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const rows = await db.getAllAsync<SaleWithItem>(
          `SELECT sales.*, items.name AS item_name
           FROM sales
           LEFT JOIN items ON items.id = sales.item_id
           ORDER BY sold_date DESC, sales.id DESC`
        );
        if (!cancelled) setSales(rows);
      })();
      return () => {
        cancelled = true;
      };
    }, [db])
  );

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.heading}>
        Sales
      </ThemedText>
      <FlatList
        data={sales}
        keyExtractor={(s) => String(s.id)}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <ThemedText style={styles.empty}>No sales recorded yet.</ThemedText>
        }
        renderItem={({ item }) => (
          <ThemedView style={styles.row}>
            <ThemedText type="defaultSemiBold">{item.item_name ?? `Item #${item.item_id}`}</ThemedText>
            <ThemedText>
              Sold for ${item.sale_price?.toFixed(2) ?? '0.00'}
              {item.platform ? ` on ${item.platform}` : ''}
            </ThemedText>
            {item.net_profit != null ? (
              <ThemedText>Net profit: ${item.net_profit.toFixed(2)}</ThemedText>
            ) : null}
          </ThemedView>
        )}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60, paddingHorizontal: 16 },
  heading: { marginBottom: 16 },
  list: { paddingBottom: 160, gap: 12 },
  empty: { textAlign: 'center', marginTop: 48, opacity: 0.6 },
  row: { padding: 12, borderRadius: 8, gap: 4 },
});
