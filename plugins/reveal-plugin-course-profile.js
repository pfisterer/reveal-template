/*
	Shows the course profile (see course-profile.js) in a deck: a badge on the title slide with the status and date of this deck in the course, and a badge on every exercise slide whose id the profile lists under "exercises" (e.g. optional or skipped in this course).
	The agenda rows are marked by reveal-plugin-show-toc.js.
 */

import { loadCourseProfile, courseEntry, formatCourseDate, STATUS_LABELS } from './course-profile.js'

function badge(profile, entry) {
	const parts = [STATUS_LABELS[entry.status], formatCourseDate(entry.date)].filter(Boolean)
	if (parts.length === 0) return null
	const el = document.createElement('div')
	el.className = `course_badge course_badge_${entry.status}`
	el.textContent = `${profile.title} · ${parts.join(', ')}`
	return el
}

export default () => {
	return {
		id: 'course_profile',
		init: (deck) => {
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
