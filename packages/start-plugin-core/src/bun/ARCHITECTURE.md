# Bun Adapter Architecture

TanStack Start 的 Bun bundler 适配层。对齐 `rsbuild/`：共享核心（config / planning / start-compiler / manifestBuilder / import-protection / post-build）+ Bun 特有壳。

## 三套生产宿主模型（勿混用）

| 路径 | Nitro | 生产宿主 |
|------|-------|----------|
| **Vite Start** | 应用侧组合 `nitro()` from `nitro/vite`；Start **不内置** Nitro | Nitro → `.output/server/index.mjs`；client 常到 `.output/public` |
| **Rsbuild Start** | **不支持** Nitro | `dist/client` + `dist/server` + srvx / 自建静态+`fetch` |
| **Bun bundler（本适配器）** | **可选** post-build bridge（`bun.nitro`）；默认无 Nitro | 默认 `dist/server/host.js`（类 Rsbuild）；开 Nitro 后另产 `.output` |

官方文档里多数「Bun 部署」是 **Vite 打包 + `nitro({ preset: 'bun' })`**（Bun 当 **runtime**），不是 Bun 当 bundler。不能把 `nitro/vite` 塞进本适配器（依赖 Vite Environments）。

## API

```ts
import { tanstackStart } from '@tanstack/react-start/plugin/bun'

const start = tanstackStart({ bun: { port: 3000 } })
await start.build()          // client + server Bun.build + host.js + post-build
await start.serve()          // 生产：dist/client 静态 + server.js fetch
const server = await start.dev() // build + Bun.serve + src watch rebuild

// 可选：双 Bun.build 之后用 Nitro 3 二次打包到 .output（仅生产；dev 仍用 Bun host）
const startNitro = tanstackStart({
  bun: { nitro: { preset: 'node-server' } },
})
await startNitro.build()
// node .output/server/index.mjs  （或对应 preset）
```

## 产物契约

| 路径 | 含义 |
|------|------|
| `dist/server/server.js` | 纯 `default.fetch`（可挂到其他宿主） |
| `dist/server/host.js` | **默认生产推荐入口**：先静态 `../client`，再 SSR |
| `dist/client/**` | 浏览器资源（`/assets/...`） |
| `.output/**` | 仅当 `bun.nitro` 启用：Nitro preset 产物（`public` + `server`） |

## 冷构建顺序

1. `prepare`：解析 root / base / outDir，`resolveStartEntryPlan`，seed 虚拟模块
2. Generator：写出 `routeTree.gen.ts` + `TSS_ROUTES_MANIFEST`
3. **Client `Bun.build`**（`target: 'browser'`）
   - 用户 plugins → **CSS assets** → alias / virtual / code-splitter / compiler / import-protection
4. 归一化产物 → `NormalizedClientBuild` → 更新 start manifest 虚拟模块
5. 刷新 `#tanstack-start-server-fn-resolver`
6. **Server `Bun.build`**（`target: 'bun'`）
7. 写出 `dist/server/host.js`
8. **若 `bun.nitro`**：`createNitro` → `prepare` → `copyPublicAssets` → `build` → `close`（`publicAssets` = clientOutDir；`serverEntry` = web handler 指向已产出的 `server.js`，并禁用根目录 `server.ts` 自动发现）
9. `postBuildWithBun`（prerender / sitemap）：**在 Nitro 之后**，`TSS_CLIENT_OUTPUT_DIR` 指向最终 public（`.output/public` 或 `dist/client`）

## CSS

内置 `createCssAssetsPlugin`：

- `import x from './file.css?url'` → hashed 文件 + `export default "/assets/..."`
- 副作用 `import './file.css'` → hashed 文件 + 空模块
- `bun.css.tailwind`: `'auto' | true | false`（默认 `auto`：源码引用 tailwindcss 且可 resolve `@tailwindcss/node` 时编译）
- `bun.css.transform` 可自定义（优先于 Tailwind）

## Nitro bridge（可选）

- **optional peer**：`nitro`（Nitro 3）；动态 `import('nitro/builder')`
- **Dev**：不模拟 `nitro/vite` 的 `dispatchFetch`；仍用 `createBunDevServer`
- 实现：`nitro-bridge.ts` 的 `runBunNitroBuild`

## 虚拟模块键

| id | 内容 |
|----|------|
| `virtual:tanstack-start-*-entry` / `#tanstack-*` | entry alias |
| `#tanstack-start-server-fn-resolver` | serverFn registry |
| `tanstack-start-manifest:v` | SSR 资源 manifest |
| `#tanstack-start-plugin-adapters` | serialization adapters |

## Dev / HMR

`createBunDevServer`：

1. **Phase 1 — 智能重建**：按变更分类只 rebuild client / server / both；SSE 事件 `server-only`（不刷页面）、`client-reload`、`full-reload`
2. **Phase 2 — ESM HMR**：浏览器入口改为 `/@tanstack-dev/client`；`/@fs/*` 按需 transform（code-splitter + StartCompiler + Bun.Transpiler）；`import.meta.hot` 改写为 `__tanstack_hot__` 垫片；React 下注入 React Refresh preamble
3. 静态回退仍可服务 `dist/client` hashed 资源

相关文件：`hmr-protocol.ts`、`hmr-runtime.ts`、`dev-transform.ts`、`react-refresh.ts`、`dev-server.ts`

## Code splitting

`createBunRouterSession` 共享 `RouterPluginContext`：reference 变换串联在 StartCompiler `onLoad`；虚拟模块插件处理 `?tsr-split` / `?tsr-shared`。

## 文件

- `plugin.ts` — 编排
- `nitro-bridge.ts` — 可选 Nitro 3 post-build
- `static-host.ts` — 静态 + fetch / host.js 源码 / `serve()`
- `css-assets-plugin.ts` — CSS `?url` / Tailwind
- `start-compiler-host.ts` — StartCompiler → Bun.plugin
- `bun-plugins.ts` / `virtual-modules.ts` / `normalized-client-build.ts`
- `import-protection.ts` / `post-build.ts` / `dev-server.ts` / `start-router-plugin.ts`
- `hmr-protocol.ts` / `hmr-runtime.ts` / `dev-transform.ts` / `react-refresh.ts`
