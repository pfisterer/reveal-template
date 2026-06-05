/*
Shows a code snippet after loading it from a file.

Parameters:
- data-code: Language
- data-begin: Begin indicator in the file (optional; substring match, first occurrence)
- data-begin-nth: Start after the Nth occurrence of data-begin instead of the first (optional, 1-based)
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

function extractBeginEndSnippet(code, beginMarker, endMarker, beginNth) {
	let lines = code.split('\n');
	let out = "";
	beginMarker = beginMarker ? beginMarker.trim() : null
	// Trim and null-guard endMarker: otherwise indexOf(null) below coerces to
	// indexOf("null"), so a line containing "null" would end the snippet early.
	endMarker = endMarker ? endMarker.trim() : null
	// Markers are substring-matched. By default the snippet starts after the
	// first line containing beginMarker; data-begin-nth selects a later one.
	let nth = beginNth && beginNth > 0 ? beginNth : 1
	let seen = 0
	let beginFound = beginMarker ? false : true

	for (let line of lines) {
		if (!beginFound && line.indexOf(beginMarker) >= 0) {
			if (++seen >= nth)
				beginFound = true;
			continue;
		} else if (beginFound && endMarker && line.indexOf(endMarker) >= 0) {
			break;
		} else if (!beginFound) {
			continue;
		}

		out += line + "\n";
	}

	return out.trim();
}

function injectStyles() {
	const style = document.createElement('style');
	style.textContent = `
		pre.with-copy-btn {
			position: relative;
		}
		.copy-code-btn {
			position: absolute;
			top: 0.4em;
			right: 0.4em;
			padding: 0.2em 0.5em;
			font-size: 0.75em;
			font-family: sans-serif;
			background: rgba(255, 255, 255, 0.15);
			color: #ccc;
			border: 1px solid rgba(255, 255, 255, 0.25);
			border-radius: 4px;
			cursor: pointer;
			opacity: 0;
			transition: opacity 0.15s ease, background 0.15s ease;
			z-index: 10;
			line-height: 1.4;
		}
		pre.with-copy-btn:hover .copy-code-btn {
			opacity: 1;
		}
		.copy-code-btn:hover {
			background: rgba(255, 255, 255, 0.3);
			color: #fff;
		}
		.copy-code-btn.copied {
			color: #4caf50;
			border-color: #4caf50;
		}
	`;
	document.head.appendChild(style);
}

function writeToClipboard(text) {
	if (navigator.clipboard && navigator.clipboard.writeText)
		return navigator.clipboard.writeText(text);
	const ta = document.createElement('textarea');
	ta.value = text;
	ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
	document.body.appendChild(ta);
	ta.focus();
	ta.select();
	try {
		document.execCommand('copy');
		return Promise.resolve();
	} catch (e) {
		return Promise.reject(e);
	} finally {
		document.body.removeChild(ta);
	}
}

function addCopyButton(preEl) {
	preEl.classList.add('with-copy-btn');
	const btn = document.createElement('button');
	btn.className = 'copy-code-btn';
	btn.textContent = 'copy';
	btn.addEventListener('click', () => {
		const code = preEl.querySelector('code');
		const text = code ? code.innerText : preEl.innerText;
		writeToClipboard(text).then(() => {
			btn.textContent = '✓ copied';
			btn.classList.add('copied');
			setTimeout(() => {
				btn.textContent = 'copy';
				btn.classList.remove('copied');
			}, 1500);
		}).catch(() => {
			btn.textContent = '✗ error';
			setTimeout(() => { btn.textContent = 'copy'; }, 1500);
		});
	});
	preEl.appendChild(btn);
}

export default () => {
	return {
		id: 'show_code_snippets',
		init: (deck) => {
			injectStyles();

			deck.on('ready', async () => {
				const highlightPlugin = deck.getPlugin("highlight")

				highlightPlugin.hljs.configure({
					// This suppresses the specific console warning you are seeing
					ignoreUnescapedHTML: true
				});

				// highlightOnLoad is false (to avoid double-highlighting external code snippets
				// loaded below). Manually highlight all inline markdown code blocks here.
				// The reveal.js markdown plugin sets class="mermaid" (no "language-" prefix) for
				// mermaid fences. RevealMermaid already rendered those elements before the ready
				// event fired, so we must skip them — otherwise hljs reads the SVG innerHTML as
				// code text and overwrites the rendered diagram.
				for (let el of deck.getRevealElement().querySelectorAll("pre code[class]")) {
					if (!el.classList.contains("mermaid")) {
						highlightPlugin.hljs.highlightElement(el);
						addCopyButton(el.closest('pre'));
					}
				}

				for (let el of deck.getRevealElement().querySelectorAll("a[data-code]")) {
					//console.log(`Loading code snippets, looking at`, el)
					let language = el.getAttribute("data-code");
					let url = el.getAttribute("href");
					let beginMarker = el.getAttribute("data-begin")
					let beginNth = parseInt(el.getAttribute("data-begin-nth"), 10) || 1
					let endMarker = el.getAttribute("data-end")
					let showLink = el.hasAttribute("data-link")
					let outdentCode = el.hasAttribute("data-outdent")

					//console.log(`language = ${language}, url = ${url}, beginMarker = ${beginMarker}, endMarker = ${endMarker}, showLink = ${showLink} `)

					if (!url) {
						showError(el, "No URL provided in elements innerText")
						continue
					}

					try {
						const sameOrigin = new URL(url, window.location.href).origin === window.location.origin
						const response = await fetch(url, { "cache": "no-store", "credentials": sameOrigin ? "include" : "omit" })
						if (response.status === 401) {
							console.log("Authentication required (show-code-snippets), reloading page");
							window.location.reload();
							return;
						}
						if (!response.ok) {
							showError(el, `HTTP ${response.status} loading ${url}`)
							continue
						}
						const text = await response.text()
						let code = extractBeginEndSnippet(text, beginMarker, endMarker, beginNth)

						if (!code) {
							showError(el, `No content extracted from ${url} (begin=${beginMarker}, end=${endMarker})`)
							continue
						}

						if (outdentCode)
							code = outdent(code)

						const newEl = showCode(el, language, code, showLink ? url : null, outdent)
						if (language !== 'mermaid') {
							highlightPlugin.hljs.highlightElement(newEl.querySelector('code') ?? newEl)
							addCopyButton(newEl)
						}
					} catch (err) {
						console.error(`show-code-snippets: failed to load ${url}:`, err)
						showError(el, `Failed to load ${url}: ${err.message}`)
					}
				}


			})


		}
	}
}