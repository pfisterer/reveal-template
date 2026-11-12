/*
	Shows the course profile (see course-profile.js) in a deck: a badge on the title slide with the status and date of this deck in the course, a badge on every exercise slide whose id the profile lists under "exercises" (e.g. optional or skipped in this course), and the sections listed under "sections" in the entry of the deck: skipped ones are removed from the presentation, prior and optional ones get a badge on each slide plus greyed (prior) or italic (optional) menu items and chapter overview lines.
	The agenda rows are marked by reveal-plugin-show-toc.js.
	Key U opens a picker with the profiles listed in toc.json (built from profiles/*.json) and "Full agenda" (no profile).
 */

import { loadCourseProfile, courseEntry, formatCourseDate, STATUS_LABELS, activeCourseProfileId, switchCourseProfile } from './course-profile.js'

function badge(profile, entry) {
	const parts = [STATUS_LABELS[entry.status], formatCourseDate(entry.date)].filter(Boolean)
	if (parts.length === 0) return null
	const el = document.createElement('div')
	el.className = `course_badge course_badge_${entry.status}`
	el.textContent = `${profile.title} · ${parts.join(', ')}`
	return el
}

// Name and level of a horizontal stack: simplemenu moves data-name of the first slide of a vertical stack to the stack, data-level stays on the slide
function stackInfo(stack) {
	const first = stack.querySelector(':scope > section') || stack
	const name = stack.getAttribute('data-name') || first.getAttribute('data-name')
	const level = parseInt(stack.getAttribute('data-level') || first.getAttribute('data-level') || '1', 10) || 1
	return { name, level }
}

// Sections of a deck ("sections": { "<data-name>": status } in the deck entry): a section runs from its named slide to the next named slide of the same or a higher level.
// skip: its slides, its menu item and its chapter overview lines are removed from the presentation. prior, optional: every slide gets the badge, the menu item and the chapter overview lines are greyed out (prior) or in italics (optional).
function markSections(deck, profile, sections) {
	const names = Object.keys(sections)
	if (names.length === 0) return
	const stacks = deck.getHorizontalSlides()
	const statusOf = new Map()
	stacks.forEach((stack, h) => {
		const { name, level } = stackInfo(stack)
		if (!name || !names.includes(name)) return
		const entry = courseEntry({ s: sections }, 's', name)
		for (let i = h; i < stacks.length; i++) {
			const next = stackInfo(stacks[i])
			if (i > h && next.name && (next.level <= level || names.includes(next.name))) break
			statusOf.set(i, entry.status)
		}
	})
	const removed = new Set([...statusOf].filter(([, s]) => s === 'skip').map(([h]) => h))

	// Old index of a link target ("#/12", "#/12/3" or "#/<id>") and its new index after the removal
	const indexOf = href => {
		const m = /^#\/(\d+)/.exec(href || '')
		if (m) return parseInt(m[1], 10)
		const target = href && href.startsWith('#/') && document.getElementById(decodeURIComponent(href.slice(2)))
		const stack = target && target.closest('.slides > section')
		return stack ? stacks.indexOf(stack) : -1
	}
	const newIndex = h => h - [...removed].filter(r => r < h).length

	// Chapter overview: drop the lines of removed sections (a title with all its sub lines), renumber the others
	for (const a of [...document.querySelectorAll('.reveal ol.chapter-overview a')]) {
		const href = a.getAttribute('href')
		const h = indexOf(href)
		if (h < 0) continue
		if (removed.has(h)) {
			const li = a.classList.contains('co-title') ? a.closest('li') : null
			;(li || a).remove()
			continue
		}
		const status = statusOf.get(h)
		if (status) a.classList.add(`course_link_${status}`)
		const m = /^#\/(\d+)(.*)$/.exec(href)
		if (m) a.setAttribute('href', `#/${newIndex(h)}${m[2]}`)
	}
	for (const sub of document.querySelectorAll('.reveal ol.chapter-overview .co-sub')) if (!sub.children.length) sub.remove()

	// Badges on the slides that stay
	for (const [h, status] of statusOf) {
		if (removed.has(h)) continue
		const stack = stacks[h]
		const leaves = stack.querySelector(':scope > section') ? [...stack.querySelectorAll(':scope > section')] : [stack]
		for (const slide of leaves) {
			const b = badge(profile, { status })
			if (b) slide.appendChild(b)
		}
	}

	// Menu bar (built by simplemenu, possibly after this ran): remove the items of removed sections, style the others
	const menu = () => {
		for (const a of document.querySelectorAll('.menubar .menu > li > a')) {
			const h = indexOf(a.getAttribute('href'))
			if (removed.has(h)) a.closest('li').remove()
			else if (statusOf.has(h)) a.classList.add(`course_link_${statusOf.get(h)}`)
		}
		// brackets of sub-sections (reveal-plugin-navigation.js) left without items
		for (const open of document.querySelectorAll('.menubar .menu > li.sm-bracket-open')) {
			const next = open.nextElementSibling
			if (next && next.classList.contains('sm-bracket-close')) { open.remove(); next.remove() }
		}
	}
	menu()
	setTimeout(menu, 500)

	if (removed.size === 0) return
	const current = deck.getIndices()
	for (const h of removed) stacks[h].remove()
	deck.sync()
	if (removed.has(current.h)) deck.slide(Math.min(newIndex(current.h), deck.getHorizontalSlides().length - 1), 0)
	else if (current.h !== newIndex(current.h)) deck.slide(newIndex(current.h), current.v)
}

