# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this app is

A mobile app for tracking a Pokémon card portfolio: items in the collection, sales recorded against those items, and aggregate stats. React Native + Expo (managed) with Expo Router for navigation and `expo-sqlite` for on-device storage. Newcomers should expect to run it via Expo Go on a physical device or simulator — there is no backend.

## Commands

All run from the repo root.

- `npm install` — install dependencies (run once after cloning, and any time `package.json` changes).
- `npm start` — start the Metro dev server; choose `i`/`a`/`w` to launch iOS sim, Android emulator, or web. For a real phone, scan the QR with the Expo Go app.
- `npm run ios` / `npm run android` / `npm run web` — same, but jump straight to a target.
- `npm run lint` — `expo lint` (ESLint + `eslint-config-expo`).
- `npx tsc --noEmit` — typecheck without emitting. There is no `npm` alias for this; add one if you find yourself running it often.
- `npx expo install <pkg>` — **use this instead of `npm install <pkg>`** for any Expo or React Native native module. It pins to a version known to work with the current Expo SDK. Plain `npm install` is fine for pure-JS libraries.
- `npm run reset-project` — destructive: moves the current `app/` to `app-example/` and replaces it with a blank starter. Don't run it casually.

There is no test runner configured yet. If you add one, prefer `jest-expo` (the Expo-blessed preset) and document the command here.

## Architecture

### Routing (Expo Router, file-based)

Every file under `app/` is a route. The file path *is* the URL.

- `app/_layout.tsx` — the root layout. Wraps the entire app in two providers: `ThemeProvider` (light/dark) and `SQLiteProvider` (the database, see below). Declares a `Stack` with two children: the `(tabs)` group and the `add` modal screen. Also mounts `<ToastHost />` (see "Toasts" below) so it overlays the entire UI.
- `app/(tabs)/_layout.tsx` — the tab bar. Parens around `(tabs)` mean "group, but don't add a URL segment." This file also renders the floating **+** button as a sibling of `<Tabs>` inside an absolute-positioned `<View>`, so the FAB sits *above* the tab bar without being part of it. The button calls `router.push('/add')`.
- `app/(tabs)/index.tsx`, `sales.tsx`, `dashboard.tsx` — the three tab screens. **Portfolio is `index.tsx`** so it resolves the `/` route when the app cold-starts; without an `index.tsx` here, Expo Router shows "Unmatched Route" because nothing claims `/`. Its `<Tabs.Screen>` is registered with `name="index"` and `title: 'Portfolio'`. The order of `<Tabs.Screen>` declarations in `_layout.tsx` controls tab order; the first one is the default.
- `app/add.tsx` — modal-presented form for inserting **or editing** an item. Registered with `presentation: 'modal'` in the root `Stack`. The same component handles both modes: if launched with an `id` search param (`router.push({ pathname: '/add', params: { id } })`), it pre-fills the form via a one-shot `SELECT` and runs `UPDATE` on save, then `router.back()` to return to the detail screen. With no `id` it runs `INSERT` and `router.dismissTo('/')` to land on Portfolio.
- `app/item/[id].tsx` — stack-pushed detail screen for a single item. The `[id]` segment is Expo Router's syntax for a dynamic route parameter, read with `useLocalSearchParams<{ id: string }>()`. Sets its own header title via `<Stack.Screen options={{ title: item.name }} />` from inside the component. Refreshes via `useFocusEffect`, so edits made through the modal show up when the user lands back here.

Typed routes are enabled (`experiments.typedRoutes` in `app.json`), so `router.push('/some-route')` is type-checked against the actual files in `app/`. If you add a screen, the type for that path appears automatically.

### Database (`expo-sqlite`)

- `db/schema.ts` — the single source of truth: exports `DATABASE_NAME`, the `migrate(db)` function with all `CREATE TABLE IF NOT EXISTS` statements, and TypeScript types (`Item`, `Sale`, `SaleWithItem`, `ItemStatus`) that mirror the table columns one-to-one.
- The schema is applied via `<SQLiteProvider databaseName={DATABASE_NAME} onInit={migrate} useSuspense>` in `app/_layout.tsx`. `onInit` runs once when the DB is first opened.
- Inside any screen or component, get the DB handle with `const db = useSQLiteContext()` and call `db.getAllAsync<T>(...)`, `db.getFirstAsync<T>(...)`, or `db.runAsync(...)`. All are async; pass parameters as a positional array (`?` placeholders) — never interpolate user input into the SQL string.
- `set` is quoted as `"set"` in every query because it's a soft keyword in SQL. Keep it quoted if you write new queries against the `items` table.
- Schema changes: bump the schema by adding a new `CREATE TABLE`/`ALTER TABLE` to `migrate`. Because we use `IF NOT EXISTS`, additive changes are safe; for column changes you'll need a real migration step (read `PRAGMA user_version` and branch). There is no migration framework yet — add one if the schema starts moving.

### Tables

```
items (id, name, set, cost_basis, acquired_date, source, photo_uri, status, current_price)
sales (id, item_id, sale_price, platform, fees, shipping, sold_date, net_profit)
```

