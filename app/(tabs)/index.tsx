import { Link, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';
import type { Item } from '@/db/schema';
import { getMarketPrice, searchCard } from '@/lib/api/pokemontcg';
import { formatMoney, formatSignedMoney } from '@/lib/format';
import { showToast } from '@/lib/toast';

const SOURCE_FILTERS = [
  'All',
  'Box Pull',
  'Single Buy',
  'Bulk',
  'Estate Sale',
  'Trade',
  'Other',
] as const;
type SourceFilter = (typeof SOURCE_FILTERS)[number];

const ACTIVE_QUERY = 'SELECT * FROM items WHERE status = ? ORDER BY id DESC';

export default function PortfolioScreen() {
  const db = useSQLiteContext();
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('All');
  const [refreshing, setRefreshing] = useState(false);

  const refetchItems = useCallback(async () => {
    const rows = await db.getAllAsync<Item>(ACTIVE_QUERY, ['active']);
    setItems(rows);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const rows = await db.getAllAsync<Item>(ACTIVE_QUERY, ['active']);
        if (!cancelled) setItems(rows);
      })();
      return () => {
        cancelled = true;
      };
    }, [db])
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (sourceFilter !== 'All' && item.source !== sourceFilter) return false;
      if (q && !item.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, search, sourceFilter]);

  const totalInvested = useMemo(
    () => items.reduce((sum, i) => sum + (i.cost_basis ?? 0), 0),
    [items]
  );

  const onRefreshPrices = async () => {
    if (refreshing || items.length === 0) return;
    setRefreshing(true);
    let updated = 0;
    let networkErrored = false;
    for (const item of items) {
      if (!item.name?.trim() || !item.set?.trim()) continue;
      try {
        const cards = await searchCard(item.name, item.set);
        if (cards.length === 0) continue;
        const price = getMarketPrice(cards[0]);
        if (price == null) continue;
        await db.runAsync('UPDATE items SET current_price = ? WHERE id = ?', [
          price,
          item.id,
        ]);
        updated++;
      } catch {
        networkErrored = true;
      }
    }
    setRefreshing(false);
    if (networkErrored && updated === 0) {
      showToast('Could not reach price service');
    } else {
      showToast(`Updated ${updated} of ${items.length} items`);
    }
    await refetchItems();
  };

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <ThemedText type="title">Portfolio</ThemedText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh prices"
            onPress={onRefreshPrices}
            disabled={refreshing || items.length === 0}
            style={({ pressed }) => [
              styles.refreshButton,
              (refreshing || items.length === 0) && styles.refreshButtonDisabled,
              pressed && styles.refreshButtonPressed,
            ]}>
            {refreshing ? (
              <ActivityIndicator size="small" color="#0a7ea4" />
            ) : (
              <IconSymbol name="arrow.clockwise" size={22} color="#0a7ea4" />
            )}
          </Pressable>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <ThemedText style={styles.statLabel}>Invested</ThemedText>
            <ThemedText type="defaultSemiBold" style={styles.statValue}>
              {formatMoney(totalInvested)}
            </ThemedText>
          </View>
          <View style={styles.stat}>
            <ThemedText style={styles.statLabel}>Active items</ThemedText>
            <ThemedText type="defaultSemiBold" style={styles.statValue}>
              {items.length}
            </ThemedText>
          </View>
        </View>

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name…"
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
          {SOURCE_FILTERS.map((s) => {
            const active = s === sourceFilter;
            return (
              <Pressable
                key={s}
                onPress={() => setSourceFilter(s)}
                style={[styles.chip, active && styles.chipActive]}>
                <ThemedText style={active ? styles.chipTextActive : styles.chipText}>
                  {s}
                </ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.listWrap}>
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <ThemedText style={styles.empty}>
              {items.length === 0
                ? 'No items yet. Tap the + button to add your first one.'
                : 'No items match your search or filter.'}
            </ThemedText>
          }
          renderItem={({ item }) => <ItemRow item={item} />}
        />
        {refreshing && (
          <View style={styles.refreshOverlay}>
            <ActivityIndicator size="large" color="#0a7ea4" />
            <ThemedText style={styles.refreshOverlayText}>
              Refreshing prices…
            </ThemedText>
          </View>
        )}
      </View>
    </ThemedView>
  );
}

function ItemRow({ item }: { item: Item }) {
  const profit =
    item.current_price != null && item.cost_basis != null
      ? item.current_price - item.cost_basis
      : null;
  const profitPositive = profit != null && profit > 0;
  const profitNegative = profit != null && profit < 0;
  return (
    <Link href={{ pathname: '/item/[id]', params: { id: String(item.id) } }} asChild>
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
        <View style={styles.rowLeft}>
          <ThemedText type="defaultSemiBold">{item.name}</ThemedText>
          {item.set ? <ThemedText>{item.set}</ThemedText> : null}
          <ThemedText style={styles.costBasisSmall}>
            Cost {formatMoney(item.cost_basis)}
          </ThemedText>
        </View>
        <View style={styles.rowRight}>
          {item.current_price != null ? (
            <>
              <ThemedText type="defaultSemiBold" style={styles.priceValue}>
                {formatMoney(item.current_price)}
              </ThemedText>
              {profit != null && (
                <ThemedText
                  style={[
                    styles.profit,
                    profitPositive && styles.profitPositive,
                    profitNegative && styles.profitNegative,
                  ]}>
                  {formatSignedMoney(profit)}
                </ThemedText>
              )}
            </>
          ) : (
            <ThemedText style={styles.priceValue}>—</ThemedText>
          )}
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60 },
  header: { paddingHorizontal: 16, gap: 12 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e6f4fb',
  },
  refreshButtonPressed: { opacity: 0.7 },
  refreshButtonDisabled: { opacity: 0.4 },
  statsRow: { flexDirection: 'row', gap: 24, marginTop: 4 },
  stat: { gap: 2 },
  statLabel: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  statValue: { fontSize: 20 },
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
  listWrap: { flex: 1 },
  list: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 160, gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#eee',
    backgroundColor: '#fafafa',
    gap: 12,
  },
  rowPressed: { opacity: 0.7 },
  rowLeft: { flex: 1, gap: 2 },
  rowRight: { alignItems: 'flex-end', gap: 2 },
  costBasisSmall: { fontSize: 13, marginTop: 2 },
  priceValue: { fontSize: 16 },
  profit: { fontSize: 14, fontWeight: '600' },
  profitPositive: { color: '#16a34a' },
  profitNegative: { color: '#dc2626' },
  empty: { textAlign: 'center', marginTop: 48 },
  refreshOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    gap: 12,
  },
  refreshOverlayText: { fontSize: 14 },
});
