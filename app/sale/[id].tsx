import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import type { SaleWithItem } from '@/db/schema';
import {
  formatIsoForDisplay,
  formatMoney,
  formatSignedMoney,
} from '@/lib/format';

export default function SaleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const [sale, setSale] = useState<SaleWithItem | null>(null);
  const [loaded, setLoaded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        if (!id) {
          setLoaded(true);
          return;
        }
        const row = await db.getFirstAsync<SaleWithItem>(
          `SELECT sales.*,
                  items.name AS item_name,
                  items."set" AS item_set,
                  items.cost_basis AS item_cost_basis
           FROM sales
           LEFT JOIN items ON items.id = sales.item_id
           WHERE sales.id = ?
           LIMIT 1`,
          [Number(id)]
        );
        if (cancelled) return;
        setSale(row ?? null);
        setLoaded(true);
      })();
      return () => {
        cancelled = true;
      };
    }, [db, id])
  );

  if (!loaded) {
    return (
      <ThemedView style={styles.container}>
        <Stack.Screen options={{ title: '' }} />
        <ThemedText style={styles.muted}>Loading…</ThemedText>
      </ThemedView>
    );
  }

  if (!sale) {
    return (
      <ThemedView style={styles.container}>
        <Stack.Screen options={{ title: 'Not found' }} />
        <ThemedText>This sale no longer exists.</ThemedText>
      </ThemedView>
    );
  }

  const profit = sale.net_profit ?? 0;
  const profitPositive = profit > 0;
  const profitNegative = profit < 0;

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: 'Sale details' }} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.headerBlock}>
          <ThemedText type="title">
            {sale.item_name ?? `Item #${sale.item_id}`}
          </ThemedText>
          {sale.item_set ? (
            <ThemedText style={styles.muted}>{sale.item_set}</ThemedText>
          ) : null}
          {sale.platform ? (
            <View style={styles.badge}>
              <ThemedText style={styles.badgeText}>{sale.platform}</ThemedText>
            </View>
          ) : null}
        </View>

        <View style={styles.card}>
          <ThemedText style={styles.cardTitle}>Math</ThemedText>
          <MathRow label="Sale price" value={formatMoney(sale.sale_price)} />
          <MathRow label="Cost basis" value={formatMoney(sale.item_cost_basis)} />
          <MathRow label="Fees" value={formatMoney(sale.fees)} />
          <MathRow label="Shipping" value={formatMoney(sale.shipping)} />
          <View style={styles.divider} />
          <View style={styles.netRow}>
            <ThemedText type="defaultSemiBold" style={styles.netLabel}>
              Net profit
            </ThemedText>
            <ThemedText
              type="title"
              style={[
                styles.netValue,
                profitPositive && styles.profitPositive,
                profitNegative && styles.profitNegative,
              ]}>
              {formatSignedMoney(profit)}
            </ThemedText>
          </View>
        </View>

        <View style={styles.card}>
          <ThemedText style={styles.cardTitle}>When</ThemedText>
          <MathRow label="Sold on" value={formatIsoForDisplay(sale.sold_date)} />
          <MathRow
            label="Held for"
            value={
              sale.days_held === null
                ? '—'
                : sale.days_held === 1
                  ? '1 day'
                  : `${sale.days_held} days`
            }
          />
        </View>

        <Pressable
          onPress={() =>
            router.push({
              pathname: '/item/[id]',
              params: { id: String(sale.item_id) },
            })
          }
          style={({ pressed }) => [
            styles.viewItemButton,
            pressed && styles.viewItemPressed,
          ]}>
          <ThemedText style={styles.viewItemText}>View this item</ThemedText>
        </Pressable>
      </ScrollView>
    </ThemedView>
  );
}

function MathRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.mathRow}>
      <ThemedText style={styles.mathLabel}>{label}</ThemedText>
      <ThemedText type="defaultSemiBold">{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 20, gap: 16, paddingBottom: 40 },
  headerBlock: { gap: 4, alignItems: 'flex-start' },
  badge: {
    backgroundColor: '#e6f4fb',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginTop: 6,
  },
  badgeText: { color: '#0a7ea4', fontSize: 12, fontWeight: '600' },
  card: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#eee',
    backgroundColor: '#fafafa',
    gap: 4,
  },
  cardTitle: {
    fontSize: 12,
    opacity: 0.5,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  mathRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  mathLabel: { opacity: 0.7 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#bbb',
    marginVertical: 4,
  },
  netRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingTop: 8,
  },
  netLabel: { fontSize: 16 },
  netValue: { fontSize: 28 },
  profitPositive: { color: '#16a34a' },
  profitNegative: { color: '#dc2626' },
  viewItemButton: {
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#0a7ea4',
    alignItems: 'center',
  },
  viewItemPressed: { opacity: 0.85 },
  viewItemText: { color: '#0a7ea4', fontSize: 16, fontWeight: '600' },
  muted: { opacity: 0.6 },
});
