import type { TanStackStartCoreOptions } from '../types'

export interface BunCoreOptions {
  /** Client output subdirectory under root (default: dist/client) */
  clientOutDir?: string | undefined
  /** Server output subdirectory under root (default: dist/server) */
  serverOutDir?: string | undefined
  /** Public asset base path (default: /) */
  publicBase?: string | undefined
  /** Dev server port */
  port?: number | undefined
  /** Dev server hostname */
  hostname?: string | undefined
}

export type TanStackStartBunPluginCoreOptions = TanStackStartCoreOptions & {
  providerEnvironmentName: string
  ssrIsProvider: boolean
  bun?: BunCoreOptions | undefined
}

export interface TanStackStartBunAdapter {
  /** Production dual Bun.build (client then server) */
  build: (opts?: { root?: string }) => Promise<void>
  /** Integrated Bun.serve development server */
  dev: (opts?: {
    root?: string
    port?: number
    hostname?: string
  }) => Promise<{ stop: () => void; port: number; hostname: string }>
}

export const BUN_ENVIRONMENT_NAMES = {
  client: 'client',
  server: 'ssr',
} as const

export type BunEnvironmentName =
  (typeof BUN_ENVIRONMENT_NAMES)[keyof typeof BUN_ENVIRONMENT_NAMES]
