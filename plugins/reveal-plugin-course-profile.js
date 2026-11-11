/*
	Shows the course profile (see course-profile.js) in a deck: a badge on the title slide with the status and date of this deck in the course, and a badge on every exercise slide whose id the profile lists under "exercises" (e.g. optional or skipped in this course).
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
