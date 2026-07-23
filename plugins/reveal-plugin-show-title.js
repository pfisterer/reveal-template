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
		// We run here during plugin init — before Reveal's first slidechanged
		// fires — so setting data-state now lets Reveal mirror it automatically
		// when the initial slide is shown. The getCurrentSlide() guard below is
		// a belt-and-suspenders fallback for the case where the title slide is
		// already the current one by the time this runs.
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
		// Run during init (NOT on 'ready') and return the promise so Reveal awaits
		// it before continuing. This matters for print/PDF: Reveal computes the
		// print layout (measuring each slide's scrollHeight to paginate) *after*
		// all plugin init() promises resolve but *before* the 'ready' event fires.
		// The markdown plugin is registered ahead of us and its init() resolves
		// first, so `.lecturetitle` already exists here. Injecting the title
		// content now guarantees the slide has its final height before Reveal
		// measures it — otherwise the title slide is paginated while still empty
		// and renders wrong in the print view and PDF.
		init: (deck) => {
			let info_json_url = (deck.getConfig().farberg_reveal_template || {}).info_json || new URL('package.json', window.location)
			if (!info_json_url) {
				console.log("show_title: no URL available @ farberg_reveal_template.info_json")
				return
			}
			// Always resolve (never reject/hang): Reveal's plugin loader only
			// chains .then(), so a rejected promise would stall initialization.
			return fetch(info_json_url.href, { "cache": "no-store", "credentials": "include" })
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
				})
				.catch(err => console.error("show_title: failed to load title info", err));
		}
	}
}