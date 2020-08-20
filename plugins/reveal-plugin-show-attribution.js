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

	//console.log("Setting credits to" + creditsText);
	if ("" !== creditsText)
		creditsTag.innerHTML = "<span>" + creditsText + "</span>";
	else
		creditsTag.innerHTML = "";
}

export default () => {

	return {
		id: 'show_attribution',
		init: (deck) => {

			deck.on('ready', () => {
				var credits = document.createElement("attribution");
				credits.setAttribute("id", "attribution");
				deck.getRevealElement().appendChild(credits);

				showAttributionOnSlide(deck.getCurrentSlide())

				deck.addEventListener('slidechanged', function (event) {
					showAttributionOnSlide(event.currentSlide)
				})

			})
		}
	}
}