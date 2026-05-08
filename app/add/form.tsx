import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import type { GradingCompany, Item } from '@/db/schema';
import {
  formatDateForDisplay,
  sanitizeMoneyInput,
  toIsoDate,
} from '@/lib/format';
import { consumePendingCard, type PendingCardPrefill } from '@/lib/pendingCard';
import { showToast } from '@/lib/toast';

const SOURCES = ['Box Pull', 'Single Buy', 'Bulk', 'Estate Sale', 'Trade', 'Other'] as const;
type Source = (typeof SOURCES)[number];

const GRADING_COMPANIES: readonly GradingCompany[] = [
  'PSA',
  'CGC',
  'BGS',
  'SGC',
  'ACE',
  'Other',
] as const;

function isHalfStep(value: number): boolean {
  return Math.abs(value * 2 - Math.round(value * 2)) < 1e-9;
}

export default function AddItemFormScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { id: idParam } = useLocalSearchParams<{ id?: string }>();
  const editingId = idParam ? Number(idParam) : null;
  const isEdit = editingId !== null && !Number.isNaN(editingId);

  const prefill = useMemo<PendingCardPrefill | null>(
    () => (isEdit ? null : consumePendingCard()),
    [isEdit]
  );

  const [name, setName] = useState(prefill?.name ?? '');
  const [setName_, setSetName] = useState(prefill?.set ?? '');
  const [costBasis, setCostBasis] = useState('');
  const [acquiredDate, setAcquiredDate] = useState<Date>(() => new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [source, setSource] = useState<Source | null>(null);
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(prefill?.photo_uri ?? null);
  const [tcgCardId, setTcgCardId] = useState<string | null>(prefill?.tcg_card_id ?? null);
  const [tcgSetId, setTcgSetId] = useState<string | null>(prefill?.tcg_set_id ?? null);
  const [autoPrice, setAutoPrice] = useState<number | null>(prefill?.current_price ?? null);

  const [isGraded, setIsGraded] = useState(false);
  const [gradingCompany, setGradingCompany] = useState<GradingCompany | null>(null);
  const [gradingModalOpen, setGradingModalOpen] = useState(false);
  const [grade, setGrade] = useState('');
  const [manualPrice, setManualPrice] = useState('');

  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(!isEdit);

  useEffect(() => {
    if (!isEdit || editingId === null) return;
    let cancelled = false;
    (async () => {
      const row = await db.getFirstAsync<Item>(
        'SELECT * FROM items WHERE id = ? LIMIT 1',
        [editingId]
      );
      if (cancelled || !row) {
        if (!cancelled) setHydrated(true);
        return;
      }
      setName(row.name);
      setSetName(row.set ?? '');
      setCostBasis(row.cost_basis != null ? row.cost_basis.toFixed(2) : '');
      if (row.acquired_date) {
        const parsed = new Date(`${row.acquired_date}T00:00:00`);
        if (!Number.isNaN(parsed.getTime())) setAcquiredDate(parsed);
      }
      if (row.source && (SOURCES as readonly string[]).includes(row.source)) {
        setSource(row.source as Source);
      }
      setPhotoUri(row.photo_uri);
      setTcgCardId(row.tcg_card_id);
      setTcgSetId(row.tcg_set_id);
      if (row.is_graded === 1) {
        setIsGraded(true);
        if (
          row.grading_company &&
          (GRADING_COMPANIES as readonly string[]).includes(row.grading_company)
        ) {
          setGradingCompany(row.grading_company as GradingCompany);
        }
        setGrade(row.grade != null ? String(row.grade) : '');
        setManualPrice(row.current_price != null ? row.current_price.toFixed(2) : '');
      } else {
        setAutoPrice(row.current_price);
      }
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [db, editingId, isEdit]);

  const canSave = useMemo(() => {
    const cost = parseFloat(costBasis);
    if (
      name.trim().length === 0 ||
      setName_.trim().length === 0 ||
      costBasis.length === 0 ||
      Number.isNaN(cost) ||
      cost < 0
    ) {
      return false;
    }
    if (isGraded) {
      if (!gradingCompany) return false;
      const g = parseFloat(grade);
      if (Number.isNaN(g) || g < 1 || g > 10 || !isHalfStep(g)) return false;
      const p = parseFloat(manualPrice);
      if (Number.isNaN(p) || p < 0) return false;
    }
    return true;
  }, [name, setName_, costBasis, isGraded, gradingCompany, grade, manualPrice]);

  const onDateChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS !== 'ios') setShowDatePicker(false);
    if (event.type === 'dismissed') return;
    if (selected) setAcquiredDate(selected);
  };

  const launchCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        'Camera permission needed',
        'Please allow camera access in Settings to take a photo.'
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const launchLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
    }
  };

  const onAttachPhoto = () => {
    Alert.alert('Add photo', 'Choose where to get the photo from.', [
      { text: 'Take Photo', onPress: launchCamera },
      { text: 'Choose from Library', onPress: launchLibrary },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const onSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      const cost = parseFloat(costBasis);
      const finalPrice = isGraded ? parseFloat(manualPrice) : autoPrice;
      const finalGradingCompany = isGraded ? gradingCompany : null;
      const finalGrade = isGraded ? parseFloat(grade) : null;

      if (isEdit && editingId !== null) {
        await db.runAsync(
          `UPDATE items
             SET name = ?, "set" = ?, cost_basis = ?, acquired_date = ?, source = ?,
                 photo_uri = ?, current_price = ?, tcg_card_id = ?, tcg_set_id = ?,
                 is_graded = ?, grading_company = ?, grade = ?
           WHERE id = ?`,
          [
            name.trim(),
            setName_.trim(),
            cost,
            toIsoDate(acquiredDate),
            source,
            photoUri,
            finalPrice,
            tcgCardId,
            tcgSetId,
            isGraded ? 1 : 0,
            finalGradingCompany,
            finalGrade,
            editingId,
          ]
        );
        showToast('Item updated');
        router.back();
      } else {
        await db.runAsync(
          `INSERT INTO items
             (name, "set", cost_basis, acquired_date, source, photo_uri, status,
              current_price, tcg_card_id, tcg_set_id, is_graded, grading_company, grade)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            name.trim(),
            setName_.trim(),
            cost,
            toIsoDate(acquiredDate),
            source,
            photoUri,
            'active',
            finalPrice,
            tcgCardId,
            tcgSetId,
            isGraded ? 1 : 0,
            finalGradingCompany,
            finalGrade,
          ]
        );
        showToast('Item saved');
        router.dismissTo('/');
      }
    } catch (err) {
      Alert.alert('Could not save', String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}>
      <ThemedView style={styles.flex}>
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.headerButton}>
            <ThemedText style={styles.headerButtonText}>Back</ThemedText>
          </Pressable>
          <ThemedText type="defaultSemiBold">
            {isEdit ? 'Edit item' : 'Confirm'}
          </ThemedText>
          <View style={styles.headerButton} />
        </View>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <ThemedText type="title">{isEdit ? 'Edit item' : 'Add item'}</ThemedText>
          {isEdit && !hydrated ? (
            <ThemedText style={styles.placeholderText}>Loading…</ThemedText>
          ) : null}

          <Field label="Name" required>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Charizard"
              placeholderTextColor="#999"
              style={styles.input}
              autoCapitalize="words"
              autoCorrect={false}
            />
          </Field>

          <Field label="Set" required>
            <TextInput
              value={setName_}
              onChangeText={setSetName}
              placeholder="Base Set"
              placeholderTextColor="#999"
              style={styles.input}
              autoCapitalize="words"
              autoCorrect={false}
            />
          </Field>

          <Field label="Cost basis" required>
            <View style={styles.moneyRow}>
              <ThemedText style={styles.moneyPrefix}>$</ThemedText>
              <TextInput
                value={costBasis}
                onChangeText={(t) => setCostBasis(sanitizeMoneyInput(t))}
                placeholder="0.00"
                placeholderTextColor="#999"
                keyboardType="decimal-pad"
                style={styles.moneyInput}
              />
            </View>
          </Field>

          <Field label="Acquired date">
            <Pressable onPress={() => setShowDatePicker(true)} style={styles.input}>
              <ThemedText>{formatDateForDisplay(acquiredDate)}</ThemedText>
            </Pressable>
            {showDatePicker && (
              <DateTimePicker
                value={acquiredDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                maximumDate={new Date()}
                onChange={onDateChange}
              />
            )}
            {Platform.OS === 'ios' && showDatePicker && (
              <Pressable onPress={() => setShowDatePicker(false)} style={styles.doneRow}>
                <ThemedText style={styles.doneText}>Done</ThemedText>
              </Pressable>
            )}
          </Field>

          <Field label="Source">
            <Pressable onPress={() => setSourceModalOpen(true)} style={styles.input}>
              <ThemedText style={source ? undefined : styles.placeholderText}>
                {source ?? 'Select source'}
              </ThemedText>
            </Pressable>
          </Field>

          <Field label="Photo">
            {photoUri ? (
              <View style={styles.photoBlock}>
                <Image source={{ uri: photoUri }} style={styles.photo} contentFit="cover" />
                <Pressable onPress={() => setPhotoUri(null)} style={styles.removePhoto}>
                  <ThemedText style={styles.removePhotoText}>Remove photo</ThemedText>
                </Pressable>
              </View>
            ) : (
              <Pressable onPress={onAttachPhoto} style={[styles.input, styles.photoButton]}>
                <ThemedText style={styles.placeholderText}>+ Add photo</ThemedText>
              </Pressable>
            )}
          </Field>

          <View style={styles.gradedToggleRow}>
            <ThemedText type="defaultSemiBold">Is this card graded?</ThemedText>
            <Switch value={isGraded} onValueChange={setIsGraded} />
          </View>

          {isGraded ? (
            <>
              <Field label="Grading company" required>
                <Pressable
                  onPress={() => setGradingModalOpen(true)}
                  style={styles.input}>
                  <ThemedText
                    style={gradingCompany ? undefined : styles.placeholderText}>
                    {gradingCompany ?? 'Select company'}
                  </ThemedText>
                </Pressable>
              </Field>

              <Field label="Grade (1–10, in 0.5 steps)" required>
                <TextInput
                  value={grade}
                  onChangeText={(t) => setGrade(sanitizeMoneyInput(t))}
                  placeholder="10"
                  placeholderTextColor="#999"
                  keyboardType="decimal-pad"
                  style={styles.input}
                />
              </Field>

              <Field label="Current market price" required>
                <View style={styles.moneyRow}>
                  <ThemedText style={styles.moneyPrefix}>$</ThemedText>
                  <TextInput
                    value={manualPrice}
                    onChangeText={(t) => setManualPrice(sanitizeMoneyInput(t))}
                    placeholder="0.00"
                    placeholderTextColor="#999"
                    keyboardType="decimal-pad"
                    style={styles.moneyInput}
                  />
                </View>
                <ThemedText style={styles.helperText}>
                  Check PriceCharting for current value. Graded card auto-pricing coming soon.
                </ThemedText>
              </Field>
            </>
          ) : null}

          <Pressable
            disabled={!canSave || saving}
            onPress={onSave}
            style={({ pressed }) => [
              styles.saveButton,
              (!canSave || saving) && styles.saveButtonDisabled,
              pressed && canSave && !saving && styles.saveButtonPressed,
            ]}>
            <ThemedText style={styles.saveButtonText}>
              {saving ? 'Saving…' : isEdit ? 'Update' : 'Save'}
            </ThemedText>
          </Pressable>

          <Pressable onPress={() => router.back()} style={styles.cancel}>
            <ThemedText style={styles.cancelText}>Cancel</ThemedText>
          </Pressable>
        </ScrollView>

        <Modal
          visible={sourceModalOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setSourceModalOpen(false)}>
          <Pressable style={styles.backdrop} onPress={() => setSourceModalOpen(false)}>
            <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
              <ThemedText type="defaultSemiBold" style={styles.sheetTitle}>
                Source
              </ThemedText>
              {SOURCES.map((s) => {
                const selected = s === source;
                return (
                  <Pressable
                    key={s}
                    onPress={() => {
                      setSource(s);
                      setSourceModalOpen(false);
                    }}
                    style={[styles.sheetOption, selected && styles.sheetOptionSelected]}>
                    <ThemedText style={selected ? styles.sheetOptionTextSelected : undefined}>
                      {s}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </Pressable>
          </Pressable>
        </Modal>

        <Modal
          visible={gradingModalOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setGradingModalOpen(false)}>
          <Pressable style={styles.backdrop} onPress={() => setGradingModalOpen(false)}>
            <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
              <ThemedText type="defaultSemiBold" style={styles.sheetTitle}>
                Grading company
              </ThemedText>
              {GRADING_COMPANIES.map((c) => {
                const selected = c === gradingCompany;
                return (
                  <Pressable
                    key={c}
                    onPress={() => {
                      setGradingCompany(c);
                      setGradingModalOpen(false);
                    }}
                    style={[styles.sheetOption, selected && styles.sheetOptionSelected]}>
                    <ThemedText style={selected ? styles.sheetOptionTextSelected : undefined}>
                      {c}
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

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerButton: { minWidth: 60, paddingVertical: 4 },
  headerButtonText: { color: '#0a7ea4', fontSize: 16, fontWeight: '500' },
  container: { padding: 20, gap: 16, paddingBottom: 40 },
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
  photoBlock: { gap: 8, alignItems: 'center' },
  photo: {
    width: 200,
    aspectRatio: 5 / 7,
    borderRadius: 8,
    backgroundColor: '#e5e7eb',
  },
  photoButton: { alignItems: 'center' },
  removePhoto: { alignItems: 'center', paddingVertical: 8 },
  removePhotoText: { color: '#c0392b' },
  gradedToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  helperText: { fontSize: 13, color: '#555', marginTop: 4 },
  saveButton: {
    marginTop: 8,
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
