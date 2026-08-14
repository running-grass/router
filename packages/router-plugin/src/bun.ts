/**
 * Bun bundler adapter for @tanstack/router-plugin.
 *
 * Bun's plugin API is esbuild-adjacent. We re-export the esbuild factories and
 * provide Bun-friendly aliases so Start / apps can depend on
 * `@tanstack/router-plugin/bun` without importing the esbuild path.
 *
 * Route generation for the Start Bun adapter is primarily driven via
 * `Generator` from `@tanstack/router-generator` inside start-plugin-core/bun.
 * Use these plugins when wiring raw `Bun.build({ plugins })` yourself.
 */
export {
  configSchema,
  TanStackRouterGeneratorEsbuild as TanStackRouterGeneratorBun,
  TanStackRouterCodeSplitterEsbuild as TanStackRouterCodeSplitterBun,
  TanStackRouterEsbuild as TanStackRouterBun,
  tanstackRouter,
  TanStackRouterEsbuild as default,
} from './esbuild'

export type { Config, CodeSplittingOptions, RouterPluginContext } from './esbuild'
