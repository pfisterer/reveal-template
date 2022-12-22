
export default () => {

	return {
		id: 'asciinema',
		init: (deck) => {

			deck.on('ready', () => {
				for (let el of deck.getRevealElement().getElementsByTagName("asciinema")) {
					const source = el.getAttribute('src')
					const conf = el.getAttribute('data-conf')
					const div = document.createElement('div')

					el.parentElement.replaceChild(div, el)

					AsciinemaPlayer.create(source, div, JSON.parse(conf));
				}
			})

		}
	}
}