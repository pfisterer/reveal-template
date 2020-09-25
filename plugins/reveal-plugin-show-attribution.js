function showAttributionOnSlide(slide) {
	//This will set the current credits correctly
	var creditsTag = document.getElementById("attribution");
	var creditsText = "";

	if (slide != null &&
		slide.getElementsByTagName("credits") != null &&
		slide.getElementsByTagName("credits")[0] != null) {

		var currentCredits = slide.getElementsByTagName("credits")[0];
		creditsText = currentCredits.innerHTML;
	}

	//console.log("Setting credits to", creditsText);
	if ("" !== creditsText)
		creditsTag.innerHTML = "<span>" + creditsText + "</span>";
	else
		creditsTag.innerHTML = "";
}

export default () => {

	return {
		id: 'show_attribution',
		init: (deck) => {
			let observer = new MutationObserver(() => {
				showAttributionOnSlide(deck.getCurrentSlide())
			})

			function monitor(target) {
				observer.disconnect()
				observer.observe(target, { subtree: true, childList: true, characterData: true })
			}

			deck.on('ready', () => {
				var credits = document.createElement("attribution");
				credits.setAttribute("id", "attribution");
				deck.getRevealElement().appendChild(credits);

				showAttributionOnSlide(deck.getCurrentSlide())
				monitor(deck.getCurrentSlide())

				deck.addEventListener('slidechanged', function (event) {
					monitor(event.currentSlide)
					showAttributionOnSlide(event.currentSlide)
				})

			})
		}
	}
}