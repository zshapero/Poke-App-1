import { Image } from 'expo-image';
import { Link, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
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
import { getCardById, getMarketPrice, searchCard } from '@/lib/api/pokemontcg';
import { formatMoney, formatSignedMoney, sanitizeMoneyInput } from '@/lib/format';
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

const TYPE_FILTERS = ['All', 'Raw', 'Graded'] as const;
type TypeFilter = (typeof TYPE_FILTERS)[number];

const ACTIVE_QUERY = 'SELECT * FROM items WHERE status = ? ORDER BY id DESC';

type GradeBadgeStyle = { backgroundColor: string; color: string };

function gradeBadgeStyle(company: string | null | undefined): GradeBadgeStyle {
  switch (company) {
    case 'PSA':
      return { backgroundColor: '#fee2e2', color: '#b91c1c' };
    case 'CGC':
      return { backgroundColor: '#dbeafe', color: '#1e40af' };
    case 'BGS':
      return { backgroundColor: '#e5e7eb', color: '#475569' };
    case 'SGC':
      return { backgroundColor: '#dcfce7', color: '#15803d' };
    default:
      return { backgroundColor: '#f3f4f6', color: '#374151' };
  }
}

function formatGradeLabel(item: Item): string | null {
  if (item.is_graded !== 1 || !item.grading_company) return null;
  if (item.grade != null) return `${item.grading_company} ${item.grade}`;
  return item.grading_company;
}

export default function PortfolioScreen() {
  const db = useSQLiteContext();
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('All');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('All');
  const [refreshing, setRefreshing] = useState(false);

  const [priceEditorItem, setPriceEditorItem] = useState<Item | null>(null);
  const [priceEditorValue, setPriceEditorValue] = useState('');

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
      if (typeFilter === 'Raw' && item.is_graded === 1) return false;
      if (typeFilter === 'Graded' && item.is_graded !== 1) return false;
      if (q && !item.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, search, sourceFilter, typeFilter]);

  const totalInvested = useMemo(
    () => items.reduce((sum, i) => sum + (i.cost_basis ?? 0), 0),
    [items]
  );

  const onRefreshPrices = async () => {
    if (refreshing || items.length === 0) return;
    const rawItems = items.filter((i) => i.is_graded !== 1);
    if (rawItems.length === 0) {
      showToast('No raw items to refresh');
      return;
    }
    setRefreshing(true);
    let updated = 0;
    let networkErrored = false;
    for (const item of rawItems) {
      let price: number | null = null;
      try {
        if (item.tcg_card_id) {
          const card = await getCardById(item.tcg_card_id);
          if (card) price = getMarketPrice(card);
        } else if (item.name?.trim() && item.set?.trim()) {
          const cards = await searchCard(item.name, item.set);
          if (cards.length > 0) price = getMarketPrice(cards[0]);
        }
      } catch {
        networkErrored = true;
        continue;
      }
      if (price == null) continue;
      await db.runAsync('UPDATE items SET current_price = ? WHERE id = ?', [
        price,
        item.id,
      ]);
      updated++;
    }
    setRefreshing(false);
    if (networkErrored && updated === 0) {
      showToast('Could not reach price service');
    } else {
      showToast(`Updated ${updated} of ${rawItems.length} items`);
    }
    await refetchItems();
  };

  const openPriceEditor = (item: Item) => {
    setPriceEditorItem(item);
    setPriceEditorValue(item.current_price != null ? item.current_price.toFixed(2) : '');
  };

  const closePriceEditor = () => {
    setPriceEditorItem(null);
    setPriceEditorValue('');
  };

  const savePriceEditor = async () => {
    if (!priceEditorItem) return;
    const value = parseFloat(priceEditorValue);
    if (Number.isNaN(value) || value < 0) {
      showToast('Enter a valid price');
      return;
    }
    await db.runAsync('UPDATE items SET current_price = ? WHERE id = ?', [
      value,
      priceEditorItem.id,
    ]);
    closePriceEditor();
    await refetchItems();
    showToast('Price updated');
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
          renderItem={({ item }) => (
            <ItemRow item={item} onEditPrice={() => openPriceEditor(item)} />
          )}
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

      <Modal
        visible={priceEditorItem !== null}
        transparent
        animationType="fade"
        onRequestClose={closePriceEditor}>
        <Pressable style={styles.backdrop} onPress={closePriceEditor}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <ThemedText type="defaultSemiBold" style={styles.sheetTitle}>
              Update market price
            </ThemedText>
            {priceEditorItem ? (
              <ThemedText style={styles.sheetSubtitle}>{priceEditorItem.name}</ThemedText>
            ) : null}
            <View style={styles.moneyRow}>
              <ThemedText style={styles.moneyPrefix}>$</ThemedText>
              <TextInput
                value={priceEditorValue}
                onChangeText={(t) => setPriceEditorValue(sanitizeMoneyInput(t))}
                placeholder="0.00"
                placeholderTextColor="#999"
                keyboardType="decimal-pad"
                style={styles.moneyInput}
                autoFocus
              />
            </View>
            <View style={styles.sheetButtonRow}>
              <Pressable onPress={closePriceEditor} style={styles.sheetCancel}>
                <ThemedText style={styles.sheetCancelText}>Cancel</ThemedText>
              </Pressable>
              <Pressable onPress={savePriceEditor} style={styles.sheetSave}>
                <ThemedText style={styles.sheetSaveText}>Save</ThemedText>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ThemedView>
  );
}

