function initSlide(slide) {
	let players = []

	let asciinemaElements = slide.getElementsByTagName("asciinema")

	for (let el of asciinemaElements) {
		console.log("Found asciinema element: ", el)

		//Make element invisible
		el.style.display = "none"

		//Create player
		const source = el.getAttribute('src')
		const conf = el.getAttribute('data-conf')
		const div = document.createElement('div')

		div.setAttribute('data-farberg-asciinema', 'true')

		console.log("Playing", source, "with options", conf)
		players.push(AsciinemaPlayer.create(source, div, JSON.parse(conf)))

		el.parentNode.insertBefore(div, el.nextSibling)
	}

	return players
}

function destroyPlayer(slide, players) {
	//remove elements from dom with attribute data-farberg-asciinema
	let elementsToRemove = slide.querySelectorAll('[data-farberg-asciinema]')
	console.log("Removing", elementsToRemove.length, "elements with attribute data-farberg-asciinema")

	for (let el of elementsToRemove)
		el.parentNode.removeChild(el)

	//destroy players
	console.log("Destroying", players.length, "players")
	players.forEach(player => player.dispose())
}

export default () => {

	return {
		id: 'asciinema',
		init: (deck) => {
			deck.on('ready', () => {
				let currentPlayers = undefined

				currentPlayers = initSlide(deck.getCurrentSlide())

				deck.addEventListener('slidechanged', function (event) {
					if (event.previousSlide)
						destroyPlayer(event.previousSlide, currentPlayers)

					currentPlayers = initSlide(event.currentSlide)
				})
			})
		}
	}
}