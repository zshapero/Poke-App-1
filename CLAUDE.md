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
- `app/sell/[id].tsx` — modal-presented form that records a sale and flips the item's status to `'sold'`. Wraps both writes (UPDATE items + INSERT sales) in `db.withTransactionAsync(...)` so they commit or roll back together — never leave the DB with a sold item missing its sale row, or vice-versa.
- `app/sale/[id].tsx` — stack-pushed read-only detail screen for a single sale row (joined with its item). Receipt-style: sale price, cost basis, fees, shipping, divider, net profit (color-coded). **Note the singular noun `/sale` vs the verb `/sell`** — `sale/[id]` is "view this completed sale," `sell/[id]` is "the form you fill out to record a sale." Both routes coexist intentionally; don't merge or rename one to look like the other.

Typed routes are enabled (`experiments.typedRoutes` in `app.json`), so `router.push('/some-route')` is type-checked against the actual files in `app/`. If you add a screen, the type for that path appears automatically.

### Database (`expo-sqlite`)

- `db/schema.ts` — the single source of truth: exports `DATABASE_NAME`, the `migrate(db)` function, the `SCHEMA_VERSION` constant, and TypeScript types (`Item`, `Sale`, `SaleWithItem`, `ItemStatus`) that mirror the table columns one-to-one.
- The schema is applied via `<SQLiteProvider databaseName={DATABASE_NAME} onInit={migrate} useSuspense>` in `app/_layout.tsx`. `onInit` runs once when the DB is first opened.
- Inside any screen or component, get the DB handle with `const db = useSQLiteContext()` and call `db.getAllAsync<T>(...)`, `db.getFirstAsync<T>(...)`, or `db.runAsync(...)`. All are async; pass parameters as a positional array (`?` placeholders) — never interpolate user input into the SQL string.
- For multi-statement writes that must be atomic (e.g. UPDATE items + INSERT sales when marking sold), wrap them in `await db.withTransactionAsync(async () => { ... })`. SQLite handles BEGIN/COMMIT/ROLLBACK for you.
- `set` is quoted as `"set"` in every query because it's a soft keyword in SQL. Keep it quoted if you write new queries against the `items` table.

### Migrations

`db/schema.ts` uses `PRAGMA user_version` to track which version the on-device DB has reached. The `migrate()` function reads it once, then runs each `if (version < N) { ... ; version = N; }` block in order, finally writing the new `user_version` back. Rules:

- **Never edit a past version's block** once it has shipped. Add a new `if (version < N+1) { ... }` block instead.
- **Bump `SCHEMA_VERSION`** to match the highest block. The migrator throws if it ends below `SCHEMA_VERSION`, which catches "I added a block but forgot to bump the constant" early.
- For additive column changes use `ALTER TABLE x ADD COLUMN y TYPE` inside the new version block — that's how `days_held` was added to `sales` in v2.
- For destructive changes (renaming/dropping columns) you'll need the SQLite copy-rename dance: create new table, copy rows, drop old, rename new. Don't try `ALTER TABLE ... DROP COLUMN` — SQLite versions in many React Native runtimes don't support it.

### Tables

```
items (id, name, set, cost_basis, acquired_date, source, photo_uri, status, current_price)
sales (id, item_id, sale_price, platform, fees, shipping, sold_date, net_profit, days_held)
```

`days_held` is captured at sale time (sold_date − acquired_date in whole days) so the sales row freezes that snapshot — useful for historical reporting that shouldn't recompute against the (potentially edited) acquired_date later.

`status` is the union `'active' | 'listed' | 'sold'`. New items inserted from the Add screen default to `'active'`, and the Portfolio tab filters on `status = 'active'` — if you add a new status value, update both the type in `db/schema.ts` and the WHERE clause in `app/(tabs)/index.tsx`. `sales.item_id` is a foreign key to `items.id` with `ON DELETE CASCADE` — deleting an item removes its sales too. Foreign keys are enabled in `migrate` via `PRAGMA foreign_keys = ON`.

### Refreshing data on tab focus

Tab screens read with `useFocusEffect(useCallback(...))` rather than `useEffect`, so the list re-queries SQLite every time the tab gains focus (e.g. after returning from Add Item). Each effect uses a `cancelled` flag to ignore stale async results if the tab is left before the query resolves.

### Toasts

There is no toast library — instead, a tiny in-house pattern:

- `lib/toast.ts` exposes `showToast(message)` and a `setToastListener(fn)` setter. It's a singleton listener slot, not a context, so any code (including non-React modules) can fire a toast with a plain function call.
- `components/toast.tsx` exports `<ToastHost />`, which subscribes via `setToastListener`, animates in/out with `Animated`, and renders absolute-positioned text near the top safe-area inset. It's mounted once in `app/_layout.tsx` outside the `Stack` so it overlays modals and tabs alike.
- To show a toast from anywhere: `import { showToast } from '@/lib/toast'; showToast('Item saved');`. Don't try to render `<Toast>` in screens directly.

### External APIs (`lib/api/`)

Network code lives under `lib/api/`. Keep it pure: a function that takes inputs and returns data (or throws on failure). No React, no state, no side effects beyond `fetch`. Screens own the loading/toasting/state-update part.

- `lib/api/pokemontcg.ts` — wraps the public `https://api.pokemontcg.io/v2` endpoint (no auth required for low-volume use).
  - `searchCard(name, setName)` builds a Lucene-style query `name:"X" set.name:"Y"`, URL-encodes it, and returns the matching cards (or throws on non-2xx / network failure). The escape helper backslash-escapes embedded quotes in the inputs.
  - `getMarketPrice(card)` reads `card.tcgplayer.prices.{normal, holofoil, reverseHolofoil}.market` and returns the highest non-null number, or `null` if none. Pure function — never throws, never fetches.

