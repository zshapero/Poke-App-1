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
import type { Item } from '@/db/schema';
import { daysHeld, formatMoney } from '@/lib/format';

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

export default function PortfolioScreen() {
  const db = useSQLiteContext();
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('All');

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const rows = await db.getAllAsync<Item>(
          'SELECT * FROM items WHERE status = ? ORDER BY id DESC',
          ['active']
        );
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

  return (
    <ThemedView style={styles.container}>
      <View style={styles.header}>
        <ThemedText type="title">Portfolio</ThemedText>
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
                <ThemedText
                  style={active ? styles.chipTextActive : styles.chipText}>
                  {s}
                </ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

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
    </ThemedView>
  );
}

function ItemRow({ item }: { item: Item }) {
  const heldDays = daysHeld(item.acquired_date);
  return (
    <Link href={{ pathname: '/item/[id]', params: { id: String(item.id) } }} asChild>
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
        <View style={styles.rowMain}>
          <ThemedText type="defaultSemiBold">{item.name}</ThemedText>
          {item.set ? <ThemedText style={styles.muted}>{item.set}</ThemedText> : null}
          <View style={styles.rowMeta}>
            <ThemedText>{formatMoney(item.cost_basis)}</ThemedText>
            {heldDays !== null && (
              <ThemedText style={styles.muted}>
                {' '}· {heldDays === 1 ? '1 day held' : `${heldDays} days held`}
              </ThemedText>
            )}
          </View>
        </View>
        {item.source ? (
          <View style={styles.badge}>
            <ThemedText style={styles.badgeText}>{item.source}</ThemedText>
          </View>
        ) : null}
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60 },
  header: { paddingHorizontal: 16, gap: 12 },
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
  list: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 160, gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#eee',
    backgroundColor: '#fafafa',
    gap: 12,
  },
  rowPressed: { opacity: 0.7 },
  rowMain: { flex: 1, gap: 4 },
  rowMeta: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' },
  muted: {},
  badge: {
    backgroundColor: '#e6f4fb',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  badgeText: { color: '#0a7ea4', fontSize: 12, fontWeight: '600' },
  empty: { textAlign: 'center', marginTop: 48 },
});
