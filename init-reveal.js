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

function loadRevealAndPlugins(revealPath) {
	const imports = ["dist/reveal.esm.js" /*must be the first one*/, "plugin/markdown/markdown.esm.js", "plugin/highlight/highlight.esm.js", "plugin/search/search.esm.js", "plugin/notes/notes.esm.js", "plugin/math/math.esm.js", "plugin/zoom/zoom.esm.js"]

	return Promise.all(imports.map(i => import(revealPath + "/" + i)))
}

function windowOnLoadPromise() {
	return new Promise((resolve, reject) => {
		window.addEventListener('load', () => resolve())
	})
}

export function initReveal(indexDocument, options, extraPlugins, slidesDestinationElement, revealPath) {
	//Wait until window is loaded and reveal imports have loaded
	Promise.all([loadRevealAndPlugins(revealPath || "../../reveal.js/"), windowOnLoadPromise()])
		.catch(error => {
			console.error("Unable to load dependencies: ", error);
		})
		.then(values => {
			//Get the first element from the array, this is the Reveal module
			const modules = values[0].map(m => m.default)
			const Reveal = modules.shift();

			const decoded = decodeURI(window.location.search);
			const match = decoded.match(/\?([\w\s-]+.md)/);

			if (match && match[1]) {
				indexDocument = match[1];
			} else {
				window.location.href = '?' + indexDocument + window.location.hash;
			}

			// Create a section to load the markdown contents
			const mdel = document.createElement("section");
			mdel.setAttribute("data-markdown", indexDocument)
			mdel.setAttribute("data-separator", "^---")
			mdel.setAttribute("data-separator-vertical", "^vvv")
			mdel.setAttribute("data-charset", "utf-8")

			const slidesEl = slidesDestinationElement || document.querySelector("body div.reveal div.slides")
			slidesEl.appendChild(mdel)

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
					/* Built-in: */ ...modules,
					/*Dennis' plugins: */ ShowCodeSnippets, ShowToc, ShowAttribution, ShowQrCode, ShowTitle, ModifyFontSize, ShowHTMLExample, ToggleSolutionsPlugin,
					/* Extra ones */ ...(extraPlugins || [])
				],

			}, options));
		})

}
