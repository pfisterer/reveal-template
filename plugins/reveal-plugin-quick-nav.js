/*
	Quick Navigation Overlay

	Press 'q' to open (or close) an overlay listing all h1 and h2 headings
	across the deck. Each heading is a link that jumps to the slide. A text
	input at the top filters the list as you type. Press ESC (or click the
	backdrop / close button) to dismiss the overlay.

	The list is rendered in multiple columns so 30-60 slides with headings
	can be scanned at a glance.
 */

function collectHeadings(deck) {
	const items = []
	const horizontalSlides = deck.getSlidesElement().querySelectorAll(':scope > section')

	horizontalSlides.forEach((hSection, h) => {
		const verticals = hSection.querySelectorAll(':scope > section')
		if (verticals.length > 0) {
			verticals.forEach((vSection, v) => extractFromSection(vSection, h, v, items))
		} else {
			extractFromSection(hSection, h, 0, items)
		}
	})

	return items
}

function extractFromSection(section, h, v, items) {
	const headings = section.querySelectorAll('h1, h2')
	if (headings.length === 0) return
	const slideText = (section.innerText || section.textContent || '').toLowerCase()
	headings.forEach(heading => {
		const text = heading.textContent.trim()
		if (!text) return
		items.push({
			text,
			level: heading.tagName.toLowerCase(),
			searchText: slideText,
			h,
			v
		})
	})
}

function injectStyles() {
	if (document.getElementById('quick-nav-styles')) return

	const css = `
		#quick-nav-overlay {
			position: fixed;
			inset: 0;
			background: rgba(0,0,0,0.65);
			z-index: 10000;
			display: none;
			font-family: sans-serif;
		}
		#quick-nav-overlay.visible { display: block; }
		#quick-nav-overlay .quick-nav-panel {
			position: absolute;
			top: 3vh;
			left: 50%;
			transform: translateX(-50%);
			width: 92vw;
			max-width: 1500px;
			max-height: 94vh;
			background: #fff;
			border-radius: 8px;
			box-shadow: 0 12px 48px rgba(0,0,0,0.4);
			display: flex;
			flex-direction: column;
			overflow: hidden;
		}
		#quick-nav-overlay .quick-nav-header {
			display: flex;
			align-items: center;
			padding: 12px 16px;
			border-bottom: 1px solid #e0e0e0;
			background: #f7f7f7;
			gap: 12px;
		}
		#quick-nav-overlay .quick-nav-title {
			font-weight: bold;
			color: #555;
			font-size: 13px;
			white-space: nowrap;
		}
		#quick-nav-overlay .quick-nav-search {
			flex: 1;
			font-size: 14px;
			padding: 6px 10px;
			border: 1px solid #ccc;
			border-radius: 4px;
			outline: none;
		}
		#quick-nav-overlay .quick-nav-search:focus {
			border-color: #e2001a;
			box-shadow: 0 0 0 2px rgba(226,0,26,0.2);
		}
		#quick-nav-overlay .quick-nav-count {
			color: #888;
			font-size: 11px;
			white-space: nowrap;
		}
		#quick-nav-overlay .quick-nav-close {
			background: transparent;
			border: none;
			font-size: 26px;
			line-height: 1;
			cursor: pointer;
			color: #555;
			padding: 0 6px;
		}
		#quick-nav-overlay .quick-nav-close:hover { color: #e2001a; }
		#quick-nav-overlay .quick-nav-list {
			flex: 1;
			overflow-y: auto;
			padding: 12px 16px;
			column-count: 2;
			column-gap: 24px;
			column-rule: 1px solid #eee;
		}
		@media (min-width: 1100px) {
			#quick-nav-overlay .quick-nav-list { column-count: 3; }
		}
		@media (min-width: 1600px) {
			#quick-nav-overlay .quick-nav-list { column-count: 4; }
		}
		#quick-nav-overlay .quick-nav-item {
			display: block;
			padding: 3px 6px;
			margin: 1px 0;
			border-radius: 3px;
			color: #222;
			text-decoration: none;
			font-size: 12px;
			line-height: 1.3;
			break-inside: avoid;
			cursor: pointer;
		}
		#quick-nav-overlay .quick-nav-item:hover,
		#quick-nav-overlay .quick-nav-item.active {
			background: #e2001a;
			color: #fff;
		}
		#quick-nav-overlay .quick-nav-h1 {
			font-weight: bold;
			font-size: 13px;
			margin-top: 5px;
		}
		#quick-nav-overlay .quick-nav-h2 {
			padding-left: 16px;
			color: #444;
		}
		#quick-nav-overlay .quick-nav-empty {
			padding: 20px;
			color: #888;
			column-span: all;
			text-align: center;
		}
	`

	const style = document.createElement('style')
	style.id = 'quick-nav-styles'
	style.textContent = css
	document.head.appendChild(style)
}

