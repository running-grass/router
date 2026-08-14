import { z } from 'zod'
import {
  parseStartConfig as parseCoreStartConfig,
  tanstackStartOptionsObjectSchema,
} from '../schema'
import type { CompileStartFrameworkOptions } from '../types'
import type { InlineCssInputOptions } from '../schema'

export const tanstackStartBunOptionsSchema = tanstackStartOptionsObjectSchema
  .extend({
    bun: z
      .object({
        clientOutDir: z.string().optional(),
        serverOutDir: z.string().optional(),
        publicBase: z.string().optional(),
        port: z.number().int().positive().optional(),
        hostname: z.string().optional(),
      })
      .optional(),
  })
  .optional()
  .prefault({})

export function parseStartConfig(
  opts: z.input<typeof tanstackStartBunOptionsSchema>,
  corePluginOpts: { framework: CompileStartFrameworkOptions },
  root: string,
) {
  tanstackStartBunOptionsSchema.parse(opts)
  const { bun: _bun, ...coreOptions } = opts ?? {}
  return parseCoreStartConfig(coreOptions, corePluginOpts, root)
}

export type TanStackStartBunInputConfig = z.input<
  typeof tanstackStartBunOptionsSchema
> & {
  bun?: {
    clientOutDir?: string
    serverOutDir?: string
    publicBase?: string
    port?: number
    hostname?: string
  }
  server?: {
    build?: {
      inlineCss?: InlineCssInputOptions
    }
  }
}
