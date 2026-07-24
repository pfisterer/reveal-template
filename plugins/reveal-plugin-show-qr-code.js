/*
	Display a QR code in a destination element using the lecture metadata that
	dennis_build embeds into the page (farberg_reveal_template.info.homepage)
	and can show the URL on the slides.

	Example:
		Show QR code: 
			<canvas class="qrcodeforslides"></canvas>

		Show URL: 
			<a class="urlforslides" style="font-size: 200%"></a>

*/


function showLinkToSlidesAndQrCode(QrCreator, deck, url) {
	if (url === undefined)
		return

	let qrElements = deck.getSlidesElement().getElementsByClassName('qrcodeforslides')
	for (let qrel of qrElements) {

		QrCreator.render({
			text: url,
			size: 500,
		}, qrel);

		//console.log("QR Code for slides generated", qrel, url)
	}

	let urlElements = deck.getSlidesElement().getElementsByClassName('urlforslides')
	for (let linkel of urlElements) {
		linkel.href = url;
		linkel.text = url.replace("https://", "").replace("http://", "");
	}

}

export default (QrCreator) => {
	return {
		id: 'show_qr_code',
		init: (deck) => {
			deck.on('ready', () => {
				const info = (deck.getConfig().farberg_reveal_template || {}).info
				if (info && info.homepage)
					showLinkToSlidesAndQrCode(QrCreator, deck, info.homepage)
				else
					console.log("show_qr_code: no homepage @ farberg_reveal_template.info")
			})
		}
	}
}