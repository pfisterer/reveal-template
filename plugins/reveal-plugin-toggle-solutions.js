
export default () => {

	return {
		id: 'toggle_solution',
		init: (deck) => {

			deck.addKeyBinding({ keyCode: 84, key: 'T' }, () => {
				for (e of rootElement.querySelectorAll('.solution,.solutionvisible')) {
					e.classList.toggle('solutionvisible');
					e.classList.toggle('solution');
				}
			})


		}
	}
}