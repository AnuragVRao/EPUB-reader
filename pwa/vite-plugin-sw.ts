import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

const TEMPLATE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sw.js')
const OUTPUT = 'sw.js'

function listFiles(dir: string, base = dir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return listFiles(full, base)
    return [path.relative(base, full).split(path.sep).join('/')]
  })
}

// Writes dist/sw.js once the build has finished: the service worker template
// with the list of every built file (to precache) and a hash of their
// contents (so the worker changes whenever the site does). Build only - the
// dev server serves no service worker, and src/lib/pwa.ts registers none.
export function serviceWorker(): Plugin {
  let outDir = 'dist'
  return {
    name: 'reader-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      const files = listFiles(outDir)
        .filter((file) => file !== OUTPUT && !file.endsWith('.map'))
        .sort()
      const hash = createHash('sha256')
      for (const file of files) {
        hash.update(file)
        hash.update(readFileSync(path.join(outDir, file)))
      }
      const source = readFileSync(TEMPLATE, 'utf8')
        .replace("'__SW_VERSION__'", JSON.stringify(hash.digest('hex').slice(0, 12)))
        .replace('__SW_PRECACHE__', JSON.stringify(files))
      writeFileSync(path.join(outDir, OUTPUT), source)
    },
  }
}
