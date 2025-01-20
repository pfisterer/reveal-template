/*
	Display a QR code in a destination element by extracting data out of `package.json` and can show the URL on the slides

	package.json:

	{
		[...]
		"homepage": "http://the.url/to/the/slides"
		[...]
	}

	Example:
		Show QR code: 
			<canvas class="qrcodeforslides"></canvas>

		Show URL: 
			<a class="urlforslides" style="font-size: 200%"></a>

*/


function showLinkToSlidesAndQrCode(deck, url) {
	if (url === undefined)
		return

	let qrElements = deck.getSlidesElement().getElementsByClassName('qrcodeforslides')
	for (let qrel of qrElements) {

		new QRCode(qrel, {
			text: url,
			width: 500,
			height: 500,
		});

		console.log("QR Code for slides generated", qrel, url)
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
				let info_json_url = (deck.getConfig().farberg_reveal_template || {}).info_json || new URL('package.json', window.location)
				if (info_json_url)
					fetch(info_json_url.href, { "cache": "no-store" })
						.then(res => res.json())
						.then(json => showLinkToSlidesAndQrCode(deck, json.homepage))
						.catch(err => console.log("Error fetching info json", err))
				else
					console.log("show_qr_code: no URL available @ farberg_reveal_template.info_json")

			})
		}
	}
}