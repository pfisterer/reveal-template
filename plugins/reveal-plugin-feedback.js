/*
	Feedback- und Umfrage-Plugin fuer die Foliensaetze.

	- Pro Folie: Bewertungsskala von -3 (bad) ueber 0 bis +3 (very good) und
	  Freitext-Kommentar (kleiner Button im Fuss-Streifen, links neben der
	  Foliennummer; oeffnet ein Popover). Bewertung und Kommentar werden erst
	  beim Klick auf "Submit" gemeinsam gesendet (nicht schon beim Anklicken der
	  Skala) -- Cancel verwirft die Eingabe.
	- Pro Block/Vorlesung: Umfragen, direkt im Markdown als <survey>-Element:

		<survey id="cloud-block-difficulty" question="How hard was this block?">
			<option>too easy</option>
			<option>just right</option>
			<option>too hard</option>
		</survey>

		Freitext-Umfrage:
		<survey id="cloud-wishes" question="What should we go deeper on?" type="text"></survey>

	Die Daten gehen per POST an die serverseitige Komponente
	(reveal-feedback-server-side). Der Gruppen-Account kommt dort aus REMOTE_USER,
	wird also NICHT vom Client gesendet.

	Konfiguration (optional) ueber revealOptions.farberg_reveal_template.feedback:
		enabled: false   -> Plugin in diesem Deck abschalten
		apiUrl:  "..."   -> abweichender Endpoint (Default:
		                    /talks/reveal-feedback-server-side/api.php)
*/

