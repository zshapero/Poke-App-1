import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

export default function AddItemScreen() {
  const db = useSQLiteContext();
  const router = useRouter();

  const [name, setName] = useState('');
  const [setName_, setSetName] = useState('');
  const [costBasis, setCostBasis] = useState('');
  const [acquiredDate, setAcquiredDate] = useState('');
  const [source, setSource] = useState('');
  const [saving, setSaving] = useState(false);

  const onSave = async () => {
    if (!name.trim()) {
      Alert.alert('Name required', 'Please enter a name for this item.');
      return;
    }
    setSaving(true);
    try {
      await db.runAsync(
        `INSERT INTO items (name, "set", cost_basis, acquired_date, source, photo_uri, status, current_price)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          name.trim(),
          setName_.trim() || null,
          costBasis ? Number(costBasis) : null,
          acquiredDate.trim() || null,
          source.trim() || null,
          null,
          'holding',
          null,
        ]
      );
      router.back();
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
        <ScrollView contentContainerStyle={styles.container}>
          <ThemedText type="title">Add item</ThemedText>

          <Field label="Name" value={name} onChangeText={setName} placeholder="Charizard" />
          <Field label="Set" value={setName_} onChangeText={setSetName} placeholder="Base Set" />
          <Field
            label="Cost basis ($)"
            value={costBasis}
            onChangeText={setCostBasis}
            placeholder="0.00"
            keyboardType="decimal-pad"
          />
          <Field
            label="Acquired date"
            value={acquiredDate}
            onChangeText={setAcquiredDate}
            placeholder="YYYY-MM-DD"
          />
          <Field label="Source" value={source} onChangeText={setSource} placeholder="eBay" />

          <Pressable
            disabled={saving}
            onPress={onSave}
            style={({ pressed }) => [
              styles.button,
              (pressed || saving) && styles.buttonPressed,
            ]}>
            <ThemedText style={styles.buttonText}>
              {saving ? 'Saving…' : 'Save'}
            </ThemedText>
          </Pressable>

          <Pressable onPress={() => router.back()} style={styles.cancel}>
            <ThemedText style={styles.cancelText}>Cancel</ThemedText>
          </Pressable>
        </ScrollView>
      </ThemedView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  ...props
}: {
  label: string;
} & React.ComponentProps<typeof TextInput>) {
  return (
    <ThemedView style={styles.field}>
      <ThemedText type="defaultSemiBold">{label}</ThemedText>
      <TextInput
        {...props}
        style={styles.input}
        placeholderTextColor="#999"
        autoCapitalize="none"
        autoCorrect={false}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: 20, gap: 16 },
  field: { gap: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: '#111',
    backgroundColor: '#fff',
  },
  button: {
    marginTop: 8,
    backgroundColor: '#0a7ea4',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonPressed: { opacity: 0.85 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  cancel: { alignItems: 'center', paddingVertical: 12 },
  cancelText: { opacity: 0.7 },
});
