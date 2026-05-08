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
  Text,
  TextInput,
  View,
} from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import type { Item } from '@/db/schema';
import { getCardById, getMarketPrice, searchCard } from '@/lib/api/pokemontcg';
import {
  daysHeld,
  formatMoney,
  formatSignedMoney,
  sanitizeMoneyInput,
} from '@/lib/format';
import { showToast } from '@/lib/toast';

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
      return { backgroundColor: 'rgba(239,68,68,0.18)', color: '#fca5a5' };
    case 'CGC':
      return { backgroundColor: 'rgba(59,130,246,0.18)', color: '#93c5fd' };
    case 'BGS':
      return { backgroundColor: 'rgba(148,163,184,0.18)', color: '#cbd5e1' };
    case 'SGC':
      return { backgroundColor: 'rgba(34,197,94,0.18)', color: '#86efac' };
    default:
      return { backgroundColor: 'rgba(148,163,184,0.18)', color: '#cbd5e1' };
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

  const filtersActive =
    sourceFilter !== 'All' || typeFilter !== 'All' || search.trim().length > 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Portfolio</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh prices"
            onPress={onRefreshPrices}
            disabled={refreshing || items.length === 0}
            style={({ pressed }) => [
              styles.iconButton,
              (refreshing || items.length === 0) && styles.iconButtonDisabled,
              pressed && styles.iconButtonPressed,
            ]}>
            {refreshing ? (
              <ActivityIndicator size="small" color={C.accent} />
            ) : (
              <IconSymbol name="arrow.clockwise" size={20} color={C.accent} />
            )}
          </Pressable>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Invested</Text>
            <Text style={styles.statValue}>{formatMoney(totalInvested)}</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Active items</Text>
            <Text style={styles.statValue}>{items.length}</Text>
          </View>
        </View>

        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name…"
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
        {SOURCE_FILTERS.map((s) => {
          const active = s === sourceFilter;
          return (
            <Pressable
              key={s}
              onPress={() => setSourceFilter(s)}
              style={[styles.chip, active && styles.chipActive]}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{s}</Text>
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
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{t}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.listWrap}>
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <IconSymbol name="briefcase.fill" size={36} color={C.muted} />
              </View>
              <Text style={styles.emptyText}>
                {items.length === 0
                  ? 'No cards yet — tap + to add one'
                  : filtersActive
                    ? 'No items match your filters'
                    : 'No cards yet — tap + to add one'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <ItemCard item={item} onEditPrice={() => openPriceEditor(item)} />
          )}
        />
        {refreshing && (
          <View style={styles.refreshOverlay}>
            <ActivityIndicator size="large" color={C.accent} />
            <Text style={styles.refreshOverlayText}>Refreshing prices…</Text>
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
            <Text style={styles.sheetTitle}>Update market price</Text>
            {priceEditorItem ? (
              <Text style={styles.sheetSubtitle}>{priceEditorItem.name}</Text>
            ) : null}
            <View style={styles.moneyRow}>
              <Text style={styles.moneyPrefix}>$</Text>
              <TextInput
                value={priceEditorValue}
                onChangeText={(t) => setPriceEditorValue(sanitizeMoneyInput(t))}
                placeholder="0.00"
                placeholderTextColor={C.muted}
                keyboardType="decimal-pad"
                style={styles.moneyInput}
                autoFocus
              />
            </View>
            <View style={styles.sheetButtonRow}>
              <Pressable onPress={closePriceEditor} style={styles.sheetCancel}>
                <Text style={styles.sheetCancelText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={savePriceEditor} style={styles.sheetSave}>
                <Text style={styles.sheetSaveText}>Save</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function ItemCard({
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
  const held = daysHeld(item.acquired_date);

  return (
    <Link href={{ pathname: '/item/[id]', params: { id: String(item.id) } }} asChild>
      <Pressable
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
        <View style={styles.thumb}>
          {item.photo_uri ? (
            <Image
              source={{ uri: item.photo_uri }}
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
              {item.name}
            </Text>
            {gradeLabel ? (
              <View style={[styles.gradeBadge, { backgroundColor: badge.backgroundColor }]}>
                <Text style={[styles.gradeBadgeText, { color: badge.color }]}>
                  {gradeLabel}
                </Text>
              </View>
            ) : null}
          </View>
          {item.set ? (
            <Text style={styles.setText} numberOfLines={1}>
              {item.set}
            </Text>
          ) : null}
          <View style={styles.metaRow}>
            {item.source ? (
              <View style={styles.sourceChip}>
                <Text style={styles.sourceChipText}>{item.source}</Text>
              </View>
            ) : null}
            {held !== null ? (
              <Text style={styles.metaText}>
                {item.source ? '· ' : ''}
                {held === 1 ? '1 day' : `${held} days`}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.right}>
          <Text style={styles.costLabel}>Cost {formatMoney(item.cost_basis)}</Text>
          <View style={styles.priceRow}>
            <Text style={styles.priceText}>
              Now {item.current_price != null ? formatMoney(item.current_price) : '—'}
            </Text>
            {item.is_graded === 1 ? (
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  onEditPrice();
                }}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.pencilButton,
                  pressed && styles.pencilPressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel="Update market price">
                <IconSymbol name="pencil" size={13} color={C.secondary} />
              </Pressable>
            ) : null}
          </View>
          {profit !== null ? (
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
          ) : null}
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60, backgroundColor: C.scaffold },

  // Header
  header: { paddingHorizontal: 16, gap: 12 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { fontSize: 32, fontWeight: '700', color: C.primary },

  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.surfaceBorder,
  },
  iconButtonPressed: { opacity: 0.6 },
  iconButtonDisabled: { opacity: 0.4 },

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
    fontSize: 12,
    color: C.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '600',
  },
  statValue: { fontSize: 24, fontWeight: '700', color: C.primary },

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
  chipActive: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  chipText: { color: C.primary, fontSize: 13, fontWeight: '500' },
  chipTextActive: { color: '#ffffff', fontSize: 13, fontWeight: '600' },

  // List + cards
  listWrap: { flex: 1 },
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
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  sourceChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  sourceChipText: { fontSize: 11, color: C.secondary, fontWeight: '500' },
  metaText: { fontSize: 12, color: C.muted },

  gradeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  gradeBadgeText: { fontSize: 11, fontWeight: '700' },

  right: { alignItems: 'flex-end', gap: 4, marginLeft: 12 },
  costLabel: { fontSize: 13, color: C.secondary },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  priceText: { fontSize: 15, fontWeight: '600', color: C.primary },
  pencilButton: {
    padding: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  pencilPressed: { opacity: 0.5 },

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

  // Empty + overlay
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

  refreshOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    gap: 12,
  },
  refreshOverlayText: { color: C.primary, fontSize: 14 },

  // Manual price modal
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  sheet: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 18,
    gap: 12,
    borderWidth: 1,
    borderColor: C.surfaceBorder,
  },
  sheetTitle: { color: C.primary, fontSize: 16, fontWeight: '600' },
  sheetSubtitle: { color: C.secondary, fontSize: 14 },
  moneyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.surfaceBorder,
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(0,0,0,0.3)',
    minHeight: 46,
  },
  moneyPrefix: { fontSize: 16, color: C.primary, marginRight: 6 },
  moneyInput: { flex: 1, fontSize: 16, color: C.primary, paddingVertical: 12 },
  sheetButtonRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  sheetCancel: { paddingVertical: 10, paddingHorizontal: 12 },
  sheetCancelText: { color: C.secondary, fontSize: 15 },
  sheetSave: {
    backgroundColor: C.accent,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  sheetSaveText: { color: '#ffffff', fontSize: 15, fontWeight: '600' },
});
