/*
	Vertical Slides

	Vertical slides (separator vvv) are optional details below a slide of the main flow. This plugin makes them visible without taking space where there are none:

	- The slide number counts only the main flow: "12 / 140" on a main slide, "12.2 / 140" on its second vertical slide
	- A main slide with vertical slides below shows a red arrow and their number before the slide number ("↓3 12 / 140"); a click on it goes down
	- Each vertical slide gets a thin red bar on its left edge
	- The feedback button and the attribution move left only as far as the slide number needs (CSS variable --fb-right, default 66px)

	Styles: .vertical-hint and .vertical-bar in css/dhbw.css
 */

function detailsBelow(deck, h) {
	const stack = deck.getHorizontalSlides()[h]
	return stack ? stack.querySelectorAll(':scope > section').length - 1 : 0
}

export default () => {
	return {
		id: 'vertical-slides',
		init: (deck) => {
			// Keep the feedback button and the attribution clear of the slide number
			function placeStrip() {
				requestAnimationFrame(() => {
					const number = deck.getRevealElement().querySelector('.slide-number')
					const width = number && number.offsetParent ? number.offsetWidth : 0
					document.documentElement.style.setProperty('--fb-right', `${Math.max(66, 8 + width + 10)}px`)
				})
			}

			// The stacks only exist once the markdown is rendered, so decorate on ready
			deck.on('ready', () => {
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

				// reveal shows the total only when it is a number; the first part may contain HTML
				deck.configure({
					slideNumber: (slide) => {
						const { h, v } = deck.getIndices(slide)
						const details = v === 0 ? detailsBelow(deck, h) : 0
						const arrow = details > 0 ? `<span class="vertical-hint" title="${details} detail slide${details === 1 ? '' : 's'} below (arrow down)"><span class="arrow">↓</span>${details}</span>` : ''
						return [v > 0 ? `${h + 1}.${v}` : `${arrow}${h + 1}`, ' / ', deck.getHorizontalSlides().length]
					}
				})

				// The slide number is a link: a click on the arrow goes down instead
				deck.getRevealElement().addEventListener('click', (event) => {
					if (!event.target.closest('.slide-number .vertical-hint')) return
					event.preventDefault()
					event.stopPropagation()
					deck.down()
				}, true)

				deck.on('slidechanged', placeStrip)
				placeStrip()
			})
		}
	}
}
