import { Link, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import type { SaleWithItem } from '@/db/schema';
import {
  formatIsoForDisplay,
  formatMoney,
  formatSignedMoney,
} from '@/lib/format';

const PLATFORM_FILTERS = [
  'All',
  'eBay',
  'TCGPlayer',
  'Whatnot',
  'Mercari',
  'Other',
] as const;
type PlatformFilter = (typeof PLATFORM_FILTERS)[number];

const TYPE_FILTERS = ['All', 'Raw', 'Graded'] as const;
type TypeFilter = (typeof TYPE_FILTERS)[number];

export default function SalesScreen() {
  const db = useSQLiteContext();
  const [sales, setSales] = useState<SaleWithItem[]>([]);
  const [search, setSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>('All');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('All');

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const rows = await db.getAllAsync<SaleWithItem>(
          `SELECT sales.*,
                  items.name AS item_name,
                  items."set" AS item_set,
                  items.cost_basis AS item_cost_basis,
                  items.is_graded AS item_is_graded
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sales.filter((s) => {
      if (platformFilter !== 'All' && s.platform !== platformFilter) return false;
      if (typeFilter === 'Raw' && s.item_is_graded === 1) return false;
      if (typeFilter === 'Graded' && s.item_is_graded !== 1) return false;
      if (q && !(s.item_name?.toLowerCase().includes(q) ?? false)) return false;
      return true;
    });
  }, [sales, search, platformFilter, typeFilter]);

  const stats = useMemo(() => {
    const totalProfit = sales.reduce((sum, s) => sum + (s.net_profit ?? 0), 0);
    const count = sales.length;
    const heldDays = sales
      .map((s) => s.days_held)
      .filter((d): d is number => d != null);
    const avgDays =
      heldDays.length === 0
        ? null
        : Math.round(heldDays.reduce((sum, d) => sum + d, 0) / heldDays.length);
    return { totalProfit, count, avgDays };
  }, [sales]);

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="title">Sales</ThemedText>
        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <ThemedText style={styles.statLabel}>Lifetime profit</ThemedText>
            <ThemedText
              type="defaultSemiBold"
              style={[
                styles.statValue,
                stats.totalProfit > 0 && styles.profitPositive,
                stats.totalProfit < 0 && styles.profitNegative,
              ]}>
              {formatSignedMoney(stats.totalProfit)}
            </ThemedText>
          </View>
          <View style={styles.stat}>
            <ThemedText style={styles.statLabel}>Sales</ThemedText>
            <ThemedText type="defaultSemiBold" style={styles.statValue}>
              {stats.count}
            </ThemedText>
          </View>
          <View style={styles.stat}>
            <ThemedText style={styles.statLabel}>Avg days to sell</ThemedText>
            <ThemedText type="defaultSemiBold" style={styles.statValue}>
              {stats.avgDays === null ? '—' : `${stats.avgDays}`}
            </ThemedText>
          </View>
        </View>

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by item name…"
          placeholderTextColor="#999"
          style={styles.search}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          returnKeyType="search"
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}>
          {PLATFORM_FILTERS.map((p) => {
            const active = p === platformFilter;
            return (
              <Pressable
                key={p}
                onPress={() => setPlatformFilter(p)}
                style={[styles.chip, active && styles.chipActive]}>
                <ThemedText
                  style={active ? styles.chipTextActive : styles.chipText}>
                  {p}
                </ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}>
          {TYPE_FILTERS.map((t) => {
            const active = t === typeFilter;
            return (
              <Pressable
                key={t}
                onPress={() => setTypeFilter(t)}
                style={[styles.chip, active && styles.chipActive]}>
                <ThemedText style={active ? styles.chipTextActive : styles.chipText}>
                  {t}
                </ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(s) => String(s.id)}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <ThemedText style={styles.empty}>
            {sales.length === 0
              ? 'No sales recorded yet. Mark an item as sold to log one here.'
              : 'No sales match your search or filter.'}
          </ThemedText>
        }
        renderItem={({ item }) => <SaleRow sale={item} />}
      />
    </ThemedView>
  );
}

function SaleRow({ sale }: { sale: SaleWithItem }) {
  const profitPositive = (sale.net_profit ?? 0) > 0;
  const profitNegative = (sale.net_profit ?? 0) < 0;
  return (
    <Link
      href={{ pathname: '/sale/[id]', params: { id: String(sale.id) } }}
      asChild>
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
        <View style={styles.rowMain}>
          <View style={styles.rowTop}>
            <View style={styles.rowTopLeft}>
              <ThemedText type="defaultSemiBold">
                {sale.item_name ?? `Item #${sale.item_id}`}
              </ThemedText>
              {sale.item_set ? (
                <ThemedText style={styles.muted}>{sale.item_set}</ThemedText>
              ) : null}
            </View>
            <View style={styles.rowTopRight}>
              <ThemedText type="defaultSemiBold">
                {formatMoney(sale.sale_price)}
              </ThemedText>
              <ThemedText
                style={[
                  styles.profit,
                  profitPositive && styles.profitPositive,
                  profitNegative && styles.profitNegative,
                ]}>
                {formatSignedMoney(sale.net_profit)}
              </ThemedText>
            </View>
          </View>
          <View style={styles.rowBottom}>
            <ThemedText style={styles.muted}>
              {sale.days_held !== null
                ? `${sale.days_held === 1 ? '1 day' : `${sale.days_held} days`} held · `
                : ''}
              {formatIsoForDisplay(sale.sold_date)}
            </ThemedText>
            {sale.platform ? (
              <View style={styles.badge}>
                <ThemedText style={styles.badgeText}>{sale.platform}</ThemedText>
              </View>
            ) : null}
          </View>
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60 },
  header: { paddingHorizontal: 16, gap: 12 },
  statsRow: { flexDirection: 'row', gap: 16, marginTop: 4, flexWrap: 'wrap' },
  stat: { gap: 2, minWidth: 100 },
  statLabel: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  statValue: { fontSize: 20 },
  profitPositive: { color: '#16a34a' },
  profitNegative: { color: '#dc2626' },
  search: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#111',
    backgroundColor: '#fff',
  },
  chipsRow: { gap: 8, paddingVertical: 4, paddingRight: 16 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#ccc',
    backgroundColor: '#fff',
  },
  chipActive: {
    borderColor: '#0a7ea4',
    backgroundColor: '#0a7ea4',
  },
  chipText: { color: '#111', fontSize: 13 },
  chipTextActive: { color: '#fff', fontSize: 13, fontWeight: '600' },
  list: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 160, gap: 8 },
  row: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#eee',
    backgroundColor: '#fafafa',
  },
  rowPressed: { opacity: 0.7 },
  rowMain: { gap: 8 },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  rowTopLeft: { flex: 1, gap: 2 },
  rowTopRight: { alignItems: 'flex-end', gap: 2 },
  profit: { fontSize: 14, fontWeight: '600' },
  rowBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  muted: {},
  badge: {
    backgroundColor: '#e6f4fb',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeText: { color: '#0a7ea4', fontSize: 12, fontWeight: '600' },
  empty: { textAlign: 'center', marginTop: 48 },
});
