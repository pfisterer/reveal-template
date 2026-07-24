#!/usr/bin/env node

// Serves a built dist/ folder with prod-like extensionless URLs
// (/02a-foo -> 02a-foo.html). Used by CI for Gotenberg PDF rendering
// and handy for local previews.
//
// Usage: serve_dist.js [dir] [--port N]     (defaults: ./dist, port 8347)

const connect = require('connect')
const serveStatic = require('serve-static')
const path = require('path')

const args = process.argv.slice(2)
const portIdx = args.indexOf('--port')
const port = portIdx >= 0 ? parseInt(args[portIdx + 1], 10) : 8347
const dirArg = args.filter((a, i) => a !== '--port' && i !== portIdx + 1)[0]
const dir = path.resolve(dirArg || 'dist')

const app = connect()
app.use(serveStatic(dir, { extensions: ['html'], cacheControl: false }))
app.listen(port, '0.0.0.0', () => console.log(`Serving ${dir} on http://0.0.0.0:${port}`))
