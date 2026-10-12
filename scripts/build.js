#!/usr/bin/env node

// dennis_build — builds a lecture repo (cwd) into a fully static dist/.
//
// Usage:
//   dennis_build              full build -> dist/
//   dennis_build --watch      full build, then rebuild on *.md / config changes
//   dennis_build --toc-only   rewrite dist/toc.json only (after PDFs were generated)
//   dennis_build dev          Vite dev server with prod-identical routes
//
// Layout of dist/ (flat, pretty URLs without query strings):
//   index.html                       redirect to the first deck (keeps #hash)
//   <slug>.html                      one page per markdown deck, markdown inlined
//   <slug>-print.html                print variant (Reveal view: 'print')
//   assets/                          hashed JS/CSS/fonts (Vite output)
//   toc.json                         machine-readable table of contents
//   img/ code/ data/                 copied as-is (mtimes preserved for rsync)
//   pdfs/                            filled by CI (Gotenberg), referenced in toc.json

const path = require('path')
const fs = require('fs')
const { slugify } = require('./slug')
const { prerenderDeck } = require('./prerender')
const { combined_pdf, pdf_exists_and_is_newer_than_markdown } = require('./helpers')

const cwd = process.cwd()
const stagingDir = path.join(cwd, '.dennis-build')
const distDir = path.join(cwd, 'dist')
const pdfDir = path.join(distDir, 'pdfs')

const structuredNameRegexp = new RegExp('(\\S+)\\s-\\s(.*)')
const subchapterRegexp = new RegExp('([0-9]+)([a-zA-Z]+)')

const SLIDES_PLACEHOLDER = '<!--DENNIS_SLIDES-->'

function readPackageJson() {
	return JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'))
}

function lectureInfo(pkg) {
	return { title: pkg.title, authors: pkg.authors || [], homepage: pkg.homepage }
}

function assetConfig(pkg) {
	const farberg = pkg.farberg || {}
	return {
		assetDirs: farberg.assetDirs || ['img', 'code', 'data'],
		assetExclude: farberg.assetExclude || []
	}
}

// Scan markdown decks in cwd (same filter rules as the old generate_toc.js)
function scanDecks() {
	const files = fs.readdirSync(cwd)
		.filter(f => path.extname(f).toLowerCase() === '.md')
		.filter(f => !path.basename(f, '.md').startsWith('__'))
		.filter(f => path.basename(f, '.md') !== 'README')
		.filter(f => path.basename(f, '.md') !== 'CLAUDE')
		.sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))

	const decks = files.map((file, i) => {
		const basename = path.basename(file, '.md')
		const sn = structuredNameRegexp.exec(basename)
		const sub = sn ? subchapterRegexp.exec(sn[1]) : null
		const slug = slugify(basename)
		return {
			order: i + 1,
			file,
			number: sn ? (sub ? sub[1] : sn[1]) : null,
			sub: sub ? sub[2] : null,
			title: sn ? sn[2] : basename,
			slug,
			path: slug,
			printPath: `${slug}-print`
		}
	})

	// Slug collisions (including a deck slug colliding with another's -print page)
	const seen = new Set()
	for (const d of decks) {
		for (const s of [d.slug, d.printPath]) {
			if (seen.has(s)) {
				console.error(`Error: slug collision on '${s}' (from '${d.file}'). Rename the file.`)
				process.exit(1)
			}
			seen.add(s)
		}
	}
	return decks
}

// JSON safe for embedding in a <script> element
function embeddableJson(obj) {
	return JSON.stringify(obj).replace(/</g, '\\u003c')
}

function deckHtml(template, { deck, info, view }) {
	const deckConfig = {
		view,
		deck: { slug: deck.slug, title: deck.title, number: deck.number, sub: deck.sub },
		info
	}
	return template
		.replace('{{TITLE}}', `${info.title || ''} - ${deck.title}`)
		.replace('{{DECK_CONFIG_JSON}}', embeddableJson(deckConfig))
}

// Prerender every deck's markdown once (shared by presentation + print page).
// Returns Map(slug -> slidesHtml).
async function prerenderDecks(decks, pkg) {
	const markdownConfig = Object.assign({ smartypants: true }, (pkg.farberg || {}).markdown)
	const slides = new Map()
	for (const deck of decks) {
		const md = fs.readFileSync(path.join(cwd, deck.file), 'utf8')
		const { slidesHtml } = await prerenderDeck(md, { file: deck.file, markdownConfig })
		slides.set(deck.slug, slidesHtml)
	}
	return slides
}