function buildOverlay(deck) {
	const overlay = document.createElement('div')
	overlay.id = 'quick-nav-overlay'
	overlay.innerHTML = `
		<div class="quick-nav-panel" role="dialog" aria-label="Quick slide navigation">
			<div class="quick-nav-header">
				<span class="quick-nav-title">Quick Nav</span>
				<input type="text" class="quick-nav-search" placeholder="Filter headings…" autocomplete="off" spellcheck="false" />
				<span class="quick-nav-count"></span>
				<button class="quick-nav-close" title="Close (Esc / q)">×</button>
			</div>
			<div class="quick-nav-list"></div>
		</div>
	`
	document.body.appendChild(overlay)

	const panel = overlay.querySelector('.quick-nav-panel')
	const input = overlay.querySelector('.quick-nav-search')
	const list = overlay.querySelector('.quick-nav-list')
	const count = overlay.querySelector('.quick-nav-count')
	const closeBtn = overlay.querySelector('.quick-nav-close')

	let allItems = []
	let filtered = []
	let activeIndex = -1

	function render() {
		list.innerHTML = ''
		if (filtered.length === 0) {
			const empty = document.createElement('div')
			empty.className = 'quick-nav-empty'
			empty.textContent = 'No matching headings'
			list.appendChild(empty)
		} else {
			filtered.forEach((item, idx) => {
				const a = document.createElement('a')
				a.className = `quick-nav-item quick-nav-${item.level}`
				if (idx === activeIndex) a.classList.add('active')
				a.textContent = item.text
				a.href = '#'
				a.addEventListener('click', e => {
					e.preventDefault()
					jumpTo(item)
				})
				list.appendChild(a)
			})
		}
		count.textContent = `${filtered.length} / ${allItems.length}`
	}

	function applyFilter() {
		const q = input.value.toLowerCase().trim()
		if (q === '') {
			filtered = allItems
		} else {
			filtered = allItems.filter(i => i.searchText.includes(q))
		}
		activeIndex = filtered.length > 0 ? 0 : -1
		render()
	}

	function jumpTo(item) {
		hide()
		deck.slide(item.h, item.v)
	}

	function show() {
		allItems = collectHeadings(deck)
		filtered = allItems
		input.value = ''
		activeIndex = filtered.length > 0 ? 0 : -1
		render()
		overlay.classList.add('visible')
		setTimeout(() => input.focus(), 30)
	}

	function hide() {
		overlay.classList.remove('visible')
	}

	function isVisible() {
		return overlay.classList.contains('visible')
	}

	function toggle() {
		if (isVisible()) hide()
		else show()
	}

	input.addEventListener('input', applyFilter)
	closeBtn.addEventListener('click', hide)
	overlay.addEventListener('click', e => {
		if (e.target === overlay) hide()
	})

	overlay.addEventListener('keydown', e => {
		if (e.key === 'Escape') {
			e.preventDefault()
			e.stopPropagation()
			hide()
			return
		}
		if (e.key === 'Enter' && activeIndex >= 0 && filtered[activeIndex]) {
			e.preventDefault()
			jumpTo(filtered[activeIndex])
			return
		}
		if (e.key === 'ArrowDown') {
			e.preventDefault()
			if (filtered.length === 0) return
			activeIndex = (activeIndex + 1) % filtered.length
			render()
			scrollActiveIntoView()
			return
		}
		if (e.key === 'ArrowUp') {
			e.preventDefault()
			if (filtered.length === 0) return
			activeIndex = (activeIndex - 1 + filtered.length) % filtered.length
			render()
			scrollActiveIntoView()
			return
		}
	})

	function scrollActiveIntoView() {
		const el = list.querySelector('.quick-nav-item.active')
		if (el) el.scrollIntoView({ block: 'nearest' })
	}

	return { show, hide, toggle, isVisible }
}

export default () => {

	return {
		id: 'quick_nav',
		init: (deck) => {
			injectStyles()

			deck.on('ready', () => {
				const overlay = buildOverlay(deck)

				deck.addKeyBinding(
					{ keyCode: 81, key: 'Q', description: 'Quick navigation overlay' },
					() => overlay.toggle()
				)
			})
		}
	}
}
