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
	wird also NICHT vom Client gesendet. Ausgewertet wird dort per woechentlichem
	HTML-Mail-Bericht (weekly-report.php); im Foliensatz gibt es keine Anzeige.

	Konfiguration (optional) ueber revealOptions.farberg_reveal_template.feedback:
		enabled: false   -> Plugin in diesem Deck abschalten
		apiUrl:  "..."   -> abweichender Endpoint (Default:
		                    /talks/reveal-feedback-server-side/api.php)
*/

export default () => ({
	id: 'feedback',
	init: (deck) => {

		// Im PDF-Export nichts Interaktives einblenden (Gotenberg rendert die Print-Seiten)
		const isPrint = deck.getConfig().view === 'print' || /print-pdf/.test(window.location.search)

		const rt = (deck.getConfig().farberg_reveal_template || {})
		const cfg = rt.feedback || {}
		if (cfg.enabled === false) return

		const apiUrl = cfg.apiUrl
			|| window.FEEDBACK_API
			|| '/talks/reveal-feedback-server-side/api.php'

		// --- Kurs-Identitaet: von dennis_build in die Seite eingebettet ----------
		let course = window.location.origin + window.location.pathname
		let courseTitle = document.title || ''

		function loadCourseInfo() {
			if (rt.info) {
				if (rt.info.homepage) course = rt.info.homepage
				if (rt.info.title) courseTitle = rt.info.title
			}
			return Promise.resolve()
		}

		function deckName() {
			if (rt.deck && rt.deck.slug) return rt.deck.slug
			const seg = window.location.pathname.split('/').filter(Boolean).pop() || 'index'
			return decodeURIComponent(seg).replace(/\.html$/, '')
		}

		function slideId() {
			const s = deck.getCurrentSlide()
			if (s && s.id) return s.id
			const i = deck.getIndices()
			return 'h' + i.h + (i.v ? '-v' + i.v : '')
		}

		function lsGet(k) { try { return window.localStorage.getItem(k) } catch (e) { return null } }
		function lsSet(k, v) { try { window.localStorage.setItem(k, v) } catch (e) { } }
		function lsRemove(k) { try { window.localStorage.removeItem(k) } catch (e) { } }

		// Titel einer Folie (erste Ueberschrift) -- wird mitgesendet, damit der
		// Wochenbericht die Folie benennen kann; der Link (#/h/v) haengt an der
		// Position und kann sich verschieben, der Titel macht das sichtbar.
		function slideTitle(section) {
			const h = section && section.querySelector('h1, h2, h3')
			return h ? (h.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 250) : null
		}

		// --- POST-Helfer --------------------------------------------------------
		function send(payload) {
			return fetch(apiUrl, {
				method: 'POST',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(Object.assign({ course, course_title: courseTitle }, payload))
			}).then(res => {
				if (res.status === 401) { window.location.reload(); return { ok: false } }
				if (!res.ok) return { ok: false }
				return res.json().catch(() => ({ ok: false }))
			}).catch(() => ({ ok: false }))   // Netzwerk-/CORS-Fehler -> nicht ok
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
				#fb-widget { position: fixed; right: var(--fb-right, 66px); bottom: var(--dhbw-strip-bottom, 6px);
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
				/* Gleiches zusammenhaengendes Segment-Control wie in der Umfrage:
				   durchgehender Balken, diverging getoent (rot -> grau -> gruen). */
				#fb-pop .fb-scale { display: flex; gap: 0; margin-bottom: 3px;
					border: 1px solid #cfcfcf; border-radius: 7px; overflow: hidden; }
				#fb-pop .fb-rate { flex: 1; border: 0; border-left: 1px solid #dcdcdc; background: #fafafa;
					color: #444; cursor: pointer; padding: 6px 0; font-size: 12px; line-height: 1;
					transition: filter .1s; }
				#fb-pop .fb-rate:first-child { border-left: 0; }
				#fb-pop .fb-rate[data-v="-3"] { background: #fbdfe1; }
				#fb-pop .fb-rate[data-v="-2"] { background: #fce9ea; }
				#fb-pop .fb-rate[data-v="-1"] { background: #fdf4f5; }
				#fb-pop .fb-rate[data-v="0"]  { background: #f2f3f4; }
				#fb-pop .fb-rate[data-v="1"]  { background: #eef7f1; }
				#fb-pop .fb-rate[data-v="2"]  { background: #e2f2e7; }
				#fb-pop .fb-rate[data-v="3"]  { background: #d5ecdc; }
				#fb-pop .fb-rate:hover { filter: brightness(0.95); }
				#fb-pop .fb-rate.fb-active { color: #fff; font-weight: bold; filter: none; }
				#fb-pop .fb-rate.fb-active[data-v^="-"] { background: #e2001a; }
				#fb-pop .fb-rate.fb-active[data-v="0"]  { background: #6b7280; }
				#fb-pop .fb-rate.fb-active[data-v="1"],
				#fb-pop .fb-rate.fb-active[data-v="2"],
				#fb-pop .fb-rate.fb-active[data-v="3"] { background: #2e7d32; }
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

				/* Innen-Masse in em, damit eine font-size als Inline-Style auf
				   <survey style="font-size:0.5em"> die ganze Umfrage skaliert. */
				.reveal survey { display: block; text-align: left; border: none;
					padding: 0; margin: 0.6em auto; max-width: 100%;
					background: none; font-size: .8em; }
				.reveal survey .fb-q { font-weight: bold; margin-bottom: 0.8em; }
				.reveal survey .fb-opt { display: block; width: 100%; text-align: left; cursor: pointer;
					border: 1px solid #ccc; background: #fff; border-radius: 6px; padding: 0.5em 0.8em;
					margin: 0.4em 0; font: inherit; }
				.reveal survey .fb-opt:hover { border-color: #e2001a; }
				.reveal survey .fb-opt.fb-chosen { background: #e2001a; color: #fff; border-color: #e2001a; }
				.reveal survey textarea { width: 100%; box-sizing: border-box; height: 5em; padding: 0.5em;
					border: 1px solid #ccc; border-radius: 6px; font: inherit; }
				.reveal survey .fb-send { background: #e2001a; color: #fff; border: none; border-radius: 6px;
					padding: 0.5em 1.1em; margin-top: 0.5em; cursor: pointer; font: inherit; }
				.reveal survey .fb-done { color: #e2001a; font-weight: bold; }
				.reveal survey .fb-again { font-weight: normal; font-size: .85em; color: #666; text-decoration: underline; cursor: pointer; }
				.reveal survey .fb-hint { color: #b00; font-size: .85em; margin-top: 0.5em; }
				.reveal survey .fb-hint.fb-hint-neutral { color: #666; }
				.reveal survey .fb-srow { margin: 1em 0; }
				.reveal survey .fb-slabel { margin-bottom: 0.4em; }
				/* Zusammenhaengendes Segment-Control statt 7 einzelner Kaestchen:
				   ein durchgehender Balken, diverging getoent (rot -> grau -> gruen),
				   ausgewaehltes Segment kraeftig (rot/grau/gruen -- wie die Verteilung
				   im Dashboard). */
				.reveal survey .fb-scale { display: flex; gap: 0; border: 1px solid #cfcfcf;
					border-radius: 7px; overflow: hidden; }
				.reveal survey .fb-scale .fb-rate { flex: 1; border: 0; border-left: 1px solid #dcdcdc;
					background: #fafafa; color: #444; cursor: pointer; padding: 0.4em 0; font: inherit;
					transition: filter .1s; }
				.reveal survey .fb-scale .fb-rate:first-child { border-left: 0; }
				.reveal survey .fb-scale .fb-rate[data-v="-3"] { background: #fbdfe1; }
				.reveal survey .fb-scale .fb-rate[data-v="-2"] { background: #fce9ea; }
				.reveal survey .fb-scale .fb-rate[data-v="-1"] { background: #fdf4f5; }
				.reveal survey .fb-scale .fb-rate[data-v="0"]  { background: #f2f3f4; }
				.reveal survey .fb-scale .fb-rate[data-v="1"]  { background: #eef7f1; }
				.reveal survey .fb-scale .fb-rate[data-v="2"]  { background: #e2f2e7; }
				.reveal survey .fb-scale .fb-rate[data-v="3"]  { background: #d5ecdc; }
				.reveal survey .fb-scale .fb-rate:hover { filter: brightness(0.95); }
				.reveal survey .fb-scale .fb-rate.fb-active { color: #fff; font-weight: bold; filter: none; }
				.reveal survey .fb-scale .fb-rate.fb-active[data-v^="-"] { background: #e2001a; }
				.reveal survey .fb-scale .fb-rate.fb-active[data-v="0"]  { background: #6b7280; }
				.reveal survey .fb-scale .fb-rate.fb-active[data-v="1"],
				.reveal survey .fb-scale .fb-rate.fb-active[data-v="2"],
				.reveal survey .fb-scale .fb-rate.fb-active[data-v="3"] { background: #2e7d32; }
				.reveal survey .fb-scale-labels { display: flex; justify-content: space-between;
					font-size: .8em; color: #888; margin-top: 0.15em; }
				.reveal survey .fb-items { display: grid; align-items: start;
					grid-template-columns: repeat(var(--fb-cols, 2), minmax(0, 1fr)); gap: 0.5em 1.2em; }
				.reveal survey .fb-items .fb-srow { margin: 0; }
				.reveal survey .fb-items .fb-text { grid-column: 1 / -1; }
				.reveal survey .fb-glabel { font-weight: bold; margin: 0.9em 0 0.4em; }
				.reveal survey .fb-items + .fb-glabel { margin-top: 1.2em; }
				/* Kompakt-Modus (<survey compact>): Label links, Skala rechts in einer
				   Zeile; die je-Zeile "bad/very good"-Labels entfallen (Legende einmal
				   ins Gruppen-Label schreiben). Deutlich platzsparender. */
				.reveal survey.fb-compact .fb-items { gap: 0.35em 1.4em; }
				.reveal survey.fb-compact .fb-rate-row { display: flex; align-items: center; gap: 0.7em; }
				.reveal survey.fb-compact .fb-rate-row .fb-slabel { flex: 1 1 42%; margin: 0; }
				.reveal survey.fb-compact .fb-rate-row .fb-scale { flex: 1 1 58%; margin: 0; }
				.reveal survey.fb-compact .fb-scale-labels { display: none; }
				.reveal survey.fb-compact textarea { height: 3em; }
				.reveal survey.fb-compact .fb-srow { margin: 0; }
				.reveal survey.fb-compact .fb-scale .fb-rate { padding: 0.25em 0; }

			`
			document.head.appendChild(s)
		}

		// --- Widget (Bewertungsskala + Kommentar) ------------------------------
		// Bewertungsstufen von bad (-3) ueber neutral (0) bis very good (+3).
		const RATING_SCALE = [-3, -2, -1, 0, 1, 2, 3]
		// Pro survey-id gesammelte Inputs aller (auch ueber Folien aufgeteilten)
		// Bloecke -> ein Submit schickt die ganze Umfrage.
		const surveyReg = {}

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
				const slide_title = slide_id ? slideTitle(deck.getCurrentSlide()) : null
				status.textContent = 'Sending…'
				const jobs = []
				if (hasRating) {
					lsSet(ratingKey(), String(selected))
					jobs.push(send({ kind: 'rating', value: String(selected), deck: deckName(), slide_id, slide_title }))
				}
				if (comment)
					jobs.push(send({ kind: 'comment', value: comment, deck: deckName(), slide_id, slide_title }))

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
				// Kinder VOR dem Leeren auslesen (el.textContent='' wuerde sie loeschen).
				const items = [...el.querySelectorAll('text, rate')]
				// Optionale Gruppierung: <group style="--fb-cols: 2" label="...">.
				// Ohne <group> eine implizite Gruppe mit allen Items.
				const groupEls = [...el.querySelectorAll('group')]
				const sections = groupEls.length
					? groupEls.map(g => ({ style: g.getAttribute('style') || '', label: g.getAttribute('label') || '', items: [...g.querySelectorAll('text, rate')] }))
					: [{ style: '', label: '', items }]

				// Optionaler <submit>-Tag legt fest, WO der Absenden-Button steht. Bei
				// Aufteilung ueber mehrere Folien (gleiche id) gehoert er nur einmal
				// (letzte Folie) hin; ohne <submit> setzt das Plugin ihn automatisch auf
				// den letzten Block der id. Alle Bloecke werden zusammen abgeschickt.
				const submitTag = el.querySelector('submit')
				const submitLabel = submitTag && submitTag.textContent.trim() ? submitTag.textContent.trim() : 'Submit'
				const idBlocks = [...deck.getRevealElement().querySelectorAll('survey')].filter(s => (s.getAttribute('id') || '') === pollId)
				const isLast = idBlocks[idBlocks.length - 1] === el

				// Ein Merker pro Umfrage-id: alle Bloecke gelten zusammen als erledigt.
				const key = 'fb:survey:' + course + ':' + pollId
				const done = lsGet(key)

				el.textContent = ''
				if (el.hasAttribute('compact')) el.classList.add('fb-compact')
				const q = document.createElement('div')
				q.className = 'fb-q'
				q.textContent = question || pollId
				el.appendChild(q)

				if (done) { showDone(el, key); continue }

				// Kompakte Kursumfrage: <survey> mit <text>/<rate>-Kindern, ein Submit.
				if (items.length) { renderCompound(el, pollId, sections, key, { hasSubmitTag: !!submitTag, submitLabel, isLast }); continue }

				if (isPrint) { renderStatic(el, type, options); continue }

				const finish = (value) => {
					surveyHint(el, 'Sending…', true)
					send({ kind: 'poll', poll_id: pollId, question, value }).then(r => {
						if (r && r.ok) {
							lsSet(key, value)
							el.querySelectorAll('.fb-q ~ *').forEach(n => n.remove())
							showDone(el, key)
						} else {
							surveyHint(el, 'Could not send your answer. Please try again.')
						}
					})
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

		// Rendert die kompakte Kursumfrage: je <text> ein Freitextfeld, je <rate>
		// die -3..+3-Skala; ein Submit schickt alle beantworteten Items ab.
		function renderCompound(el, surveyId, sections, key, opts) {
			// Inputs dieses Blocks in die geteilte Registry der survey-id sammeln,
			// damit ein einziger Submit (evtl. auf einer spaeteren Folie) alles sendet.
			const reg = surveyReg[surveyId] || (surveyReg[surveyId] = { inputs: [], explicitPlaced: false })

			// Baut eine Item-Zeile (<text> -> Freitext, <rate> -> -3..+3-Skala).
			function buildRow(child) {
				const cid = child.getAttribute('id') || ''
				const cq = child.getAttribute('question') || child.textContent.trim() || cid
				const row = document.createElement('div'); row.className = 'fb-srow'
				const label = document.createElement('div'); label.className = 'fb-slabel'; label.textContent = cq
				row.appendChild(label)

				if (child.tagName.toLowerCase() === 'text') {
					row.classList.add('fb-text')
					const ta = document.createElement('textarea')
					// style vom <text> ans Textfeld durchreichen (z.B. height/width).
					const cstyle = child.getAttribute('style')
					if (cstyle) ta.setAttribute('style', cstyle)
					ta.addEventListener('keydown', e => e.stopPropagation())
					if (isPrint) ta.disabled = true
					row.appendChild(ta)
					reg.inputs.push({ kind: 'comment', id: cid, question: cq, get: () => ta.value.trim() || null })
				} else {
					row.classList.add('fb-rate-row')
					const scale = document.createElement('div'); scale.className = 'fb-scale'
					let selected = null
					const btns = RATING_SCALE.map(v => {
						const b = document.createElement('button'); b.type = 'button'; b.className = 'fb-rate'
						b.dataset.v = v
						b.textContent = v > 0 ? '+' + v : String(v)
						if (!isPrint) b.addEventListener('click', () => {
							selected = v; btns.forEach(x => x.classList.remove('fb-active')); b.classList.add('fb-active')
						})
						scale.appendChild(b); return b
					})
					row.appendChild(scale)
					const lbls = document.createElement('div'); lbls.className = 'fb-scale-labels'
					const s1 = document.createElement('span'); s1.textContent = 'bad'
					const s2 = document.createElement('span'); s2.textContent = 'very good'
					lbls.appendChild(s1); lbls.appendChild(s2)
					row.appendChild(lbls)
					reg.inputs.push({ kind: 'rating', id: cid, question: cq, get: () => selected === null ? null : String(selected) })
				}
				return row
			}

			// Je Sektion (optionale <group>) ein eigenes Grid mit deren style/label.
			// <text> spannt alle Spalten, <rate> je eine (Default 2, via --fb-cols).
			for (const section of sections) {
				if (section.label) {
					const h = document.createElement('div'); h.className = 'fb-glabel'; h.textContent = section.label
					el.appendChild(h)
				}
				const grid = document.createElement('div'); grid.className = 'fb-items'
				if (section.style) grid.setAttribute('style', section.style)
				for (const child of section.items) grid.appendChild(buildRow(child))
				el.appendChild(grid)
			}

			if (isPrint) return

			// Submit nur dort, wo ein <submit>-Tag steht -- oder automatisch auf dem
			// letzten Block der id, falls kein <submit> gesetzt wurde.
			const renderHere = opts.hasSubmitTag || (opts.isLast && !reg.explicitPlaced)
			if (opts.hasSubmitTag) reg.explicitPlaced = true
			if (!renderHere) return

			const submit = document.createElement('button')
			submit.className = 'fb-send'; submit.type = 'button'; submit.textContent = opts.submitLabel || 'Submit'
			submit.addEventListener('click', () => {
				const jobs = []
				for (const inp of reg.inputs) {
					const v = inp.get()
					if (v === null || v === '') continue
					jobs.push(send({ kind: inp.kind, poll_id: surveyId + ':' + inp.id, question: inp.question, value: v, deck: deckName() }))
				}
				// Nichts ausgefuellt -> nicht als erledigt markieren, sondern Hinweis.
				if (!jobs.length) { surveyHint(el, 'Please answer at least one item before submitting.'); return }

				// Erst nach erfolgreichem Senden als erledigt markieren; scheitert ein
				// Request (Server nicht erreichbar, kein JSON), Fehler zeigen und offen
				// lassen, damit erneut abgeschickt werden kann.
				submit.disabled = true
				surveyHint(el, 'Sending…', true)
				Promise.all(jobs).then(rs => {
					if (rs.every(r => r && r.ok)) {
						lsSet(key, 'submitted')
						el.querySelectorAll('.fb-q ~ *').forEach(n => n.remove())
						showDone(el, key)
					} else {
						submit.disabled = false
						surveyHint(el, 'Could not send your answer. Please try again.')
					}
				})
			})
			el.appendChild(submit)
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

		// Ein-/ausblendbarer Statushinweis unter einer Umfrage (Fehler/Sende-Status).
		// neutral=true -> unauffaellig grau (Sende-Status), sonst rot (Fehler/Hinweis).
		function surveyHint(el, msg, neutral) {
			let hint = el.querySelector('.fb-hint')
			if (!hint) { hint = document.createElement('div'); hint.className = 'fb-hint'; el.appendChild(hint) }
			hint.classList.toggle('fb-hint-neutral', !!neutral)
			hint.textContent = msg
		}

		function showDone(el, resetKey) {
			const d = document.createElement('div')
			d.className = 'fb-done'
			d.textContent = 'Thanks for your answer! '
			if (resetKey && !isPrint) {
				const a = document.createElement('a')
				a.href = '#'; a.className = 'fb-again'; a.textContent = 'Fill again'
				a.addEventListener('click', e => { e.preventDefault(); lsRemove(resetKey); window.location.reload() })
				d.appendChild(a)
			}
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
