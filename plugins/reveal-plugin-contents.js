/*
	Contents overlay: a compact, scrollable summary of the whole lecture, i.e. the agenda with the level-1 and level-2 sections of every deck (their data-summary, collected into toc.json by dennis_build).

	It covers the whole window like a page; key I opens and closes it, Escape or the close button closes it. ?contents in the URL opens it on load, also together with a course profile (e.g. index.html?profile=<id>&contents; the start page keeps the query when it redirects).
	With a course profile (course-profile.js), decks and sections follow its status like the agenda and the menu: prior knowledge greyed out, optional in italics, skipped struck through (skipped decks without their sections).
	Every line links to its slide; links into the current deck jump there directly (skipped sections are removed from the deck, so slide numbers can differ from toc.json).
	The search field above searches the text of all slides (search.json, search-core.js); while it is not empty, the hits replace the outline, grouped by deck in the order of the lecture. Skipped decks and sections of the course profile are left out. ?contents=<term> opens the overlay with a search; the quick navigation (key Q) hands its term over the same way.
 */

import { loadCourseProfile, courseEntry, courseResetLink } from './course-profile.js'
import { fromIndex, createSearch, searchHelpHtml, highlight, snippet, goTo, resumePendingJump } from './search-core.js'

// Encode a relative path per segment
function encodePath(p) {
	return p.split('/').map(encodeURIComponent).join('/')
}

