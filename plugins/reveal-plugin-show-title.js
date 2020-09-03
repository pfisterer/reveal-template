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
				let info_json_url = (deck.getConfig().farberg_reveal_template || {}).info_json || new URL('package.json', window.location)
				if (info_json_url)
					fetch(info_json_url.href, { "cache": "no-store" })
						.then(response => response.json())
						.then(packageJson => showTitle(deck, packageJson));
				else
					console.log("show_title: no URL available @ farberg_reveal_template.info_json")
			})
		}
	}
}