function ItemRow({
  item,
  onEditPrice,
}: {
  item: Item;
  onEditPrice: () => void;
}) {
  const profit =
    item.current_price != null && item.cost_basis != null
      ? item.current_price - item.cost_basis
      : null;
  const profitPositive = profit != null && profit > 0;
  const profitNegative = profit != null && profit < 0;
  const gradeLabel = formatGradeLabel(item);
  const badge = gradeBadgeStyle(item.grading_company);

  return (
    <Link href={{ pathname: '/item/[id]', params: { id: String(item.id) } }} asChild>
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
        <View style={styles.thumbnail}>
          {item.photo_uri ? (
            <Image
              source={{ uri: item.photo_uri }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={150}
            />
          ) : (
            <IconSymbol name="photo" size={20} color="#9ca3af" />
          )}
        </View>
        <View style={styles.rowLeft}>
          <View style={styles.nameRow}>
            <ThemedText type="defaultSemiBold" style={styles.nameText} numberOfLines={1}>
              {item.name}
            </ThemedText>
            {gradeLabel ? (
              <View style={[styles.gradeBadge, { backgroundColor: badge.backgroundColor }]}>
                <ThemedText style={[styles.gradeBadgeText, { color: badge.color }]}>
                  {gradeLabel}
                </ThemedText>
              </View>
            ) : null}
          </View>
          {item.set ? <ThemedText style={styles.setText}>{item.set}</ThemedText> : null}
          <ThemedText style={styles.costBasisSmall}>
            Cost {formatMoney(item.cost_basis)}
          </ThemedText>
        </View>
        <View style={styles.rowRight}>
          <View style={styles.priceLine}>
            {item.current_price != null ? (
              <ThemedText type="defaultSemiBold" style={styles.priceValue}>
                {formatMoney(item.current_price)}
              </ThemedText>
            ) : (
              <ThemedText style={styles.priceValue}>—</ThemedText>
            )}
            {item.is_graded === 1 ? (
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  onEditPrice();
                }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Update market price"
                style={({ pressed }) => [
                  styles.pencilButton,
                  pressed && styles.pencilButtonPressed,
                ]}>
                <IconSymbol name="pencil" size={14} color="#0a7ea4" />
              </Pressable>
            ) : null}
          </View>
          {item.current_price != null && profit != null ? (
            <ThemedText
              style={[
                styles.profit,
                profitPositive && styles.profitPositive,
                profitNegative && styles.profitNegative,
              ]}>
              {formatSignedMoney(profit)}
            </ThemedText>
          ) : null}
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60, backgroundColor: '#f9fafb' },
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
  statLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#4b5563',
    fontWeight: '600',
  },
  statValue: { fontSize: 20, color: '#111827', fontWeight: '700' },
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
  list: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 160, gap: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    gap: 14,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  rowPressed: { opacity: 0.85 },
  thumbnail: {
    width: 64,
    aspectRatio: 5 / 7,
    borderRadius: 8,
    backgroundColor: '#e5e7eb',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLeft: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  nameText: { flexShrink: 1, color: '#111827' },
  setText: { color: '#4b5563' },
  gradeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  gradeBadgeText: { fontSize: 11, fontWeight: '700' },
  rowRight: { alignItems: 'flex-end', gap: 2 },
  priceLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pencilButton: {
    padding: 4,
    borderRadius: 4,
  },
  pencilButtonPressed: { opacity: 0.5 },
  costBasisSmall: { fontSize: 13, marginTop: 2, color: '#4b5563' },
  priceValue: { fontSize: 16, color: '#111827' },
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
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  sheet: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  sheetTitle: { fontSize: 16 },
  sheetSubtitle: { fontSize: 14 },
  moneyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    minHeight: 46,
  },
  moneyPrefix: { fontSize: 16, color: '#111', marginRight: 6 },
  moneyInput: {
    flex: 1,
    fontSize: 16,
    color: '#111',
    paddingVertical: 12,
  },
  sheetButtonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  sheetCancel: { paddingVertical: 10, paddingHorizontal: 12 },
  sheetCancelText: { fontSize: 15 },
  sheetSave: {
    backgroundColor: '#0a7ea4',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  sheetSaveText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
