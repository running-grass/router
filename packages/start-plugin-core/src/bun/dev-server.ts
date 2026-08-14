import { watch } from 'node:fs'
import { join } from 'pathe'
import { tryServeClientAsset } from './static-host'

export interface BunDevServerOptions {
  root: string
  port: number
  hostname: string
  clientOutDir: string
  serverOutDir: string
  publicBase: string
  rebuild: (change: {
    path: string
    kind: 'route' | 'src' | 'unknown'
  }) => Promise<void>
  invalidate: (ids: Iterable<string>) => void
  /** Debounce window for coalescing rapid fs events (ms). */
  debounceMs?: number
}

const LIVE_RELOAD_PATH = '/__tanstack_bun_reload'
const LIVE_RELOAD_SCRIPT = `<script>
(() => {
  let es;
  const connect = () => {
    es = new EventSource(${JSON.stringify(LIVE_RELOAD_PATH)});
    es.onmessage = () => location.reload();
    es.onerror = () => {
      try { es.close(); } catch {}
      setTimeout(connect, 1000);
    };
  };
  connect();
})();
</script>`

function classifyChange(root: string, absPath: string): 'route' | 'src' | 'unknown' {
  const normalized = absPath.replace(/\\/g, '/')
  const routesDir = join(root, 'src', 'routes').replace(/\\/g, '/')
  if (normalized.startsWith(routesDir + '/') || normalized.includes('/routes/')) {
    return 'route'
  }
  if (normalized.includes('/src/')) {
    return 'src'
  }
  return 'unknown'
}

function injectLiveReload(html: string): string {
  if (html.includes(LIVE_RELOAD_PATH)) {
    return html
  }
  if (html.includes('</body>')) {
    return html.replace('</body>', `${LIVE_RELOAD_SCRIPT}</body>`)
  }
  return `${html}${LIVE_RELOAD_SCRIPT}`
}

/**
 * Bun.serve hosting built server handler + client assets, with debounced
 * rebuild and EventSource live-reload (full page refresh).
 */
export async function createBunDevServer(opts: BunDevServerOptions): Promise<{
  stop: () => void
  port: number
  hostname: string
}> {
  const serverEntry = join(opts.serverOutDir, 'server.js')
  const debounceMs = opts.debounceMs ?? 120

  let handlerModule = (await import(`${serverEntry}?t=${Date.now()}`)) as {
    default: { fetch: (req: Request) => Response | Promise<Response> }
  }

  const reloadClients = new Set<ReadableStreamDefaultController<Uint8Array>>()
  const encoder = new TextEncoder()
  const notifyReload = () => {
    const payload = encoder.encode(`data: reload\n\n`)
    for (const controller of reloadClients) {
      try {
        controller.enqueue(payload)
      } catch {
        reloadClients.delete(controller)
      }
    }
  }

  let rebuildTimer: ReturnType<typeof setTimeout> | undefined
  let rebuildQueued = false
  let pendingPath: string | undefined

  const runRebuild = async () => {
    if (rebuildQueued) return
    rebuildQueued = true
    const changedPath = pendingPath
    pendingPath = undefined
    try {
      if (changedPath) {
        opts.invalidate([changedPath])
      }
      await opts.rebuild({
        path: changedPath ?? '',
        kind: changedPath
          ? classifyChange(opts.root, changedPath)
          : 'unknown',
      })
      handlerModule = (await import(`${serverEntry}?t=${Date.now()}`)) as {
        default: { fetch: (req: Request) => Response | Promise<Response> }
      }
      notifyReload()
      console.info('[tanstack-start-bun] rebuilt')
    } catch (error) {
      console.error('[tanstack-start-bun] rebuild failed', error)
    } finally {
      rebuildQueued = false
      if (pendingPath) {
        scheduleRebuild(pendingPath)
      }
    }
  }

  const scheduleRebuild = (changedPath: string) => {
    pendingPath = changedPath
    if (rebuildTimer) {
      clearTimeout(rebuildTimer)
    }
    rebuildTimer = setTimeout(() => {
      rebuildTimer = undefined
      void runRebuild()
    }, debounceMs)
  }

  const watcher = watch(
    join(opts.root, 'src'),
    { recursive: true },
    (_event, filename) => {
      if (!filename) return
      if (filename.includes('routeTree.gen.')) return
      scheduleRebuild(join(opts.root, 'src', filename))
    },
  )

  const server = Bun.serve({
    port: opts.port,
    hostname: opts.hostname,
    async fetch(req) {
      const url = new URL(req.url)

      if (url.pathname === LIVE_RELOAD_PATH) {
        let streamController: ReadableStreamDefaultController<Uint8Array>
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            streamController = controller
            reloadClients.add(controller)
            controller.enqueue(encoder.encode(`: connected\n\n`))
          },
          cancel() {
            reloadClients.delete(streamController)
          },
        })
        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
        })
      }

      const staticResponse = await tryServeClientAsset(
        opts.clientOutDir,
        url.pathname,
      )
      if (staticResponse) {
        return staticResponse
      }

      const response = await handlerModule.default.fetch(req)
      const contentType = response.headers.get('content-type') ?? ''
      if (contentType.includes('text/html')) {
        const html = await response.text()
        return new Response(injectLiveReload(html), {
          status: response.status,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
          },
        })
      }
      return response
    },
  })

  console.info(
    `[tanstack-start-bun] dev server http://${opts.hostname}:${server.port}`,
  )

  return {
    port: Number(server.port),
    hostname: opts.hostname,
    stop() {
      if (rebuildTimer) {
        clearTimeout(rebuildTimer)
      }
      watcher.close()
      for (const controller of reloadClients) {
        try {
          controller.close()
        } catch {
          // ignore
        }
      }
      reloadClients.clear()
      server.stop(true)
    },
  }
}
