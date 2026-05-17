/*
	Create a title slide automatically by reading data out of package.json to display the title slide:
	
	package.json:
	
	{
		[...]
		title: "Title of the presentation",
		homepage: "https://the.url/to/the/slides",
		authors: [
			{ "name": "John Doe", homepage:"https://jon.doe.com" },
			{ "name": "Jane Doe", homepage:"https://jane.doe.com" },
		]
		[...]
	}

	Example markdown:
		<div class="lecturetitle">This is the Title of the Presentation</div>
*/

function showTitle(deck, packageJson) {
	let lectureTitle = packageJson.title

	let authors = packageJson.authors || []
	let authorBlock = authors.map(entry => `<a href="${entry.homepage}"> ${entry.name}</a>`).join(", ")

	for (let el of deck.getSlidesElement().getElementsByClassName("lecturetitle")) {
		let slideTitle = el.innerText;

		// Mark the enclosing slide so simplemenu hides on it (handled in dhbw.css
		// via body.hide-menubar). Equivalent to writing in the markdown:
		//   <!-- .slide: data-state="hide-menubar" -->
		// Reveal mirrors data-state to body classes on every slidechanged event.
		// We're running here in the 'ready' callback — after the first
		// slidechanged has already fired during init — so for the *current*
		// slide we also need to apply the body class manually. Subsequent
		// navigations are then handled by Reveal automatically.
		const section = el.closest('section');
		if (section) {
			section.setAttribute('data-state', 'hide-menubar');
			if (section === deck.getCurrentSlide()) {
				document.body.classList.add('hide-menubar');
			}
		}

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
					fetch(info_json_url.href, { "cache": "no-store", "credentials": "include" })
						.then(res => {
							if (res.status === 401) {
								console.log("Authentication required (show-title), reloading page");
								window.location.reload();
								return;
							}
							return res.json();
						})
						.then(packageJson => {
							if (packageJson) showTitle(deck, packageJson)
						});
				else
					console.log("show_title: no URL available @ farberg_reveal_template.info_json")
			})
		}
	}
}