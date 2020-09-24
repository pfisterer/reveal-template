// Built-in
import Reveal from '../../reveal.js/dist/reveal.esm.js';
import RevealMarkdown from '../../reveal.js/plugin/markdown/markdown.esm.js';
import RevealHighlight from '../../reveal.js/plugin/highlight/highlight.esm.js';
import RevealSearch from '../../reveal.js/plugin/search/search.esm.js';
import RevealNotes from '../../reveal.js/plugin/notes/notes.esm.js';
import RevealMath from '../../reveal.js/plugin/math/math.esm.js';
import RevealZoom from '../../reveal.js/plugin/zoom/zoom.esm.js';

// Dennis' plugins
import ShowCodeSnippets from './plugins/reveal-plugin-show-code-snippets.js';
import ShowAttribution from './plugins/reveal-plugin-show-attribution.js';
import ShowToc from './plugins/reveal-plugin-show-toc.js';
import ShowQrCode from './plugins/reveal-plugin-show-qr-code.js';
import ShowTitle from './plugins/reveal-plugin-show-title.js';
import ModifyFontSize from './plugins/reveal-plugin-modify-font-size.js';
import ShowHTMLExample from './plugins/reveal-plugin-html-example.js';
import ToggleSolutionsPlugin from './plugins/reveal-plugin-toggle-solutions.js';

// If the query includes 'print-pdf', include the PDF print sheet
if (window.location.search.match(/print-pdf/gi)) {
	console.log("Print version requested");

	const link = document.createElement('link');
	link.rel = 'stylesheet';
	link.type = 'text/css';
	link.href = 'reveal/dhbw-print.css';
	document.getElementsByTagName('head')[0].appendChild(link);
}

export function initReveal(indexDocument, options, extraPlugins) {
	let doc = indexDocument
	let decoded = decodeURI(window.location.search);
	var match = decoded.match(/\?([\w\s-]+.md)/);

	if (match && match[1]) {
		doc = match[1];
	} else {
		window.location.href = '?' + indexDocument + window.location.hash;
	}

	// Create a section to load the markdown contents
	let mdel = document.createElement("section");
	mdel.setAttribute("data-markdown", doc)
	mdel.setAttribute("data-separator", "^---")
	mdel.setAttribute("data-separator-vertical", "^vvv")
	mdel.setAttribute("data-charset", "utf-8")

	let slidesEl = document.querySelector("body div.reveal div.slides")
	slidesEl.appendChild(mdel)

	window.addEventListener('load', (event) => {
		window.Reveal = Reveal
		Reveal.initialize(Object.assign({
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
			plugins: [
			/* Built-in: */ RevealMarkdown, RevealHighlight, RevealSearch, RevealNotes, RevealMath, RevealZoom,
			/*Dennis' plugins: */ ShowCodeSnippets, ShowToc, ShowAttribution, ShowQrCode, ShowTitle, ModifyFontSize, ShowHTMLExample, ToggleSolutionsPlugin,
			/* Extra ones */ ...(extraPlugins || [])
			],

		}, options));
	});

}
