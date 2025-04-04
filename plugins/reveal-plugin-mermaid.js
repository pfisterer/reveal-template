import mermaid from '../../../mermaid/dist/mermaid.esm.min.mjs';

export default {
	id: 'mermaid',
	init: (deck) => {
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
			}
		});

		function handle(el) {
			const mermaids = el.querySelectorAll('pre.mermaid')
			mermaid.run({
				nodes: mermaids,
			});
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
			  }	
			`;
			document.head.appendChild(style);

			//check if url contains print-pdf

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
