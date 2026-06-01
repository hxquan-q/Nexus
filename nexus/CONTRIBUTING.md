# Contributing to Nexus

## Development Setup

1. Clone the repository
2. `cd nexus && npm install`
3. `npm run dev` for development with HMR

## Build

```bash
npm run build
```

Output is in `.output/chrome-mv3/`. Load as unpacked extension in Chrome.

## Code Style

- Vue 3 Composition API with `<script setup lang="ts">`
- CSS uses design tokens from `styles/design-tokens.css`
- All user-visible strings use i18n
- No Tailwind or external CSS frameworks

## Pull Request Process

1. Fork the repository
2. Create a feature branch
3. Make changes
4. Run `npx vue-tsc --noEmit` and `npm run build`
5. Submit PR with description

## Reporting Issues

Use GitHub Issues for bug reports and feature requests.
