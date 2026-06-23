/*
Shows a code snippet after loading it from a file.

Parameters:
- data-code: Language
- data-begin: Begin indicator in the file (optional; substring match, first occurrence)
- data-begin-nth: Start after the Nth occurrence of data-begin instead of the first (optional, 1-based)
- data-end: End indicator in the file (optional)
- data-link: Show a link to the file (optional)
- data-no-wrap: Disable soft line wrapping; long lines scroll horizontally instead (optional)

For inline markdown code fences, disable wrapping with a no-wrap class or a
data-no-wrap attribute via reveal's element-attribute comment, e.g.

```console
199.72.81.55 - - [01/Jul/1995:00:00:01 -0400] "GET /history/apollo/ HTTP/1.0" 200 6245
```
<!-- .element: class="no-wrap" -->

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
	// Keep the exact, un-escaped source so the copy button can reproduce it
	// verbatim regardless of how we later restructure the DOM for display.
	newEl.__rawCode = code
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
		/* Soft-wrap long lines like VS Code's word wrap. white-space:pre-wrap is
		   a purely visual wrap: it does NOT insert real newlines into the text.
		   overflow-wrap:break-word prefers breaking at whitespace and only splits a
		   word when that single token is itself too long to fit (long URLs / base64
		   / paths). Unlike "anywhere", it does not snap mid-word when a whitespace
		   break is available. Copy fidelity is handled separately (see
		   addCopyButton / wrapCodeLines), so wrapping never leaks into copied text. */
		.reveal pre.with-copy-btn,
		.reveal pre.with-copy-btn code {
			white-space: pre-wrap;
			overflow-wrap: break-word;
			word-break: normal;
		}
		/* Opt-out: with data-no-wrap (or a "no-wrap" class on the <pre>) long lines
		   are kept on one line and the block scrolls horizontally instead. These
		   blocks are never run through wrapCodeLines/decorateWrappedLines, so the
		   .cl hang-indent and wrap markers above never apply to them. Declared
		   after the wrapping rules so equal-specificity selectors win on order. */
		.reveal pre.with-copy-btn.no-wrap,
		.reveal pre.with-copy-btn.no-wrap code {
			white-space: pre;
			overflow-wrap: normal;
			word-break: normal;
		}
		.reveal pre.with-copy-btn.no-wrap {
			overflow-x: auto;
		}
		/* Each logical source line becomes its own block so wrapped continuation
		   rows can be hang-indented (text-indent pulls the first row back to the
		   margin; padding-left indents everything else). padding-right reserves
		   room for the end-of-row wrap marker (see decorateWrappedLines): text
		   wraps before that zone, so the absolutely-positioned marker lands inside
		   the box instead of overflowing and triggering a horizontal scrollbar. */
		.reveal pre.with-copy-btn code .cl {
			display: block;
			position: relative;
			padding-left: 2.5ch;
			padding-right: 1.5ch;
			text-indent: -2.5ch;
		}
		/* Preserve the height of blank lines. Generated content is excluded from
		   selection/copy, so the zero-width space never reaches the clipboard. */
		.reveal pre.with-copy-btn code .cl:empty::before {
			content: "\\200b";
		}
		/* Continuation marker placed at the end of each row that soft-wraps (see
		   decorateWrappedLines). The horizontal/vertical offset is set inline per
		   row; user-select:none keeps it out of native select+copy. */
		.reveal pre.with-copy-btn code .wrap-marker {
			position: absolute;
			text-indent: 0;
			font-style: normal;
			opacity: 0.4;
			pointer-events: none;
			user-select: none;
			-webkit-user-select: none;
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

// Wrap each logical line of a (already highlighted) <code> element in its own
// <span class="cl"> block. hljs emits a single run of HTML with "\n"
// separators and token <span>s that may straddle newlines, so we tokenize the
// markup and re-open any spans still active when a line ends.
function wrapCodeLines(codeEl) {
	const html = codeEl.innerHTML
	const tokenRe = /(<\/?[^>]+>)|([^<]+)/g
	let m
	let open = []           // stack of currently-open tag strings (hljs uses <span>)
	let buf = ''
	let lines = []
	const closers = () => open.map(() => '</span>').join('')
	const reopen = () => open.join('')

	while ((m = tokenRe.exec(html)) !== null) {
		if (m[1]) {
			const tag = m[1]
			if (tag[1] === '/') { open.pop(); buf += tag }
			else if (tag.endsWith('/>')) { buf += tag }   // self-closing (rare)
			else { open.push(tag); buf += tag }
		} else {
			const parts = m[2].split('\n')
			for (let i = 0; i < parts.length; i++) {
				if (i > 0) {
					buf += closers()        // close spans before the line break
					lines.push(buf)
					buf = reopen()          // re-open them on the next line
				}
				buf += parts[i]
			}
		}
	}
	buf += closers()
	lines.push(buf)

	codeEl.innerHTML = lines.map(l => `<span class="cl">${l}</span>`).join('')
}

// Place a "↴" marker at the end of every row that soft-wraps (i.e. every visual
// row except the last). CSS has no selector for soft-wrap rows, so we measure
// them with a Range. The deck is rendered at a fixed layout width and merely
// CSS-scaled, so wrap positions are stable; we divide measured offsets by the
// current scale to get layout pixels.
function decorateWrappedLines(root, scale) {
	if (!root) return
	const s = scale || 1
	for (const line of root.querySelectorAll('pre.with-copy-btn code .cl')) {
		// Idempotent: clear any decoration from a previous pass before measuring.
		for (const old of line.querySelectorAll('.wrap-marker')) old.remove()

		const range = document.createRange()
		range.selectNodeContents(line)
		const rects = range.getClientRects()
		if (!rects.length) continue

		const base = line.getBoundingClientRect()
		// Group the rects (one per inline fragment) into visual rows keyed by
		// their top offset, tracking the rightmost text edge of each row — that
		// edge is where the row visually ends, i.e. the wrap point.
		const rows = []
		for (const r of rects) {
			if (r.width === 0 && r.height === 0) continue
			const top = Math.round(r.top - base.top)
			const right = r.right - base.left
			const row = rows.find(x => Math.abs(x.top - top) <= 2)
			if (row) row.right = Math.max(row.right, right)
			else rows.push({ top, right })
		}
		if (rows.length <= 1) continue   // line did not wrap

		// Mark the end of every row except the last — those are the wrap points.
		for (let i = 0; i < rows.length - 1; i++) {
			const marker = document.createElement('span')
			marker.className = 'wrap-marker'
			marker.textContent = '↴'
			marker.setAttribute('aria-hidden', 'true')
			marker.style.top = (rows[i].top / s) + 'px'
			marker.style.left = (rows[i].right / s) + 'px'
			line.appendChild(marker)
		}
	}
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
		// Prefer the stashed raw source: it is immune to the per-line <span>
		// wrapping and wrap markers used for display. textContent is the
		// fallback (block-per-line collapses to no newlines under textContent,
		// so raw is what we really want here).
		const text = preEl.__rawCode != null
			? preEl.__rawCode
			: (code ? code.textContent : preEl.textContent);
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

			// Re-measure wrap points after fonts settle and on every layout change.
			// Only the visible slide can be measured (hidden slides have no layout),
			// so slidechanged re-runs decoration as each slide is shown.
			const decorate = (root) => {
				const run = () => decorateWrappedLines(root, deck.getScale());
				if (document.fonts && document.fonts.ready)
					document.fonts.ready.then(() => requestAnimationFrame(run));
				else
					requestAnimationFrame(run);
			};

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
						const pre = el.closest('pre')
						// Capture raw source before highlighting/line-wrapping touches the DOM.
						if (pre) pre.__rawCode = el.textContent
						highlightPlugin.hljs.highlightElement(el);
						// Opt-out authored on the <pre> or <code> — either a "no-wrap"
						// class or a data-no-wrap attribute. Reveal's markdown
						// `<!-- .element: ... -->` may land the attribute on either
						// element, so check both.
						const optOut = n => n && (n.classList.contains('no-wrap') || n.hasAttribute('data-no-wrap'))
						const noWrap = optOut(pre) || optOut(el)
						if (noWrap) pre && pre.classList.add('no-wrap')
						else wrapCodeLines(el);
						addCopyButton(pre);
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
					let noWrap = el.hasAttribute("data-no-wrap")

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
							const codeEl = newEl.querySelector('code') ?? newEl
							highlightPlugin.hljs.highlightElement(codeEl)
							if (noWrap) newEl.classList.add('no-wrap')
							else wrapCodeLines(codeEl)
							addCopyButton(newEl)
						}
					} catch (err) {
						console.error(`show-code-snippets: failed to load ${url}:`, err)
						showError(el, `Failed to load ${url}: ${err.message}`)
					}
				}

				// First pass for the slide that is visible at startup.
				decorate(deck.getRevealElement())
			})

			// Slides other than the current one have no layout while hidden, so we
			// (re)place wrap markers each time a slide becomes visible, and after
			// any resize that changes the scale.
			deck.on('slidechanged', (e) => decorate(e.currentSlide))
			deck.on('resize', () => decorate(deck.getRevealElement()))
		}
	}
}
