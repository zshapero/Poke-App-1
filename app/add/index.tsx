import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getMarketPrice, searchCard, type TcgCard } from '@/lib/api/pokemontcg';
import { formatMoney } from '@/lib/format';
import { setPendingCard } from '@/lib/pendingCard';

const DEBOUNCE_MS = 400;

export default function AddSearchScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TcgCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      setErrored(false);
      return;
    }
    setLoading(true);
    setErrored(false);
    let cancelled = false;
    const timeout = setTimeout(async () => {
      try {
        const cards = await searchCard(trimmed);
        if (!cancelled) setResults(cards.slice(0, 10));
      } catch {
        if (!cancelled) {
          setResults([]);
          setErrored(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query]);

  const onSelect = (card: TcgCard) => {
    setPendingCard({
      name: card.name,
      set: card.set?.name ?? '',
      photo_uri: card.images?.large ?? card.images?.small ?? null,
      tcg_card_id: card.id,
      tcg_set_id: card.set?.id ?? null,
      current_price: getMarketPrice(card),
    });
    router.push('/add/form');
  };

  const onManual = () => {
    router.push('/add/form');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}>
      <ThemedView style={styles.flex}>
        <View style={styles.headerRow}>
          <ThemedText type="title">Add item</ThemedText>
          <Pressable onPress={() => router.back()} style={styles.cancelButton}>
            <ThemedText style={styles.cancelText}>Cancel</ThemedText>
          </Pressable>
        </View>

        <View style={styles.searchWrap}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search for a Pokémon card"
            placeholderTextColor="#999"
            style={styles.search}
            autoCapitalize="words"
            autoCorrect={false}
            autoFocus
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          <Pressable onPress={onManual} style={styles.manualLink}>
            <ThemedText style={styles.manualLinkText}>Enter manually</ThemedText>
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.statusBlock}>
            <ActivityIndicator color="#0a7ea4" />
          </View>
        ) : errored ? (
          <View style={styles.statusBlock}>
            <ThemedText>Could not reach the card service.</ThemedText>
            <ThemedText style={styles.statusHint}>
              Check your connection or use “Enter manually”.
            </ThemedText>
          </View>
        ) : query.trim().length < 2 ? (
          <View style={styles.statusBlock}>
            <ThemedText>Type a card name to search.</ThemedText>
            <ThemedText style={styles.statusHint}>
              You can also enter the card manually.
            </ThemedText>
          </View>
        ) : results.length === 0 ? (
          <View style={styles.statusBlock}>
            <ThemedText>No cards match “{query}”.</ThemedText>
            <ThemedText style={styles.statusHint}>
              Try a different spelling or enter manually.
            </ThemedText>
          </View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={(c) => c.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.list}
            renderItem={({ item }) => <ResultRow card={item} onPress={() => onSelect(item)} />}
          />
        )}
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

function ResultRow({ card, onPress }: { card: TcgCard; onPress: () => void }) {
  const price = getMarketPrice(card);
  const setLabel =
    [card.set?.name, card.rarity].filter(Boolean).join(' · ') || '—';
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.resultRow, pressed && styles.resultRowPressed]}>
      <View style={styles.thumbnail}>
        {card.images?.small ? (
          <Image
            source={{ uri: card.images.small }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={150}
          />
        ) : null}
      </View>
      <View style={styles.resultMeta}>
        <ThemedText type="defaultSemiBold" numberOfLines={1}>
          {card.name}
        </ThemedText>
        <ThemedText numberOfLines={1}>{setLabel}</ThemedText>
      </View>
      <ThemedText type="defaultSemiBold">
        {price != null ? formatMoney(price) : '—'}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  cancelButton: { paddingVertical: 8, paddingHorizontal: 8 },
  cancelText: { color: '#0a7ea4', fontSize: 16, fontWeight: '500' },
  searchWrap: { paddingHorizontal: 20, paddingBottom: 12, gap: 8 },
  search: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111',
    backgroundColor: '#fff',
  },
  manualLink: { alignSelf: 'flex-start', paddingVertical: 4 },
  manualLinkText: { color: '#0a7ea4', fontSize: 14, fontWeight: '500' },
  statusBlock: {
    paddingHorizontal: 20,
    paddingTop: 24,
    alignItems: 'center',
    gap: 4,
  },
  statusHint: { fontSize: 13 },
  list: { paddingHorizontal: 20, paddingBottom: 32, gap: 8 },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#eee',
    backgroundColor: '#fafafa',
  },
  resultRowPressed: { opacity: 0.7 },
  thumbnail: {
    width: 48,
    aspectRatio: 5 / 7,
    borderRadius: 4,
    backgroundColor: '#e5e7eb',
    overflow: 'hidden',
  },
  resultMeta: { flex: 1, gap: 2 },
});
