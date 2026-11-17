/*
	Shared full-text search for the quick navigation (key Q, the open deck) and the contents overlay (key I, all decks). Both keep their own view; this module provides the documents, the matching, the snippets, and the jump to a hit.

	A document is one slide: { id, slug, h, v, pos, title, section, text }.
	- fromDeck(deck): the slides of the open deck from the DOM; h/v are the current indices, so they are exact even after a course profile removed sections.
	- fromIndex(): all decks from search.json (written by dennis_build, scripts/structure.js collectSearchDocs); h/v are the positions of the build.
	pos ("h/v" of the build) is also stored on every slide as data-pos, so a hit in another deck is found again after that deck removed sections.

	createSearch(docs) builds an Orama index in the browser (title weighted above text, prefix matching, one typo tolerated in words longer than 3 characters; the section name is only shown, not searched, or every slide of a section would match its name); Orama is loaded on first use.

	Query syntax like a web search (parseQuery):
	- kserve autoscaling: every word must match, in the title or the text (AND)
	- kserve OR knative (also kserve | knative): one of the words is enough
	- "scale to zero": the words in this order, without typo tolerance
	- -sklearn, -"model weights": leave out slides that match
 */

const SEARCH_URL = 'search.json'
const PENDING_KEY = 'farberg-search-jump'

export function escapeHtml(s) {
	return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

function normalize(s) {
	return (s || '').replace(/\s+/g, ' ').trim()
}

// Visible text of a slide without its title, left out like in search.json (scripts/structure.js collectSearchDocs): code blocks, notes, credits, players, the chapter overview
const SKIP = 'pre, aside.notes, credits, script, style, svg, asciinema, [data-farberg-asciinema], a[data-code], .chapter-overview'
function slideText(slide) {
	const clone = slide.cloneNode(true)
	for (const el of clone.querySelectorAll(SKIP)) el.remove()
	const first = clone.querySelector('h1, h2')
	if (first) first.remove()
	for (const el of clone.querySelectorAll('li, p, td, th, h3, h4, div, br')) el.insertAdjacentText('afterend', ' ')
	return normalize(clone.textContent).slice(0, 1500)
}

// Slides of the open deck, in the same shape as the documents of search.json
export function fromDeck(deck) {
	const page = (deck.getConfig().farberg_reveal_template || {}).deck || {}
	const docs = []
	let section = ''
	deck.getHorizontalSlides().forEach((top, h) => {
		const inner = [...top.children].filter(c => c.tagName === 'SECTION')
		const slides = inner.length ? inner.map((s, v) => [s, v]) : [[top, 0]]
		for (const [slide, v] of slides) {
			const name = slide.getAttribute('data-name')
			if (name && (parseInt(slide.getAttribute('data-level') || '1', 10) || 1) === 1) section = name
			const heading = slide.querySelector('h1, h2')
			const title = heading ? normalize(heading.textContent) : ''
			const text = slideText(slide)
			if (!title && !text) continue
			docs.push({ id: `${page.slug || ''}:${h}/${v}`, slug: page.slug || '', h, v, pos: slide.getAttribute('data-pos') || `${h}/${v}`, title, section, text, slide })
		}
	})
	return docs
}

let indexPromise = null

// All decks from search.json: { decks: [{ slug, path, number, sub, title }], docs: [...] }, or null if there is none (e.g. an older build)
export function fromIndex() {
	if (!indexPromise) {
		indexPromise = fetch(SEARCH_URL, { cache: 'no-store', credentials: 'include' })
			.then(res => res.ok ? res.json() : null)
			.then(data => data && {
				decks: data.decks,
				docs: data.docs.map(d => {
					const deck = data.decks[d.d] || {}
					return { id: `${deck.slug}:${d.h}/${d.v}`, slug: deck.slug, path: deck.path, h: d.h, v: d.v, pos: `${d.h}/${d.v}`, title: d.t || '', section: d.s || '', text: d.x || '' }
				})
			})
			.catch(() => null)
	}
	return indexPromise
}

let oramaPromise = null

// Query as { groups, exclude }: every group must match with at least one of its clauses, no clause of exclude may match; a clause is { word } or { phrase: [words] }
export function parseQuery(term) {
	const groups = [], exclude = []
	let joinNext = false
	for (const m of normalize(term).matchAll(/(-?)"([^"]*)"?|(\S+)/g)) {
		const [, minus, quoted, plain] = m
		if (plain === 'OR' || plain === '|') { joinNext = groups.length > 0; continue }
		let negate = minus === '-', clause
		if (quoted !== undefined) {
			const words = quoted.toLowerCase().split(' ').filter(Boolean)
			if (words.length) clause = { phrase: words }
		} else {
			let word = plain
			if (word.length > 1 && word[0] === '-') { negate = true; word = word.slice(1) }
			clause = { word: word.toLowerCase() }
		}
		// Only punctuation (e.g. a lone "-"): nothing to search for
		if (!clause || !/[\p{L}\p{N}]/u.test(clause.word ?? clause.phrase.join(''))) { joinNext = false; continue }
		if (negate) exclude.push(clause)
		else if (joinNext) groups[groups.length - 1].push(clause)
		else groups.push([clause])
		joinNext = false
	}
	return { groups, exclude }
}

