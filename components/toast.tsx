import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { setToastListener } from '@/lib/toast';

const VISIBLE_MS = 1800;
const FADE_IN_MS = 180;
const FADE_OUT_MS = 240;

export function ToastHost() {
  const [message, setMessage] = useState<string | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();

  useEffect(() => {
    setToastListener((m) => {
      setMessage(m);
      opacity.setValue(0);
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: FADE_IN_MS,
          useNativeDriver: true,
        }),
        Animated.delay(VISIBLE_MS),
        Animated.timing(opacity, {
          toValue: 0,
          duration: FADE_OUT_MS,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) setMessage(null);
      });
    });
    return () => setToastListener(null);
  }, [opacity]);

  if (!message) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.toast, { opacity, top: insets.top + 16 }]}>
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: 24,
    right: 24,
    backgroundColor: 'rgba(20, 20, 20, 0.92)',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  text: {
    color: 'white',
    fontSize: 15,
    fontWeight: '500',
  },
});
