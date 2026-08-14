import { watch } from 'node:fs'
import { join } from 'pathe'

export interface BunDevServerOptions {
  root: string
  port: number
  hostname: string
  clientOutDir: string
  serverOutDir: string
  publicBase: string
  rebuild: () => Promise<void>
  invalidate: (ids: Iterable<string>) => void
}

/**
 * Production-style Bun.serve that loads the built server handler and static
 * client assets, with a coarse file watcher that rebuilds on change.
 */
export async function createBunDevServer(opts: BunDevServerOptions): Promise<{
  stop: () => void
  port: number
  hostname: string
}> {
  const serverEntry = join(opts.serverOutDir, 'server.js')

  let handlerModule = (await import(`${serverEntry}?t=${Date.now()}`)) as {
    default: { fetch: (req: Request) => Response | Promise<Response> }
  }

  let rebuildQueued = false
  const queueRebuild = async (changedPath?: string) => {
    if (rebuildQueued) return
    rebuildQueued = true
    try {
      if (changedPath) {
        opts.invalidate([changedPath])
      }
      await opts.rebuild()
      handlerModule = (await import(`${serverEntry}?t=${Date.now()}`)) as {
        default: { fetch: (req: Request) => Response | Promise<Response> }
      }
      console.info('[tanstack-start-bun] rebuilt')
    } catch (error) {
      console.error('[tanstack-start-bun] rebuild failed', error)
    } finally {
      rebuildQueued = false
    }
  }

  const watcher = watch(
    join(opts.root, 'src'),
    { recursive: true },
    (_event, filename) => {
      if (!filename) return
      if (filename.includes('routeTree.gen.')) return
      void queueRebuild(join(opts.root, 'src', filename))
    },
  )

  const server = Bun.serve({
    port: opts.port,
    hostname: opts.hostname,
    async fetch(req) {
      const url = new URL(req.url)

      // Static assets from client outdir
      if (url.pathname.startsWith('/assets/') || url.pathname.match(/\.\w+$/)) {
        const assetPath = join(
          opts.clientOutDir,
          decodeURIComponent(url.pathname.replace(/^\//, '')),
        )
        const file = Bun.file(assetPath)
        if (await file.exists()) {
          return new Response(file)
        }
      }

      return handlerModule.default.fetch(req)
    },
  })

  console.info(
    `[tanstack-start-bun] dev server http://${opts.hostname}:${server.port}`,
  )

  return {
    port: Number(server.port),
    hostname: opts.hostname,
    stop() {
      watcher.close()
      server.stop(true)
    },
  }
}