// (i) button next to a search field that shows the query syntax on hover or focus; the style is added to the page once
const HELP_STYLE = `
.farberg-search-help { position: relative; display: inline-flex; flex: none; }
.farberg-search-help-btn { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border: 1px solid #b5bbbf; border-radius: 50%; font: italic bold 12px/1 Georgia, serif; color: #6b7377; background: #fff; cursor: help; user-select: none; }
.farberg-search-help-btn:hover, .farberg-search-help-btn:focus { border-color: #e2001a; color: #e2001a; outline: none; }
.farberg-search-help-pop { display: none; position: absolute; top: calc(100% + 8px); right: -8px; z-index: 10000; width: max-content; max-width: 320px; padding: 8px 12px; border: 1px solid #d5d9dc; border-radius: 6px; background: #fff; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15); font: 13px/1.5 system-ui, sans-serif; font-style: normal; font-weight: normal; color: #33393d; text-align: left; white-space: normal; }
.farberg-search-help:hover .farberg-search-help-pop, .farberg-search-help:focus-within .farberg-search-help-pop { display: block; }
.farberg-search-help-pop table { border-collapse: collapse; margin: 0; font-size: inherit; }
.farberg-search-help-pop td { padding: 2px 10px 2px 0; border: none; vertical-align: top; }
.farberg-search-help-pop code { font: 12px/1.5 ui-monospace, Menlo, monospace; color: #33393d; background: #f1f3f4; padding: 0 4px; border-radius: 3px; white-space: nowrap; }
`
export function searchHelpHtml() {
	if (!document.getElementById('farberg-search-help-style')) {
		const style = document.createElement('style')
		style.id = 'farberg-search-help-style'
		style.textContent = HELP_STYLE
		document.head.appendChild(style)
	}
	const rows = [
		['kserve autoscaling', 'all words'],
		['kserve OR knative', 'one of the words'],
		['"scale to zero"', 'exact phrase'],
		['-sklearn', 'leave out'],
	].map(([q, what]) => `<tr><td><code>${escapeHtml(q)}</code></td><td>${what}</td></tr>`).join('')
	return `<span class="farberg-search-help"><span class="farberg-search-help-btn" tabindex="0" role="button" aria-label="Search syntax">i</span><span class="farberg-search-help-pop" role="tooltip"><table>${rows}</table></span></span>`
}

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// A phrase as words in order, each matched as the start of a word like the search (prefix matching)
const phraseSource = words => words.map(escapeRe).join('[\\p{L}\\p{N}]*[^\\p{L}\\p{N}]+')

// search(term, limit) returns the matching documents with their score, best first
export async function createSearch(docs) {
	if (!oramaPromise) oramaPromise = import('@orama/orama')
	const { create, insertMultiple, search } = await oramaPromise
	const db = create({ schema: { title: 'string', text: 'string' } })
	const byId = new Map(docs.map(d => [d.id, d]))
	await insertMultiple(db, docs.map(({ id, title, text }) => ({ id, title, text })))

	// Score per matching document of one clause; words go through Orama (typo tolerance only for positive words), phrases through a regular expression over title and text
	const clauseHits = async (clause, tolerant) => {
		if (clause.word !== undefined) {
			const tolerance = tolerant && clause.word.length > 3 ? 1 : 0
			const result = await search(db, { term: clause.word, properties: ['title', 'text'], boost: { title: 3 }, tolerance, threshold: 0, limit: docs.length })
			return new Map(result.hits.map(hit => [hit.id, hit.score]))
		}
		const re = new RegExp(`(?<![\\p{L}\\p{N}])${phraseSource(clause.phrase)}`, 'iu')
		const hits = new Map()
		for (const d of docs) {
			const inTitle = re.test(d.title)
			if (inTitle || re.test(d.text)) hits.set(d.id, clause.phrase.length * (inTitle ? 3 : 1))
		}
		return hits
	}

	return async (term, limit = 50) => {
		const { groups, exclude } = parseQuery(term)
		if (!groups.length) return []
		let scores = null
		for (const group of groups) {
			// A group matches a document if one of its clauses does; the scores of matching clauses add up
			const groupScores = new Map()
			for (const clause of group) {
				for (const [id, score] of await clauseHits(clause, true)) groupScores.set(id, (groupScores.get(id) || 0) + score)
			}
			if (scores) {
				for (const id of scores.keys()) {
					if (groupScores.has(id)) scores.set(id, scores.get(id) + groupScores.get(id))
					else scores.delete(id)
				}
			} else scores = groupScores
			if (!scores.size) return []
		}
		for (const clause of exclude) {
			for (const id of (await clauseHits(clause, false)).keys()) scores.delete(id)
		}
		return [...scores].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id, score]) => Object.assign({ score }, byId.get(id)))
	}
}

