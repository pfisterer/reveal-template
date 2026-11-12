/*
	Course profiles: one lecture site, several courses with different agendas.

	A start link with ?profile=<id> stores <id> in the localStorage of the browser (per lecture directory), ?profile=none removes it. The profile itself is profiles/<id>.json in the lecture repository (copied to dist/profiles by dennis_build), so the agenda of a course can change during the semester without a new link:

	{
		"title": "WDSKI24",
		"decks": {
			"03f": "prior",
			"04a": { "status": "core", "date": "2026-11-18" },
			"04d": { "status": "core", "sections": { "Access Control": "skip", "Supply Chain": "optional" } },
			"04e": "skip",
			"05b": { "status": "optional", "date": "2026-12-14" }
		},
		"exercises": { "<slide id of an exercise>": "optional" }
	}

	Deck keys are the number plus the sub letter of the deck ("04a", "05" for a chapter deck). Status: prior (prior knowledge), core (the default), optional, skip. "sections" in a deck entry marks parts of that deck by the data-name of their first slide (the name in the menu bar); a section ends at the next named slide of the same or a higher data-level. Skipped sections are removed from the presentation. Without a profile, nothing changes.
	Used by reveal-plugin-show-toc.js (marks the agenda rows) and reveal-plugin-course-profile.js (badges on the title slide of a deck and on exercise slides).
 */

const KEY = 'farberg-profile:' + new URL('.', window.location.href).pathname
const STATUSES = ['prior', 'core', 'optional', 'skip']
export const STATUS_LABELS = { prior: 'prior knowledge', core: '', optional: 'optional', skip: 'skipped' }

let profilePromise

// localStorage can be missing or throw (private mode, blocked site data)
function storage(fn) {
	try { return fn(window.localStorage) } catch (e) { return null }
}

export function loadCourseProfile() {
	if (profilePromise) return profilePromise
	const param = new URLSearchParams(window.location.search).get('profile')
	if (param === 'none') storage(s => s.removeItem(KEY))
	else if (param && /^[A-Za-z0-9_-]+$/.test(param)) storage(s => s.setItem(KEY, param))
	const id = storage(s => s.getItem(KEY))
	profilePromise = !id ? Promise.resolve(null) : fetch(`profiles/${id}.json`, { cache: 'no-store', credentials: 'include' })
		.then(res => res.ok ? res.json() : null)
		.then(profile => profile ? Object.assign({ id, title: id }, profile) : null)
		.catch(e => { console.log(`Unable to load course profile ${id}`, e); return null })
	return profilePromise
}

// Status and date of a deck ("decks") or an exercise ("exercises"); entries are either a status string or { status, date }
export function courseEntry(profile, group, key) {
	const value = profile && profile[group] && profile[group][key]
	const entry = typeof value === 'string' ? { status: value } : Object.assign({}, value)
	if (!STATUSES.includes(entry.status)) entry.status = 'core'
	return entry
}

// "2026-11-18" -> "18 Nov" (the same in every browser, without the year)
export function formatCourseDate(date) {
	if (!date) return ''
	const d = new Date(date + 'T00:00:00')
	return isNaN(d) ? date : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// Id of the active profile (or null), without loading it
export function activeCourseProfileId() {
	return storage(s => s.getItem(KEY))
}

// Activate a profile (null: none) and reload the page so that agenda and badges follow it
export function switchCourseProfile(id) {
	const url = new URL(window.location.href)
	url.searchParams.set('profile', id || 'none')
	window.location.assign(url.pathname + url.search + url.hash)
}

export function courseResetLink() {
	const url = new URL(window.location.href)
	url.searchParams.set('profile', 'none')
	return url.pathname + url.search + url.hash
}
