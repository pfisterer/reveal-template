function showTitle(deck, packageJson) {
	let lectureTitle = packageJson.title

	let authors = packageJson.authors || []
	let authorBlock = authors.map(entry => `<a href="${entry.homepage}"> ${entry.name}</a>`).join(", ")

	for (let el of deck.getSlidesElement().getElementsByClassName("lecturetitle")) {
		let slideTitle = el.innerText;

		el.innerHTML = `
				<div style="height: 120px;"></div>
					<h1>${lectureTitle}</h1>
					<h3>${slideTitle}</h3>
	
					<div style="height: 170px;"></div>
					
					<div style="font-size: .7em; font-weight: bold;">
						${authorBlock}
						<br/><br/>
					</div>
			`;

		document.title = `${lectureTitle} - ${slideTitle}`
	}

}

export default () => {

	return {
		id: 'show_title',
		init: (deck) => {

			deck.on('ready', () => {
				fetch("package.json")
					.then(response => response.json())
					.then(packageJson => showTitle(deck, packageJson));
			})
		}
	}
}