The Portfolio tab's "Refresh Prices" button is the consumer pattern: per-item `try/catch`, sequential loop (one fetch at a time so we don't burst-rate-limit the public API), per-item UPDATE only when a real price comes back, single summary toast at the end. **Do not** add a second toast per failed item — the toast would queue up and overwhelm the user.

### Format helpers

`lib/format.ts` holds small, pure formatters and input sanitizers. Use these instead of inlining `toFixed(2)` or `Date` math in screens — Portfolio, the item detail screen, the Add form, and the Mark-as-Sold form all read from them, and they're trivially unit-testable later.

- `formatMoney(value)` — turns a `number | null | undefined` into a `$0.00` string. Negatives render as `-$1.50` (sign before the dollar). `null`/`undefined` becomes `$0.00`, not `'—'`; show a dash at the call site if you want one for missing values.
- `formatSignedMoney(value)` — like `formatMoney` but always shows a leading sign on non-zero values: `+$45.00` / `-$10.00` / `$0.00`. Use for **net profit** displays (Sales tab rows, sale detail, lifetime profit stat); use plain `formatMoney` for prices, costs, fees, shipping, totals.
- `formatIsoForDisplay(iso)` — `'2026-03-15'` → `'Mar 15, 2026'`. Returns `'—'` for null/undefined and falls back to the raw string for unparseable input. Use this in lists/details that read a stored `YYYY-MM-DD`.
- `formatSignedPercent(value)` — `+20.0%` / `-60.0%` / `0.0%`. Returns `'—'` for `null`/`NaN`. Used for the Dashboard's avg-margin stat.
- `daysHeld(acquiredDate)` — takes a `YYYY-MM-DD` string and returns the integer number of whole days since that date, or `null` if the input is missing or unparseable. Anchored to local midnight, so it doesn't drift across timezones.
- `daysBetween(startIsoDate, end)` — same idea but with an explicit `Date` for the end. Used by the sell form to freeze `days_held` against the picked sold date, not "today".
- `sanitizeMoneyInput(text)` — strips non-digits and caps decimals at 2. Run it inside every `onChangeText` for a `$` field so users can't type letters or two dots.
- `toIsoDate(date)` — `Date` → `'YYYY-MM-DD'`. **Always store dates in SQLite via this** — never raw `Date` objects, never locale-formatted strings. ISO strings sort correctly and survive timezone shifts.
- `formatDateForDisplay(date)` — `Date` → user-facing string (e.g. `'May 8, 2026'`). Only for display; never for storage.

### Forms (patterns from `app/add.tsx`)

- **Validation gating**: derive a `canSave` boolean with `useMemo`, and disable the Save button via the `disabled` prop and a low-opacity style. Don't show alerts for missing fields — disabling the button is enough signal. Reserve `Alert.alert` for failures from the database.
- **Money inputs**: use a row with a `$` `<ThemedText>` prefix and a `<TextInput keyboardType="decimal-pad">`. Sanitize on every keystroke (digits + at most one dot, max 2 decimals) so users can't type letters or two dots. Parse with `parseFloat` only at save time.
- **Date inputs**: `@react-native-community/datetimepicker`. Display the date as a tappable row showing the formatted date; on tap, render `<DateTimePicker mode="date">`. On Android the picker auto-dismisses after selection; on iOS use `display="inline"` with a "Done" row to dismiss. Always store dates as ISO `YYYY-MM-DD` strings in SQLite — never the full Date or a locale-formatted string.
- **Single-select dropdowns**: a `<Pressable>` opens a `<Modal transparent animationType="fade">` with a backdrop; the inner sheet uses `e.stopPropagation()` so taps inside the sheet don't dismiss it. The 6-option Source picker is the example.
- **Photo input**: `expo-image-picker`. The "+ Add photo" button calls `Alert.alert` with three actions (Take Photo / Choose from Library / Cancel), then calls `launchCameraAsync` or `launchImageLibraryAsync` accordingly. Camera requires `requestCameraPermissionsAsync` first; library picker handles its own prompt. The permission strings live in the `expo-image-picker` plugin block in `app.json` — always update both iOS keys (`photosPermission`, `cameraPermission`) when changing copy.

### Charts (`react-native-gifted-charts`)

The Dashboard tab uses `BarChart` and `PieChart` from `react-native-gifted-charts`. Pinned via `npx expo install` so versions match the SDK.

- **Peer dependencies**: `react-native-svg` (bundled in Expo Go) **and** `react-native-linear-gradient` (NOT bundled in Expo Go). The latter has a static import inside gifted-charts that runs at JS-module-load time, even if you never use gradient props. **The Dashboard tab will crash in Expo Go for that reason** — to view it, run a development build: `npx expo prebuild && npx expo run:ios` (or `run:android`). The other tabs work fine in Expo Go.
- **Pie charts can't render negative slices.** `buildPlatformPie` in `app/(tabs)/dashboard.tsx` filters to platforms with strictly positive total profit. If everything is a loss, the pie card shows "No platform has positive profit yet" instead of a broken chart. If you add another chart type later, plan for the negative-value case explicitly — don't just pass raw aggregates.
- **Bar charts need fixed-shape data, not just sums.** `buildMonthlyBars` always returns 6 buckets (current month + 5 prior), even if some are `$0` — otherwise a quiet month would silently disappear from the time series and skew how you read the trend.
- **Chart width is computed from `Dimensions.get('window').width`** minus the screen's outer padding and the card's inner padding. If you change those styles, update the `CHART_WIDTH` constant in `dashboard.tsx`.

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
