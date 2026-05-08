import { Image } from 'expo-image';
import { Link, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import type { SaleWithItem } from '@/db/schema';
import {
  formatIsoForDisplay,
  formatMoney,
  formatSignedMoney,
} from '@/lib/format';

const C = {
  scaffold: '#000000',
  surface: '#1f2937',
  surfaceBorder: 'rgba(255,255,255,0.06)',
  primary: '#f9fafb',
  secondary: '#9ca3af',
  muted: '#6b7280',
  accent: '#3b82f6',
  positive: '#22c55e',
  positiveBg: 'rgba(34,197,94,0.15)',
  negative: '#ef4444',
  negativeBg: 'rgba(239,68,68,0.15)',
};

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
                  items.is_graded AS item_is_graded,
                  items.photo_uri AS item_photo_uri
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

  const filtersActive =
    platformFilter !== 'All' || typeFilter !== 'All' || search.trim().length > 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Sales</Text>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Lifetime profit</Text>
            <Text
              style={[
                styles.statValue,
                stats.totalProfit > 0 && styles.statValuePositive,
                stats.totalProfit < 0 && styles.statValueNegative,
              ]}>
              {formatSignedMoney(stats.totalProfit)}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Sales</Text>
            <Text style={styles.statValue}>{stats.count}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Avg days</Text>
            <Text style={styles.statValue}>
              {stats.avgDays === null ? '—' : `${stats.avgDays}`}
            </Text>
          </View>
        </View>

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by item name…"
          placeholderTextColor={C.muted}
          style={styles.search}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
        style={styles.chipsScroll}>
        {PLATFORM_FILTERS.map((p) => {
          const active = p === platformFilter;
          return (
            <Pressable
              key={p}
              onPress={() => setPlatformFilter(p)}
              style={[styles.chip, active && styles.chipActive]}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {p}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
        style={styles.chipsScroll}>
        {TYPE_FILTERS.map((t) => {
          const active = t === typeFilter;
          return (
            <Pressable
              key={t}
              onPress={() => setTypeFilter(t)}
              style={[styles.chip, active && styles.chipActive]}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {t}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <FlatList
        data={filtered}
        keyExtractor={(s) => String(s.id)}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <IconSymbol name="dollarsign.circle.fill" size={36} color={C.muted} />
            </View>
            <Text style={styles.emptyText}>
              {sales.length === 0
                ? 'No sales yet — mark an item sold to log one'
                : filtersActive
                  ? 'No sales match your filters'
                  : 'No sales recorded yet'}
            </Text>
          </View>
        }
        renderItem={({ item }) => <SaleCard sale={item} />}
      />
    </View>
  );
}

function SaleCard({ sale }: { sale: SaleWithItem }) {
  const profit = sale.net_profit ?? 0;
  const profitPositive = profit > 0;
  const profitNegative = profit < 0;
  const isGraded = sale.item_is_graded === 1;
  const setLine = sale.item_set;

  return (
    <Link
      href={{ pathname: '/sale/[id]', params: { id: String(sale.id) } }}
      asChild>
      <Pressable
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
        <View style={styles.thumb}>
          {sale.item_photo_uri ? (
            <Image
              source={{ uri: sale.item_photo_uri }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={150}
            />
          ) : (
            <IconSymbol name="photo" size={20} color={C.muted} />
          )}
        </View>

        <View style={styles.center}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {sale.item_name ?? `Item #${sale.item_id}`}
            </Text>
            {isGraded ? (
              <View style={styles.gradeChip}>
                <Text style={styles.gradeChipText}>Graded</Text>
              </View>
            ) : null}
          </View>
          {setLine ? (
            <Text style={styles.setText} numberOfLines={1}>
              {setLine}
            </Text>
          ) : null}
          <View style={styles.metaRow}>
            {sale.platform ? (
              <View style={styles.sourceChip}>
                <Text style={styles.sourceChipText}>{sale.platform}</Text>
              </View>
            ) : null}
            <Text style={styles.metaText}>
              {sale.platform ? '· ' : ''}
              {sale.days_held != null
                ? `${sale.days_held === 1 ? '1 day' : `${sale.days_held} days`} · `
                : ''}
              {formatIsoForDisplay(sale.sold_date)}
            </Text>
          </View>
        </View>

        <View style={styles.right}>
          <Text style={styles.costLabel}>
            Cost {formatMoney(sale.item_cost_basis)}
          </Text>
          <Text style={styles.priceText}>Sale {formatMoney(sale.sale_price)}</Text>
          <View
            style={[
              styles.profitPill,
              profitPositive && styles.profitPillPositive,
              profitNegative && styles.profitPillNegative,
            ]}>
            <Text
              style={[
                styles.profitPillText,
                profitPositive && styles.profitPillTextPositive,
                profitNegative && styles.profitPillTextNegative,
              ]}>
              {formatSignedMoney(profit)}
            </Text>
          </View>
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60, backgroundColor: C.scaffold },

  header: { paddingHorizontal: 16, gap: 12 },
  title: { fontSize: 32, fontWeight: '700', color: C.primary },

  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: {
    flex: 1,
    backgroundColor: C.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: C.surfaceBorder,
    gap: 4,
  },
  statLabel: {
    fontSize: 11,
    color: C.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '600',
  },
  statValue: { fontSize: 22, fontWeight: '700', color: C.primary },
  statValuePositive: { color: C.positive },
  statValueNegative: { color: C.negative },

  search: {
    borderWidth: 1,
    borderColor: C.surfaceBorder,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: C.primary,
    backgroundColor: C.surface,
  },

  chipsScroll: { flexGrow: 0 },
  chipsRow: { gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.surfaceBorder,
    backgroundColor: C.surface,
  },
  chipActive: { backgroundColor: C.accent, borderColor: C.accent },
  chipText: { color: C.primary, fontSize: 13, fontWeight: '500' },
  chipTextActive: { color: '#ffffff', fontSize: 13, fontWeight: '600' },

  list: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 160, gap: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.surfaceBorder,
  },
  cardPressed: { opacity: 0.85 },

  thumb: {
    width: 56,
    aspectRatio: 5 / 7,
    borderRadius: 8,
    backgroundColor: '#374151',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },

  center: { flex: 1, gap: 4 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  name: { flexShrink: 1, fontSize: 16, fontWeight: '600', color: C.primary },
  setText: { fontSize: 13, color: C.secondary },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' },
  sourceChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  sourceChipText: { fontSize: 11, color: C.secondary, fontWeight: '500' },
  metaText: { fontSize: 12, color: C.muted },
  gradeChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(148,163,184,0.18)',
  },
  gradeChipText: { fontSize: 11, color: '#cbd5e1', fontWeight: '700' },

  right: { alignItems: 'flex-end', gap: 4, marginLeft: 12 },
  costLabel: { fontSize: 13, color: C.secondary },
  priceText: { fontSize: 15, fontWeight: '600', color: C.primary },

  profitPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginTop: 2,
  },
  profitPillPositive: { backgroundColor: C.positiveBg },
  profitPillNegative: { backgroundColor: C.negativeBg },
  profitPillText: { fontSize: 12, fontWeight: '700', color: C.muted },
  profitPillTextPositive: { color: C.positive },
  profitPillTextNegative: { color: C.negative },

  empty: { alignItems: 'center', paddingTop: 80, gap: 16 },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.surfaceBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { color: C.secondary, textAlign: 'center', fontSize: 15 },
});
