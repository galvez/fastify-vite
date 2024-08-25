const { existsSync } = require('node:fs')
const { isAbsolute, dirname, resolve } = require('node:path')
const { ensure, remove, write, read } = require("./ioutils")

/**
 * This is the Vite plugin, not the Fastify plugin.
 * 
 * Writes the vite.config properties used by fastify-vite to a JSON file so production builds can
 * be loaded without importing vite nor the actual vite.config file. This allows vite to remain a
 * devDependency and not need to exist on production Docker images.
 *
 * @param {object} [options]
 * @param {string} [options.distDir] - The directory to create the JSON file into. 
 *   Must match the `vitePluginDistDir` provided to FastifyVite when registering the plugin onto a 
 *   Fastify server. Defaults to 'dist', relative to the location of the vite.config file.
 * @returns 
 */
function viteFastify({ distDir = 'dist' } = {}) {
  let configToWrite = {}
  let jsonFilePath
  let resolvedConfig = {}

  return {
    name: 'vite-fastify',
    async configResolved(config = {}) {
      const { base, build, root } = config
      const { assetsDir, outDir, ssr } = build || {}

      resolvedConfig = config

      if (!isAbsolute(distDir)) {
        distDir = resolve(dirname(config.configFile), 'dist')
      }

      jsonFilePath = resolve(distDir, 'vite.config.dist.json')

      configToWrite = {
        base,
        root,
        build: { assetsDir },
        // Special key that does not exist on Vite's ResolvedConfig type
        // for properties that only belong to this plugin
        fastify: {},
      }

      // For SSR builds, `vite build` is executed twice: once for client and once for server.
      // We need to merge the two configs and make both `outDir` properties available.
      if (ssr) {
        configToWrite.fastify.serverOutDir = outDir;
      } else {
        configToWrite.fastify.clientOutDir = outDir;
      }

      if (existsSync(jsonFilePath)) {
        const existingJson = JSON.parse(await read(jsonFilePath, 'utf-8'))
        console.log('read existing config file', configToWrite)
        if (existingJson.fastify) {
          configToWrite.fastify = { ...existingJson.fastify, ...configToWrite.fastify }
        }
      }
    },

    // Write the JSON file after the bundle finishes writing to avoid getting deleted by emptyOutDir
    async writeBundle() {
      if (resolvedConfig.isProduction) {
        await ensure(distDir)
        await write(jsonFilePath, JSON.stringify(configToWrite, undefined, 2), 'utf-8')
      } else {
        await remove(jsonFilePath) // dev mode needs the real vite
      }
    }
  }
}

module.exports.viteFastify = viteFastify
