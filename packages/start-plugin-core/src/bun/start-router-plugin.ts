import { Generator } from '@tanstack/router-generator'
import { getConfig } from '@tanstack/router-plugin'
import { routesManifestPlugin } from '../start-router-plugin/generator-plugins/routes-manifest-plugin'
import type { Config } from '@tanstack/router-plugin'
import type { BunPlugin } from 'bun'

/**
 * Run the file-based route generator once (build) or on demand (dev).
 * Attaches Start's routes-manifest generator plugin so TSS_ROUTES_MANIFEST
 * is available for the start manifest builder.
 */
export async function runBunRouterGenerator(opts: {
  root: string
  routerConfig?: Partial<Config>
}): Promise<Generator> {
  const config = getConfig(
    {
      ...opts.routerConfig,
      plugins: [
        routesManifestPlugin(),
        ...((opts.routerConfig?.plugins as Array<unknown> | undefined) ?? []),
      ],
    } as Partial<Config>,
    opts.root,
  )
  const generator = new Generator({
    config,
    root: opts.root,
  })
  await generator.run()
  return generator
}

/**
 * Placeholder Bun plugin reserved for code-splitting transforms.
 * Route generation is invoked out-of-band via {@link runBunRouterGenerator}.
 */
export function createBunRouterPlugin(_opts: {
  root: string
  routerConfig?: Partial<Config>
}): BunPlugin {
  return {
    name: 'tanstack-router-bun',
    setup() {
      // Code-splitter onLoad hooks land in Phase 2.
    },
  }
}
