import outdent from './outdent.js'

function showError(el, err) {
	el.innerText = `${err} - (Original innerText=${el.innerText})`
}

function showCode(el, language, code, link, outdent) {
	var newEl = document.createElement('pre');
	newEl.setAttribute('class', `language-${language}`);
	//Replace special chars
	code = code.replace(/&/g, "&amp;").replace(/>/g, "&gt;").replace(/</g, "&lt;").replace(/"/g, "&quot;")


	let codeEl = document.createElement('code')
	codeEl.innerHTML = code
	newEl.appendChild(codeEl)

	el.parentNode.replaceChild(newEl, el);

	if (link) {
		let linkNode = document.createElement("div");
		linkNode.classList.add("source-code-link")
		linkNode.innerHTML = `<a href = "${link}" > ${link}</a >`
		newEl.parentNode.insertBefore(linkNode, newEl.nextSibling);
	}

	return newEl
}

function extractBeginEndSnippet(code, beginMarker, endMarker) {
	let lines = code.split('\n');
	let out = "";
	let beginFound = beginMarker ? false : true
	beginMarker = beginMarker ? beginMarker.trim() : null

	for (let line of lines) {
		if (!beginFound && line.indexOf(beginMarker) >= 0) {
			beginFound = true;
			continue;
		} else if (beginFound && line.indexOf(endMarker) >= 0) {
			break;
		} else if (!beginFound) {
			continue;
		}

		out += line + "\n";
	}

	return out.trim();
}

export default () => {

	return {
		id: 'show_code_snippets',
		init: (deck) => {

			deck.on('ready', () => {
				const highlightPlugin = deck.getPlugin("highlight")

				for (let el of deck.getRevealElement().querySelectorAll("a[data-code]")) {
					//console.log(`Loading code snippets, looking at`, el)
					let language = el.getAttribute("data-code");
					let url = el.getAttribute("href");
					let beginMarker = el.getAttribute("data-begin")
					let endMarker = el.getAttribute("data-end")
					let showLink = el.hasAttribute("data-link")
					let outdentCode = el.hasAttribute("data-outdent")

					//console.log(`language = ${language}, url = ${url}, beginMarker = ${beginMarker}, endMarker = ${endMarker}, showLink = ${showLink} `)

					if (url) {
						fetch(url, { "cache": "no-store" })
							.then(response => response.text()).then(text => {
								let code = extractBeginEndSnippet(text, beginMarker, endMarker)

								if (outdentCode)
									code = outdent(code)

								const newEl = showCode(el, language, code, showLink ? url : null, outdent)
								highlightPlugin.highlightBlock(newEl)
							}).catch(err => {
								showError(el, err)
							})
					} else {
						showError(el, "No URL provided in elements innerText")
					}
				}


			})

		}
	}
}