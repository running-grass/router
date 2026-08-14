import { mkdir } from 'node:fs/promises'
import { join } from 'pathe'
import {
  applyResolvedBaseAndOutput,
  applyResolvedRouterBasepath,
  createStartConfigContext,
} from '../config-context'
import { createServerFnBasePath, normalizePublicBase } from '../planning'
import { generateSerializationAdaptersModule } from '../serialization-adapters-module'
import { parseStartConfig } from './schema'
import {
  BUN_ENVIRONMENT_NAMES,
  createBunDefine,
  createBunResolvedEntryAliases,
  resolveBunOutputDirectories,
} from './planning'
import { createBunVirtualModuleStore, VIRTUAL_MODULES } from './virtual-modules'
import { createBunCompilerHosts } from './start-compiler-host'
import { createBunImportProtectionPlugin } from './import-protection'
import { createBunRouterSession } from './start-router-plugin'
import { createBunAliasAndVirtualPlugin } from './bun-plugins'
import {
  enrichBunClientBuildFromSourcemaps,
  normalizeBunClientBuild,
  toClientRelativeFileName,
} from './normalized-client-build'
import { postBuildWithBun } from './post-build'
import { createBunDevServer } from './dev-server'
import type { ServerFn } from '../start-compiler/types'
import type { TanStackStartBunPluginCoreOptions } from './types'
import type { TanStackStartBunInputConfig } from './schema'
import type { TanStackStartBunAdapter } from './types'

