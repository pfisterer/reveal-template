// When installed as an npm package the plugin lives at node_modules/@farberg/reveal-template/plugins/
// and mermaid is 3 levels up. When running from the template root directly it is 1 level up.
const mermaidUrl = new URL(
	new URL(import.meta.url).pathname.includes('/node_modules/')
		? '../../../mermaid/dist/mermaid.esm.min.mjs'
		: '../node_modules/mermaid/dist/mermaid.esm.min.mjs',
	import.meta.url
).href;

export default {
	id: 'mermaid',
	init: async (deck) => {
		const { default: mermaid } = await import(mermaidUrl);
		mermaid.initialize({
			'startOnLoad': false,
			'theme': 'base',
			'themeVariables': {
				'textColor': '#000',
				'primaryColor': '#e2001a',
				'primaryTextColor': '#ffff',
				'noteBkgColor': '#ededeb',
				'fontFamily': 'arial',
				'lineColor': '#5c6971',
				'primaryBorderColor': '#5c6971',
				'secondaryColor': '#5c6971',
				'secondaryTextColor': '#000'
			},
			'sequence': {
				'mirrorActors': false,
				'useMaxWidth': true
			},
			'flowchart': {
				'useMaxWidth': true,
				'htmlLabels': true
			}
		});

		function fixSvgScaling(el) {
			el.querySelectorAll('pre.mermaid svg').forEach(svg => {
				// mermaid v10+ sets style="max-width: Xpx" which constrains width —
				// remove it and let the container CSS drive the size instead
				svg.style.maxWidth = '100%';
				svg.style.width = '100%';
				svg.style.height = 'auto';
			});
		}

		function handle(el) {
			// Convert ```mermaid code blocks into pre.mermaid elements.
			// highlight.js processes them first (adding spans, encoding arrows as &gt;),
			// so we read textContent to strip spans and decode HTML entities back to raw source.
			el.querySelectorAll('code.mermaid').forEach(code => {
				if (code.closest('pre.mermaid')) return; // already converted
				const pre = code.parentElement;
				pre.className = 'mermaid';
				pre.textContent = code.textContent;
			});

			const mermaids = el.querySelectorAll('pre.mermaid');
			const result = mermaid.run({ nodes: mermaids });
			if (result && typeof result.then === 'function') {
				result.then(() => fixSvgScaling(el));
			} else {
				setTimeout(() => fixSvgScaling(el), 100);
			}
		}

		deck.on('ready', event => {
			const style = document.createElement("style");
			style.innerHTML = `
			  pre.mermaid {
				all: revert;
				padding: 10px;
				border-radius: 10px;
				border: 1px solid #e0e0e0;
				box-shadow: none !important;
				text-align: center;
				overflow: visible;
			  }
			  pre.mermaid svg {
				max-width: 100%;
				height: auto;
			  }
			`;
			document.head.appendChild(style);

			const print = window.location.search.match(/print-pdf/gi);

			if (print) {
				console.log("print-pdf detected, rendering mermaid diagrams")
				handle(document);
			} else {
				deck.addEventListener('slidechanged', e => handle(e.currentSlide));
				handle(event.currentSlide);
			}
		})
	}
}
