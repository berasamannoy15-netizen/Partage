import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'
import path from 'path'

// ─── Local Photos Folder Watcher Plugin ─────────────────────────────────────
// Watches the /photos folder in the project root.
// GET /api/local-photos  →  returns JSON array of { url, name, size, mtime }
// Files placed in /photos/ automatically appear in the website feed.
function localPhotosPlugin() {
  const PHOTOS_DIR = path.resolve(process.cwd(), 'photos')
  const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.bmp'])

  if (!fs.existsSync(PHOTOS_DIR)) {
    fs.mkdirSync(PHOTOS_DIR, { recursive: true })
    console.log('\n📁  Created local photos folder → photos/')
    console.log('    Drop any image files there and they will appear on the site!\n')
  }

  return {
    name: 'local-photos-watcher',
    configureServer(server) {
      // Serve raw image files at /photos/<filename>
      server.middlewares.use('/photos', (req, res, next) => {
        const filePath = path.join(PHOTOS_DIR, decodeURIComponent(req.url || '/'))
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const ext = path.extname(filePath).toLowerCase()
          const mimeMap = {
            '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
            '.png': 'image/png',  '.gif': 'image/gif',
            '.webp': 'image/webp', '.avif': 'image/avif',
            '.bmp': 'image/bmp'
          }
          res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream')
          res.setHeader('Cache-Control', 'no-cache')
          fs.createReadStream(filePath).pipe(res)
        } else {
          next()
        }
      })

      // API: GET /api/local-photos → JSON list of image files
      server.middlewares.use('/api/local-photos', (_req, res) => {
        try {
          const files = fs.existsSync(PHOTOS_DIR)
            ? fs.readdirSync(PHOTOS_DIR).filter(f => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
            : []

          const photos = files.map(filename => {
            const stat = fs.statSync(path.join(PHOTOS_DIR, filename))
            return {
              url: `/photos/${encodeURIComponent(filename)}`,
              name: path.basename(filename, path.extname(filename)),
              filename,
              size: stat.size,
              mtime: stat.mtimeMs
            }
          }).sort((a, b) => b.mtime - a.mtime)

          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Cache-Control', 'no-cache')
          res.end(JSON.stringify(photos))
        } catch (err) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: String(err) }))
        }
      })
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    localPhotosPlugin(),
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
  }
})

