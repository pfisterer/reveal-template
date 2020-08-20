function resizeIFrameToFitContent(iFrame) {
	iFrame.width = iFrame.contentWindow.document.body.scrollWidth;
	iFrame.height = iFrame.contentWindow.document.body.scrollHeight;
}

function handleSlide(slide) {
	try {
		let els = slide.querySelectorAll('[data-html-example]')
		const singleDestinationEl = slide.querySelector('.html-example-output')

		for (const el of els) {
			const code = el.innerText;
			const destinationById = el.getAttribute('data-html-destination-id')
			const destinationEl = destinationById ? document.getElementById(destinationById) : singleDestinationEl

			//Create a new iframe and set it as the only child of the destination element
			const iframe = document.createElement('iframe');
			iframe.classList.add('html_example')
			destinationEl.innerHTML = ''
			destinationEl.appendChild(iframe)

			//Write the code to the iframe
			const contents = iframe.contentWindow || (iframe.contentDocument.document || iframe.contentDocument);
			contents.document.open();
			contents.document.write(code);
			contents.document.close();

			//Scale the iframe to fit it's contents
			resizeIFrameToFitContent(iframe)

			//Scale the iframe once it comes into view (e.g., on a later slide)
			// cf. https://usefulangle.com/post/113/javascript-detecting-element-visible-during-scroll
			const observer = new IntersectionObserver(entries => {
				if (entries[0].isIntersecting === true)
					resizeIFrameToFitContent(iframe)
			}, { threshold: [0] });
			observer.observe(iframe);

		}
	} catch (e) {
		console.error("Unable to handle slide", slide, ":", e)

	}
}

export default () => {

	return {
		id: 'html_example',
		init: (deck) => {

			deck.on('ready', () => {
				handleSlide(deck.getCurrentSlide());
			})

			deck.on('slidechanged', (event) => {
				handleSlide(event.currentSlide);
			})

		}
	}
}