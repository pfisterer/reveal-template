// Dennis' plugins
import ShowCodeSnippets from './plugins/reveal-plugin-show-code-snippets.js';
import ShowAttribution from './plugins/reveal-plugin-show-attribution.js';
import ShowToc from './plugins/reveal-plugin-show-toc.js';
import ShowQrCode from './plugins/reveal-plugin-show-qr-code.js';
import ShowTitle from './plugins/reveal-plugin-show-title.js';
import ModifyFontSize from './plugins/reveal-plugin-modify-font-size.js';
import ShowHTMLExample from './plugins/reveal-plugin-html-example.js';
import ToggleSolutionsPlugin from './plugins/reveal-plugin-toggle-solutions.js';
import DirTreePlugin from './plugins/reveal-plugin-dir-tree.js';
import PrefixUrlPlugin from './plugins/reveal-plugin-prefix-with-base-url.js';
import AsciinemaPlugin from './plugins/reveal-plugin-asciinema.js';
import QuickNavPlugin from './plugins/reveal-plugin-quick-nav.js';

// All third-party paths below are written as bare-package specifiers
// (e.g. "reveal.js/dist/reveal.mjs"). At runtime they are resolved to
// `${basePath}node_modules/${pkgPath}`. When migrating to a bundler
// (Vite, etc.), these same strings can be used directly as import
// specifiers — drop the toUrl() prefixing and they Just Work.

const revealEsmModules = [
	'reveal.js/dist/reveal.mjs', // must be first
	'reveal.js/dist/plugin/markdown.mjs',
	'reveal.js/dist/plugin/highlight.mjs',
	'reveal.js/dist/plugin/search.mjs',
	'reveal.js/dist/plugin/notes.mjs',
	'reveal.js/dist/plugin/math.mjs',
	'reveal.js/dist/plugin/zoom.mjs'
]

// Third-party ESM deps loaded dynamically via import(). Awaited in parallel.
// `isPlugin: true` means the module's default export is a Reveal plugin and
// gets registered automatically; otherwise it's a library injected into a
// Dennis-plugin factory (see buildDennisPlugins).
const esmDeps = {
	qrCreator: { path: 'qr-creator/dist/qr-creator.es6.min.js' },
	fflate: { path: 'fflate/esm/browser.js' },
	asciinemaPlayer: { path: 'asciinema-player/dist/index.js' },
	revealMermaid: { path: 'reveal.js-mermaid-plugin/plugin/mermaid/mermaid.esm.js', isPlugin: true },
	simplemenu: { path: 'reveal.js-simplemenu/plugin/simplemenu/simplemenu.esm.js', isPlugin: true }
}

// Classic-script deps that publish themselves on `window` and have no ESM build.
// These are awaited via the script `load` event so their globals are defined
// before Reveal.initialize is called.
const externalJsLibs = [
	'reveal.js-plugins/customcontrols/plugin.js', // → window.RevealCustomControls
	'reveal.js-plugins/chalkboard/plugin.js'      // → window.RevealChalkboard
]

const extraStylesheets = [
	{ href: 'reveal.js/dist/reveal.css' },
	{ href: 'reveal.js/dist/plugin/highlight/zenburn.css' },
	{ href: 'asciinema-player/dist/bundle/asciinema-player.css' },
	{ href: 'reveal.js-plugins/customcontrols/style.css' },
	{ href: 'reveal.js-plugins/chalkboard/style.css' },
	{ href: '@fortawesome/fontawesome-free/css/all.min.css' }
]

// Package-owned assets (theme + print CSS) live inside this package, NOT under
// node_modules. They're always co-located with init-reveal.js — in local dev
// that's the repo root, in an npm install it's node_modules/@farberg/reveal-template/.
// Resolving against import.meta.url handles both cases identically and is the
// standard bundler-friendly pattern for package assets.
const defaultThemeCss = [
	{ href: new URL('./css/dhbw.css', import.meta.url).href, id: 'theme' }
]

const printStylesheet = new URL('./css/dhbw-print.css', import.meta.url).href

const defaultOptions = {
	revealOptions: {},
	// Path prefix to the directory containing node_modules/, relative to the HTML.
	// Examples: "" (HTML next to node_modules), "../" (HTML one level down).
	basePath: "",
	// Theme stylesheets. Defaults to this package's dhbw.css (resolved against
	// import.meta.url so it works in both local-dev and npm-install layouts).
	// Override with absolute or document-relative URLs to swap themes.
	themeCss: defaultThemeCss,
	slidesDestinationElement: document.querySelector("body div.reveal div.slides"),
	indexDocument: "00 - Introduction.md",
	verbose: false
}

