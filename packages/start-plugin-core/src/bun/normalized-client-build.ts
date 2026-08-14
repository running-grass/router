import { relative } from 'pathe'
import { tsrSplit } from '@tanstack/router-plugin'
import type { NormalizedClientBuild, NormalizedClientChunk } from '../types'

export interface BunClientOutputLike {
  path: string
  fileName: string
  kind: string
  /** Optional Bun input paths (may include ?tsr-split=...) when available. */
  inputs?: Array<{ path: string }>
}

/**
 * Best-effort normalization of Bun.build client outputs into NormalizedClientBuild.
 */
export function normalizeBunClientBuild(opts: {
  outputs: Array<BunClientOutputLike>
  clientOutDir: string
}): NormalizedClientBuild {
  const chunksByFileName = new Map<string, NormalizedClientChunk>()
  const chunkFileNamesByRouteFilePath = new Map<string, Array<string>>()
  let entryChunkFileName: string | undefined

  for (const artifact of opts.outputs) {
    const fileName = artifact.fileName.replace(/^\.\//, '')
    const kind = artifact.kind

    if (kind === 'asset' && fileName.endsWith('.css')) {
      continue
    }

    if (kind !== 'entry-point' && kind !== 'chunk') {
      continue
    }

    const isEntry = kind === 'entry-point'
    const routeFilePaths = getRouteFilePathsFromInputs(artifact.inputs)

    chunksByFileName.set(fileName, {
      fileName,
      isEntry,
      imports: [],
      dynamicImports: [],
      css: [],
      routeFilePaths,
      hydrationIds: [],
    })

    for (const routeFilePath of routeFilePaths) {
      const existing = chunkFileNamesByRouteFilePath.get(routeFilePath) ?? []
      existing.push(fileName)
      chunkFileNamesByRouteFilePath.set(routeFilePath, existing)
    }

    if (isEntry && !entryChunkFileName) {
      entryChunkFileName = fileName
    }
  }

  if (!entryChunkFileName) {
    for (const fileName of chunksByFileName.keys()) {
      if (/\.(m?js)$/.test(fileName)) {
        entryChunkFileName = fileName
        const chunk = chunksByFileName.get(fileName)!
        chunksByFileName.set(fileName, { ...chunk, isEntry: true })
        break
      }
    }
  }

  if (!entryChunkFileName) {
    throw new Error(
      '[tanstack-start-bun] Could not determine client entry chunk from Bun.build outputs',
    )
  }

  return {
    entryChunkFileName,
    chunksByFileName,
    chunkFileNamesByRouteFilePath,
    cssFilesBySourcePath: new Map(),
    cssContentByFileName: new Map(),
  }
}

export function toClientRelativeFileName(
  absolutePath: string,
  clientOutDir: string,
): string {
  const rel = relative(clientOutDir, absolutePath)
  return rel.replace(/\\/g, '/')
}

function getRouteFilePathsFromInputs(
  inputs: Array<{ path: string }> | undefined,
): Array<string> {
  if (!inputs?.length) return []

  const paths: Array<string> = []
  const seen = new Set<string>()

  for (const input of inputs) {
    const id = input.path
    const queryIndex = id.indexOf('?')
    if (queryIndex < 0) continue
    const query = id.slice(queryIndex + 1)
    if (!query.includes(tsrSplit)) continue
    if (!new URLSearchParams(query).has(tsrSplit)) continue

    const routeFilePath = id.slice(0, queryIndex)
    if (seen.has(routeFilePath)) continue
    seen.add(routeFilePath)
    paths.push(routeFilePath)
  }

  return paths
}
