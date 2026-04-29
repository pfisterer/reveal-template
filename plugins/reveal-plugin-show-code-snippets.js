/*
Shows a code snippet after loading it from a file.

Parameters:
- data-code: Language
- data-begin: Begin indicator in the file (optional)
- data-end: End indicator in the file (optional)
- data-link: Show a link to the file (optional)

Example

<a 	data-code='bash' 
	data-begin="# Begin indicator in the file" 
	data-end="# End indicator in the file" 
	data-link
	href="link/to/the/file.sh">Source code</a>
*/

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

			deck.on('ready', async () => {
				const highlightPlugin = deck.getPlugin("highlight")

				highlightPlugin.hljs.configure({
					// This suppresses the specific console warning you are seeing
					ignoreUnescapedHTML: true
				});


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
						const response = await fetch(url, { "cache": "no-store", "credentials": "include" })
						if (response.status === 401) {
							console.log("Authentication required (show-code-snippets), reloading page");
							window.location.reload();
							return;
						}
						const text = await response.text()
						let code = extractBeginEndSnippet(text, beginMarker, endMarker)

						if (outdentCode)
							code = outdent(code)

						const newEl = showCode(el, language, code, showLink ? url : null, outdent)
						highlightPlugin.hljs.highlightElement(newEl)

					} else {
						showError(el, "No URL provided in elements innerText")
					}
				}


			})


		}
	}
}