# TanStack Start + Bun Bundler

Minimal example that builds with **Bun as the bundler** (no Vite).

## vs `start-bun`

| | [`start-bun`](../start-bun) | **this example** |
|--|--|--|
| Dev / build | Vite (`vite dev` / `vite build`) | `tanstackStart().dev()` / `.build()` via Bun |
| Production host | `Bun.serve` + Vite `dist` | `Bun.serve` + Bun-bundled `dist` |
| Plugin entry | `@tanstack/react-start/plugin/vite` | `@tanstack/react-start/plugin/bun` |

## Scripts

```bash
# from monorepo root (packages must resolve; Bun can load src via package exports)
cd examples/react/start-bun-bundler
bun run build   # → dist/client + dist/server (+ prerender when configured)
bun run start   # production host
bun run dev     # Bun.serve + watch rebuild + EventSource live-reload
bun run smoke   # build + HTTP assertions for `/` and `/about`
```

## What this proves

- Dual `Bun.build` (browser client + bun server) without Vite
- `createServerFn` + SSR hydrate (loader data in HTML)
- File route generation + route code-splitting (`index-*.js` / `about-*.js`)
- Import protection plugin (shared analysis layer)
- Serialization adapters virtual module (`#tanstack-start-plugin-adapters`)
- Post-build prerender for configured `pages`
- Solid/Vue facades: `@tanstack/solid-start/plugin/bun`, `@tanstack/vue-start/plugin/bun`

## Known gaps (later)

- Dev is debounce rebuild + full-page live-reload (not module-level React Refresh / HMR)
- No RSC / Nitro integration in this adapter
- CSS / asset pipeline is thinner than Vite

See `packages/start-plugin-core/src/bun/ARCHITECTURE.md` for orchestration details.
