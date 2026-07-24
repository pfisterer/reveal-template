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

		// Kurz-Hash (12 Hex = 6 Byte SHA-256) des gerenderten Folien-Inhalts.
		// Basis: normalisierter Text der Folie, ohne Plugin-UI/Notizen -- so
		// aendert er sich bei echten inhaltlichen Aenderungen, nicht bei reinem
		// Markup/CSS. Wird beim Bewerten mitgesendet (slide_hash), damit man
		// spaeter sieht, ob Feedback zu genau dieser Version gehoerte.
		// Normalisierter, sichtbarer Text einer Folie (ohne Plugin-UI/Notizen).
		// Basis fuer Hash UND Aehnlichkeitsvergleich.
		function slideNormText(section) {
			if (!section) return ''
			const clone = section.cloneNode(true)
			clone.querySelectorAll('survey, aside.notes, script, style, #fb-widget').forEach(n => n.remove())
			return (clone.textContent || '').replace(/\s+/g, ' ').trim()
		}
		async function slideHash(section) {
			if (!window.crypto || !crypto.subtle) return null
			const text = slideNormText(section)
			if (!text) return null
			try {
				const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
				return [...new Uint8Array(buf)].slice(0, 6).map(b => b.toString(16).padStart(2, '0')).join('')
			} catch (e) { return null }
		}

		// --- Aehnlichkeit zweier Folientexte (Token-3-Shingle-Jaccard) ---------
		function shingles(text, k) {
			k = k || 3
			const w = (text || '').toLowerCase().split(/\s+/).filter(Boolean)
			const s = new Set()
			if (w.length < k) { for (const x of w) s.add(x); return s }
			for (let i = 0; i + k <= w.length; i++) s.add(w.slice(i, i + k).join(' '))
			return s
		}
		function jaccard(a, b) {
			if (!a.size && !b.size) return 1
			let inter = 0; for (const x of a) if (b.has(x)) inter++
			const uni = a.size + b.size - inter
			return uni ? inter / uni : 0
		}
		function textSim(a, b) { return jaccard(shingles(a), shingles(b)) }

		// --- Leichter HTML-Snapshot einer Folie (gzip -> base64) ---------------
		// Struktur/Text der Folie, Bilder klein und als Referenz (nicht inline),
		// Plugin-UI/Notizen entfernt. Klein genug zum Mitsenden beim Bewerten.
		async function slideSnapshotHtml(section) {
			if (!section || typeof CompressionStream === 'undefined') return null
			const clone = section.cloneNode(true)
			clone.querySelectorAll('#fb-widget, survey, aside.notes, script').forEach(n => n.remove())
			clone.querySelectorAll('img').forEach(img => {
				try { img.src = img.src } catch (e) { }   // relative -> absolute URL
				img.removeAttribute('srcset')
				img.style.maxWidth = '100%'; img.style.maxHeight = '55%'
			})
			try {
				const stream = new Blob([clone.outerHTML]).stream().pipeThrough(new CompressionStream('gzip'))
				const buf = new Uint8Array(await new Response(stream).arrayBuffer())
				if (buf.length > 300000) return null   // zu gross -> weglassen
				let bin = ''; for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i])
				return btoa(bin)
			} catch (e) { return null }
		}
		async function ungzipB64(b64) {
			const bin = atob(b64); const bytes = new Uint8Array(bin.length)
			for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
			const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
			return await new Response(stream).text()
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

				/* --- Admin-Ansichten (nur fuer Admins, per Taste) ------------------ */
				#fb-overlay { position: fixed; top: 12px; right: 12px; width: 340px; max-width: 42vw;
					max-height: 82vh; overflow: auto; z-index: 300; display: none;
					background: rgba(255,255,255,.97); color: #222; border: 1px solid #ccc;
					border-radius: 10px; box-shadow: 0 6px 26px rgba(0,0,0,.28);
					font-family: Arial, Helvetica, sans-serif; font-size: 13px; line-height: 1.35; }
				#fb-overlay.open { display: block; }
				#fb-overlay .fb-o-head { display: flex; justify-content: space-between; align-items: baseline;
					padding: 9px 12px; border-bottom: 1px solid #eee; position: sticky; top: 0;
					background: inherit; border-radius: 10px 10px 0 0; }
				#fb-overlay .fb-o-title { font-weight: bold; font-size: 13px; }
				#fb-overlay .fb-o-sub { font-size: 11px; color: #888; }
				#fb-overlay .fb-o-body { padding: 10px 12px; }
				#fb-overlay .fb-o-metrics { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
				#fb-overlay .fb-o-avg { font-size: 22px; font-weight: bold; }
				#fb-overlay .fb-o-avg.neg { color: #e2001a; } #fb-overlay .fb-o-avg.pos { color: #2e7d32; }
				#fb-overlay .fb-o-avg.neu { color: #6b7280; }
				#fb-overlay .fb-o-n { font-size: 12px; color: #666; }
				#fb-overlay .fb-o-bars { display: grid; grid-template-columns: 1.4em 1fr 1.6em; gap: 2px 6px;
					align-items: center; margin: 6px 0 10px; }
				#fb-overlay .fb-o-bl { font-size: 11px; color: #666; text-align: right; }
				#fb-overlay .fb-o-bar { height: 9px; background: #eee; border-radius: 3px; overflow: hidden; }
				#fb-overlay .fb-o-bar > span { display: block; height: 100%; }
				#fb-overlay .fb-o-bar.neg > span { background: #e2001a; }
				#fb-overlay .fb-o-bar.neu > span { background: #6b7280; }
				#fb-overlay .fb-o-bar.pos > span { background: #2e7d32; }
				#fb-overlay .fb-o-bc { font-size: 11px; color: #888; }
				#fb-overlay .fb-o-ver { font-size: 11px; margin: 6px 0 2px; display: flex; flex-wrap: wrap; gap: 4px; }
				#fb-overlay .fb-o-ver .v { padding: 1px 6px; border-radius: 10px; font-weight: bold; }
				#fb-overlay .fb-o-ver .v em { font-weight: normal; font-style: normal; opacity: .8; }
				#fb-overlay .fb-o-ver .v.ok { background: #e2f2e7; color: #2e7d32; }
				#fb-overlay .fb-o-ver .v.mid { background: #fdf0dc; color: #b06a00; }
				#fb-overlay .fb-o-ver .v.old { background: #fbe3e5; color: #c0142c; }
				#fb-overlay .fb-o-ver .v.unk { background: #eee; color: #777; }
				#fb-overlay .fb-o-verlabel { font-size: 10px; color: #aaa; margin-bottom: 4px; }
				#fb-overlay .fb-o-csim { font-weight: bold; }
				#fb-overlay .fb-o-csim.ok { color: #2e7d32; } #fb-overlay .fb-o-csim.mid { color: #b06a00; }
				#fb-overlay .fb-o-csim.old { color: #c0142c; } #fb-overlay .fb-o-csim.unk { color: #999; }
				#fb-overlay .fb-o-ver-legacy .ok { color: #2e7d32; } #fb-overlay .fb-o-ver-legacy .old { color: #b06a00; }
				#fb-overlay .fb-o-clist { margin-top: 6px; border-top: 1px solid #eee; padding-top: 6px;
					max-height: 34vh; overflow: auto; }
				#fb-overlay .fb-o-c { padding: 5px 0; border-bottom: 1px dashed #eee; }
				#fb-overlay .fb-o-c:last-child { border-bottom: 0; }
				#fb-overlay .fb-o-cmeta { font-size: 10px; color: #999; }
				#fb-overlay .fb-o-cwarn { color: #b06a00; }
				#fb-overlay .fb-o-ctools { display: flex; justify-content: space-between; align-items: center;
					font-size: 10px; margin-bottom: 5px; }
				#fb-overlay .fb-o-selall { color: #888; cursor: pointer; display: inline-flex; align-items: center; gap: 3px; }
				#fb-overlay .fb-o-selall input { margin: 0; cursor: pointer; }
				#fb-overlay .fb-o-delsel { color: #c0142c; text-decoration: none; cursor: pointer; }
				#fb-overlay .fb-o-delsel:hover { text-decoration: underline; }
				#fb-overlay .fb-o-delsel.disabled { color: #ccc; pointer-events: none; }
				#fb-overlay .fb-o-crow { display: flex; align-items: flex-start; gap: 6px; }
				#fb-overlay .fb-o-crow > input[type=checkbox] { margin: 3px 0 0; cursor: pointer; flex: none; }
				#fb-overlay .fb-o-ctext { flex: 1; min-width: 0; }
				#fb-overlay .fb-o-cx { color: #c0142c; text-decoration: none; cursor: pointer; opacity: .5;
					font-size: 12px; padding: 0 2px; flex: none; }
				#fb-overlay .fb-o-cx:hover { opacity: 1; }
				#fb-overlay .fb-o-actions { margin-top: 10px; padding-top: 8px; border-top: 1px solid #eee; }
				#fb-overlay .fb-o-delall { color: #c0142c; font-size: 11px; text-decoration: none; cursor: pointer; }
				#fb-overlay .fb-o-delall:hover { text-decoration: underline; }
				#fb-overlay .fb-o-empty { color: #888; }
				#fb-overlay .fb-o-hint { font-size: 10px; color: #aaa; padding: 6px 12px; border-top: 1px solid #eee; }

				#fb-boxplot { position: fixed; inset: 0; z-index: 320; display: none;
					background: #fff; color: #222; padding: 18px 20px 8px;
					box-sizing: border-box; font-family: Arial, Helvetica, sans-serif; }
				#fb-boxplot.open { display: flex; flex-direction: column; }
				#fb-boxplot .fb-bp-head { display: flex; justify-content: space-between; align-items: baseline;
					margin-bottom: 8px; }
				#fb-boxplot .fb-bp-title { font-weight: bold; font-size: 15px; }
				#fb-boxplot .fb-bp-sub { font-size: 12px; color: #888; }
				#fb-boxplot .fb-bp-scroll { flex: 1; overflow: auto; border: 1px solid #eee; border-radius: 8px; }
				#fb-boxplot svg { display: block; }
				#fb-boxplot .fb-bp-empty { color: #888; padding: 20px; }
				#fb-boxplot text { font-family: Arial, Helvetica, sans-serif; }
				#fb-boxplot rect[data-idx]:hover { fill: rgba(226,0,26,.06); }

				/* Hover-Mini-Abbild einer Folie im Boxplot */
				#fb-bp-mini { position: fixed; z-index: 340; display: none; pointer-events: none;
					background: #fff; border: 1px solid #ccc; border-radius: 6px; overflow: hidden;
					box-shadow: 0 6px 22px rgba(0,0,0,.3); }
				#fb-bp-mini.open { display: block; }
				#fb-bp-mini .fb-mini-stats { display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
					padding: 5px 8px; font: 11px Arial, Helvetica, sans-serif; color: #444;
					border-bottom: 1px solid #eee; background: #fafafa; }
				#fb-bp-mini .fb-mini-stats .t { font-weight: bold; }
				#fb-bp-mini .fb-mini-stats .p { color: #2e7d32; }
				#fb-bp-mini .fb-mini-stats .n { color: #e2001a; }
				#fb-bp-mini .fb-mini-stats .z { color: #6b7280; }
				#fb-bp-mini .fb-mini-stats .a, #fb-bp-mini .fb-mini-stats .m { color: #333; margin-left: auto; }
				#fb-bp-mini .fb-mini-stats .m { margin-left: 0; }
				#fb-bp-mini .fb-mini-view { overflow: hidden; }
				#fb-bp-mini .fb-mini-scale { transform-origin: top left; }
				#fb-bp-mini .fb-mini-comments { border-top: 1px solid #eee; padding: 5px 8px;
					font: 11px Arial, Helvetica, sans-serif; color: #444; max-height: 30vh; overflow: auto; }
				#fb-bp-mini .fb-mini-c { padding: 3px 0; border-bottom: 1px dashed #eee; }
				#fb-bp-mini .fb-mini-c:last-child { border-bottom: 0; }
				#fb-bp-mini .fb-mini-ct { display: block; }
				#fb-bp-mini .fb-mini-cm { color: #999; font-size: 10px; }
				#fb-bp-mini .fb-mini-more { color: #999; font-size: 10px; padding-top: 3px; }
				#fb-bp-mini .reveal { position: static; width: 100%; height: 100%; font-size: initial; }
				#fb-bp-mini .reveal .slides { position: static !important; width: 100% !important;
					height: 100% !important; left: auto !important; top: auto !important;
					transform: none !important; zoom: 1 !important; }
				#fb-bp-mini .reveal .slides > section { position: static !important; display: block !important;
					visibility: visible !important; opacity: 1 !important; width: 100% !important;
					height: 100% !important; top: auto !important; left: auto !important;
					transform: none !important; padding: 18px 24px !important; box-sizing: border-box; }
				#fb-bp-mini .reveal .slides section .fragment { opacity: 1 !important; visibility: visible !important; }

				/* Vollbild-Dashboard (Taste e), lazy gemountet */
				#fb-dashboard { position: fixed; inset: 0; z-index: 330; display: none;
					background: #fff; color: #222; overflow: auto;
					font-family: Arial, Helvetica, sans-serif; }
				#fb-dashboard.open { display: block; }
				#fb-dashboard .fb-dash-loading { padding: 40px; color: #666; font-size: 15px; }

				/* Snapshot-Viewer (alte Fassung einer Folie) */
				#fb-overlay .fb-o-eye { cursor: pointer; text-decoration: none; }
				#fb-overlay .fb-o-ver .fb-o-eye { margin-left: 2px; }
				#fb-snap { position: fixed; inset: 0; z-index: 360; display: none;
					background: rgba(255,255,255,.99); flex-direction: column;
					font-family: Arial, Helvetica, sans-serif; }
				#fb-snap.open { display: flex; }
				#fb-snap .fb-snap-head { display: flex; justify-content: space-between; align-items: center;
					padding: 10px 16px; border-bottom: 1px solid #eee; }
				#fb-snap .fb-snap-title { font-weight: bold; color: #4e565c; font-size: 14px; }
				#fb-snap .fb-snap-close { color: #4e565c; text-decoration: none; font-size: 13px; cursor: pointer; }
				#fb-snap .fb-snap-close:hover { color: #e2001a; }
				#fb-snap .fb-snap-body { flex: 1; display: flex; align-items: center; justify-content: center; overflow: auto; }
				#fb-snap .fb-snap-loading { color: #666; }
				#fb-snap .fb-snap-frame { overflow: hidden; border: 1px solid #ddd; box-shadow: 0 4px 20px rgba(0,0,0,.15); background: #fff; }
				#fb-snap .fb-snap-scale { transform-origin: top left; }
				#fb-snap .reveal { position: static; width: 100%; height: 100%; font-size: initial; }
				#fb-snap .reveal .slides { position: static !important; width: 100% !important; height: 100% !important;
					left: auto !important; top: auto !important; transform: none !important; zoom: 1 !important; }
				#fb-snap .reveal .slides > section { position: static !important; display: block !important;
					visibility: visible !important; opacity: 1 !important; width: 100% !important; height: 100% !important;
					top: auto !important; left: auto !important; transform: none !important; padding: 24px 32px !important;
					box-sizing: border-box; }
				#fb-snap .reveal .slides section .fragment { opacity: 1 !important; visibility: visible !important; }
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

			sendBtn.addEventListener('click', async () => {
				const comment = textarea.value.trim()
				const hasRating = dirtyRating && selected !== null
				if (!hasRating && !comment) { toggle(false); return }

				const slide_id = targetSlide()
				status.textContent = 'Sending…'
				// Bei Folien-Feedback (nicht deck-weit) Inhalts-Hash UND normalisierten
				// Text mitschicken (Text wird serverseitig einmal je Version abgelegt).
				const sec = deck.getCurrentSlide()
				const slide_hash = slide_id ? await slideHash(sec) : null
				const slide_text = slide_id ? slideNormText(sec).slice(0, 8000) : null
				const slide_html = slide_id ? await slideSnapshotHtml(sec) : null
				const jobs = []
				if (hasRating) {
					lsSet(ratingKey(), String(selected))
					jobs.push(send({ kind: 'rating', value: String(selected), deck: deckName(), slide_id, slide_hash, slide_text, slide_html }))
				}
				if (comment)
					jobs.push(send({ kind: 'comment', value: comment, deck: deckName(), slide_id, slide_hash, slide_text, slide_html }))

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

		// --- Admin-Ansichten (Overlay + Boxplot, per Taste) --------------------
		// Nur wenn der Server whoami.is_admin meldet. Eine Taste (Default 'v')
		// schaltet zyklisch: aus -> Folien-Overlay -> Boxplot ueber alle Folien.
		const ADMIN_KEY = (cfg.adminKey || 'u').toLowerCase()      // Overlay/Boxplot
		const DASH_KEY = (cfg.dashboardKey || 'e').toLowerCase()   // Vollbild-Dashboard (Auswertung)
		let adminData = null            // slide_id -> { n, avg, dist, comments, hashes }
		let adminMode = 0               // 0 aus, 1 Overlay, 2 Boxplot
		let overlayEl = null, boxplotEl = null, miniEl = null
		let overlayTarget = null   // null = aktuelle Folie, '*deck*' = deck-weit

		// slide_id einer beliebigen Section -- konsistent mit slideId().
		function sectionId(sec) {
			if (sec && sec.id) return sec.id
			const i = deck.getIndices(sec)
			return 'h' + i.h + (i.v ? '-v' + i.v : '')
		}

		function apiGet(action) {
			const u = apiUrl + (apiUrl.includes('?') ? '&' : '?') + action
			return fetch(u, { credentials: 'include', cache: 'no-store' })
				.then(r => r.ok ? r.json() : null).catch(() => null)
		}
		// Loeschen (nur Admin). body = {ids:[...]} ODER {scope:{...}}.
		function apiDelete(body) {
			const u = apiUrl + (apiUrl.includes('?') ? '&' : '?') + 'action=delete'
			return fetch(u, {
				method: 'POST', credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			}).then(r => r.ok ? r.json() : null).catch(() => null)
		}
		function checkAdmin() {
			return apiGet('action=whoami').then(j => !!(j && j.is_admin))
		}
		function loadSlideStats() {
			const qs = 'action=slidestats&course=' + encodeURIComponent(course) + '&deck=' + encodeURIComponent(deckName())
			return apiGet(qs).then(j => { adminData = (j && j.ok) ? (j.slides || {}) : (adminData || {}) })
		}

		function avgClass(a) { return a == null ? 'neu' : (a < -0.001 ? 'neg' : (a > 0.001 ? 'pos' : 'neu')) }
		function esc(s) { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML }

		function ensureAdminDom() {
			if (overlayEl) return
			overlayEl = document.createElement('div'); overlayEl.id = 'fb-overlay'
			document.body.appendChild(overlayEl)
			boxplotEl = document.createElement('div'); boxplotEl.id = 'fb-boxplot'
			document.body.appendChild(boxplotEl)
			miniEl = document.createElement('div'); miniEl.id = 'fb-bp-mini'
			document.body.appendChild(miniEl)
			snapEl = document.createElement('div'); snapEl.id = 'fb-snap'
			snapEl.innerHTML = '<div class="fb-snap-head"><span class="fb-snap-title">Snapshot</span>'
				+ '<a href="#" class="fb-snap-close">✕ close (Esc)</a></div><div class="fb-snap-body"></div>'
			document.body.appendChild(snapEl)
			snapEl.querySelector('.fb-snap-close').addEventListener('click', e => { e.preventDefault(); closeSnap() })
		}

		// Snapshot-Viewer: laedt den gespeicherten HTML-Snapshot einer Version und
		// rendert ihn skaliert (grobe Ansicht der alten Fassung).
		let snapEl = null, snapOpen = false
		function closeSnap() { if (snapEl) { snapOpen = false; snapEl.classList.remove('open') } }
		async function showSnapshot(hash, slideId, simPctLabel) {
			ensureAdminDom()
			snapOpen = true; snapEl.classList.add('open')
			const body = snapEl.querySelector('.fb-snap-body')
			snapEl.querySelector('.fb-snap-title').textContent = 'Snapshot of rated version' + (simPctLabel ? ' · ' + simPctLabel + ' similar to current' : '')
			body.innerHTML = '<div class="fb-snap-loading">Loading snapshot…</div>'
			const qs = 'action=slideversion&course=' + encodeURIComponent(course)
				+ '&deck=' + encodeURIComponent(deckName())
				+ '&slide_id=' + encodeURIComponent(slideId || '')
				+ '&hash=' + encodeURIComponent(hash)
			const j = await apiGet(qs)
			if (!j || !j.ok || !j.html) { body.innerHTML = '<div class="fb-snap-loading">No snapshot stored for this version.</div>'; return }
			let htmlText
			try { htmlText = await ungzipB64(j.html) } catch (e) { body.innerHTML = '<div class="fb-snap-loading">Snapshot could not be decoded.</div>'; return }
			const c = deck.getConfig() || {}
			const SW = (typeof c.width === 'number' && c.width) || 960
			const SH = (typeof c.height === 'number' && c.height) || 700
			const availW = Math.min(window.innerWidth * 0.86, 1200)
			const availH = window.innerHeight * 0.82
			const scale = Math.min(availW / SW, availH / SH)
			const dispW = Math.round(SW * scale), dispH = Math.round(SH * scale)
			body.innerHTML = `<div class="fb-snap-frame" style="width:${dispW}px;height:${dispH}px">`
				+ `<div class="fb-snap-scale" style="transform:scale(${scale});width:${SW}px;height:${SH}px">`
				+ `<div class="reveal"><div class="slides">${htmlText}</div></div></div></div>`
			const sec = body.querySelector('.slides > section')
			if (sec) { sec.classList.remove('past', 'future'); sec.classList.add('present'); sec.removeAttribute('hidden') }
		}

		// Skaliertes Mini-Abbild einer Folie (Hover im Boxplot). Klont die Section
		// in einen .reveal/.slides-Wrapper (damit die Reveal-CSS greift) und
		// skaliert ihn auf Thumbnail-Groesse.
		function showMini(section, clientX, clientY) {
			ensureAdminDom()
			const c = deck.getConfig() || {}
			const SW = (typeof c.width === 'number' && c.width) || 960
			const SH = (typeof c.height === 'number' && c.height) || 700
			const miniW = 320, scale = miniW / SW, miniH = Math.round(SH * scale)

			const clone = section.cloneNode(true)
			clone.removeAttribute('hidden'); clone.removeAttribute('aria-hidden')
			clone.classList.remove('past', 'future', 'present')
			clone.querySelectorAll('#fb-widget, aside.notes, .fragment').forEach(n => {
				if (n.id === 'fb-widget' || n.matches('aside.notes')) n.remove()
				else { n.classList.add('visible'); n.classList.remove('fragment') } // Fragmente sichtbar
			})

			// Zahlen ueber dem Preview: gesamt / positiv / neutral / negativ / Schnitt.
			const st = adminData && adminData[sectionId(section)]
			let statsHtml = ''
			if (st && st.n) {
				const d = st.dist || {}
				const pos = (d['1'] || 0) + (d['2'] || 0) + (d['3'] || 0)
				const neg = (d['-1'] || 0) + (d['-2'] || 0) + (d['-3'] || 0)
				const neu = d['0'] || 0
				const q = quartiles(d)
				statsHtml = `<div class="fb-mini-stats">`
					+ `<span class="t">n ${st.n}</span>`
					+ `<span class="p">▲ ${pos}</span>`
					+ `<span class="z">● ${neu}</span>`
					+ `<span class="n">▼ ${neg}</span>`
					+ `<span class="a">⌀ ${st.avg == null ? '–' : (st.avg > 0 ? '+' : '') + st.avg}</span>`
					+ (q ? `<span class="m">med ${q.med}</span>` : '')
					+ `</div>`
			}

			// Neueste Kommentare unter dem Preview (Server liefert neueste zuerst).
			let commentsHtml = ''
			if (st && st.comments && st.comments.length) {
				const cs = st.comments.slice(0, 4)
				commentsHtml = `<div class="fb-mini-comments">`
					+ cs.map(c => `<div class="fb-mini-c"><span class="fb-mini-ct">${esc(c.value)}</span>`
						+ `<span class="fb-mini-cm">${esc((c.created_at || '').slice(5, 16).replace('T', ' '))}</span></div>`).join('')
					+ (st.comments.length > cs.length ? `<div class="fb-mini-more">+${st.comments.length - cs.length} more</div>` : '')
					+ `</div>`
			}

			miniEl.innerHTML = statsHtml
				+ `<div class="fb-mini-view" style="width:${miniW}px;height:${miniH}px">`
				+ `<div class="fb-mini-scale" style="transform:scale(${scale});width:${SW}px;height:${SH}px">`
				+ `<div class="reveal"><div class="slides"></div></div></div></div>`
				+ commentsHtml
			miniEl.querySelector('.fb-mini-scale .slides').appendChild(clone)
			miniEl.style.width = miniW + 'px'; miniEl.style.height = ''
			miniEl.classList.add('open')
			moveMini(clientX, clientY)
		}
		function moveMini(clientX, clientY) {
			if (!miniEl) return
			const w = miniEl.offsetWidth, h = miniEl.offsetHeight, m = 14
			let x = clientX + m, y = clientY + m
			if (x + w + 4 > window.innerWidth) x = clientX - w - m
			if (y + h + 4 > window.innerHeight) y = clientY - h - m
			miniEl.style.left = Math.max(4, x) + 'px'
			miniEl.style.top = Math.max(4, y) + 'px'
		}
		function hideMini() { if (miniEl) miniEl.classList.remove('open') }

		// Overlay fuer die aktuelle Folie rendern (inkl. Versions-Abgleich per Hash).
		async function updateOverlay() {
			ensureAdminDom()
			// Deck-weites Overlay (aus der Boxplot-Deck-Spalte) vs. Folien-Overlay.
			const deckMode = overlayTarget === '*deck*'
			const sec = deck.getCurrentSlide()
			const id = deckMode ? '*deck*' : sectionId(sec)
			const st = adminData && adminData[id]
			const curHash = deckMode ? null : await slideHash(sec)
			const curText = deckMode ? '' : slideNormText(sec)

			let html = `<div class="fb-o-head"><span class="fb-o-title">${deckMode ? 'Whole-deck feedback' : 'Slide feedback'}</span>`
				+ `<span class="fb-o-sub">${deckMode ? 'not tied to a slide' : esc(id)}</span></div><div class="fb-o-body">`

			if (!st || !st.n && (!st.comments || !st.comments.length)) {
				html += `<div class="fb-o-empty">${deckMode ? 'No whole-deck feedback yet.' : 'No feedback for this slide yet.'}</div>`
			} else {
				const avg = st.avg
				html += `<div class="fb-o-metrics"><span class="fb-o-avg ${avgClass(avg)}">`
					+ (avg == null ? '–' : (avg > 0 ? '+' : '') + avg.toFixed(2))
					+ `</span><span class="fb-o-n">${st.n} rating${st.n === 1 ? '' : 's'}</span></div>`

				// Verteilung -3..+3 als Mini-Balken.
				const maxc = Math.max(1, ...[-3,-2,-1,0,1,2,3].map(v => st.dist[String(v)] || 0))
				html += `<div class="fb-o-bars">`
				for (const v of [3,2,1,0,-1,-2,-3]) {
					const c = st.dist[String(v)] || 0
					const cls = v < 0 ? 'neg' : (v > 0 ? 'pos' : 'neu')
					html += `<span class="fb-o-bl">${v > 0 ? '+' + v : v}</span>`
						+ `<span class="fb-o-bar ${cls}"><span style="width:${Math.round(c / maxc * 100)}%"></span></span>`
						+ `<span class="fb-o-bc">${c}</span>`
				}
				html += `</div>`

				// Versions-Abgleich per AEHNLICHKEIT (nicht nur gleich/ungleich):
				// vergleicht den aktuellen Folientext mit dem gespeicherten Text jeder
				// bewerteten Fassung (Jaccard). Klasse: >=98% aktuell, >=60% aehnlich,
				// sonst stark geaendert; '?' wenn kein Versionstext vorliegt (Altdaten).
				const versions = st.versions || {}
				const simOf = h => {
					if (curHash && h === curHash) return 1
					if (versions[h] != null && curText) return textSim(curText, versions[h])
					return null
				}
				const simCls = s => s == null ? 'unk' : (s >= 0.98 ? 'ok' : (s >= 0.6 ? 'mid' : 'old'))
				const simPct = s => s == null ? '?' : Math.round(s * 100) + '%'

				const snaps = st.snaps || []
				const hashes = st.hashes || {}
				const keys = Object.keys(hashes)
				if (!deckMode && keys.length) {
					const items = keys.map(h => ({ h, n: hashes[h], sim: simOf(h) }))
						.sort((a, b) => (b.sim == null ? -1 : b.sim) - (a.sim == null ? -1 : a.sim))
					html += `<div class="fb-o-ver">` + items.map(it => {
						const eye = snaps.includes(it.h) ? ` <a class="fb-o-eye" data-hash="${it.h}" data-sim="${simPct(it.sim)}" title="View this version">👁</a>` : ''
						return `<span class="v ${simCls(it.sim)}">${simPct(it.sim)} <em>(${it.n})</em>${eye}</span>`
					}).join('') + `</div>`
					html += `<div class="fb-o-verlabel">similarity of each rated version to the current slide (count) · 👁 view</div>`
				}

				// Kommentare mit Aehnlichkeit ihrer Fassung zur aktuellen Folie.
				const cs = st.comments || []
				if (cs.length) {
					html += `<div class="fb-o-clist">`
					// Werkzeugleiste: alle auswaehlen + Auswahl loeschen (mehrere).
					html += `<div class="fb-o-ctools"><label class="fb-o-selall"><input type="checkbox" class="fb-o-selall-cb"> select all</label>`
						+ `<a href="#" class="fb-o-delsel disabled" data-act="delsel">🗑 delete selected</a></div>`
					for (const c of cs) {
						const sim = c.hash ? simOf(c.hash) : null
						const badge = sim == null ? '' : ` · <span class="fb-o-csim ${simCls(sim)}">${simPct(sim)} match</span>`
						const eye = (c.hash && snaps.includes(c.hash)) ? ` · <a class="fb-o-eye" data-hash="${c.hash}" data-sim="${sim == null ? '' : simPct(sim)}">👁 snapshot</a>` : ''
						const sel = c.id ? `<input type="checkbox" class="fb-o-csel" data-id="${c.id}">` : ''
						const cx = c.id ? `<a href="#" class="fb-o-cx" data-id="${c.id}" title="Delete this comment">✕</a>` : ''
						html += `<div class="fb-o-c"><div class="fb-o-crow">${sel}<div class="fb-o-ctext">`
							+ `<div>${esc(c.value)}</div>`
							+ `<div class="fb-o-cmeta">${esc((c.created_at || '').slice(0, 16).replace('T', ' '))}${badge}${eye}</div>`
							+ `</div>${cx}</div></div>`
					}
					html += `</div>`
				}

				// "Alles loeschen" fuer diese Folie / das Deck (Ratings + Kommentare).
				html += `<div class="fb-o-actions"><a href="#" class="fb-o-delall" data-act="delall">`
					+ `🗑 Delete all feedback for this ${deckMode ? 'deck' : 'slide'}</a></div>`
			}
			html += `</div><div class="fb-o-hint">Press “${ADMIN_KEY.toUpperCase()}” to cycle · Esc to close</div>`
			overlayEl.innerHTML = html
			// Snapshot-Ansicht je Version/Kommentar.
			overlayEl.querySelectorAll('.fb-o-eye').forEach(a => a.addEventListener('click', e => {
				e.preventDefault()
				showSnapshot(a.getAttribute('data-hash'), deckMode ? '' : id, a.getAttribute('data-sim') || '')
			}))

			// --- Loesch-Interaktionen im Overlay -------------------------------
			const selBoxes = () => [...overlayEl.querySelectorAll('.fb-o-csel')]
			const delSelBtn = overlayEl.querySelector('.fb-o-delsel')
			const selAllCb = overlayEl.querySelector('.fb-o-selall-cb')
			function refreshSel() {
				const n = selBoxes().filter(b => b.checked).length
				if (delSelBtn) {
					delSelBtn.classList.toggle('disabled', n === 0)
					delSelBtn.textContent = n ? `🗑 delete selected (${n})` : '🗑 delete selected'
				}
				if (selAllCb) { const all = selBoxes(); selAllCb.checked = all.length > 0 && all.every(b => b.checked) }
			}
			// Nach dem Loeschen: Stats neu laden und Overlay neu rendern.
			async function afterDelete(res) {
				if (!res || !res.ok) { alert('Delete failed.'); return }
				await loadSlideStats(); updateOverlay()
			}
			selBoxes().forEach(b => b.addEventListener('change', refreshSel))
			if (selAllCb) selAllCb.addEventListener('change', () => {
				selBoxes().forEach(b => { b.checked = selAllCb.checked }); refreshSel()
			})
			overlayEl.querySelectorAll('.fb-o-cx').forEach(a => a.addEventListener('click', async e => {
				e.preventDefault()
				const cid = Number(a.getAttribute('data-id'))
				if (!cid || !confirm('Delete this comment?')) return
				afterDelete(await apiDelete({ ids: [cid] }))
			}))
			if (delSelBtn) delSelBtn.addEventListener('click', async e => {
				e.preventDefault()
				const ids = selBoxes().filter(b => b.checked).map(b => Number(b.getAttribute('data-id')))
				if (!ids.length || !confirm(`Delete ${ids.length} selected comment${ids.length === 1 ? '' : 's'}?`)) return
				afterDelete(await apiDelete({ ids }))
			})
			const delAllBtn = overlayEl.querySelector('.fb-o-delall')
			if (delAllBtn) delAllBtn.addEventListener('click', async e => {
				e.preventDefault()
				const scope = deckMode
					? { course, deck: deckName(), deckWide: true, pollNull: true }
					: { course, deck: deckName(), slide_id: id, pollNull: true }
				const what = deckMode ? 'the whole deck' : 'this slide'
				if (!confirm(`Delete ALL feedback (ratings + comments) for ${what}? This cannot be undone.`)) return
				afterDelete(await apiDelete({ scope }))
			})
			refreshSel()
		}

		// Quartile aus der diskreten Verteilung (dist: {"-3":n,...}).
		function quartiles(dist) {
			const arr = []
			for (const v of [-3,-2,-1,0,1,2,3]) { const c = (dist && dist[String(v)]) || 0; for (let i = 0; i < c; i++) arr.push(v) }
			const n = arr.length; if (!n) return null
			const q = p => { const idx = (n - 1) * p, lo = Math.floor(idx), hi = Math.ceil(idx); return arr[lo] + (arr[hi] - arr[lo]) * (idx - lo) }
			return { min: arr[0], q1: q(0.25), med: q(0.5), q3: q(0.75), max: arr[n - 1], n, mean: arr.reduce((a, b) => a + b, 0) / n }
		}

		// Boxplot ueber alle Folien (Inline-SVG, dependency-frei). X = Folien in
		// Praesentationsreihenfolge (nur bewertete), Y = Skala -3..+3.
		function renderBoxplot() {
			ensureAdminDom()
			const slides = deck.getSlides()
			const cols = []
			// Deck-weites Feedback ("Feedback for the whole deck") als erste Spalte.
			const deckSt = adminData && adminData['*deck*']
			const deckQ = deckSt ? quartiles(deckSt.dist) : null
			if (deckQ) cols.push({ i: '∑', label: 'Deck', id: '*deck*', q: deckQ, isDeck: true })
			slides.forEach((sec, i) => {
				const id = sectionId(sec)
				const st = adminData && adminData[id]
				const q = st ? quartiles(st.dist) : null
				if (q) cols.push({ i: i + 1, label: String(i + 1), id, q })
			})

			const head = `<div class="fb-bp-head"><span class="fb-bp-title">Ratings per slide (boxplot)</span>`
				+ `<span class="fb-bp-sub">${cols.length} rated slide${cols.length === 1 ? '' : 's'} · press “${ADMIN_KEY.toUpperCase()}” to cycle · Esc to close</span></div>`

			if (!cols.length) { boxplotEl.innerHTML = head + `<div class="fb-bp-empty">No rated slides yet.</div>`; return }

			// Erst Geruest einsetzen, dann die verfuegbare Flaeche messen und das
			// SVG darauf fuellen (volle Folien-/Fenstergroesse statt fixer Hoehe).
			boxplotEl.innerHTML = head + `<div class="fb-bp-scroll"></div>`
			const scroll = boxplotEl.querySelector('.fb-bp-scroll')
			const availW = Math.max(320, scroll.clientWidth - 2)
			const availH = Math.max(240, scroll.clientHeight - 2)

			const padL = 40, padR = 14, padT = 16, padB = 40
			// Spaltenbreite fuellt die Breite bei wenigen Folien, scrollt bei vielen.
			const colW = Math.max(30, Math.floor((availW - padL - padR) / cols.length))
			const H = availH
			const W = Math.max(availW, padL + padR + cols.length * colW)
			const y = v => padT + (3 - v) / 6 * (H - padT - padB)   // +3 oben, -3 unten
			const boxW = Math.min(30, Math.max(10, Math.round(colW * 0.5)))

			let svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
			// Gitter + Y-Achsenbeschriftung
			for (const v of [3,2,1,0,-1,-2,-3]) {
				const yy = y(v)
				svg += `<line x1="${padL}" y1="${yy}" x2="${W - padR}" y2="${yy}" stroke="${v === 0 ? '#bbb' : '#eee'}" stroke-width="1"/>`
					+ `<text x="${padL - 6}" y="${yy + 3}" text-anchor="end" font-size="10" fill="#888">${v > 0 ? '+' + v : v}</text>`
			}
			// Boxen
			cols.forEach((c, k) => {
				const cx = padL + k * colW + colW / 2
				const q = c.q
				const col = q.mean < -0.001 ? '#e2001a' : (q.mean > 0.001 ? '#2e7d32' : '#6b7280')
				const fill = q.mean < -0.001 ? '#fbe3e5' : (q.mean > 0.001 ? '#e2f2e7' : '#eceef0')
				// Whisker
				svg += `<line x1="${cx}" y1="${y(q.max)}" x2="${cx}" y2="${y(q.min)}" stroke="${col}" stroke-width="1"/>`
					+ `<line x1="${cx - 5}" y1="${y(q.max)}" x2="${cx + 5}" y2="${y(q.max)}" stroke="${col}" stroke-width="1"/>`
					+ `<line x1="${cx - 5}" y1="${y(q.min)}" x2="${cx + 5}" y2="${y(q.min)}" stroke="${col}" stroke-width="1"/>`
				// Box q1..q3
				const yq3 = y(q.q3), yq1 = y(q.q1)
				svg += `<rect x="${cx - boxW / 2}" y="${yq3}" width="${boxW}" height="${Math.max(1, yq1 - yq3)}" fill="${fill}" stroke="${col}" stroke-width="1" rx="2"/>`
					+ `<line x1="${cx - boxW / 2}" y1="${y(q.med)}" x2="${cx + boxW / 2}" y2="${y(q.med)}" stroke="${col}" stroke-width="2"/>`
				// Klickbare Flaeche -> zur Folie springen (Deck-Spalte nicht klickbar)
				const label = c.isDeck ? 'whole deck' : ('slide ' + c.i)
				svg += `<rect data-idx="${k}" x="${padL + k * colW}" y="${padT}" width="${colW}" height="${H - padT - padB}" fill="transparent" style="cursor:pointer"><title>${label} · n=${q.n} · median ${q.med} · mean ${q.mean.toFixed(2)}</title></rect>`
				// X-Label: Deck-Spalte hervorgehoben, Folienindizes bei vielen ausgeduennt
				if (c.isDeck)
					svg += `<text x="${cx}" y="${H - padB + 14}" text-anchor="middle" font-size="9" font-weight="bold" fill="#555">Deck</text>`
				else if (cols.length <= 40 || k % Math.ceil(cols.length / 40) === 0)
					svg += `<text x="${cx}" y="${H - padB + 14}" text-anchor="middle" font-size="9" fill="#888">${c.label}</text>`
			})
			svg += `</svg>`

			scroll.innerHTML = svg
			const secFor = id => deck.getSlides().find(s => sectionId(s) === id)
			scroll.querySelectorAll('rect[data-idx]').forEach(r => {
				const c = cols[Number(r.getAttribute('data-idx'))]
				// Klick: Deck-Spalte -> Deck-Overlay; sonst zur Folie springen + Overlay.
				r.addEventListener('click', () => {
					if (c.isDeck) { hideMini(); openDeckOverlay(); return }
					const sec = secFor(c.id)
					if (sec) { const idx = deck.getIndices(sec); hideMini(); deck.slide(idx.h, idx.v || 0); setMode(1) }
				})
				// Hover -> Mini-Abbild der Folie (nicht fuer die Deck-Spalte)
				r.addEventListener('mouseenter', e => { const sec = secFor(c.id); if (sec) showMini(sec, e.clientX, e.clientY) })
				r.addEventListener('mousemove', e => moveMini(e.clientX, e.clientY))
				r.addEventListener('mouseleave', hideMini)
			})
		}

		function setMode(m) {
			ensureAdminDom()
			adminMode = m
			hideMini()
			if (m !== 0) closeDashboard()
			overlayEl.classList.toggle('open', m === 1)
			boxplotEl.classList.toggle('open', m === 2)
			if (m === 1) loadSlideStats().then(updateOverlay)
			else if (m === 2) loadSlideStats().then(renderBoxplot)
		}
		function cycle() { overlayTarget = null; setMode((adminMode + 1) % 3) }
		// Deck-weites Overlay aus der Boxplot-Deck-Spalte oeffnen.
		function openDeckOverlay() { overlayTarget = '*deck*'; setMode(1) }

		// --- Vollbild-Dashboard (Taste d) --------------------------------------
		// Die komplette Auswerte-SPA liegt als Geschwistermodul und wird ERST beim
		// Oeffnen geladen (dynamischer import); ihre schweren Abhaengigkeiten
		// (Preact/Mantine/ApexCharts) laedt sie selbst per esm.sh on-demand.
		let dashEl = null, dashOpen = false, dashMounted = false, dashMounting = false
		function ensureDashDom() {
			if (dashEl) return
			dashEl = document.createElement('div'); dashEl.id = 'fb-dashboard'
			document.body.appendChild(dashEl)
		}
		function closeDashboard() { if (dashEl) { dashOpen = false; dashEl.classList.remove('open') } }
		async function toggleDashboard() {
			ensureDashDom()
			if (dashOpen) { closeDashboard(); return }
			setMode(0)
			dashOpen = true; dashEl.classList.add('open')
			if (dashMounted || dashMounting) return
			dashMounting = true
			dashEl.innerHTML = '<div class="fb-dash-loading">Loading dashboard…</div>'
			try {
				const url = cfg.dashboardUrl || new URL('./reveal-plugin-feedback-dashboard.js', import.meta.url).href
				const mod = await import(url)
				dashEl.innerHTML = ''
				await mod.mountDashboard(dashEl, { apiUrl, course, deck: deckName(), close: closeDashboard })
				dashMounted = true
			} catch (e) {
				dashEl.innerHTML = '<div class="fb-dash-loading">Dashboard failed to load: ' + (e && e.message ? e.message : e) + '</div>'
			} finally { dashMounting = false }
		}

		function initAdmin() {
			ensureAdminDom()
			loadSlideStats()
			// Ueber Reveals Binding-API registrieren: erscheint in der Hilfe (Taste
			// "?"), wird in Eingabefeldern automatisch ignoriert und kollidiert nicht
			// mit anderen Bindings. keyCode = Grossbuchstabe.
			deck.addKeyBinding(
				{ keyCode: ADMIN_KEY.toUpperCase().charCodeAt(0), key: ADMIN_KEY.toUpperCase(), description: 'Admin: slide feedback overlay / boxplot' },
				() => cycle())
			deck.addKeyBinding(
				{ keyCode: DASH_KEY.toUpperCase().charCodeAt(0), key: DASH_KEY.toUpperCase(), description: 'Admin: analytics dashboard' },
				() => toggleDashboard())
			// Escape schliesst unsere Overlays -- im Capture abfangen, damit Reveal
			// nicht gleichzeitig die Folienuebersicht oeffnet.
			document.addEventListener('keydown', e => {
				if ((e.key || '').toLowerCase() !== 'escape') return
				if (snapOpen) { e.stopPropagation(); e.preventDefault(); closeSnap(); return }  // Snapshot zuerst
				if (adminMode || dashOpen) { e.stopPropagation(); e.preventDefault(); setMode(0); closeDashboard() }
			}, true)
			deck.on('slidechanged', () => { if (adminMode === 1) updateOverlay() })
		}

		// --- Start --------------------------------------------------------------
		deck.on('ready', () => {
			injectStyle()
			loadCourseInfo().then(() => {
				renderSurveys()
				if (!isPrint) buildWidget()
				// Admin-Ansichten nur im interaktiven Modus und nur fuer Admins.
				if (!isPrint) checkAdmin().then(ok => { if (ok) initAdmin() })
			})
		})
		// Vertikale/nachgeladene Folien ebenfalls abdecken
		deck.on('slidechanged', () => renderSurveys())
	}
})
