import { Link, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { Dimensions, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { BarChart, PieChart } from 'react-native-gifted-charts';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import type { SaleWithItem } from '@/db/schema';
import {
  formatMoney,
  formatSignedMoney,
  formatSignedPercent,
} from '@/lib/format';

const PLATFORM_COLORS: Record<string, string> = {
  eBay: '#0a7ea4',
  TCGPlayer: '#16a34a',
  Whatnot: '#f59e0b',
  Mercari: '#dc2626',
  Other: '#8b5cf6',
};
const PLATFORM_ORDER = ['eBay', 'TCGPlayer', 'Whatnot', 'Mercari', 'Other'] as const;

const SCREEN_WIDTH = Dimensions.get('window').width;
const CHART_WIDTH = SCREEN_WIDTH - 64; // screen − screen padding (16) × 2 − card padding (16) × 2

type ItemCounts = { active: number; sold: number };

export default function DashboardScreen() {
  const db = useSQLiteContext();
  const [sales, setSales] = useState<SaleWithItem[]>([]);
  const [counts, setCounts] = useState<ItemCounts>({ active: 0, sold: 0 });

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const [salesRows, countsRow] = await Promise.all([
          db.getAllAsync<SaleWithItem>(
            `SELECT sales.*,
                    items.name AS item_name,
                    items."set" AS item_set,
                    items.cost_basis AS item_cost_basis
             FROM sales
             LEFT JOIN items ON items.id = sales.item_id
             ORDER BY sold_date DESC, sales.id DESC`
          ),
          db.getFirstAsync<ItemCounts>(
            `SELECT
               COALESCE(SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END), 0) AS active,
               COALESCE(SUM(CASE WHEN status = 'sold' THEN 1 ELSE 0 END), 0) AS sold
             FROM items`
          ),
        ]);
        if (cancelled) return;
        setSales(salesRows);
        setCounts({
          active: countsRow?.active ?? 0,
          sold: countsRow?.sold ?? 0,
        });
      })();
      return () => {
        cancelled = true;
      };
    }, [db])
  );

  const stats = useMemo(() => {
    const lifetimeProfit = sales.reduce((sum, s) => sum + (s.net_profit ?? 0), 0);

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const monthPrefix = `${yyyy}-${mm}`;
    const profitThisMonth = sales
      .filter((s) => s.sold_date?.startsWith(monthPrefix))
      .reduce((sum, s) => sum + (s.net_profit ?? 0), 0);

    const validMargins = sales
      .filter((s) => s.item_cost_basis != null && s.item_cost_basis > 0)
      .map((s) => ((s.net_profit ?? 0) / (s.item_cost_basis as number)) * 100);
    const avgMargin =
      validMargins.length === 0
        ? null
        : validMargins.reduce((sum, m) => sum + m, 0) / validMargins.length;

    const validHeld = sales
      .map((s) => s.days_held)
      .filter((d): d is number => d != null);
    const avgDaysToFlip =
      validHeld.length === 0
        ? null
        : Math.round(validHeld.reduce((sum, d) => sum + d, 0) / validHeld.length);

    return {
      lifetimeProfit,
      profitThisMonth,
      avgMargin,
      avgDaysToFlip,
      activeCount: counts.active,
      soldCount: counts.sold,
    };
  }, [sales, counts]);

  const monthlyData = useMemo(() => buildMonthlyBars(sales), [sales]);
  const platformData = useMemo(() => buildPlatformPie(sales), [sales]);
  const topPerformers = useMemo(
    () =>
      [...sales]
        .filter((s) => s.net_profit != null)
        .sort((a, b) => (b.net_profit ?? 0) - (a.net_profit ?? 0))
        .slice(0, 5),
    [sales]
  );

  const hasSales = sales.length > 0;

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <ThemedText type="title">Dashboard</ThemedText>

        <View style={styles.statsGrid}>
          <StatCard
            label="Lifetime profit"
            value={formatSignedMoney(stats.lifetimeProfit)}
            tone={
              stats.lifetimeProfit > 0
                ? 'positive'
                : stats.lifetimeProfit < 0
                  ? 'negative'
                  : 'neutral'
            }
          />
          <StatCard
            label="Profit this month"
            value={formatSignedMoney(stats.profitThisMonth)}
            tone={
              stats.profitThisMonth > 0
                ? 'positive'
                : stats.profitThisMonth < 0
                  ? 'negative'
                  : 'neutral'
            }
          />
          <StatCard
            label="Avg margin"
            value={formatSignedPercent(stats.avgMargin)}
            tone={
              stats.avgMargin == null
                ? 'neutral'
                : stats.avgMargin > 0
                  ? 'positive'
                  : stats.avgMargin < 0
                    ? 'negative'
                    : 'neutral'
            }
          />
          <StatCard
            label="Avg days to flip"
            value={stats.avgDaysToFlip === null ? '—' : `${stats.avgDaysToFlip}`}
            tone="neutral"
          />
          <StatCard label="Active items" value={`${stats.activeCount}`} tone="neutral" />
          <StatCard label="Sold items" value={`${stats.soldCount}`} tone="neutral" />
        </View>

        {!hasSales ? (
          <View style={styles.emptyCard}>
            <ThemedText type="defaultSemiBold" style={styles.emptyTitle}>
              No sales yet
            </ThemedText>
            <ThemedText style={styles.emptyText}>
              Mark an item as sold to start seeing charts and top performers.
            </ThemedText>
          </View>
        ) : (
          <>
            <ChartCard title="Profit by month (last 6)">
              <BarChart
                data={monthlyData}
                width={CHART_WIDTH}
                height={180}
                barWidth={28}
                spacing={14}
                initialSpacing={12}
                noOfSections={4}
                yAxisThickness={0}
                xAxisThickness={0.5}
                xAxisColor="#ddd"
                yAxisTextStyle={chartAxisTextStyle}
                xAxisLabelTextStyle={chartAxisTextStyle}
                hideRules
              />
            </ChartCard>

            <ChartCard title="Profit by platform">
              {platformData.length === 0 ? (
                <ThemedText style={styles.muted}>
                  No platform has positive profit yet.
                </ThemedText>
              ) : (
                <View style={styles.pieRow}>
                  <PieChart
                    data={platformData}
                    radius={80}
                    innerRadius={45}
                    donut
                    centerLabelComponent={() => (
                      <View style={styles.pieCenter}>
                        <ThemedText style={styles.pieCenterLabel}>Total</ThemedText>
                        <ThemedText type="defaultSemiBold" style={styles.pieCenterValue}>
                          {formatMoney(
                            platformData.reduce((sum, d) => sum + d.value, 0)
                          )}
                        </ThemedText>
                      </View>
                    )}
                  />
                  <View style={styles.legend}>
                    {platformData.map((slice) => (
                      <View key={slice.text} style={styles.legendItem}>
                        <View
                          style={[styles.legendSwatch, { backgroundColor: slice.color }]}
                        />
                        <ThemedText style={styles.legendName}>{slice.text}</ThemedText>
                        <ThemedText style={styles.legendValue}>
                          {formatMoney(slice.value)}
                        </ThemedText>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </ChartCard>

            <View style={styles.card}>
              <ThemedText style={styles.cardTitle}>Top performers</ThemedText>
              {topPerformers.map((sale, idx) => (
                <Link
                  key={sale.id}
                  href={{ pathname: '/sale/[id]', params: { id: String(sale.id) } }}
                  asChild>
                  <Pressable
                    style={({ pressed }) => [
                      styles.topRow,
                      pressed && styles.topRowPressed,
                    ]}>
                    <ThemedText style={styles.topRank}>{idx + 1}</ThemedText>
                    <View style={styles.topName}>
                      <ThemedText type="defaultSemiBold" numberOfLines={1}>
                        {sale.item_name ?? `Item #${sale.item_id}`}
                      </ThemedText>
                      {sale.item_set ? (
                        <ThemedText style={styles.muted} numberOfLines={1}>
                          {sale.item_set}
                        </ThemedText>
                      ) : null}
                    </View>
                    <ThemedText
                      style={[
                        styles.topProfit,
                        (sale.net_profit ?? 0) > 0 && styles.profitPositive,
                        (sale.net_profit ?? 0) < 0 && styles.profitNegative,
                      ]}>
                      {formatSignedMoney(sale.net_profit)}
                    </ThemedText>
                  </Pressable>
                </Link>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </ThemedView>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'positive' | 'negative' | 'neutral';
}) {
  return (
    <View style={styles.statCardWrap}>
      <View style={styles.statCardInner}>
        <ThemedText style={styles.statLabel}>{label}</ThemedText>
        <ThemedText
          type="defaultSemiBold"
          style={[
            styles.statValue,
            tone === 'positive' && styles.profitPositive,
            tone === 'negative' && styles.profitNegative,
          ]}>
          {value}
        </ThemedText>
      </View>
    </View>
  );
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <ThemedText style={styles.cardTitle}>{title}</ThemedText>
      {children}
    </View>
  );
}

type BarDatum = { value: number; label: string; frontColor: string };

function buildMonthlyBars(sales: SaleWithItem[]): BarDatum[] {
  const buckets: { key: string; label: string; profit: number }[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    buckets.push({
      key: `${yyyy}-${mm}`,
      label: d.toLocaleDateString(undefined, { month: 'short' }),
      profit: 0,
    });
  }
  const byKey = new Map(buckets.map((b) => [b.key, b]));

  for (const sale of sales) {
    if (!sale.sold_date) continue;
    const monthKey = sale.sold_date.slice(0, 7);
    const bucket = byKey.get(monthKey);
    if (bucket) bucket.profit += sale.net_profit ?? 0;
  }

  return buckets.map((b) => ({
    value: Math.round(b.profit * 100) / 100,
    label: b.label,
    frontColor: b.profit < 0 ? '#dc2626' : '#0a7ea4',
  }));
}

type PieDatum = { value: number; color: string; text: string };

function buildPlatformPie(sales: SaleWithItem[]): PieDatum[] {
  const totals = new Map<string, number>();
  for (const sale of sales) {
    const platform = sale.platform;
    if (!platform || !(platform in PLATFORM_COLORS)) continue;
    totals.set(platform, (totals.get(platform) ?? 0) + (sale.net_profit ?? 0));
  }

  return PLATFORM_ORDER.flatMap((p) => {
    const total = totals.get(p);
    if (total == null || total <= 0) return [];
    return [
      {
        value: Math.round(total * 100) / 100,
        color: PLATFORM_COLORS[p],
        text: p,
      },
    ];
  });
}

const chartAxisTextStyle = { color: '#111', fontSize: 11 };

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 60, paddingBottom: 160, gap: 16 },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  statCardWrap: {
    width: '50%',
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  statCardInner: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#eee',
    backgroundColor: '#fafafa',
    gap: 4,
    minHeight: 80,
    justifyContent: 'space-between',
  },
  statLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statValue: { fontSize: 22 },
  profitPositive: { color: '#16a34a' },
  profitNegative: { color: '#dc2626' },
  card: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#eee',
    backgroundColor: '#fafafa',
    gap: 8,
  },
  cardTitle: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  emptyCard: {
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#eee',
    backgroundColor: '#fafafa',
    alignItems: 'center',
    gap: 6,
  },
  emptyTitle: { fontSize: 16 },
  emptyText: { textAlign: 'center' },
  pieRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 4,
  },
  pieCenter: { alignItems: 'center', gap: 2 },
  pieCenterLabel: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  pieCenterValue: { fontSize: 14 },
  legend: { flex: 1, gap: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendSwatch: { width: 12, height: 12, borderRadius: 3 },
  legendName: { flex: 1 },
  legendValue: { fontSize: 13 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 12,
  },
  topRowPressed: { opacity: 0.6 },
  topRank: {
    width: 24,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
  },
  topName: { flex: 1, gap: 2 },
  topProfit: { fontSize: 16, fontWeight: '600' },
  muted: {},
});
