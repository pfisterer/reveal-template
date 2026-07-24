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
import FeedbackPlugin from './plugins/reveal-plugin-feedback.js';

// Stylesheets — bundled and minified by Vite into a single hashed CSS file;
// font url()s inside them are hashed automatically. Specifiers must match the
// packages' exports maps (reveal.js v6 exports './reveal.css'; zenburn.css is
// not exported, so a vendored copy lives in css/).
import 'reveal.js/reveal.css';
import './css/zenburn.css';
import 'asciinema-player/dist/bundle/asciinema-player.css';
import 'reveal.js-simplemenu/plugin/simplemenu/simplemenu.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './css/dhbw.css';
import './plugins/chalkboard/style.css';

// Print stylesheet is attached only on print pages -> keep as a URL asset
import printStylesheetUrl from './css/dhbw-print.css?url';

// Chalkboard: vendored classic script (strict mode, publishes
// window.RevealChalkboard as a side effect of this import).
import './plugins/chalkboard/plugin.js';

// Reveal core + bundled reveal plugins. Loaded via dynamic import() with
// literal specifiers so Vite code-splits them into hashed chunks that load
// in parallel.
function loadRevealAndPlugins() {
	return Promise.all([
		import('reveal.js'), // must be first
		import('reveal.js/plugin/markdown'),
		import('reveal.js/plugin/highlight'),
		import('reveal.js/plugin/search'),
		import('reveal.js/plugin/notes'),
		import('reveal.js/plugin/math'),
		import('reveal.js/plugin/zoom')
	])
}

// Third-party ESM deps. `plugins` entries register with Reveal directly;
// `deps` are libraries injected into the Dennis-plugin factories.
async function loadEsmDeps(isPrint) {
	const [qrCreator, fflate, asciinemaPlayer, revealMermaid, simplemenu] = await Promise.all([
		import('qr-creator/dist/qr-creator.es6.min.js'),
		import('fflate'),
		import('asciinema-player'),
		import('reveal.js-mermaid-plugin/plugin/mermaid/mermaid.esm.js'),
		import('reveal.js-simplemenu/plugin/simplemenu/simplemenu.esm.js')
	])
	return {
		deps: { qrCreator, fflate, asciinemaPlayer },
		// The menu bar is pointless in the PDF and simplemenu trips over the
		// restructured DOM of Reveal's print view -> skip it there.
		plugins: isPrint ? [revealMermaid.default] : [revealMermaid.default, simplemenu.default]
	}
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
		// Ganz feines Gitter auf schwarzem Grund: dünne (1px), sehr dezente Linien.
		grid: { color: 'rgba(255,255,255,0.06)', distance: 50, width: 1 },
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
		// CSS is bundled via the import above; without this, simplemenu tries to
		// load simplemenu.css relative to its (hashed) script URL and its init
		// promise never resolves on the resulting 404 -> Reveal never gets ready.
		csspath: false,
		barhtml: {
			header: "",
			footer: "<div class='menubar bottom'><ul class='menu'></ul></div>"
		}
	},
	keyboard: {
		33: function () { Reveal.left(); }, // Don't go up using the presenter
		34: function () { Reveal.right(); }, // Don't go down using the presenter
		65  /* a */: function () { window.location.hash = "#/agenda" }, //Go to the agenda
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
			primaryTextColor: '#ffffff',
			// block/flowchart node labels derive from nodeTextColor; set it
			// explicitly so block-beta diagrams get white-on-red like flowcharts
			nodeTextColor: '#ffffff',
			noteBkgColor: '#ededeb',
			fontFamily: 'arial',
			lineColor: '#5c6971',
			primaryBorderColor: '#5c6971',
			secondaryColor: '#5c6971',
			secondaryTextColor: '#000',
			tertiaryColor: '#e8e8e8',
			loopTextColor: '#4a4a4a',
			// timeline / journey color scale (DHBW red + grey, alternating)
			cScale0: '#e2001a', cScaleLabel0: '#ffffff',
			cScale1: '#5c6971', cScaleLabel1: '#ffffff',
			cScale2: '#e2001a', cScaleLabel2: '#ffffff',
			cScale3: '#5c6971', cScaleLabel3: '#ffffff',
			cScale4: '#e2001a', cScaleLabel4: '#ffffff',
			cScale5: '#5c6971', cScaleLabel5: '#ffffff'
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
		},
		block: {
			useMaxWidth: true,
			padding: 8
		}
	},

	// Leave here
	plugins: []
}

