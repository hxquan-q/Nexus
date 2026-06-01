# Nexus Chrome Extension - AI Agent Instructions

## Project Overview
Nexus is a Chrome extension (MV3) built with WXT + Vue 3. It provides an AI-powered browser assistant with multi-provider support, browser control, and rich content rendering.

## Tech Stack
- Framework: WXT (wraps Vite for extension development)
- UI: Vue 3 Composition API with `<script setup lang="ts">`
- Styling: CSS Variables + Scoped CSS (NO Tailwind, NO external CSS framework)
- State: @wxt-dev/storage + idb (IndexedDB)
- Build: `npm run dev` (dev), `npm run build` (production)

## Architecture
- `entrypoints/` -- WXT entry points (background, sidepanel, content scripts, options, assistant-window, sandbox)
- `components/` -- Shared Vue components
- `composables/` -- Vue composables (useStreamChat, useChatContext)
- `utils/` -- Business logic (api, storage, db, markdown, etc.)
- `background/control/` -- Chrome DevTools Protocol browser control
- `styles/` -- Design tokens (Apple-style CSS variables)

## Key Conventions
- All CSS must use design tokens from `styles/design-tokens.css`
- All user-visible strings must use i18n via `t(lang, 'key', params?)`
- Charts (Mermaid, Graphviz) render in sandboxed iframes only
- Content scripts use shadow DOM for style isolation
- File parsers use dynamic import() for lazy loading

## Commands
- `npm run dev` -- Start dev server with HMR
- `npm run build` -- Production build
- `npx vue-tsc --noEmit` -- Type check

## Common Tasks
- Adding a provider: update `utils/providers/adapters.ts` + `utils/providers/types.ts`
- Adding a tool: update `utils/tools.ts` + tool executor in sidepanel
- Adding a setting: update `utils/storage.ts` + options page
- Adding i18n keys: add to both `en` and `zh-CN` in `utils/i18n.ts`
