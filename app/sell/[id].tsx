import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform as RNPlatform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import type { Item } from '@/db/schema';
import {
  daysBetween,
  formatDateForDisplay,
  formatMoney,
  sanitizeMoneyInput,
  toIsoDate,
} from '@/lib/format';
import { showToast } from '@/lib/toast';

const PLATFORMS = ['eBay', 'TCGPlayer', 'Whatnot', 'Mercari', 'Other'] as const;
type SalePlatform = (typeof PLATFORMS)[number];

export default function SellScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const router = useRouter();

  const [item, setItem] = useState<Item | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [salePrice, setSalePrice] = useState('');
  const [platform, setPlatform] = useState<SalePlatform | null>(null);
  const [platformModalOpen, setPlatformModalOpen] = useState(false);
  const [fees, setFees] = useState('0');
  const [shipping, setShipping] = useState('0');
  const [soldDate, setSoldDate] = useState<Date>(() => new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!id) return;
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
  }, [db, id]);

  const netProfit = useMemo(() => {
    const sale = parseFloat(salePrice);
    const f = parseFloat(fees);
    const s = parseFloat(shipping);
    const cost = item?.cost_basis ?? 0;
    const safeNum = (n: number) => (Number.isNaN(n) ? 0 : n);
    return safeNum(sale) - safeNum(f) - safeNum(s) - cost;
  }, [salePrice, fees, shipping, item]);

  const canSave = useMemo(() => {
    const sale = parseFloat(salePrice);
    return !!item && !Number.isNaN(sale) && sale > 0;
  }, [salePrice, item]);

  const onDateChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (RNPlatform.OS !== 'ios') setShowDatePicker(false);
    if (event.type === 'dismissed') return;
    if (selected) setSoldDate(selected);
  };

  const onSave = async () => {
    if (!canSave || !item || saving) return;
    setSaving(true);
    try {
      const heldDays = daysBetween(item.acquired_date, soldDate);
      const sale = parseFloat(salePrice);
      const feeNum = parseFloat(fees) || 0;
      const shipNum = parseFloat(shipping) || 0;

      await db.withTransactionAsync(async () => {
        await db.runAsync('UPDATE items SET status = ? WHERE id = ?', ['sold', item.id]);
        await db.runAsync(
          `INSERT INTO sales
             (item_id, sale_price, platform, fees, shipping, sold_date, net_profit, days_held)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            item.id,
            sale,
            platform,
            feeNum,
            shipNum,
            toIsoDate(soldDate),
            netProfit,
            heldDays,
          ]
        );
      });

      showToast('Item marked as sold');
      router.dismissTo('/');
    } catch (err) {
      Alert.alert('Could not save', String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={RNPlatform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}>
      <ThemedView style={styles.flex}>
        <Stack.Screen options={{ title: 'Mark as Sold' }} />
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <ThemedText type="title">Mark as Sold</ThemedText>
          {loaded && item ? (
            <ThemedText style={styles.itemSummary}>
              {item.name}
              {item.set ? ` · ${item.set}` : ''} · cost basis {formatMoney(item.cost_basis)}
            </ThemedText>
          ) : null}
          {loaded && !item ? (
            <ThemedText style={styles.error}>This item no longer exists.</ThemedText>
          ) : null}

          <Field label="Sale price" required>
            <MoneyInput
              value={salePrice}
              onChangeText={setSalePrice}
              placeholder="0.00"
              autoFocus
            />
          </Field>

          <Field label="Platform">
            <Pressable onPress={() => setPlatformModalOpen(true)} style={styles.input}>
              <ThemedText style={platform ? undefined : styles.placeholderText}>
                {platform ?? 'Select platform'}
              </ThemedText>
            </Pressable>
          </Field>

          <Field label="Fees">
            <MoneyInput value={fees} onChangeText={setFees} placeholder="0.00" />
          </Field>

          <Field label="Shipping">
            <MoneyInput value={shipping} onChangeText={setShipping} placeholder="0.00" />
          </Field>

          <Field label="Sold date">
            <Pressable onPress={() => setShowDatePicker(true)} style={styles.input}>
              <ThemedText>{formatDateForDisplay(soldDate)}</ThemedText>
            </Pressable>
            {showDatePicker && (
              <DateTimePicker
                value={soldDate}
                mode="date"
                display={RNPlatform.OS === 'ios' ? 'inline' : 'default'}
                maximumDate={new Date()}
                onChange={onDateChange}
              />
            )}
            {RNPlatform.OS === 'ios' && showDatePicker && (
              <Pressable onPress={() => setShowDatePicker(false)} style={styles.doneRow}>
                <ThemedText style={styles.doneText}>Done</ThemedText>
              </Pressable>
            )}
          </Field>

          <View style={styles.netRow}>
            <ThemedText style={styles.netLabel}>Net profit</ThemedText>
            <ThemedText
              type="title"
              style={[
                styles.netValue,
                netProfit > 0 && styles.netPositive,
                netProfit < 0 && styles.netNegative,
              ]}>
              {formatMoney(netProfit)}
            </ThemedText>
            <ThemedText style={styles.netFormula}>
              sale price − fees − shipping − cost basis
            </ThemedText>
          </View>

          <Pressable
            disabled={!canSave || saving}
            onPress={onSave}
            style={({ pressed }) => [
              styles.saveButton,
              (!canSave || saving) && styles.saveButtonDisabled,
              pressed && canSave && !saving && styles.saveButtonPressed,
            ]}>
            <ThemedText style={styles.saveButtonText}>
              {saving ? 'Saving…' : 'Save sale'}
            </ThemedText>
          </Pressable>

          <Pressable onPress={() => router.back()} style={styles.cancel}>
            <ThemedText style={styles.cancelText}>Cancel</ThemedText>
          </Pressable>
        </ScrollView>

        <Modal
          visible={platformModalOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setPlatformModalOpen(false)}>
          <Pressable style={styles.backdrop} onPress={() => setPlatformModalOpen(false)}>
            <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
              <ThemedText type="defaultSemiBold" style={styles.sheetTitle}>
                Platform
              </ThemedText>
              {PLATFORMS.map((p) => {
                const selected = p === platform;
                return (
                  <Pressable
                    key={p}
                    onPress={() => {
                      setPlatform(p);
                      setPlatformModalOpen(false);
                    }}
                    style={[styles.sheetOption, selected && styles.sheetOptionSelected]}>
                    <ThemedText style={selected ? styles.sheetOptionTextSelected : undefined}>
                      {p}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </Pressable>
          </Pressable>
        </Modal>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <ThemedView style={styles.field}>
      <ThemedText type="defaultSemiBold">
        {label}
        {required ? <ThemedText style={styles.required}> *</ThemedText> : null}
      </ThemedText>
      {children}
    </ThemedView>
  );
}

function MoneyInput({
  value,
  onChangeText,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <View style={styles.moneyRow}>
      <ThemedText style={styles.moneyPrefix}>$</ThemedText>
      <TextInput
        value={value}
        onChangeText={(t) => onChangeText(sanitizeMoneyInput(t))}
        placeholder={placeholder}
        placeholderTextColor="#999"
        keyboardType="decimal-pad"
        style={styles.moneyInput}
        autoFocus={autoFocus}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: 20, gap: 16, paddingBottom: 40 },
  itemSummary: {},
  error: { color: '#c0392b' },
  field: { gap: 6 },
  required: { color: '#c0392b' },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111',
    backgroundColor: '#fff',
    justifyContent: 'center',
    minHeight: 46,
  },
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
  placeholderText: { color: '#999' },
  doneRow: { alignItems: 'flex-end', paddingTop: 4 },
  doneText: { color: '#0a7ea4', fontWeight: '600' },
  netRow: {
    marginTop: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#f4f4f4',
    alignItems: 'center',
    gap: 4,
  },
  netLabel: { fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 },
  netValue: { fontSize: 32 },
  netPositive: { color: '#16a34a' },
  netNegative: { color: '#dc2626' },
  netFormula: { fontSize: 12, marginTop: 2 },
  saveButton: {
    marginTop: 4,
    backgroundColor: '#0a7ea4',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveButtonDisabled: { opacity: 0.4 },
  saveButtonPressed: { opacity: 0.85 },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  cancel: { alignItems: 'center', paddingVertical: 12 },
  cancelText: {},
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  sheet: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  sheetTitle: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 },
  sheetOption: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  sheetOptionSelected: { backgroundColor: '#e6f4fb' },
  sheetOptionTextSelected: { color: '#0a7ea4', fontWeight: '600' },
});
