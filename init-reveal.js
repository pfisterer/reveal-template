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
import MermaidPlugin from './plugins/reveal-plugin-mermaid.js';

const defaultOptions = {
	revealOptions: {},
	revealPath: "../../reveal.js/",
	jsPrefixPath: "",
	cssPrefixPath: "",
	cssThemePrefixPath: "node_modules/@farberg/reveal-template/",
	slidesDestinationElement: document.querySelector("body div.reveal div.slides"),
	indexDocument: "00 - Introduction.md",
	verbose: false
}

const externalJsLibs = [
	'node_modules/easyqrcodejs/dist/easy.qrcode.min.js',
	'node_modules/file-saver/dist/FileSaver.min.js',
	'node_modules/jszip/dist/jszip.min.js',
	//'node_modules/reveal.js-plugins/chalkboard/plugin.js',
	'node_modules/asciinema-player/dist/bundle/asciinema-player.min.js'
]

const extraStylesheets = [
	{ href: 'node_modules/reveal.js/dist/reveal.css' },
	{ href: 'node_modules/reveal.js/plugin/highlight/zenburn.css' },
	//{ href: 'node_modules/reveal.js-plugins/chalkboard/style.css' },
	{ href: 'node_modules/asciinema-player/dist/bundle/asciinema-player.css' }
]

const extraThemeCssStylesheets = [
	{ href: 'css/dhbw.css', id: 'theme' }

]

const defaultDennisPlugins = [
	ShowCodeSnippets, ShowToc, ShowAttribution, ShowQrCode, ShowTitle,
	ModifyFontSize, ShowHTMLExample, ToggleSolutionsPlugin, DirTreePlugin,
	PrefixUrlPlugin, AsciinemaPlugin, MermaidPlugin
]

const defaultRevealOptions = {
	embedded: false,
	// Display controls in the bottom right corner
	controls: false,
	// Display a presentation progress bar
	progress: true,
	// Display the page number of the current slide
	slideNumber: true,
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
	// Leave here
	plugins: []
}

async function addPrintStylesheetIfUrlContainsPrintPdf() {
	// If the query includes 'print-pdf', include the PDF print sheet
	if (window.location.search.match(/print-pdf/gi)) {
		console.log("Print version requested");

		const link = document.createElement('link');
		link.rel = 'stylesheet';
		link.type = 'text/css';
		link.href = 'node_modules/@farberg/reveal-template/css/dhbw-print.css';
		document.getElementsByTagName('head')[0].appendChild(link);
	}
}

// Resolve when window has finished loading
function windowOnLoadPromise() {
	return new Promise((resolve, reject) => {
		window.addEventListener('load', () => resolve())
	})
}

// Load reveal and its plugins
function loadRevealAndPlugins(options) {
	const imports = [
		"dist/reveal.esm.js" /*must be the first one*/,
		"plugin/markdown/markdown.esm.js",
		"plugin/highlight/highlight.esm.js",
		"plugin/search/search.esm.js",
		"plugin/notes/notes.esm.js",
		"plugin/math/math.esm.js",
		"plugin/zoom/zoom.esm.js"
	]

	if (options.verbose)
		console.log("Importing the following plugins: ", imports)

	return Promise.all(imports.map(i => import(options.revealPath + "/" + i)))
}

// Add js tags to the header and resolve
async function addJsDependencies(options, externalJsLibs) {
	for (let file of externalJsLibs) {
		const script = document.createElement('script');
		script.src = options.jsPrefixPath + file;
		document.head.appendChild(script);
	}
}

// Add CSSs tags to the header and resolve
async function addCssDependencies(options, cssFiles, themeCssFiles) {
	function addCssElement(href, id) {
		const cssEl = document.createElement('link');
		cssEl.rel = "stylesheet"
		cssEl.href = href
		if (id)
			cssEl.id = id

		document.head.appendChild(cssEl);
	}

	for (let css of cssFiles) {
		addCssElement(options.cssPrefixPath + css.href, css.id)
	}

	for (let css of themeCssFiles) {
		addCssElement(options.cssThemePrefixPath + css.href, css.id)
	}

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

export function initReveal(opts) {
	// Generate options and include defaults (later sources' properties overwrite earlier ones)
	const options = Object.assign({}, defaultOptions, opts)

	// Load dependencies and then initialize Reveal
	Promise.all([
		loadRevealAndPlugins(options),
		addJsDependencies(options, externalJsLibs),
		addCssDependencies(options, extraStylesheets, extraThemeCssStylesheets),
		addPrintStylesheetIfUrlContainsPrintPdf(),
		windowOnLoadPromise()
	]).then(values => {
		//Get the first element from the array, this is the Reveal module
		const modules = values[0].map(m => m.default)
		const Reveal = modules.shift();

		//Make it globally available
		window.Reveal = Reveal

		//Add markdown doc to presentation
		const doc = getDocumentToLoadOrRedirectToIndexDocument(options)

		if (doc) {
			addMarkdownSectionToPresentation(doc, options);

			//Initialize Reveal
			const finalOptions = Object.assign(defaultRevealOptions, options.revealOptions);

			//Add plugins
			finalOptions.plugins = [
				...modules,
				...defaultDennisPlugins,
				//window.RevealChalkboard,
				...finalOptions.plugins
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
