# Bun Adapter Architecture

TanStack Start 的 Bun bundler 适配层。对齐 `rsbuild/`：共享核心（config / planning / start-compiler / manifestBuilder / import-protection / post-build）+ Bun 特有壳。

## API

```ts
import { tanstackStart } from '@tanstack/react-start/plugin/bun'

const start = tanstackStart({ bun: { port: 3000 } })
await start.build()          // client + server Bun.build + host.js + post-build
await start.serve()          // 生产：dist/client 静态 + server.js fetch
const server = await start.dev() // build + Bun.serve + src watch rebuild
```

## 产物契约

| 路径 | 含义 |
|------|------|
| `dist/server/server.js` | 纯 `default.fetch`（可挂到其他宿主） |
| `dist/server/host.js` | **生产推荐入口**：先静态 `../client`，再 SSR |
| `dist/client/**` | 浏览器资源（`/assets/...`） |

## 冷构建顺序

1. `prepare`：解析 root / base / outDir，`resolveStartEntryPlan`，seed 虚拟模块
2. Generator：写出 `routeTree.gen.ts` + `TSS_ROUTES_MANIFEST`
3. **Client `Bun.build`**（`target: 'browser'`）
   - 用户 plugins → **CSS assets** → alias / virtual / code-splitter / compiler / import-protection
4. 归一化产物 → `NormalizedClientBuild` → 更新 start manifest 虚拟模块
5. 刷新 `#tanstack-start-server-fn-resolver`
6. **Server `Bun.build`**（`target: 'bun'`）
7. 写出 `dist/server/host.js`
8. `postBuildWithBun`（prerender / sitemap，若配置启用）

## CSS

内置 `createCssAssetsPlugin`：

- `import x from './file.css?url'` → hashed 文件 + `export default "/assets/..."`
- 副作用 `import './file.css'` → hashed 文件 + 空模块
- `bun.css.tailwind`: `'auto' | true | false`（默认 `auto`：源码引用 tailwindcss 且可 resolve `@tailwindcss/node` 时编译）
- `bun.css.transform` 可自定义（优先于 Tailwind）

## 虚拟模块键

| id | 内容 |
|----|------|
| `virtual:tanstack-start-*-entry` / `#tanstack-*` | entry alias |
| `#tanstack-start-server-fn-resolver` | serverFn registry |
| `tanstack-start-manifest:v` | SSR 资源 manifest |
| `#tanstack-start-plugin-adapters` | serialization adapters |

## Dev

`createBunDevServer`：与生产相同的静态解析（`tryServeClientAsset`）+ SSR；`fs.watch(src)` debounce rebuild；EventSource live-reload。精细 React Refresh 仍待后续。

## Code splitting

`createBunRouterSession` 共享 `RouterPluginContext`：reference 变换串联在 StartCompiler `onLoad`；虚拟模块插件处理 `?tsr-split` / `?tsr-shared`。

## 文件

- `plugin.ts` — 编排
- `static-host.ts` — 静态 + fetch / host.js 源码 / `serve()`
- `css-assets-plugin.ts` — CSS `?url` / Tailwind
- `start-compiler-host.ts` — StartCompiler → Bun.plugin
- `bun-plugins.ts` / `virtual-modules.ts` / `normalized-client-build.ts`
- `import-protection.ts` / `post-build.ts` / `dev-server.ts` / `start-router-plugin.ts`