// Resolve when window has finished loading
function windowOnLoadPromise() {
	if (document.readyState === 'complete') return Promise.resolve()
	return new Promise(resolve => window.addEventListener('load', () => resolve()))
}

// Shallow-recursive merge for plain-object config overrides
function deepMerge(base, override) {
	const out = Object.assign({}, base)
	for (const [key, value] of Object.entries(override || {})) {
		out[key] = (value && value.constructor === Object && base[key] && base[key].constructor === Object)
			? deepMerge(base[key], value)
			: value
	}
	return out
}

// Reload the page when the OIDC session has expired while the tab was in the
// background ("reopened the tab next morning"). The initial page load itself
// is a top-level navigation, so the auth proxy handles that via redirect.
function installSessionProbe() {
	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState !== 'visible') return
		fetch('toc.json', { method: 'HEAD', cache: 'no-store', credentials: 'include' })
			.then(res => { if (res.status === 401) window.location.reload() })
			.catch(() => { })
	})
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
		QuickNavPlugin,
		FeedbackPlugin
	]
}

// Entry point for pages generated by dennis_build. Reads the per-deck config
// (view, deck metadata, lecture info) embedded by the build step and merges it
// with the lecture's deck.config.js export (`opts`).
export function initRevealFromPage(opts = {}) {
	const configEl = document.getElementById('farberg-deck-config')
	const pageConfig = configEl ? JSON.parse(configEl.textContent) : {}
	const isPrint = pageConfig.view === 'print' || /print-pdf/gi.test(window.location.search)

	if (isPrint) {
		const link = document.createElement('link')
		link.rel = 'stylesheet'
		link.href = printStylesheetUrl
		document.head.appendChild(link)
	}

	return Promise.all([
		loadRevealAndPlugins(),
		loadEsmDeps(isPrint),
		windowOnLoadPromise()
	]).then(([revealModules, { deps, plugins: esmPlugins }]) => {
		// First entry from reveal modules is Reveal itself
		const modules = revealModules.map(m => m.default)
		const Reveal = modules.shift()

		// Make it globally available (keyboard handlers etc. rely on it)
		window.Reveal = Reveal

		const finalOptions = Object.assign({}, defaultRevealOptions, opts.revealOptions)

		// Top-level `mermaid` in deck.config.js deep-merges into the defaults
		if (opts.mermaid)
			finalOptions.mermaid = deepMerge(defaultRevealOptions.mermaid, opts.mermaid)

		if (isPrint)
			finalOptions.view = 'print'

		// Deck/lecture metadata embedded at build time, consumed by show-title,
		// show-qr-code and feedback (no runtime package.json fetch anymore).
		finalOptions.farberg_reveal_template = Object.assign(
			{},
			finalOptions.farberg_reveal_template,
			{ info: pageConfig.info, deck: pageConfig.deck }
		)

		//Add plugins
		finalOptions.plugins = [
			...modules,
			...buildDennisPlugins(deps),
			...esmPlugins,
			...(finalOptions.plugins || []),
			window.RevealChalkboard
		]

		if (opts.verbose)
			console.log("Invoking Reveal.initialize with options: ", finalOptions)

		installSessionProbe()

		return Reveal.initialize(finalOptions)
	}).catch(error => {
		console.error("Unable to load dependencies: ", error)
	})
}
