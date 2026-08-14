# Bun Adapter Architecture

TanStack Start 的 Bun bundler 适配层。对齐 `rsbuild/`：共享核心（config / planning / start-compiler / manifestBuilder / import-protection / post-build）+ Bun 特有壳。

## API

```ts
import { tanstackStart } from '@tanstack/react-start/plugin/bun'

const start = tanstackStart({ bun: { port: 3000 } })
await start.build()          // client + server Bun.build + post-build
const server = await start.dev() // build + Bun.serve + src watch rebuild
```

## 冷构建顺序

1. `prepare`：解析 root / base / outDir，`resolveStartEntryPlan`，seed 虚拟模块
2. `runBunRouterGenerator`：写出 `routeTree.gen.ts` + `TSS_ROUTES_MANIFEST`
3. **Client `Bun.build`**（`target: 'browser'`）
   - alias / virtual / compiler transform / import-protection 插件
4. 归一化产物 → `NormalizedClientBuild` → 更新 start manifest 虚拟模块
5. 刷新 `#tanstack-start-server-fn-resolver`
6. **Server `Bun.build`**（`target: 'bun'`）
7. `postBuildWithBun`（prerender / sitemap，若配置启用）

## 虚拟模块键

| id | 内容 |
|----|------|
| `virtual:tanstack-start-*-entry` / `#tanstack-*` | entry alias |
| `#tanstack-start-server-fn-resolver` | serverFn registry |
| `tanstack-start-manifest:v` | SSR 资源 manifest |
| `#tanstack-start-plugin-adapters` | serialization adapters（一期为空） |

## Dev

`createBunDevServer`：`Bun.serve` 托管 `dist/server/server.js` + `dist/client` 静态资源；`fs.watch(src)` 触发全量 rebuild（Phase 4 可细化 HMR）。

## 文件

- `plugin.ts` — 编排
- `start-compiler-host.ts` — StartCompiler → Bun.plugin
- `bun-plugins.ts` — alias + virtual modules
- `virtual-modules.ts` — 内存虚拟模块 store
- `normalized-client-build.ts` — Bun outputs → NormalizedClientBuild
- `import-protection.ts` / `post-build.ts` / `dev-server.ts` / `start-router-plugin.ts`
