function showLinkToSlidesAndQrCode(deck, url) {
	if (url === undefined)
		return

	let qrElements = deck.getSlidesElement().getElementsByClassName('qrcodeforslides')
	for (let qrel of qrElements) {
		QRCode.toCanvas(qrel, url, { scale: 15, margin: 0 }, function (error) {
			if (error) console.error(error)
		});
	}

	let urlElements = deck.getSlidesElement().getElementsByClassName('urlforslides')
	for (let linkel of urlElements) {
		linkel.href = url;
		linkel.text = url.replace("https://", "").replace("http://", "");
	}

}

export default () => {
	return {
		id: 'show_qr_code',
		init: (deck) => {

			deck.on('ready', () => {
				fetch("package.json")
					.then(res => res.json())
					.then(json => showLinkToSlidesAndQrCode(deck, json.homepage))
					.catch(err => console.log("Error fetching package.json", err))

			})
		}
	}
}