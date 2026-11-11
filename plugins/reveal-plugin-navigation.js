/*
	Navigation

	Everything around the bottom strip and moving through a deck, at runtime. The build-time part (chapter overview, numbered menu names, file trees) is in scripts/structure.js.

	Vertical slides (separator vvv) are optional details below a slide of the main flow:
	- The slide number counts only the main flow: "12 / 140" on a main slide, "12.2 / 140" on its second vertical slide
	- A tab hangs from the top right corner of the window: red with the number of detail slides on a main slide that has vertical slides below ("↓ 3 details"), grey with the position on a vertical slide ("detail 2 / 3"); a click goes down (on the last vertical slide: back up to the main slide)
	- Each vertical slide gets a thin red bar on its left edge
	- The feedback button and the attribution move left only as far as the slide number needs (CSS variable --fb-right, default 66px)

	Menu bar (built by simplemenu from data-name): slides with data-level="2" or deeper, the attribute the chapter overview uses, are sub-sections of the entry before them; their menu items are wrapped in light brackets, e.g. "Package Management [ Kustomize Helm Exercise 1 ] Tilt".

	Keys: A goes to the agenda (#agenda in this deck, otherwise via the root page), O to the chapter overview slide (<div data-chapter-overview>; without one, O keeps reveal's slide overview, also on ESC).

	Help ("?"): reveal renders it from its built-in list of default shortcuts plus the key bindings registered with a description. Overrides are not reflected there (e.g. the chalkboard takes B, which reveal still lists as "Pause"), and reveal does not expose that list, so the rendered table is corrected right after it opens.

	Styles: .vertical-tab, .vertical-bar and .menubar li.sm-bracket in css/dhbw.css
 */

const helpFixes = {
	// reveal's key label (spaces removed) -> replacement rows
	'B,.': [['. , V', 'Pause (black screen)']],
	'ESC,O': [['ESC', 'Slide overview']],
	'G': [['G', 'Jump to slide'], ['HOME , END', 'First / last slide'], ['PAGE UP , PAGE DOWN', 'Previous / next slide (presenter)']]
}

function fixHelpTable(table) {
	if (table.dataset.fixed) return
	table.dataset.fixed = 'true'
	for (const tr of [...table.querySelectorAll('tr')]) {
		const cells = tr.querySelectorAll('td')
		if (cells.length !== 2) continue
		const replacement = helpFixes[cells[0].textContent.replace(/\s+/g, '')]
		if (!replacement) continue
		for (const [key, description] of replacement) {
			const row = document.createElement('tr')
			const k = document.createElement('td'), d = document.createElement('td')
			k.textContent = key
			d.textContent = description
			row.append(k, d)
			tr.before(row)
		}
		tr.remove()
	}
}

function detailsBelow(deck, h) {
	const stack = deck.getHorizontalSlides()[h]
	return stack ? stack.querySelectorAll(':scope > section').length - 1 : 0
}

function levelOf(section) {
	const own = section.getAttribute('data-level')
	if (own) return parseInt(own, 10) || 1
	// data-name of the first slide of a vertical stack is moved to the stack by simplemenu
	const first = section.querySelector(':scope > section')
	return first && first.getAttribute('data-level') ? parseInt(first.getAttribute('data-level'), 10) || 1 : 1
}

function markVerticalSlides(deck) {
	for (const stack of deck.getHorizontalSlides()) {
		const slides = [...stack.children].filter(c => c.tagName === 'SECTION')
		if (slides.length < 2 || slides[1].classList.contains('vertical-slide')) continue
		for (const slide of slides.slice(1)) {
			slide.classList.add('vertical-slide')
			const bar = document.createElement('div')
			bar.className = 'vertical-bar'
			slide.appendChild(bar)
		}
	}
}

function bracketMenuLevels() {
	const items = [...document.querySelectorAll('.menubar .menu > li')]
	const sub = items.map(li => {
		const href = li.querySelector('a')?.getAttribute('href') || ''
		const section = href.startsWith('#/') ? document.getElementById(decodeURIComponent(href.slice(2))) : null
		return !!section && levelOf(section) > 1
	})
	const bracket = (text, side) => {
		const li = document.createElement('li')
		li.className = 'sm-bracket sm-bracket-' + side
		li.setAttribute('aria-hidden', 'true')
		li.textContent = text
		return li
	}
	items.forEach((li, i) => {
		if (!sub[i]) return
		li.classList.add('sm-sub')
		if (!sub[i - 1]) li.before(bracket('[', 'open'))
		if (!sub[i + 1]) li.after(bracket(']', 'close'))
	})
}

export default () => {
	return {
		id: 'navigation',
		init: (deck) => {
			// Keep the feedback button and the attribution clear of the slide number
			function placeStrip() {
				requestAnimationFrame(() => {
					const number = deck.getRevealElement().querySelector('.slide-number')
					const width = number && number.offsetParent ? number.offsetWidth : 0
					document.documentElement.style.setProperty('--fb-right', `${Math.max(66, 8 + width + 10)}px`)
				})
			}

			// Registered key bindings take precedence over reveal's defaults (A: auto-slide, O: overview) and show up in the help
			deck.addKeyBinding({ keyCode: 65, key: 'A', description: 'Agenda (all chapters)' }, () => {
				if (document.getElementById('agenda')) window.location.hash = '#/agenda'
				else window.location.assign('./#/agenda')
			})
			deck.addKeyBinding({ keyCode: 79, key: 'O', description: 'Chapter overview slide' }, () => {
				const target = document.querySelector('.reveal .slides [data-chapter-overview]')
				const slide = target && target.closest('section')
				if (slide) {
					const { h, v } = deck.getIndices(slide)
					deck.slide(h, v)
				} else deck.toggleOverview()
			})

			new MutationObserver(() => {
				const table = document.querySelector('.r-overlay-help .r-overlay-help-content table')
				if (table) fixHelpTable(table)
			}).observe(document.body, { childList: true, subtree: true })

			// The stacks and the menu bar only exist once the markdown is rendered and simplemenu ran
			deck.on('ready', () => {
				markVerticalSlides(deck)

				// reveal shows the total only when it is a number; the first part may contain HTML
				deck.configure({
					slideNumber: (slide) => {
						const { h, v } = deck.getIndices(slide)
						return [v > 0 ? `${h + 1}.${v}` : `${h + 1}`, ' / ', deck.getHorizontalSlides().length]
					}
				})

				// Tab in the top right corner for the vertical slides of the current stack
				const tab = document.createElement('button')
				tab.className = 'vertical-tab'
				tab.addEventListener('click', (event) => {
					event.preventDefault()
					event.stopPropagation()
					const { h, v } = deck.getIndices()
					if (v < detailsBelow(deck, h)) deck.down()
					else deck.slide(h, 0)
				})
				deck.getRevealElement().appendChild(tab)
				const updateTab = () => {
					const { h, v } = deck.getIndices()
					const details = detailsBelow(deck, h)
					tab.hidden = !(details > 0)
					tab.classList.toggle('vertical-tab-inside', v > 0)
					tab.innerHTML = v === 0 ? `<span class="arrow">↓</span> ${details} detail${details === 1 ? '' : 's'}` : `detail ${v} / ${details}`
					tab.title = v === 0 ? 'Detail slides below (arrow down)' : (v < details ? 'Next detail slide (arrow down)' : 'Back to the main slide')
				}

				deck.on('slidechanged', placeStrip)
				deck.on('slidechanged', updateTab)
				placeStrip()
				updateTab()
				setTimeout(bracketMenuLevels)
			})
		}
	}
}