export function tanStackStartBun(
  corePluginOpts: TanStackStartBunPluginCoreOptions,
  startPluginOpts: TanStackStartBunInputConfig = {},
): TanStackStartBunAdapter {
  const configContext = createStartConfigContext({
    corePluginOpts,
    startPluginOpts,
    parseConfig: parseStartConfig,
  })

  async function prepare(root: string, mode: 'dev' | 'build') {
    const publicBase = normalizePublicBase(
      startPluginOpts.bun?.publicBase ??
        corePluginOpts.bun?.publicBase ??
        '/',
    )
    const outDirs = resolveBunOutputDirectories({
      root,
      clientOutDir:
        startPluginOpts.bun?.clientOutDir ?? corePluginOpts.bun?.clientOutDir,
      serverOutDir:
        startPluginOpts.bun?.serverOutDir ?? corePluginOpts.bun?.serverOutDir,
    })

    applyResolvedBaseAndOutput({
      resolvedStartConfig: configContext.resolvedStartConfig,
      root,
      publicBase,
      clientOutputDirectory: outDirs.client,
      serverOutputDirectory: outDirs.server,
    })

    const { startConfig, resolvedStartConfig } = configContext.getConfig()
    const routerBasepath = applyResolvedRouterBasepath({
      resolvedStartConfig,
      startConfig,
    })

    const entryPlan = configContext.resolveEntries()
    const entryAliases = createBunResolvedEntryAliases({
      entryPaths: entryPlan.entryPaths,
    })

    const serverFnBase = createServerFnBasePath({
      routerBasepath,
      serverFnBase: startConfig.serverFns.base,
    })

    const inlineCssEnabled =
      mode === 'build' && startConfig.server.build.inlineCss.enabled

    const define = createBunDefine({
      serverFnBase,
      routerBasepath,
      publicBase: resolvedStartConfig.basePaths.publicBase,
      isDev: mode === 'dev',
      inlineCssEnabled,
    })

    const serverFnsById: Record<string, ServerFn> = {}
    const virtualModules = createBunVirtualModuleStore()

    const setPluginAdapters = (runtime: 'client' | 'server') => {
      virtualModules.set(
        VIRTUAL_MODULES.pluginAdapters,
        generateSerializationAdaptersModule({
          adapters: corePluginOpts.serializationAdapters,
          runtime,
        }),
      )
    }
    setPluginAdapters('server')

    const refreshResolver = () => {
      virtualModules.updateServerFnResolver(serverFnsById, {
        includeClientReferencedCheck: !corePluginOpts.ssrIsProvider,
      })
    }
    refreshResolver()

    const routerSession = createBunRouterSession({
      root,
      framework: corePluginOpts.framework,
      routerConfig: startConfig.router,
      prerenderEnabled: startConfig.prerender?.enabled === true,
      isProduction: mode === 'build',
    })
    await routerSession.generate()

    const compilers = createBunCompilerHosts({
      root,
      framework: corePluginOpts.framework,
      providerEnvName: corePluginOpts.providerEnvironmentName,
      mode,
      ssrIsProvider: corePluginOpts.ssrIsProvider,
      serverFnsById,
      onRegistryChange: refreshResolver,
      preprocessCode: (code, id, env) =>
        routerSession.getCodeSplitterRuntime(env).transformReference(code, id),
    })

    return {
      startConfig,
      resolvedStartConfig,
      entryAliases,
      define,
      serverFnsById,
      virtualModules,
      compilers,
      routerSession,
      outDirs,
      publicBase: resolvedStartConfig.basePaths.publicBase,
      refreshResolver,
      setPluginAdapters,
    }
  }

  async function buildClient(ctx: Awaited<ReturnType<typeof prepare>>) {
    await mkdir(ctx.outDirs.client, { recursive: true })
    ctx.setPluginAdapters('client')

    const bunOpts = startPluginOpts.bun ?? corePluginOpts.bun
    const extraPlugins = [
      ...(bunOpts?.plugins ?? []),
      ...(bunOpts?.clientPlugins ?? []),
    ]

    const result = await Bun.build({
      entrypoints: [ctx.entryAliases.client],
      outdir: ctx.outDirs.client,
      target: 'browser',
      format: 'esm',
      packages: 'bundle',
      splitting: true,
      sourcemap: 'linked',
      minify: false,
      naming: {
        entry: 'assets/[name]-[hash].js',
        chunk: 'assets/[name]-[hash].js',
        asset: 'assets/[name]-[hash].[ext]',
      },
      define: ctx.define,
      plugins: [
        ...extraPlugins,
        createBunAliasAndVirtualPlugin({
          aliases: ctx.entryAliases.alias,
          virtualModules: ctx.virtualModules,
        }),
        ctx.routerSession.createCodeSplitterPlugin('client'),
        ctx.compilers.createTransformPlugin('client'),
        createBunImportProtectionPlugin({
          envName: BUN_ENVIRONMENT_NAMES.client,
          envType: 'client',
          root: ctx.resolvedStartConfig.root,
          srcDirectory: ctx.resolvedStartConfig.srcDirectory,
          importProtection: ctx.startConfig.importProtection,
        }),
      ],
    })

    if (!result.success) {
      const message = result.logs.map(String).join('\n')
      throw new Error(`[tanstack-start-bun] Client build failed:\n${message}`)
    }

    const outputs = result.outputs.map((o) => ({
      path: o.path,
      fileName: toClientRelativeFileName(o.path, ctx.outDirs.client),
      kind: o.kind,
      sourcemapPath: `${o.path}.map`,
    }))

    let clientBuild = normalizeBunClientBuild({
      outputs,
      clientOutDir: ctx.outDirs.client,
    })
    clientBuild = await enrichBunClientBuildFromSourcemaps({
      clientBuild,
      outputs,
    })

    ctx.virtualModules.updateManifest({
      clientBuild,
      publicBase: ctx.publicBase,
      scriptFormat: 'module',
      inlineCss: {
        enabled: ctx.startConfig.server.build.inlineCss.enabled,
        transformAssets: ctx.startConfig.server.build.inlineCss.transformAssets,
      },
    })
    ctx.refreshResolver()

    return { result, clientBuild }
  }

  async function buildServer(ctx: Awaited<ReturnType<typeof prepare>>) {
    await mkdir(ctx.outDirs.server, { recursive: true })
    ctx.setPluginAdapters('server')

    const bunOpts = startPluginOpts.bun ?? corePluginOpts.bun
    const extraPlugins = [
      ...(bunOpts?.plugins ?? []),
      ...(bunOpts?.serverPlugins ?? []),
    ]

    const result = await Bun.build({
      entrypoints: [ctx.entryAliases.server],
      outdir: ctx.outDirs.server,
      target: 'bun',
      format: 'esm',
      // Bundle deps so #tanstack-* aliases inside start-server-core resolve
      // at build time via createBunAliasAndVirtualPlugin.
      packages: 'bundle',
      splitting: false,
      sourcemap: 'linked',
      naming: {
        entry: 'server.js',
      },
      define: ctx.define,
      plugins: [
        ...extraPlugins,
        createBunAliasAndVirtualPlugin({
          aliases: ctx.entryAliases.alias,
          virtualModules: ctx.virtualModules,
        }),
        ctx.routerSession.createCodeSplitterPlugin('server'),
        ctx.compilers.createTransformPlugin('server'),
        createBunImportProtectionPlugin({
          envName: BUN_ENVIRONMENT_NAMES.server,
          envType: 'server',
          root: ctx.resolvedStartConfig.root,
          srcDirectory: ctx.resolvedStartConfig.srcDirectory,
          importProtection: ctx.startConfig.importProtection,
        }),
      ],
    })

    if (!result.success) {
      const message = result.logs.map(String).join('\n')
      throw new Error(`[tanstack-start-bun] Server build failed:\n${message}`)
    }

    return result
  }

  return {
    async build(opts) {
      const root = opts?.root ?? process.cwd()
      const ctx = await prepare(root, 'build')
      await buildClient(ctx)
      await buildServer(ctx)
      await postBuildWithBun({
        startConfig: ctx.startConfig,
        serverOutDir: ctx.outDirs.server,
        clientOutDir: ctx.outDirs.client,
      })
    },

    async dev(opts) {
      const root = opts?.root ?? process.cwd()
      const ctx = await prepare(root, 'dev')

      // Initial builds so SSR has a server entry and client assets
      await buildClient(ctx)
      await buildServer(ctx)

      return createBunDevServer({
        root,
        port: opts?.port ?? startPluginOpts.bun?.port ?? 3000,
        hostname:
          opts?.hostname ?? startPluginOpts.bun?.hostname ?? '0.0.0.0',
        clientOutDir: ctx.outDirs.client,
        serverOutDir: ctx.outDirs.server,
        publicBase: ctx.publicBase,
        rebuild: async () => {
          Object.keys(ctx.serverFnsById).forEach((k) => {
            delete ctx.serverFnsById[k]
          })
          await ctx.routerSession.generate()
          await buildClient(ctx)
          await buildServer(ctx)
        },
        invalidate: (ids) => ctx.compilers.invalidate(ids),
      })
    },
  }
}