`status` is the union `'active' | 'listed' | 'sold'`. New items inserted from the Add screen default to `'active'`, and the Portfolio tab filters on `status = 'active'` — if you add a new status value, update both the type in `db/schema.ts` and the WHERE clause in `app/(tabs)/index.tsx`. `sales.item_id` is a foreign key to `items.id` with `ON DELETE CASCADE` — deleting an item removes its sales too. Foreign keys are enabled in `migrate` via `PRAGMA foreign_keys = ON`.

### Refreshing data on tab focus

Tab screens read with `useFocusEffect(useCallback(...))` rather than `useEffect`, so the list re-queries SQLite every time the tab gains focus (e.g. after returning from Add Item). Each effect uses a `cancelled` flag to ignore stale async results if the tab is left before the query resolves.

### Toasts

There is no toast library — instead, a tiny in-house pattern:

- `lib/toast.ts` exposes `showToast(message)` and a `setToastListener(fn)` setter. It's a singleton listener slot, not a context, so any code (including non-React modules) can fire a toast with a plain function call.
- `components/toast.tsx` exports `<ToastHost />`, which subscribes via `setToastListener`, animates in/out with `Animated`, and renders absolute-positioned text near the top safe-area inset. It's mounted once in `app/_layout.tsx` outside the `Stack` so it overlays modals and tabs alike.
- To show a toast from anywhere: `import { showToast } from '@/lib/toast'; showToast('Item saved');`. Don't try to render `<Toast>` in screens directly.

### Format helpers

`lib/format.ts` holds small, pure formatters. Use these instead of inlining `toFixed(2)` or `Date` math in screens — both Portfolio and the item detail screen read from them, and they're trivially unit-testable later.

- `formatMoney(value)` — turns a `number | null | undefined` into a `$0.00` string. `null`/`undefined` becomes `$0.00`, not `'—'`; if you want a dash for missing values, do `value == null ? '—' : formatMoney(value)`.
- `daysHeld(acquiredDate)` — takes a `YYYY-MM-DD` string and returns the integer number of whole days since that date, or `null` if the input is missing or unparseable. Anchored to local midnight, so it doesn't drift across timezones.

### Forms (patterns from `app/add.tsx`)

- **Validation gating**: derive a `canSave` boolean with `useMemo`, and disable the Save button via the `disabled` prop and a low-opacity style. Don't show alerts for missing fields — disabling the button is enough signal. Reserve `Alert.alert` for failures from the database.
- **Money inputs**: use a row with a `$` `<ThemedText>` prefix and a `<TextInput keyboardType="decimal-pad">`. Sanitize on every keystroke (digits + at most one dot, max 2 decimals) so users can't type letters or two dots. Parse with `parseFloat` only at save time.
- **Date inputs**: `@react-native-community/datetimepicker`. Display the date as a tappable row showing the formatted date; on tap, render `<DateTimePicker mode="date">`. On Android the picker auto-dismisses after selection; on iOS use `display="inline"` with a "Done" row to dismiss. Always store dates as ISO `YYYY-MM-DD` strings in SQLite — never the full Date or a locale-formatted string.
- **Single-select dropdowns**: a `<Pressable>` opens a `<Modal transparent animationType="fade">` with a backdrop; the inner sheet uses `e.stopPropagation()` so taps inside the sheet don't dismiss it. The 6-option Source picker is the example.
- **Photo input**: `expo-image-picker`. The "+ Add photo" button calls `Alert.alert` with three actions (Take Photo / Choose from Library / Cancel), then calls `launchCameraAsync` or `launchImageLibraryAsync` accordingly. Camera requires `requestCameraPermissionsAsync` first; library picker handles its own prompt. The permission strings live in the `expo-image-picker` plugin block in `app.json` — always update both iOS keys (`photosPermission`, `cameraPermission`) when changing copy.

### Theming and shared UI

- `components/themed-text.tsx`, `themed-view.tsx` — wrappers that pick light/dark colors automatically. **Use these** instead of raw `<Text>`/`<View>` in screens, otherwise dark mode will look wrong.
- `components/ui/icon-symbol.tsx` (and `.ios.tsx`) — cross-platform icon. iOS uses native SF Symbols; Android/web fall back to MaterialIcons via the `MAPPING` object. **If you add an icon, add it to `MAPPING` first**, otherwise TypeScript will reject the name.
- `constants/theme.ts`, `hooks/use-color-scheme.ts` — the color tokens and the platform color-scheme hook. Read these before hard-coding hex values.
- The `@/` alias resolves to the repo root (configured in `tsconfig.json`). Prefer `@/components/...` over relative paths.

## Conventions

- New Architecture is **on** (`newArchEnabled: true` in `app.json`) and the React Compiler experiment is on. If a third-party native module misbehaves, that's the first thing to suspect.
- Don't write to AsyncStorage or the filesystem for app data — everything goes in SQLite via the schema in `db/schema.ts`.
- Modals open with `router.push('/route')` against a screen registered with `presentation: 'modal'` in the root `Stack`. Use `router.back()` to dismiss.
- The repo's working branch is `claude/add-claude-documentation-J0N17`; PRs target `main`.
