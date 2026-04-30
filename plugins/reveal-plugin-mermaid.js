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
			'fontSize': 13,
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
				'padding': 6
			}
		});

		function fixSvgScaling(el) {
			el.querySelectorAll('.mermaid svg').forEach(svg => {
				// Ensure viewBox so width:100% scales content proportionally
				if (!svg.getAttribute('viewBox')) {
					const w = parseFloat(svg.getAttribute('width'));
					const h = parseFloat(svg.getAttribute('height'));
					if (w && h) svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
				}
				svg.setAttribute('width', '100%');
				svg.removeAttribute('height');
				svg.style.maxWidth = '100%';
				svg.style.width = '100%';
				svg.style.height = 'auto';

				// mermaid v11 measures text before the document font is loaded,
				// producing foreignObjects that are too narrow for the actual rendered text.
				// Measure the real content width and expand each foreignObject to fit,
				// then shift the label group by half the difference to keep it centered.
				svg.querySelectorAll('foreignObject').forEach(fo => {
					fo.setAttribute('overflow', 'visible');
					const inner = fo.firstElementChild;
					if (!inner) return;
					const actualWidth = inner.scrollWidth;
					const foWidth = parseFloat(fo.getAttribute('width')) || 0;
					if (actualWidth > foWidth) {
						const extra = actualWidth - foWidth;
						fo.setAttribute('width', actualWidth);
						const labelG = fo.parentElement;
						if (labelG && labelG.hasAttribute('transform')) {
							const m = labelG.getAttribute('transform')
								.match(/translate\((-?[\d.]+),\s*(-?[\d.]+)\)/);
							if (m) {
								labelG.setAttribute('transform',
									`translate(${parseFloat(m[1]) - extra / 2}, ${m[2]})`);
							}
						}
					}
				});
			});
		}

		async function handle(el) {
			// Convert ```mermaid code blocks to .mermaid elements.
			// highlight.js runs first: adds <span> tags and encodes --> as &gt;.
			// textContent strips spans and decodes HTML entities back to raw mermaid source.
			el.querySelectorAll('code.mermaid').forEach(code => {
				const oldPre = code.parentElement;
				if (oldPre.classList.contains('mermaid')) return;
				const newPre = document.createElement('pre');
				newPre.className = 'mermaid';
				newPre.textContent = code.textContent;
				oldPre.replaceWith(newPre);
			});

			// Yield so DOM mutations are flushed before mermaid reads them
			await new Promise(resolve => requestAnimationFrame(resolve));

			// Skip elements already rendered (contain an SVG)
			const unrendered = [...el.querySelectorAll('.mermaid')].filter(
				node => !node.querySelector('svg') && node.textContent.trim().length > 0
			);
			if (unrendered.length === 0) return;

			await mermaid.run({ nodes: unrendered, suppressErrors: true });
			fixSvgScaling(el);
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
			  .mermaid svg {
				max-width: 100%;
				height: auto;
			  }
			  .mermaid svg foreignObject {
				overflow: visible;
			  }
			  .mermaid svg foreignObject * {
				font-size: 13px !important;
				font-family: arial, sans-serif !important;
				line-height: 1.5 !important;
			  }
			`;
			document.head.appendChild(style);

			const print = window.location.search.match(/print-pdf/gi);
			if (print) {
				console.log("print-pdf detected, rendering mermaid diagrams");
				handle(document);
			} else {
				deck.addEventListener('slidechanged', e => handle(e.currentSlide));
				handle(event.currentSlide);
			}
		});
	}
}
