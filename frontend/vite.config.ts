import { transform } from '@svgr/core'
import jsxPlugin from '@svgr/plugin-jsx'
import svgoPlugin from '@svgr/plugin-svgo'
import react from '@vitejs/plugin-react'
import * as child from 'child_process'
import { readFile } from 'fs/promises'
import path, { resolve } from 'path'
import { fileURLToPath } from 'url'
import { Plugin, defineConfig, transformWithEsbuild } from 'vite'
import injectHTML from 'vite-plugin-html-inject'
import Inspect from 'vite-plugin-inspect'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const commitHash = process.env.GIT_SHA || child.execSync('git rev-parse --short HEAD').toString()

interface SVGToReactOptions {}

function svgToReact(_options?: SVGToReactOptions): Plugin {
  function shouldProcessPath(path: string) {
    return path.endsWith('.svg')
  }

  const retVal: Plugin = {
    name: 'svg-to-react-component',
    enforce: 'pre',

    async transform(code, id) {
      const [path, query] = id.split('?', 2)

      if (!shouldProcessPath(path)) {
        return
      }

      if (query === 'component') {
        const svg = await readFile(path, 'utf-8')

        const svgrPlugins = [svgoPlugin, jsxPlugin]

        const svgrCode = await transform(
          svg,
          {
            svgo: true,
          },
          {
            filePath: id,
            caller: {
              previousExport: null,
              defaultPlugins: svgrPlugins,
            },
          }
        )

        return await transformWithEsbuild(svgrCode, id, {
          loader: 'jsx',
        })
      }
    },
  }
  return retVal
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), svgToReact(), injectHTML(), Inspect()],

  define: {
    __GIT_SHA__: JSON.stringify(commitHash),
  },

  root: __dirname,
  build: {
    sourcemap: true,
    // assetsInlineLimit: 1024 * 1024, // 1024KiB
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            return 'vendor'
          }
        },
      },
      input: [resolve(__dirname, `index.html`), resolve(__dirname, `messages.html`)],
    },
  },

  server: {
    proxy: {
      '/api': `http://localhost:3333/`,
    },
  },
})