// Injects the prerendered slides AFTER Vite's asset scanning (order: 'post'),
// both in build and dev — slide content (img/... refs) must never appear in
// the Vite input pages or Vite would try to resolve/hash those assets.
function injectSlidesPlugin(getState) {
	return {
		name: 'dennis-inject-slides',
		transformIndexHtml: {
			order: 'post',
			handler(html, ctx) {
				const { decks, slides } = getState()
				const page = path.basename(ctx.filename || ctx.path || '', '.html')
				const deck = decks.find(d => d.slug === page || d.printPath === page)
				if (!deck) return html
				const slidesHtml = slides.get(deck.slug)
				if (!slidesHtml) return html
				// function replacement: slide HTML may contain $-sequences
				return html.replace(SLIDES_PLACEHOLDER, () => slidesHtml)
			}
		}
	}
}

function redirectHtml(firstSlug) {
	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="utf-8">
	<script>location.replace('${firstSlug}' + location.hash)</script>
	<meta http-equiv="refresh" content="0; url=${firstSlug}">
</head>
<body><a href="${firstSlug}">Continue to the slides</a></body>
</html>
`
}

// Generate the staging tree (.dennis-build/) that Vite builds from.
// Prerenders all decks; the slides HTML is NOT written into the staging pages
// (see injectSlidesPlugin) — the pages keep the placeholder comment.
async function generateStaging(decks, pkg) {
	const info = lectureInfo(pkg)
	const template = fs.readFileSync(path.join(__dirname, 'deck-template.html'), 'utf8')
	const slides = await prerenderDecks(decks, pkg)

	fs.rmSync(stagingDir, { recursive: true, force: true })
	fs.mkdirSync(stagingDir, { recursive: true })

	for (const deck of decks) {
		fs.writeFileSync(path.join(stagingDir, `${deck.slug}.html`), deckHtml(template, { deck, info, view: 'presentation' }))
		fs.writeFileSync(path.join(stagingDir, `${deck.printPath}.html`), deckHtml(template, { deck, info, view: 'print' }))
	}

	fs.writeFileSync(path.join(stagingDir, 'index.html'), redirectHtml(decks[0].slug))

	// Shared entry: every page loads the same module -> one shared bundle
	const hasDeckConfig = fs.existsSync(path.join(cwd, 'deck.config.js'))
	const deckJs = hasDeckConfig
		? `import { initRevealFromPage } from '@farberg/reveal-template/init-reveal.js'\n` +
		`import config from '../deck.config.js'\n` +
		`initRevealFromPage(config)\n`
		: `import { initRevealFromPage } from '@farberg/reveal-template/init-reveal.js'\n` +
		`initRevealFromPage({})\n`
	fs.writeFileSync(path.join(stagingDir, 'deck.js'), deckJs)

	// toc.json also goes into staging so the dev server can serve it
	fs.writeFileSync(path.join(stagingDir, 'toc.json'), JSON.stringify(buildToc(decks, pkg), null, '\t'))

	return { decks, slides }
}

function buildToc(decks, pkg) {
	const combinedPdfName = combined_pdf(pkg)
	const combinedExists = fs.existsSync(path.join(pdfDir, combinedPdfName))
	return {
		version: 1,
		generated: new Date().toISOString(),
		title: pkg.title,
		combinedPdf: combinedExists ? `pdfs/${combinedPdfName}` : null,
		decks: decks.map(d => ({
			order: d.order,
			file: d.file,
			number: d.number,
			sub: d.sub,
			title: d.title,
			slug: d.slug,
			path: d.path,
			printPath: d.printPath,
			pdf: pdf_exists_and_is_newer_than_markdown(path.join(cwd, d.file), path.join(pdfDir, `${d.slug}.pdf`), false)
				? `pdfs/${d.slug}.pdf`
				: null
		}))
	}
}

function writeTocJson(decks, pkg) {
	fs.writeFileSync(path.join(distDir, 'toc.json'), JSON.stringify(buildToc(decks, pkg), null, '\t'))
}

async function viteBuild(decks, slides) {
	const vite = await import('vite')
	const input = { index: path.join(stagingDir, 'index.html') }
	for (const d of decks) {
		input[d.slug] = path.join(stagingDir, `${d.slug}.html`)
		input[d.printPath] = path.join(stagingDir, `${d.printPath}.html`)
	}
	await vite.build({
		root: stagingDir,
		base: './',
		configFile: false,
		logLevel: 'info',
		plugins: [injectSlidesPlugin(() => ({ decks, slides }))],
		build: {
			outDir: distDir,
			emptyOutDir: true,
			chunkSizeWarningLimit: 4000,
			rollupOptions: { input }
		}
	})

	// Backstop: a page that still carries the placeholder would ship empty
	const leftover = fs.readdirSync(distDir)
		.filter(f => f.endsWith('.html'))
		.filter(f => fs.readFileSync(path.join(distDir, f), 'utf8').includes(SLIDES_PLACEHOLDER))
	if (leftover.length > 0) {
		console.error(`Error: slides placeholder not replaced in: ${leftover.join(', ')}`)
		process.exit(1)
	}
}

// Minify the final HTML pages. Conservative option set: <pre>/<textarea>
// content is preserved by collapseWhitespace, the #farberg-deck-config JSON
// is left untouched (no processScripts), attribute case is kept for inline
// SVG. Comment directives were already consumed by the prerender, so
// removeComments only drops inert author comments.
async function minifyDistHtml() {
	const { minify } = require('html-minifier-terser')
	const options = {
		collapseWhitespace: true,
		// Never REMOVE whitespace, only collapse to a single space: plain
		// collapseWhitespace drops whitespace-only text nodes even next to
		// inline elements, visibly gluing words together ("-f <span>" -> "-f<span>").
		conservativeCollapse: true,
		removeComments: true,
		caseSensitive: true,
		keepClosingSlash: true,
		minifyJS: true,
		minifyCSS: true
	}
	for (const f of fs.readdirSync(distDir).filter(f => f.endsWith('.html'))) {
		const file = path.join(distDir, f)
		fs.writeFileSync(file, await minify(fs.readFileSync(file, 'utf8'), options))
	}
}

// Copy img/, code/, data/ (and .htaccess) into dist/. preserveTimestamps is
// load-bearing: rsync (without -c) only re-uploads what actually changed.
function copyStaticAssets(pkg) {
	const { assetDirs, assetExclude } = assetConfig(pkg)
	const excluded = rel => assetExclude.some(e => rel === e || rel.startsWith(e + '/'))

	for (const dir of assetDirs) {
		const src = path.join(cwd, dir)
		if (!fs.existsSync(src)) continue
		fs.cpSync(src, path.join(distDir, dir), {
			recursive: true,
			preserveTimestamps: true,
			filter: srcPath => {
				const rel = path.relative(cwd, srcPath)
				return !excluded(rel) && !path.basename(srcPath).startsWith('.DS_Store')
			}
		})
	}

	const htaccess = path.join(cwd, '.htaccess')
	if (fs.existsSync(htaccess))
		fs.cpSync(htaccess, path.join(distDir, '.htaccess'), { preserveTimestamps: true })
}

async function fullBuild() {
	const pkg = readPackageJson()
	const decks = scanDecks()
	if (decks.length === 0) {
		console.error('Error: no markdown decks found in ' + cwd)
		process.exit(1)
	}
	console.log(`Building ${decks.length} decks -> ${distDir}`)
	const { slides } = await generateStaging(decks, pkg)
	await viteBuild(decks, slides)
	await minifyDistHtml()
	copyStaticAssets(pkg)
	writeTocJson(decks, pkg)
	console.log('Build done.')
}

function tocOnly() {
	const pkg = readPackageJson()
	const decks = scanDecks()
	if (!fs.existsSync(distDir)) {
		console.error('Error: dist/ does not exist, run a full build first')
		process.exit(1)
	}
	writeTocJson(decks, pkg)
	console.log('toc.json updated.')
}

async function watchMode() {
	await fullBuild()
	console.log('Watching for changes (*.md, deck.config.js, custom-code.js, package.json) ...')
	let timer = null
	const trigger = file => {
		if (!/\.md$|^deck\.config\.js$|^custom-code\.js$|^package\.json$/.test(file || '')) return
		clearTimeout(timer)
		timer = setTimeout(() => {
			console.log(`Change detected (${file}), rebuilding ...`)
			fullBuild().catch(e => console.error(e))
		}, 300)
	}
	fs.watch(cwd, (event, file) => trigger(file))
	// keep the process alive
	process.stdin.resume?.()
}

// Dev-server hooks from package.json, e.g. regenerate SVGs when a PowerPoint source changes:
//   "farberg": { "devHooks": [{ "watch": "^img/[^~].*\\.pptx$", "run": "npm run img" }] }
// "watch" is a regex on the path relative to the repo root. Changes are debounced, a hook never runs twice at the same time (changes during a run trigger one more run), and the browser reloads after each run.
function devHooks(pkg, reload) {
	const { spawn } = require('child_process')
	return ((pkg.farberg || {}).devHooks || []).map(({ watch, run }) => {
		let timer = null, running = false, pending = false
		const start = () => {
			running = true
			pending = false
			console.log(`[devHook] ${run}`)
			spawn(run, { cwd, shell: true, stdio: 'inherit' }).on('exit', code => {
				running = false
				if (code !== 0) console.error(`[devHook] "${run}" exited with ${code}`)
				reload()
				if (pending) start()
			})
		}
		return {
			pattern: new RegExp(watch),
			trigger(rel) {
				console.log(`[devHook] ${rel} changed`)
				clearTimeout(timer)
				timer = setTimeout(() => (running ? (pending = true) : start()), 500)
			}
		}
	})
}

async function devServer() {
	const vite = await import('vite')
	const serveStatic = require('serve-static')

	const pkg = readPackageJson()
	let { decks, slides } = await generateStaging(scanDecks(), pkg)
	let routes = new Set(decks.flatMap(d => [d.slug, d.printPath]))
	const { assetDirs } = assetConfig(pkg)

	const templateRealDir = fs.realpathSync(path.resolve(__dirname, '..'))

	const server = await vite.createServer({
		root: stagingDir,
		base: '/',
		configFile: false,
		appType: 'mpa',
		server: { fs: { allow: [cwd, templateRealDir] } },
		plugins: [injectSlidesPlugin(() => ({ decks, slides })), {
			name: 'dennis-lecture-dev',
			configureServer(server) {
				// Extensionless routes like prod: /02a-foo -> /02a-foo.html
				server.middlewares.use((req, res, next) => {
					const url = (req.url || '').split('?')[0]
					if (routes.has(url.replace(/^\//, ''))) req.url = url + '.html'
					next()
				})
				// Static asset dirs served from the repo root, like in prod
				for (const dir of assetDirs) {
					const src = path.join(cwd, dir)
					if (fs.existsSync(src))
						server.middlewares.use('/' + dir, serveStatic(src))
				}
			}
		}]
	})

	const hooks = devHooks(pkg, () => server.ws.send({ type: 'full-reload' }))

	// Regenerate staging on markdown/config changes, then full-reload
	server.watcher.add(cwd)
	server.watcher.on('all', (event, file) => {
		const rel = path.relative(cwd, file)
		if (rel.startsWith('.dennis-build') || rel.startsWith('dist') || rel.startsWith('node_modules')) return
		for (const hook of hooks) if (hook.pattern.test(rel)) hook.trigger(rel)
		if (!/\.md$|^deck\.config\.js$|^custom-code\.js$|^package\.json$/.test(rel)) return
		generateStaging(scanDecks(), readPackageJson()).then(result => {
			decks = result.decks
			slides = result.slides
			routes = new Set(decks.flatMap(d => [d.slug, d.printPath]))
			server.ws.send({ type: 'full-reload' })
			console.log(`Regenerated after change in ${rel}`)
		}).catch(e => console.error(e))
	})

	await server.listen()
	server.printUrls()
}

const args = process.argv.slice(2)
if (args.includes('--toc-only')) tocOnly()
else if (args.includes('--watch')) watchMode().catch(e => { console.error(e); process.exit(1) })
else if (args.includes('dev')) devServer().catch(e => { console.error(e); process.exit(1) })
else fullBuild().catch(e => { console.error(e); process.exit(1) })
