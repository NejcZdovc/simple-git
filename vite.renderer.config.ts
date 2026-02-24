import tailwindcss from '@tailwindcss/vite'
import type { ConfigEnv } from 'vite'
import { defineConfig } from 'vite'

export default defineConfig((forgeEnv: ConfigEnv<'renderer'>) => {
  const { root, forgeConfigSelf } = forgeEnv
  const name = forgeConfigSelf.name ?? ''

  return {
    root: `${root}/src/renderer`,
    plugins: [tailwindcss()],
    build: {
      outDir: `${root}/.vite/renderer/${name}`,
      rollupOptions: {
        input: `${root}/src/renderer/${name}/index.html`,
      },
    },
  }
})
