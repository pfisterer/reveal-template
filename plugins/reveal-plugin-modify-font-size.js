function modifyFontSize(deck, delta) {

	for (let el of deck.getElementsByClassName("reveal")) {

		if (!el.hasAttribute("data-font-size")) {
			let fs = parseFloat(window.getComputedStyle(el, null).getPropertyValue('font-size'))
			el.setAttribute("data-font-size", fs)
		}

		let fontSize = parseFloat(el.getAttribute("data-font-size"))
		let newFontSize = `${fontSize + delta}px`
		el.setAttribute("data-font-size", newFontSize)
		console.log(`Setting font size to ${newFontSize}`)
		el.style.fontSize = newFontSize;
	}
}

export default () => {

	return {
		id: 'modify_font_size',
		init: (deck) => {

			deck.on('ready', () => {
				deck.addKeyBinding({ keyCode: 187, key: '+' }, () => modifyFontSize(1));
				deck.addKeyBinding({ keyCode: 189, key: '-' }, () => modifyFontSize(-1));
			})
		}
	}
}