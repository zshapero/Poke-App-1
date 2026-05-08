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

- `app/_layout.tsx` — the root layout. Wraps the entire app in two providers: `ThemeProvider` (light/dark) and `SQLiteProvider` (the database, see below). Declares a `Stack` with two children: the `(tabs)` group and the `add-item` modal screen.
- `app/(tabs)/_layout.tsx` — the tab bar. Parens around `(tabs)` mean "group, but don't add a URL segment." This file also renders the floating **+** button as a sibling of `<Tabs>` inside an absolute-positioned `<View>`, so the FAB sits *above* the tab bar without being part of it. The button calls `router.push('/add-item')`.
- `app/(tabs)/portfolio.tsx`, `sales.tsx`, `dashboard.tsx` — the three tab screens. The order of `<Tabs.Screen>` declarations in `_layout.tsx` controls tab order; the first one is the default.
- `app/add-item.tsx` — modal-presented form for inserting a new item. Registered with `presentation: 'modal'` in the root `Stack`.

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

`status` is the union `'holding' | 'listed' | 'sold'`. New items default to `'holding'`. `sales.item_id` is a foreign key to `items.id` with `ON DELETE CASCADE` — deleting an item removes its sales too. Foreign keys are enabled in `migrate` via `PRAGMA foreign_keys = ON`.

### Refreshing data on tab focus

Tab screens read with `useFocusEffect(useCallback(...))` rather than `useEffect`, so the list re-queries SQLite every time the tab gains focus (e.g. after returning from Add Item). Each effect uses a `cancelled` flag to ignore stale async results if the tab is left before the query resolves.

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
