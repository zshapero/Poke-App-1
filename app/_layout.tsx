import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { Suspense } from 'react';
import { ActivityIndicator, View } from 'react-native';
import 'react-native-reanimated';

import { ToastHost } from '@/components/toast';
import { DATABASE_NAME, migrate } from '@/db/schema';
import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Suspense fallback={<DbLoading />}>
        <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrate} useSuspense>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="add"
              options={{ presentation: 'modal', headerShown: false }}
            />
            <Stack.Screen name="item/[id]" options={{ headerBackTitle: 'Back' }} />
            <Stack.Screen
              name="sell/[id]"
              options={{ presentation: 'modal', title: 'Mark as Sold' }}
            />
            <Stack.Screen name="sale/[id]" options={{ headerBackTitle: 'Back' }} />
          </Stack>
          <ToastHost />
          <StatusBar style="auto" />
        </SQLiteProvider>
      </Suspense>
    </ThemeProvider>
  );
}

function DbLoading() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator />
    </View>
  );
}
