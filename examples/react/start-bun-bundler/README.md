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
bun run build   # → dist/client + dist/server (+ prerender `/` → dist/client/index.html)
bun run start   # production host
bun run dev     # Bun.serve + watch rebuild
```

## What this proves

- Dual `Bun.build` (browser client + bun server) without Vite
- `createServerFn` + SSR hydrate (loader data in HTML)
- File route generation (`routeTree.gen.ts`)
- Import protection plugin (shared analysis layer)
- Post-build prerender for configured `pages`

## Known gaps (upstream / later)

- No Tailwind / Vite-only plugin ecosystem — use Bun-native CSS/TSX first
- Dev HMR is coarse (full rebuild on `src` change), not Vite-grade Fast Refresh fidelity
- No RSC / Nitro / solid-vue facades in this adapter
- CSS code-splitting / asset pipeline is thinner than Vite

See `packages/start-plugin-core/src/bun/ARCHITECTURE.md` for orchestration details.