// Words and phrases of the search term (not the excluded ones) as a regular expression for the start of words in the text (prefix matching like the search)
function termPattern(term) {
	const parts = parseQuery(term).groups.flat()
		.map(c => c.word !== undefined ? (c.word.length > 1 ? escapeRe(c.word) : null) : phraseSource(c.phrase))
		.filter(Boolean)
	return parts.length ? new RegExp(`(?<![\\p{L}\\p{N}])(${parts.join('|')})`, 'giu') : null
}

// Escaped HTML with every match of the term in <mark>
export function highlight(text, term) {
	const re = termPattern(term)
	if (!re) return escapeHtml(text)
	let out = '', last = 0
	for (const m of text.matchAll(re)) {
		out += escapeHtml(text.slice(last, m.index)) + `<mark>${escapeHtml(m[0])}</mark>`
		last = m.index + m[0].length
	}
	return out + escapeHtml(text.slice(last))
}

// A short excerpt around the first match (or the start of the text), highlighted
export function snippet(text, term, width = 160) {
	const re = termPattern(term)
	const m = re ? re.exec(text) : null
	if (!m) return text.length > width ? escapeHtml(text.slice(0, width)) + ' …' : escapeHtml(text)
	// start and end at word boundaries
	let start = Math.max(0, m.index - Math.round(width / 3))
	if (start > 0) {
		const space = text.indexOf(' ', start)
		start = space >= 0 && space < m.index ? space + 1 : start
	}
	let end = Math.min(text.length, start + width)
	if (end < text.length) {
		const space = text.lastIndexOf(' ', end)
		if (space > m.index + m[0].length) end = space
	}
	const cut = text.slice(start, end)
	return (start > 0 ? '… ' : '') + highlight(cut, term) + (end < text.length ? ' …' : '')
}

// Slide of a document in the open deck: by its build position (data-pos), so it is found even if a course profile removed sections before it
function findSlide(deck, pos) {
	return deck.getSlidesElement().querySelector(`section[data-pos="${pos}"]`)
}

// Jump to a hit: within the open deck directly, in another deck via its page (the jump is completed there by resumePendingJump)
export function goTo(deck, doc) {
	const page = (deck.getConfig().farberg_reveal_template || {}).deck || {}
	if (!doc.slug || doc.slug === page.slug) {
		const slide = doc.slide || findSlide(deck, doc.pos)
		if (slide) {
			const { h, v } = deck.getIndices(slide)
			deck.slide(h, v)
		} else deck.slide(doc.h, doc.v)
		return
	}
	try { window.sessionStorage.setItem(PENDING_KEY, JSON.stringify({ slug: doc.slug, pos: doc.pos })) } catch (e) { }
	window.location.assign(`${doc.path || doc.slug}${window.location.search}#/${doc.h}/${doc.v}`)
}

// On the target page: after the course profile has removed its sections, go to the slide with the stored position
export function resumePendingJump(deck, profileReady) {
	let pending = null
	try {
		pending = JSON.parse(window.sessionStorage.getItem(PENDING_KEY) || 'null')
		window.sessionStorage.removeItem(PENDING_KEY)
	} catch (e) { return }
	const page = (deck.getConfig().farberg_reveal_template || {}).deck || {}
	if (!pending || pending.slug !== page.slug) return
	Promise.resolve(profileReady).then(() => setTimeout(() => {
		const slide = findSlide(deck, pending.pos)
		if (!slide) return
		const { h, v } = deck.getIndices(slide)
		deck.slide(h, v)
	}, 0))
}
