function showToc(url, el) {
	fetch(url)
		.then(res => res.text())
		.then(html => el.innerHTML = html)
		.catch(el.innerText = `Unable to load TOC from ${url}`)
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