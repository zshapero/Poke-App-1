import { Image } from 'expo-image';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import type { Item } from '@/db/schema';
import { daysHeld, formatMoney } from '@/lib/format';

export default function ItemDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const [item, setItem] = useState<Item | null>(null);
  const [loaded, setLoaded] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        if (!id) {
          setLoaded(true);
          return;
        }
        const row = await db.getFirstAsync<Item>(
          'SELECT * FROM items WHERE id = ? LIMIT 1',
          [Number(id)]
        );
        if (cancelled) return;
        setItem(row ?? null);
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

  if (!item) {
    return (
      <ThemedView style={styles.container}>
        <Stack.Screen options={{ title: 'Not found' }} />
        <ThemedText>This item no longer exists.</ThemedText>
      </ThemedView>
    );
  }

  const heldDays = daysHeld(item.acquired_date);

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: item.name }} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {item.photo_uri ? (
          <Image
            source={{ uri: item.photo_uri }}
            style={styles.photo}
            contentFit="cover"
          />
        ) : null}

        <View style={styles.headerBlock}>
          <ThemedText type="title">{item.name}</ThemedText>
          {item.source ? (
            <View style={styles.badge}>
              <ThemedText style={styles.badgeText}>{item.source}</ThemedText>
            </View>
          ) : null}
        </View>

        <FieldRow label="Set" value={item.set ?? '—'} />
        <FieldRow label="Cost basis" value={formatMoney(item.cost_basis)} />
        <FieldRow
          label="Current price"
          value={item.current_price != null ? formatMoney(item.current_price) : '—'}
        />
        <FieldRow label="Acquired" value={item.acquired_date ?? '—'} />
        <FieldRow
          label="Days held"
          value={heldDays === null ? '—' : heldDays === 1 ? '1 day' : `${heldDays} days`}
        />
        <FieldRow label="Status" value={item.status ?? '—'} />

        <View style={styles.buttons}>
          <Pressable
            onPress={() =>
              router.push({ pathname: '/add/form', params: { id: String(item.id) } })
            }
            style={({ pressed }) => [
              styles.button,
              styles.editButton,
              pressed && styles.buttonPressed,
            ]}>
            <ThemedText style={styles.editButtonText}>Edit</ThemedText>
          </Pressable>
          <Pressable
            onPress={() =>
              router.push({ pathname: '/sell/[id]', params: { id: String(item.id) } })
            }
            disabled={item.status === 'sold'}
            style={({ pressed }) => [
              styles.button,
              styles.soldButton,
              item.status === 'sold' && styles.buttonDisabled,
              pressed && item.status !== 'sold' && styles.buttonPressed,
            ]}>
            <ThemedText style={styles.soldButtonText}>
              {item.status === 'sold' ? 'Already sold' : 'Mark as Sold'}
            </ThemedText>
          </Pressable>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fieldRow}>
      <ThemedText style={styles.fieldLabel}>{label}</ThemedText>
      <ThemedText type="defaultSemiBold">{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 20, gap: 12, paddingBottom: 40 },
  photo: { width: '100%', height: 260, borderRadius: 12, backgroundColor: '#eee' },
  headerBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 4,
  },
  badge: {
    backgroundColor: '#e6f4fb',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeText: { color: '#0a7ea4', fontSize: 12, fontWeight: '600' },
  fieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  fieldLabel: {},
  buttons: { flexDirection: 'row', gap: 12, marginTop: 16 },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonPressed: { opacity: 0.85 },
  buttonDisabled: { opacity: 0.4 },
  editButton: { backgroundColor: '#0a7ea4' },
  editButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  soldButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#0a7ea4',
  },
  soldButtonText: { color: '#0a7ea4', fontSize: 16, fontWeight: '600' },
  muted: {},
});
