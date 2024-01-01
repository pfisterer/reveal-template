/*
	Loads the table of contents from a file and displays it

	Parameters:

		data-toc-src: Defaults to "generated_toc.html" 
	
	Example:

	## Agenda
	<!-- .slide: id="agenda" -->

	<div data-toc-src="generated_toc.html" style="font-size: 0.82em;" />
 */

function showToc(url, el) {
	fetch(url, { "cache": "no-store" })
		.then(res => res.text())
		.then(html => el.innerHTML = html)
		.catch(e => console.log(`Unable to load TOC from ${url}`, e))
}

export default () => {

	// Integrate functionality similar to https://raw.githubusercontent.com/naamor/reveal.js-tableofcontents/master/tableofcontents.js

	return {
		id: 'show_toc',
		init: (deck) => {

			deck.on('ready', () => {
				let tocElements = deck.getSlidesElement().querySelectorAll('[data-toc-src]')

				for (let tocElement of tocElements) {
					let url = tocElement.getAttribute("data-toc-src")
					showToc(url || "generated_toc.html", tocElement);
				}

			})
		}
	}
}