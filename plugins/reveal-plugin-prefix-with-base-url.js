/*
Prefixes the pages base URL to an element's inner Text

Parameters:
- data-convert-to-inline-code="language": Converts the element to an inline code element.

Example:

<span data-prefix-url data-convert-to-inline-code="bash">code/k8s-simple/pod-demo-busybox.yaml</span>
*/

const dir_tree = {
	id: 'prefix_url',
	init: (deck) => {

		deck.on('ready', () => {
			for (let el of deck.getRevealElement().querySelectorAll("[data-prefix-url]")) {
				const convertToInlineCode = el.getAttribute('data-convert-to-inline-code')
				const attribute = el.getAttribute('data-prefix-url')
				const urlPath = window.location.href.split('?')[0]
				const prefix = attribute || urlPath

				if (convertToInlineCode) {
					el.outerHTML = `<code>${prefix + el.innerText}</code>`
				} else {
					el.innerText = prefix + el.innerText
				}
			}

		})

	}
}

export default dir_tree;