const defaultRevealOptions = {
	embedded: false,
	// Display controls in the bottom right corner
	controls: false,
	// Display a presentation progress bar
	progress: true,
	// Display the page number of the current slide
	slideNumber: "c/t",
	// Push each slide change to the browser history
	history: true,
	// none/fade/slide/convex/concave/zoom
	transition: 'slide',
	// Transition speed // default/fast/slow
	transitionSpeed: 'default',
	// Vertical centering of slides
	center: false,
	//Markdown config
	markdown: {
		smartypants: true,
	},
	// Disable automatic hljs; show-code-snippets calls hljs manually per element
	highlight: {
		highlightOnLoad: false
	},
	chalkboard: {
		boardmarkerWidth: 2,
		chalkWidth: 3,
		chalkEffect: 0.4,
		theme: "chalkboard", // or "whiteboard"
		grid: { color: 'rgb(50,50,10,0.5)', distance: 100, width: 3 },
		boardmarkers: [
			{ color: 'rgba(225, 2, 23, 1)' },
			{ color: 'rgba(100,100,100,1)' },
		],
		chalks: [
			{ color: 'rgba(225, 2, 23, 0.6)' },
			{ color: 'rgba(100,100,100,0.6)' },
		]
	},
	simplemenu: {
		flat: true,
		barhtml: {
			header: "",
			footer: "<div class='menubar bottom'><ul class='menu'></ul></div>"
		}
	},
	keyboard: {
		33: function () { Reveal.left(); }, // Don't go up using the presenter
		34: function () { Reveal.right(); }, // Don't go down using the presenter
		65  /* a */: function () { window.location.assign("./#/agenda") }, //Go to the agenda
	},
	// Bounds for smallest/largest possible scale to apply to content
	minScale: 0.1,
	maxScale: 3,

	// Factor of the display size that should remain empty around the content
	margin: 0.05,

	// reveal.js-mermaid-plugin config (passed to mermaid.initialize)
	mermaid: {
		theme: 'base',
		fontSize: 13,
		themeVariables: {
			textColor: '#000',
			primaryColor: '#e2001a',
			primaryTextColor: '#ffff',
			noteBkgColor: '#ededeb',
			fontFamily: 'arial',
			lineColor: '#5c6971',
			primaryBorderColor: '#5c6971',
			secondaryColor: '#5c6971',
			secondaryTextColor: '#000',
			tertiaryColor: '#e8e8e8',
			loopTextColor: '#4a4a4a'
		},
		sequence: {
			mirrorActors: false,
			useMaxWidth: true,
			boxMargin: 15,
			actorMargin: 60,
			messageMargin: 45,
			noteMargin: 15
		},
		flowchart: {
			useMaxWidth: true,
			htmlLabels: true,
			curve: 'basis',
			padding: 20,
			nodeSpacing: 70,
			rankSpacing: 90,
			subGraphTitleMargin: { top: 8, bottom: 8 }
		}
	},

	// Leave here
	plugins: []
}

// Resolve a bare-package path against the configured basePath, and
// absolutize against document.baseURI so the result works identically
// for DOM tag URLs (resolved vs document) and dynamic import()
// (resolved vs the importing module URL).
function toUrl(basePath, pkgPath) {
	return new URL(`${basePath}node_modules/${pkgPath}`, document.baseURI).href
}

async function addPrintStylesheetIfUrlContainsPrintPdf(options) {
	if (!window.location.search.match(/print-pdf/gi)) return

	console.log("Print version requested")
	const link = document.createElement('link')
	link.rel = 'stylesheet'
	link.type = 'text/css'
	link.href = printStylesheet
	document.head.appendChild(link)
}

// Resolve when window has finished loading
function windowOnLoadPromise() {
	return new Promise(resolve => window.addEventListener('load', () => resolve()))
}

// Load reveal core + bundled plugins
function loadRevealAndPlugins(options) {
	if (options.verbose)
		console.log("Importing reveal modules: ", revealEsmModules)

	return Promise.all(revealEsmModules.map(p => import(toUrl(options.basePath, p))))
}

// Dynamically import each third-party ESM dep. Returns an object keyed by the
// same names as `esmDeps`, mapped to the imported module namespace.
// Dynamically import each esmDep in parallel. Returns:
//   { deps: { [name]: module }, plugins: [defaultExports of isPlugin entries] }
async function loadEsmDeps(options) {
	const loaded = await Promise.all(
		Object.entries(esmDeps).map(async ([key, meta]) => {
			const mod = await import(toUrl(options.basePath, meta.path))
			return { key, mod, meta }
		})
	)
	return {
		deps: Object.fromEntries(loaded.map(({ key, mod }) => [key, mod])),
		plugins: loaded.filter(({ meta }) => meta.isPlugin).map(({ mod }) => mod.default)
	}
}

