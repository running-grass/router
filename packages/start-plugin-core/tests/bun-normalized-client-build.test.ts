import { describe, expect, it } from 'vitest'
import { normalizeBunClientBuild } from '../src/bun/normalized-client-build'

describe('normalizeBunClientBuild', () => {
  it('marks entry-point as the SSR entry chunk', () => {
    const build = normalizeBunClientBuild({
      clientOutDir: '/app/dist/client',
      outputs: [
        {
          path: '/app/dist/client/assets/main-abc.js',
          fileName: 'assets/main-abc.js',
          kind: 'entry-point',
        },
        {
          path: '/app/dist/client/assets/chunk-1.js',
          fileName: 'assets/chunk-1.js',
          kind: 'chunk',
        },
      ],
    })

    expect(build.entryChunkFileName).toBe('assets/main-abc.js')
    expect(build.chunksByFileName.get('assets/main-abc.js')?.isEntry).toBe(true)
    expect(build.chunksByFileName.size).toBe(2)
  })

  it('collects tsr-split route file paths from inputs', () => {
    const build = normalizeBunClientBuild({
      clientOutDir: '/app/dist/client',
      outputs: [
        {
          path: '/app/dist/client/assets/index.js',
          fileName: 'assets/index.js',
          kind: 'entry-point',
          inputs: [
            {
              path: '/app/src/routes/posts.tsx?tsr-split=component',
            },
          ],
        },
      ],
    })

    expect(
      build.chunksByFileName.get('assets/index.js')?.routeFilePaths,
    ).toEqual(['/app/src/routes/posts.tsx'])
    expect(
      build.chunkFileNamesByRouteFilePath.get('/app/src/routes/posts.tsx'),
    ).toEqual(['assets/index.js'])
  })
})