export default () => ({
	id: 'feedback',
	init: (deck) => {

		// Im PDF-Export nichts Interaktives einblenden (Gotenberg rendert print-pdf)
		const isPrint = /print-pdf/.test(window.location.search)

		const rt = (deck.getConfig().farberg_reveal_template || {})
		const cfg = rt.feedback || {}
		if (cfg.enabled === false) return

		const apiUrl = cfg.apiUrl
			|| window.FEEDBACK_API
			|| '/talks/reveal-feedback-server-side/api.php'

		// --- Kurs-Identitaet: einmalig aus package.json (wie show-qr-code) -------
		let course = window.location.origin + window.location.pathname
		let courseTitle = document.title || ''
		const infoUrl = rt.info_json || new URL('package.json', window.location)

		function loadCourseInfo() {
			return fetch(infoUrl.href, { cache: 'no-store', credentials: 'include' })
				.then(res => {
					if (res.status === 401) { window.location.reload(); return null }
					return res.ok ? res.json() : null
				})
				.then(json => {
					if (json) {
						if (json.homepage) course = json.homepage
						if (json.title) courseTitle = json.title
					}
				})
				.catch(() => { /* Kurs bleibt auf Fallback */ })
		}

		function deckName() {
			const raw = decodeURIComponent(window.location.search.replace(/^\?/, ''))
			return raw.split('/')[0] || 'index'
		}

		function slideId() {
			const s = deck.getCurrentSlide()
			if (s && s.id) return s.id
			const i = deck.getIndices()
			return 'h' + i.h + (i.v ? '-v' + i.v : '')
		}

		function lsGet(k) { try { return window.localStorage.getItem(k) } catch (e) { return null } }
		function lsSet(k, v) { try { window.localStorage.setItem(k, v) } catch (e) { } }

		// --- POST-Helfer --------------------------------------------------------
		function send(payload) {
			return fetch(apiUrl, {
				method: 'POST',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(Object.assign({ course, course_title: courseTitle }, payload))
			}).then(res => {
				if (res.status === 401) { window.location.reload(); return { ok: false } }
				return res.json().catch(() => ({ ok: false }))
			})
		}

		// --- Styles -------------------------------------------------------------
		// Die Platzierung im Fuss-Streifen (fester Slot zwischen Foliennummer und
		// Attribution) sowie die dafuer noetige attribution-Verschiebung leben in
		// css/dhbw.css. Hier nur der Stil des Buttons/Popovers und der Umfragen.
		function injectStyle() {
			if (document.getElementById('feedback-plugin-style')) return
			const s = document.createElement('style')
			s.id = 'feedback-plugin-style'
			s.textContent = `
				#fb-widget { position: fixed; right: var(--fb-right, 52px); bottom: var(--dhbw-strip-bottom, 6px);
					z-index: 100; height: var(--dhbw-strip-height, 20px); display: flex; align-items: center;
					font-family: Arial, Helvetica, sans-serif; }
				#fb-trigger { background: none; border: none; cursor: pointer; padding: 0;
					color: var(--dhbw-strip-color, #4e565c); font-size: 14px; line-height: var(--dhbw-strip-height, 20px);
					height: var(--dhbw-strip-height, 20px); display: inline-flex; align-items: center; opacity: .8; }
				#fb-trigger:hover { opacity: 1; }
				#fb-pop { position: absolute; right: 0; bottom: 26px; width: 250px; text-align: left;
					background: #fff; border: 1px solid #ccc; border-radius: 8px; padding: 10px;
					box-shadow: 0 3px 14px rgba(0,0,0,.28); display: none; }
				#fb-pop.open { display: block; }
				#fb-pop .fb-q { font-size: 12px; color: #333; margin-bottom: 6px; font-weight: bold; }
				#fb-pop .fb-scale { display: flex; gap: 3px; margin-bottom: 3px; }
				#fb-pop .fb-rate { flex: 1; border: 1px solid #ccc; background: #fff; cursor: pointer;
					border-radius: 5px; padding: 6px 0; font-size: 12px; line-height: 1; color: #333;
					transition: background .12s, border-color .12s, color .12s; }
				#fb-pop .fb-rate:hover { border-color: #e2001a; }
				#fb-pop .fb-rate.fb-active { background: #e2001a; border-color: #e2001a; color: #fff; font-weight: bold; }
				#fb-pop .fb-scale-labels { display: flex; justify-content: space-between;
					font-size: 10px; color: #888; margin-bottom: 8px; }
				#fb-pop .fb-scope { display: flex; align-items: center; gap: 6px; margin-top: 8px;
					font-size: 11px; color: #555; cursor: pointer; }
				#fb-pop .fb-scope input { margin: 0; cursor: pointer; }
				#fb-pop textarea { width: 100%; box-sizing: border-box; height: 66px; resize: vertical;
					border: 1px solid #bbb; border-radius: 5px; padding: 6px; font: inherit; font-size: 13px; }
				#fb-pop .fb-actions { display: flex; justify-content: space-between; align-items: center;
					margin-top: 8px; gap: 8px; }
				#fb-pop .fb-status { font-size: 12px; color: #666; }
				#fb-pop .fb-btns { display: flex; gap: 6px; }
				#fb-pop button.fb-send { background: #e2001a; color: #fff; border: none; border-radius: 5px;
					padding: 5px 12px; font-size: 13px; cursor: pointer; }
				#fb-pop button.fb-cancel { background: #ececec; color: #333; border: none; border-radius: 5px;
					padding: 5px 12px; font-size: 13px; cursor: pointer; }
				@media print { #fb-widget { display: none !important; } }

				.reveal survey { display: block; text-align: left; border: 2px solid #e2001a;
					border-radius: 10px; padding: 18px 22px; margin: 10px auto; max-width: 80%;
					background: rgba(226,0,26,.03); font-size: .8em; }
				.reveal survey .fb-q { font-weight: bold; margin-bottom: 12px; }
				.reveal survey .fb-opt { display: block; width: 100%; text-align: left; cursor: pointer;
					border: 1px solid #ccc; background: #fff; border-radius: 6px; padding: 8px 12px;
					margin: 6px 0; font: inherit; }
				.reveal survey .fb-opt:hover { border-color: #e2001a; }
				.reveal survey .fb-opt.fb-chosen { background: #e2001a; color: #fff; border-color: #e2001a; }
				.reveal survey textarea { width: 100%; box-sizing: border-box; height: 90px; padding: 8px;
					border: 1px solid #ccc; border-radius: 6px; font: inherit; }
				.reveal survey .fb-send { background: #e2001a; color: #fff; border: none; border-radius: 6px;
					padding: 8px 18px; margin-top: 8px; cursor: pointer; font: inherit; }
				.reveal survey .fb-done { color: #e2001a; font-weight: bold; }
			`
			document.head.appendChild(s)
		}

		// --- Widget (Bewertungsskala + Kommentar) ------------------------------
		// Bewertungsstufen von bad (-3) ueber neutral (0) bis very good (+3).
		const RATING_SCALE = [-3, -2, -1, 0, 1, 2, 3]

		function buildWidget() {
			const rateButtons = RATING_SCALE
				.map(v => `<button class="fb-rate" type="button" data-v="${v}" title="${v > 0 ? '+' + v : v}">${v > 0 ? '+' + v : v}</button>`)
				.join('')

			const w = document.createElement('div')
			w.id = 'fb-widget'
			w.innerHTML = `
				<div id="fb-pop">
					<div class="fb-q">How would you rate this slide?</div>
					<div class="fb-scale">${rateButtons}</div>
					<div class="fb-scale-labels"><span>bad</span><span>neutral</span><span>very good</span></div>
					<textarea placeholder="Your comment on this slide…"></textarea>
					<label class="fb-scope"><input type="checkbox" class="fb-deck"> Feedback for the whole deck (not this slide)</label>
					<div class="fb-actions">
						<span class="fb-status"></span>
						<div class="fb-btns">
							<button class="fb-cancel" type="button">Cancel</button>
							<button class="fb-send"   type="button">Submit</button>
						</div>
					</div>
				</div>
				<button id="fb-trigger" type="button" title="Feedback">&#128172;</button>`
			document.body.appendChild(w)

			const pop = w.querySelector('#fb-pop')
			const trigger = w.querySelector('#fb-trigger')
			const rateEls = [...w.querySelectorAll('.fb-rate')]
			const textarea = w.querySelector('textarea')
			const deckChk = w.querySelector('.fb-deck')
			const sendBtn = w.querySelector('.fb-send')
			const cancelBtn = w.querySelector('.fb-cancel')
			const status = w.querySelector('.fb-status')

			// Aktuell gewaehlte Bewertung (null = keine). dirtyRating merkt, ob in
			// dieser Sitzung angeklickt wurde -- so wird eine aus localStorage
			// vorbefuellte Bewertung nicht bei jedem Kommentar erneut gesendet.
			let selected = null
			let dirtyRating = false

			// Bezug des Feedbacks: einzelne Folie (Default) oder ganzes Deck, wenn
			// die Checkbox gesetzt ist. Deck-weites Feedback hat kein slide_id.
			function forDeck() { return deckChk.checked }
			function targetSlide() { return forDeck() ? null : slideId() }
			function ratingKey() {
				return 'fb:rating:' + course + ':' + deckName() + ':' + (forDeck() ? '*deck*' : slideId())
			}
			function paintScale() {
				rateEls.forEach(b => b.classList.toggle('fb-active', selected !== null && Number(b.dataset.v) === selected))
			}
			function loadRating() {
				const v = lsGet(ratingKey())
				selected = (v === null || v === '') ? null : Number(v)
				dirtyRating = false
				paintScale()
			}
			function syncPlaceholder() {
				textarea.placeholder = forDeck() ? 'Your comment on the whole deck…' : 'Your comment on this slide…'
			}
			function toggle(openIt) {
				pop.classList.toggle('open', openIt)
				if (openIt) { deckChk.checked = false; syncPlaceholder(); loadRating(); status.textContent = ''; setTimeout(() => textarea.focus(), 0) }
			}

			// Umschalten des Bezugs laedt die passende gespeicherte Bewertung nach.
			deckChk.addEventListener('change', () => { syncPlaceholder(); loadRating() })

			// Klick auf eine Stufe waehlt sie nur aus (erneuter Klick hebt sie auf);
			// gesendet wird erst beim Submit.
			rateEls.forEach(b => b.addEventListener('click', () => {
				const v = Number(b.dataset.v)
				selected = (selected === v) ? null : v
				dirtyRating = true
				paintScale()
			}))

			trigger.addEventListener('click', () => toggle(!pop.classList.contains('open')))
			cancelBtn.addEventListener('click', () => { textarea.value = ''; toggle(false) })

			sendBtn.addEventListener('click', () => {
				const comment = textarea.value.trim()
				const hasRating = dirtyRating && selected !== null
				if (!hasRating && !comment) { toggle(false); return }

				const slide_id = targetSlide()
				status.textContent = 'Sending…'
				const jobs = []
				if (hasRating) {
					lsSet(ratingKey(), String(selected))
					jobs.push(send({ kind: 'rating', value: String(selected), deck: deckName(), slide_id }))
				}
				if (comment)
					jobs.push(send({ kind: 'comment', value: comment, deck: deckName(), slide_id }))

				Promise.all(jobs).then(rs => {
					if (rs.every(r => r && r.ok)) {
						status.textContent = 'Thanks!'
						textarea.value = ''
						dirtyRating = false
						setTimeout(() => toggle(false), 800)
					} else {
						status.textContent = 'Error while sending'
					}
				})
			})

			// Tastatureingaben im Textfeld nicht an Reveal weiterreichen
			textarea.addEventListener('keydown', e => e.stopPropagation())

			deck.on('slidechanged', () => { textarea.value = ''; status.textContent = ''; toggle(false); loadRating() })
			loadRating()
		}

		// --- Umfragen (<survey>) -----------------------------------------------
		function renderSurveys() {
			const surveys = deck.getRevealElement().querySelectorAll('survey')
			for (const el of surveys) {
				if (el.dataset.fbReady) continue
				el.dataset.fbReady = '1'

				const pollId = el.getAttribute('id') || ''
				const question = el.getAttribute('question') || el.getAttribute('data-question') || ''
				const type = el.getAttribute('type') || 'choice'
				const options = [...el.querySelectorAll('option')].map(o => o.textContent.trim()).filter(Boolean)

				const key = 'fb:poll:' + course + ':' + pollId
				const done = lsGet(key)

				el.textContent = ''
				const q = document.createElement('div')
				q.className = 'fb-q'
				q.textContent = question || pollId
				el.appendChild(q)

				if (done) { showDone(el, done); continue }

				if (isPrint) { renderStatic(el, type, options); continue }

				const finish = (value) => {
					lsSet(key, value)
					send({ kind: 'poll', poll_id: pollId, question, value })
					el.querySelectorAll('.fb-q ~ *').forEach(n => n.remove())
					showDone(el, value)
				}

				if (type === 'text') {
					const ta = document.createElement('textarea')
					ta.placeholder = 'Your answer…'
					ta.addEventListener('keydown', e => e.stopPropagation())
					const btn = document.createElement('button')
					btn.className = 'fb-send'; btn.type = 'button'; btn.textContent = 'Submit'
					btn.addEventListener('click', () => { const v = ta.value.trim(); if (v) finish(v) })
					el.appendChild(ta); el.appendChild(btn)
				} else {
					for (const opt of options) {
						const b = document.createElement('button')
						b.className = 'fb-opt'; b.type = 'button'; b.textContent = opt
						b.addEventListener('click', () => finish(opt))
						el.appendChild(b)
					}
				}
			}
		}

		function renderStatic(el, type, options) {
			if (type === 'text') {
				const p = document.createElement('div'); p.style.color = '#888'; p.textContent = '(free-text survey)'
				el.appendChild(p)
			} else {
				for (const opt of options) {
					const b = document.createElement('div'); b.className = 'fb-opt'; b.textContent = opt
					el.appendChild(b)
				}
			}
		}

		function showDone(el, value) {
			const d = document.createElement('div')
			d.className = 'fb-done'
			d.textContent = 'Thanks for your answer!'
			el.appendChild(d)
		}

		// --- Start --------------------------------------------------------------
		deck.on('ready', () => {
			injectStyle()
			loadCourseInfo().then(() => {
				renderSurveys()
				if (!isPrint) buildWidget()
			})
		})
		// Vertikale/nachgeladene Folien ebenfalls abdecken
		deck.on('slidechanged', () => renderSurveys())
	}
})