// Inject classic <script> tags and await each one's load event so dependent
// globals (window.RevealChalkboard, etc.) are defined before Reveal init.
function addJsDependencies(options) {
	return Promise.all(externalJsLibs.map(pkgPath => new Promise((resolve, reject) => {
		const script = document.createElement('script')
		script.src = toUrl(options.basePath, pkgPath)
		script.onload = () => resolve()
		script.onerror = () => reject(new Error(`Failed to load ${script.src}`))
		document.head.appendChild(script)
	})))
}

// Add <link rel="stylesheet"> tags for each CSS file
function addCssDependencies(options) {
	function addCssElement(href, id) {
		const cssEl = document.createElement('link')
		cssEl.rel = "stylesheet"
		cssEl.href = href
		if (id) cssEl.id = id
		document.head.appendChild(cssEl)
	}

	for (const css of extraStylesheets)
		addCssElement(toUrl(options.basePath, css.href), css.id)

	// Theme CSS hrefs are used as-is. Defaults are absolute URLs (resolved via
	// import.meta.url so they work in both local-dev and npm-install layouts).
	// User overrides pass document-relative or absolute URLs directly.
	for (const css of options.themeCss)
		addCssElement(css.href, css.id)
}

function getDocumentToLoadOrRedirectToIndexDocument(options) {
	const decoded = decodeURI(window.location.search);
	const match = decoded.match(/\?([\w\s-]+.md)/);

	//Url matches and contains a document to load
	if (match && match[1]) {
		const doc = match[1];
		return doc;
	}

	// URL pattern does not match, redirect to index document
	window.location.href = '?' + options.indexDocument + window.location.hash;
}

function addMarkdownSectionToPresentation(doc, options) {
	// Create a section to load the markdown contents
	const mdel = document.createElement("section");
	mdel.setAttribute("data-markdown", doc)
	mdel.setAttribute("data-separator", "^---")
	mdel.setAttribute("data-separator-vertical", "^vvv")
	mdel.setAttribute("data-charset", "utf-8")

	options.slidesDestinationElement.appendChild(mdel)
}

// Build the Dennis-plugins array, injecting ESM deps into the factories that
// need them. Plugins that take no deps stay as static factory imports.
function buildDennisPlugins(deps) {
	return [
		ShowCodeSnippets,
		ShowToc,
		ShowAttribution,
		ShowQrCode(deps.qrCreator.default),
		ShowTitle,
		ModifyFontSize,
		ShowHTMLExample,
		ToggleSolutionsPlugin,
		DirTreePlugin(deps.fflate),
		PrefixUrlPlugin,
		AsciinemaPlugin(deps.asciinemaPlayer.create),
		QuickNavPlugin
	]
}

export function initReveal(opts) {
	// Generate options and include defaults (later sources' properties overwrite earlier ones)
	const options = Object.assign({}, defaultOptions, opts)

	// Load dependencies and then initialize Reveal
	Promise.all([
		loadRevealAndPlugins(options),
		loadEsmDeps(options),
		addJsDependencies(options),
		addCssDependencies(options),
		addPrintStylesheetIfUrlContainsPrintPdf(options),
		windowOnLoadPromise()
	]).then(async values => {
		const [revealModules, { deps, plugins: esmPlugins }] = values

		// First entry from reveal modules is Reveal itself
		const modules = revealModules.map(m => m.default)
		const Reveal = modules.shift()

		// Make it globally available
		window.Reveal = Reveal

		// Add markdown doc to presentation
		const doc = getDocumentToLoadOrRedirectToIndexDocument(options)

		if (doc) {
			addMarkdownSectionToPresentation(doc, options);

			//Initialize Reveal
			const finalOptions = Object.assign(defaultRevealOptions, options.revealOptions);

			//Add plugins
			finalOptions.plugins = [
				...modules,
				...buildDennisPlugins(deps),
				...esmPlugins,
				...finalOptions.plugins,
				window.RevealChalkboard,
				window.RevealCustomControls
			]

			if (options.verbose)
				console.log("Invoking Reveal.initialize with options: ", finalOptions)

			Reveal.initialize(finalOptions);
		} else {
			console.error("No document to load, aborting");
		}

	}).catch(error => {
		console.error("Unable to load dependencies: ", error);
	})
}
