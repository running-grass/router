/** Minimal Bun ambient types for router-plugin bun entry. */

declare module 'bun' {
  export interface BunPlugin {
    name: string
    setup: (build: {
      onStart: (callback: () => void | Promise<void>) => void
    }) => void | Promise<void>
  }
}

declare var Bun: {
  plugin: (plugin: import('bun').BunPlugin) => void
}
