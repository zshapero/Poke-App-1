import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import type { Item } from '@/db/schema';

export default function PortfolioScreen() {
  const db = useSQLiteContext();
  const [items, setItems] = useState<Item[]>([]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const rows = await db.getAllAsync<Item>(
          'SELECT * FROM items WHERE status = ? OR status IS NULL ORDER BY id DESC',
          ['holding']
        );
        if (!cancelled) setItems(rows);
      })();
      return () => {
        cancelled = true;
      };
    }, [db])
  );

  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.heading}>
        Portfolio
      </ThemedText>
      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <ThemedText style={styles.empty}>
            No items yet. Tap the + button to add your first one.
          </ThemedText>
        }
        renderItem={({ item }) => (
          <ThemedView style={styles.row}>
            <ThemedText type="defaultSemiBold">{item.name}</ThemedText>
            {item.set ? <ThemedText>{item.set}</ThemedText> : null}
            {item.cost_basis != null ? (
              <ThemedText>Cost basis: ${item.cost_basis.toFixed(2)}</ThemedText>
            ) : null}
          </ThemedView>
        )}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60, paddingHorizontal: 16 },
  heading: { marginBottom: 16 },
  list: { paddingBottom: 160, gap: 12 },
  empty: { textAlign: 'center', marginTop: 48, opacity: 0.6 },
  row: { padding: 12, borderRadius: 8, gap: 4 },
});
