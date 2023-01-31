
export default () => {

	return {
		id: 'asciinema',
		init: (deck) => {

			deck.on('ready', () => {

				deck.addEventListener('slidechanged', function (event) {

					// Workaround to get elements into an array before they are replaced
					const els = []
					for (let el of deck.getRevealElement().getElementsByTagName("asciinema")) {
						els.push(el)
					}

					for (let el of els) {
						console.log("Looking @", el)
						const source = el.getAttribute('src')
						const conf = el.getAttribute('data-conf')
						const div = document.createElement('div')

						el.parentElement.replaceChild(div, el)

						console.log("Playing", source, "with options", conf)
						console.log(AsciinemaPlayer.create(source, div, JSON.parse(conf)));
					}
				})


			})

		}
	}
}