function escapeHtml(s) {
	return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

// "Title (note)" -> title and note, like the chapter overview
function split(summary) {
	const m = summary.match(/^(.*?)\s*\(([^()]*)\)\s*$/)
	return m ? [m[1], m[2]] : [summary, '']
}

// Status of every horizontal slide index under the "sections" of a deck entry, with the same rule as reveal-plugin-course-profile.js: a section runs from its named slide to the next named slide of the same or a higher level
function sectionStatus(sections, statuses) {
	const names = Object.keys(statuses || {})
	const result = new Map()
	if (names.length === 0) return result
	// name and level of each horizontal slide: its first named slide
	const stacks = new Map()
	for (const s of sections) if (s.name && !stacks.has(s.h)) stacks.set(s.h, s)
	const order = [...stacks.keys()].sort((a, b) => a - b)
	const last = Math.max(0, ...sections.map(s => s.h))
	order.forEach((h, i) => {
		const { name, level } = stacks.get(h)
		if (!names.includes(name)) return
		const status = courseEntry({ s: statuses }, 's', name).status
		let end = last + 1
		for (const next of order.slice(i + 1)) {
			const n = stacks.get(next)
			if (n.level <= level || names.includes(n.name)) { end = next; break }
		}
		for (let k = h; k < end; k++) result.set(k, status)
	})
	return result
}

// Prior knowledge is only greyed out (the legend explains it), optional and not covered also get a small label
const STATUS_NOTE = { optional: 'optional', skip: 'not covered' }


function render(toc, profile) {
	// Chapters (decks without sub letter) with their sub-chapters
	const groups = []
	for (const deck of toc.decks) {
		if (!deck.sub || groups.length === 0) groups.push({ chapter: null, decks: [] })
		const g = groups[groups.length - 1]
		if (!deck.sub) g.chapter = deck
		else g.decks.push(deck)
	}

	const deckStatus = deck => courseEntry(profile, 'decks', (deck.number || '') + (deck.sub || ''))
	const statusNote = status => profile && STATUS_NOTE[status] ? `<span class="contents_status">${STATUS_NOTE[status]}</span>` : ''

	// Sections like the chapter overview: the level-1 titles, below each its note and its level-2 sections as small grey lines
	const sectionList = (deck, entry) => {
		if (profile && entry.status === 'skip') return ''
		const marks = profile ? sectionStatus(deck.sections || [], entry.sections) : new Map()
		const items = []
		let current = null
		for (const s of deck.sections || []) {
			if (!s.summary || s.level > 2) continue
			const [title, note] = split(s.summary)
			const status = marks.get(s.h)
			const cls = status ? ` class="contents_${status}"` : ''
			const href = `${encodePath(deck.path)}#/${s.h}${s.v ? '/' + s.v : ''}`
			const attrs = `data-contents-deck="${escapeHtml(deck.slug)}" data-contents-summary="${escapeHtml(s.summary)}"`
			const link = (text, extra = '') => status === 'skip' ? `<span${extra}>${escapeHtml(text)}</span>` : `<a href="${href}" ${attrs}${extra}>${escapeHtml(text)}</a>`
			if (s.level === 1 || !current) {
				current = { status, cls, head: link(title, ' class="contents_t"') + statusNote(status), subs: note ? [`<span>${escapeHtml(note)}</span>`] : [] }
				items.push(current)
			} else {
				// the label only where the status changes, not again on every sub-section of a labelled section
				current.subs.push(`<div${cls}>${link(note ? `${title} (${note})` : title)}${status !== current.status ? statusNote(status) : ''}</div>`)
			}
		}
		if (items.length === 0) return ''
		return `<ul class="contents_sections">${items.map(i => `<li${i.cls}>${i.head}${i.subs.length ? `<div class="contents_sub">${i.subs.map(x => x.startsWith('<div') ? x : `<div>${x}</div>`).join('')}</div>` : ''}</li>`).join('')}</ul>`
	}

	const deckBlock = (deck, isChapter) => {
		const entry = deckStatus(deck)
		const cls = profile ? ` contents_${entry.status}` : ''
		const no = deck.sub ? `${deck.number}${deck.sub}` : (deck.number || '')
		return `<div class="contents_deck${isChapter ? ' contents_chapter' : ''}${cls}">
			<div class="contents_no">${escapeHtml(no)}</div>
			<div class="contents_body">
				<div class="contents_deck_title"><a href="${encodePath(deck.path)}">${escapeHtml(deck.title)}</a>${statusNote(entry.status)}</div>
				${sectionList(deck, entry)}
			</div>
		</div>`
	}

	const outline = groups.map(g => `<div class="contents_group">${[g.chapter ? deckBlock(g.chapter, true) : '', ...g.decks.map(d => deckBlock(d, false))].join('')}</div>`).join('')
	const course = profile
		? `<div class="contents_course">${escapeHtml(profile.title)}<span class="contents_key contents_prior">prior knowledge</span><span class="contents_key contents_optional">optional</span><span class="contents_key contents_skip">not covered</span><a href="${courseResetLink()}">full contents</a></div>`
		: ''
	const search = '<input type="search" class="contents_search" placeholder="Search all slides" autocomplete="off" spellcheck="false" aria-label="Search all slides">'
	return { head: `<div class="contents_head"><div class="contents_topline"><div class="contents_kicker">Contents</div><span class="contents_searchbox">${search}${searchHelpHtml()}</span></div><div class="contents_title">${escapeHtml(toc.title || '')}</div>${course}<button type="button" class="contents_close" title="Close (Esc)">&times;</button></div>`, outline }
}

// Documents of search.json that the course profile shows: no skipped decks, no skipped sections
function visibleDocs(index, toc, profile) {
	if (!profile) return index.docs
	const hidden = new Map()
	for (const deck of toc.decks) {
		const entry = courseEntry(profile, 'decks', (deck.number || '') + (deck.sub || ''))
		const marks = sectionStatus(deck.sections || [], entry.sections)
		hidden.set(deck.slug, h => entry.status === 'skip' || marks.get(h) === 'skip')
	}
	return index.docs.filter(d => !(hidden.get(d.slug) || (() => false))(d.h))
}

// Hits grouped by deck in the order of the lecture, slides in their order within a deck
function renderHits(hits, term, toc) {
	if (hits.length === 0) return `<div class="contents_hits_none">No slides match "${escapeHtml(term)}"</div>`
	const order = new Map(toc.decks.map((d, i) => [d.slug, i]))
	const bySlug = new Map()
	for (const hit of hits) {
		if (!bySlug.has(hit.slug)) bySlug.set(hit.slug, [])
		bySlug.get(hit.slug).push(hit)
	}
	const decks = [...bySlug.keys()].sort((a, b) => (order.get(a) ?? 1e9) - (order.get(b) ?? 1e9))
	let n = 0
	const groups = decks.map(slug => {
		const deck = toc.decks[order.get(slug)] || { title: slug }
		const no = deck.sub ? `${deck.number}${deck.sub}` : (deck.number || '')
		const items = bySlug.get(slug).sort((a, b) => a.h - b.h || a.v - b.v).map(hit => {
			const where = hit.section && hit.section !== hit.title ? `<span class="contents_hit_section">${escapeHtml(hit.section)}</span>` : ''
			return `<a class="contents_hit" href="${encodePath(hit.path || slug)}#/${hit.h}/${hit.v}" data-hit="${n++}"><span class="contents_hit_title">${highlight(hit.title || '(untitled slide)', term)}</span>${where}<span class="contents_hit_text">${snippet(hit.text, term)}</span></a>`
		}).join('')
		return `<div class="contents_deck contents_hits_deck"><div class="contents_no">${escapeHtml(no)}</div><div class="contents_body"><div class="contents_deck_title">${escapeHtml(deck.title)}</div>${items}</div></div>`
	})
	const count = `<div class="contents_hits_count">${hits.length} slide${hits.length === 1 ? '' : 's'}</div>`
	return count + groups.join('')
}

export default () => {
	let overlay = null
	let onKey = null
	let hits = []
	let active = -1
	let setQuery = () => { }

	const hitLinks = () => overlay ? [...overlay.querySelectorAll('a[data-hit]')] : []

	// Arrow keys: mark the next or previous hit and keep it in view
	function moveActive(step) {
		const links = hitLinks()
		if (!links.length) return
		if (links[active]) links[active].classList.remove('contents_hit_active')
		active = (active + step + links.length) % links.length
		links[active].classList.add('contents_hit_active')
		links[active].scrollIntoView({ block: 'nearest' })
	}

	function close() {
		if (!overlay) return
		overlay.remove()
		overlay = null
		hits = []
		active = -1
		setQuery = () => { }
		document.removeEventListener('keydown', onKey, true)
	}

	function open(deck, query = '') {
		if (overlay) {
			if (query) setQuery(query)
			return
		}
		overlay = document.createElement('div')
		overlay.className = 'contents_overlay'
		const box = document.createElement('div')
		box.className = 'contents_box'
		box.tabIndex = -1
		box.textContent = 'Loading contents ...'
		overlay.appendChild(box)
		document.body.appendChild(overlay)
		box.focus()

		// While open, keys scroll the overlay instead of changing slides; Escape closes it, I as well unless the search field has the focus; arrow keys and Enter move through the hits
		onKey = e => {
			const inSearch = e.target && e.target.classList && e.target.classList.contains('contents_search')
			if (e.key === 'Escape' || (!inSearch && (e.key === 'i' || e.key === 'I'))) {
				close()
				e.preventDefault()
			} else if (hitLinks().length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
				moveActive(e.key === 'ArrowDown' ? 1 : -1)
				e.preventDefault()
			} else if (e.key === 'Enter' && inSearch && hitLinks().length) {
				hitLinks()[Math.max(0, active)].click()
				e.preventDefault()
			}
			e.stopPropagation()
		}
		document.addEventListener('keydown', onKey, true)
		overlay.addEventListener('click', e => {
			if (e.target.closest('.contents_close')) return close()
			const hit = e.target.closest('a[data-hit]')
			if (hit && hits[+hit.getAttribute('data-hit')]) {
				e.preventDefault()
				const doc = hits[+hit.getAttribute('data-hit')]
				close()
				goTo(deck, doc)
				return
			}
			// Links into the current deck: jump to the slide (its index may have changed through the course profile)
			const a = e.target.closest('a[data-contents-deck]')
			const page = (deck.getConfig().farberg_reveal_template || {}).deck || {}
			if (!a || a.getAttribute('data-contents-deck') !== page.slug) return
			const summary = a.getAttribute('data-contents-summary')
			const slide = [...deck.getSlidesElement().querySelectorAll('section[data-summary]')].find(s => s.getAttribute('data-summary') === summary)
			if (!slide) return
			e.preventDefault()
			close()
			const { h, v } = deck.getIndices(slide)
			deck.slide(h, v)
		})

		Promise.all([
			fetch('toc.json', { cache: 'no-store', credentials: 'include' }).then(res => res.ok ? res.json() : null).catch(() => null),
			loadCourseProfile()
		]).then(([toc, profile]) => {
			if (!overlay) return
			if (!toc) {
				box.textContent = 'Contents not available (toc.json missing)'
				return
			}
			const { head, outline } = render(toc, profile)
			box.innerHTML = `${head}<div class="contents_main">${outline}</div>`
			const input = box.querySelector('.contents_search')
			const main = box.querySelector('.contents_main')
			// The index is built on the first search only
			let searchFn = null
			const getSearch = () => searchFn || (searchFn = fromIndex().then(index => index ? createSearch(visibleDocs(index, toc, profile)).then(search => ({ search, index })) : null))
			let run = 0
			input.addEventListener('input', async () => {
				const term = input.value.trim()
				const mine = ++run
				if (!term) {
					hits = []
					main.innerHTML = outline
					return
				}
				const ready = await getSearch()
				if (mine !== run || !overlay) return
				if (!ready) {
					main.innerHTML = '<div class="contents_hits_none">Search not available (search.json missing)</div>'
					return
				}
				hits = await ready.search(term, 300)
				if (mine !== run || !overlay) return
				main.innerHTML = renderHits(hits, term, toc)
				// data-hit numbers follow the rendered order (grouped by deck), so hits is reordered the same way
				const order = new Map(toc.decks.map((d, i) => [d.slug, i]))
				hits.sort((a, b) => (order.get(a.slug) ?? 1e9) - (order.get(b.slug) ?? 1e9) || a.h - b.h || a.v - b.v)
				active = -1
			})
			setQuery = q => {
				input.value = q
				input.dispatchEvent(new Event('input'))
			}
			if (query) setQuery(query)
			input.focus()
		})
	}

	return {
		id: 'contents',
		init: (deck) => {
			if (deck.getConfig().view === 'print') return
			deck.addKeyBinding({ keyCode: 73, key: 'I', description: 'Contents of the lecture (all chapters and sections)' }, () => overlay ? close() : open(deck))
			// Links with data-open-contents (e.g. in the agenda footer, reveal-plugin-show-toc.js) open the overlay without reloading
			document.addEventListener('click', e => {
				const link = e.target.closest && e.target.closest('[data-open-contents]')
				if (!link) return
				e.preventDefault()
				open(deck, link.getAttribute('data-contents-query') || '')
			})
			deck.on('ready', () => {
				const params = new URLSearchParams(window.location.search)
				if (params.has('contents')) open(deck, params.get('contents') || '')
				// A search hit in another deck: jump to its slide once the course profile has removed its sections
				resumePendingJump(deck, loadCourseProfile())
			})
		}
	}
}
