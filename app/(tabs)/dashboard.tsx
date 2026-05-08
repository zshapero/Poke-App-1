import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

type Totals = {
  itemCount: number;
  totalCostBasis: number;
  saleCount: number;
  totalNetProfit: number;
};

const ZERO: Totals = { itemCount: 0, totalCostBasis: 0, saleCount: 0, totalNetProfit: 0 };

export default function DashboardScreen() {
  const db = useSQLiteContext();
  const [totals, setTotals] = useState<Totals>(ZERO);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const itemRow = await db.getFirstAsync<{
          item_count: number;
          total_cost_basis: number | null;
        }>(
          `SELECT COUNT(*) AS item_count, COALESCE(SUM(cost_basis), 0) AS total_cost_basis FROM items`
        );
        const saleRow = await db.getFirstAsync<{
          sale_count: number;
          total_net_profit: number | null;
        }>(
          `SELECT COUNT(*) AS sale_count, COALESCE(SUM(net_profit), 0) AS total_net_profit FROM sales`
        );
        if (cancelled) return;
        setTotals({
          itemCount: itemRow?.item_count ?? 0,
          totalCostBasis: itemRow?.total_cost_basis ?? 0,
          saleCount: saleRow?.sale_count ?? 0,
          totalNetProfit: saleRow?.total_net_profit ?? 0,
        });
      })();
      return () => {
        cancelled = true;
      };
    }, [db])
  );

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.heading}>
        Dashboard
      </ThemedText>
      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">Items in collection</ThemedText>
        <ThemedText type="title">{totals.itemCount}</ThemedText>
      </ThemedView>
      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">Total cost basis</ThemedText>
        <ThemedText type="title">${totals.totalCostBasis.toFixed(2)}</ThemedText>
      </ThemedView>
      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">Sales recorded</ThemedText>
        <ThemedText type="title">{totals.saleCount}</ThemedText>
      </ThemedView>
      <ThemedView style={styles.card}>
        <ThemedText type="subtitle">Lifetime net profit</ThemedText>
        <ThemedText type="title">${totals.totalNetProfit.toFixed(2)}</ThemedText>
      </ThemedView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60, paddingHorizontal: 16, gap: 12 },
  heading: { marginBottom: 8 },
  card: { padding: 16, borderRadius: 12, gap: 4 },
});