// Picker for the course profile (key U): arrow keys or click, Enter selects, Escape or U closes
function openPicker() {
	if (document.querySelector('.course_picker')) return
	fetch('toc.json', { cache: 'no-store', credentials: 'include' })
		.then(res => res.ok ? res.json() : {})
		.catch(() => ({}))
		.then(toc => {
			const active = activeCourseProfileId() || null
			const profiles = toc.profiles || []
			const options = [{ id: null, title: 'Full agenda', note: 'no profile' }].concat(profiles.map(p => ({ id: p.id, title: p.title, note: p.id })))

			const backdrop = document.createElement('div')
			backdrop.className = 'course_picker'
			const box = document.createElement('div')
			box.className = 'course_picker_box'
			const head = document.createElement('div')
			head.className = 'course_picker_head'
			head.textContent = 'Course profile'
			box.appendChild(head)

			const items = options.map(o => {
				const btn = document.createElement('button')
				btn.type = 'button'
				btn.className = 'course_picker_item' + (o.id === active ? ' course_picker_active' : '')
				const title = document.createElement('span')
				title.className = 'course_picker_title'
				title.textContent = o.title
				const note = document.createElement('span')
				note.className = 'course_picker_note'
				note.textContent = o.note
				btn.append(title, note)
				btn.addEventListener('click', () => switchCourseProfile(o.id))
				box.appendChild(btn)
				return btn
			})

			if (profiles.length === 0) {
				const empty = document.createElement('div')
				empty.className = 'course_picker_empty'
				empty.textContent = 'No profiles in profiles/*.json'
				box.appendChild(empty)
			}
			backdrop.appendChild(box)

			const onKey = e => {
				const i = items.indexOf(document.activeElement)
				if (e.key === 'Escape' || e.key === 'u' || e.key === 'U') close()
				else if (e.key === 'ArrowDown') items[(i + 1) % items.length].focus()
				else if (e.key === 'ArrowUp') items[(i - 1 + items.length) % items.length].focus()
				else if (e.key === 'Enter' && i >= 0) items[i].click()
				else return
				e.preventDefault()
				e.stopPropagation()
			}
			const close = () => {
				backdrop.remove()
				document.removeEventListener('keydown', onKey, true)
			}
			backdrop.addEventListener('click', e => { if (e.target === backdrop) close() })
			document.addEventListener('keydown', onKey, true)
			document.body.appendChild(backdrop)
			;(items.find(b => b.classList.contains('course_picker_active')) || items[0]).focus()
		})
}

export default () => {
	return {
		id: 'course_profile',
		init: (deck) => {
			deck.addKeyBinding({ keyCode: 85, key: 'U', description: 'Course profile (agenda of a course)' }, openPicker)

			deck.on('ready', () => {
				loadCourseProfile().then(profile => {
					if (!profile) return
					const configEl = document.getElementById('farberg-deck-config')
					const page = configEl ? JSON.parse(configEl.textContent) : {}
					const slides = deck.getSlidesElement()

					// Title slide of the deck
					const meta = page.deck || {}
					const first = slides.querySelector(':scope > section')
					const firstSlide = first && (first.querySelector(':scope > section') || first)
					const deckBadge = meta.number && firstSlide && badge(profile, courseEntry(profile, 'decks', meta.number + (meta.sub || '')))
					if (deckBadge) firstSlide.appendChild(deckBadge)

					// Sections of this deck listed in the profile
					if (meta.number) markSections(deck, profile, courseEntry(profile, 'decks', meta.number + (meta.sub || '')).sections || {})

					// Exercise slides listed in the profile
					for (const id of Object.keys(profile.exercises || {})) {
						const slide = slides.querySelector(`section#${CSS.escape(id)}`)
						const exerciseBadge = slide && badge(profile, courseEntry(profile, 'exercises', id))
						if (exerciseBadge) slide.appendChild(exerciseBadge)
					}
				})
			})
		}
	}
}
