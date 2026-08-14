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
| `#tanstack-start-plugin-adapters` | serialization adapters（按 client/server runtime 生成） |

## Dev

`createBunDevServer`：`Bun.serve` 托管 `dist/server/server.js` + `dist/client` 静态资源；
对 `src/` 做 debounce 重建，并通过 EventSource (`/__tanstack_bun_reload`) 注入整页 live-reload。
精细 React Refresh / 模块级 HMR 仍待后续。

## Code splitting

`createBunRouterSession` 共享 `RouterPluginContext`：
1. Generator 写入 `routesByFile`
2. reference 变换在 StartCompiler `onLoad` 内串联（Bun 每个模块只能有一个成功的 onLoad）
3. `createBunRouterCodeSplitterRuntime().plugin` 仅处理 `?tsr-split` / `?tsr-shared` 虚拟模块

## 文件

- `plugin.ts` — 编排
- `start-compiler-host.ts` — StartCompiler → Bun.plugin
- `bun-plugins.ts` — alias + virtual modules
- `virtual-modules.ts` — 内存虚拟模块 store
- `normalized-client-build.ts` — Bun outputs → NormalizedClientBuild
- `import-protection.ts` / `post-build.ts` / `dev-server.ts` / `start-router-plugin.ts`
