// Feedback-Auswerte-Dashboard als Preact/Mantine-SPA. Wird vom Feedback-Plugin
// (reveal-plugin-feedback.js) ERST beim Oeffnen (Taste "e") per dynamischem
// import() geladen; die schweren Abhaengigkeiten (Preact, Mantine, ApexCharts)
// holt dieses Modul selbst on-demand von esm.sh -- nichts davon beim Modul-Load.
//
// Vertrag: export async function mountDashboard(container, { apiUrl, course, deck, close })
// Der Container ist ein bereits sichtbares Vollbild-Overlay (#fb-dashboard); die
// App fuellt ihn. Alle Fetches gehen gegen apiUrl (JSON-API), credentials:'include'.

// --- Feste Versionen (identisch zur bisherigen Import-Map in dashboard/index.html) ---
const PREACT_VER = '10.24.3'
const HTM_VER = '3.1.1'
const APEX_VER = '3.54.1'
const MANTINE_VER = '7.15.1'

// react/react-dom werden bei esm.sh per ?alias auf preact/compat gemappt; &deps
// pinnt preact (und @mantine/hooks) auf EINE Version, damit alle Module -- unsere
// direkten preact-Importe UND Mantines interne react-Importe -- dieselbe
// preact-Instanz teilen (sonst "Invalid hook call"/doppelte Hooks).
const MANTINE_ALIAS = `alias=react:preact/compat,react-dom:preact/compat&deps=preact@${PREACT_VER},@mantine/hooks@${MANTINE_VER}`
const HOOKS_ALIAS = `alias=react:preact/compat,react-dom:preact/compat&deps=preact@${PREACT_VER}`

const URLS = {
    preact: `https://esm.sh/preact@${PREACT_VER}`,
    hooks: `https://esm.sh/preact@${PREACT_VER}/hooks`,
    htm: `https://esm.sh/htm@${HTM_VER}`,
    apex: `https://esm.sh/apexcharts@${APEX_VER}`,
    mantineCore: `https://esm.sh/@mantine/core@${MANTINE_VER}?${MANTINE_ALIAS}`,
    mantineHooks: `https://esm.sh/@mantine/hooks@${MANTINE_VER}?${HOOKS_ALIAS}`,
    mantineCss: `https://esm.sh/@mantine/core@${MANTINE_VER}/styles.css`,
}

export async function mountDashboard(container, opts) {
    const { apiUrl, course: optCourse, deck: optDeck, close } = opts || {}
    const API = apiUrl

    // Mantine-CSS einmalig injizieren.
    if (!document.querySelector('link[data-mantine-styles]')) {
        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.href = URLS.mantineCss
        link.setAttribute('data-mantine-styles', '')
        document.head.appendChild(link)
    }

    // Alle Abhaengigkeiten dynamisch laden (erst jetzt). @mantine/hooks wird mit
    // geladen, damit es -- via &deps -- dieselbe Instanz ist, die @mantine/core nutzt.
    const [preactMod, hooksMod, htmMod, apexMod, coreMod] = await Promise.all([
        import(URLS.preact),
        import(URLS.hooks),
        import(URLS.htm),
        import(URLS.apex),
        import(URLS.mantineCore),
        import(URLS.mantineHooks),
    ])

    const { h, render } = preactMod
    const { useState, useEffect, useCallback, useRef, useMemo } = hooksMod
    const htm = htmMod.default || htmMod
    const ApexCharts = apexMod.default || apexMod
    const {
        MantineProvider, Container, Title, Text, Group, Stack, SimpleGrid, Card,
        Select, TextInput, Button, Table, Progress, Badge, Tabs, Loader,
        Alert, Center,
    } = coreMod

    const html = htm.bind(h)

    // --- Datum-Helfer (lokale Zeit, Tages-Granularitaet) ---
    const isoDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const daysAgo = n => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - n); return d }
    const PRESETS = [
        { label: 'Woche', days: 7 },
        { label: 'Monat', days: 30 },
        { label: '3 Monate', days: 90 },
        { label: 'Jahr', days: 365 },
        { label: 'Alles', days: null },
    ]

    const theme = { primaryColor: 'red', fontFamily: 'Arial, Helvetica, sans-serif' }

    // Das Dashboard-Overlay (#fb-dashboard) liegt bei z-index 330; Mantine
    // portalt Dropdowns nach document.body mit Default-z-index 300 -- sie
    // lägen also HINTER dem Overlay und wären unsichtbar. Darüber heben.
    const OVERLAY_Z = 400
    const comboboxProps = { zIndex: OVERLAY_Z }

    async function apiGet(params) {
        const qs = new URLSearchParams(params).toString()
        const res = await fetch(`${API}?${qs}`, { credentials: 'include' })
        if (res.status === 401) { window.location.reload(); throw new Error('auth') }
        if (res.status === 403) throw new Error('forbidden')
        if (!res.ok) throw new Error('http_' + res.status)
        return res.json()
    }

    // Feedback loeschen (nur Admin). body = {ids:[...]} ODER {scope:{...}}.
    async function apiDelete(body) {
        const res = await fetch(`${API}?action=delete`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        })
        if (res.status === 401) { window.location.reload(); throw new Error('auth') }
        if (res.status === 403) throw new Error('forbidden')
        if (!res.ok) throw new Error('http_' + res.status)
        return res.json()
    }

    // Aktive Filter -> Loesch-Scope (nur nicht-leere Werte), damit "alles
    // loeschen" pro Zeile genau den angezeigten (gefilterten) Umfang trifft.
    const filterScope = f => {
        const s = {}
        if (f && f.course) s.course = f.course
        if (f && f.group) s.group = f.group
        if (f && f.from) s.from = f.from
        if (f && f.to) s.to = f.to
        return s
    }

    // Bestaetigen, loeschen, neu laden. Gibt true zurueck, wenn geloescht wurde.
    async function runDelete(body, confirmMsg, reload) {
        if (confirmMsg && !window.confirm(confirmMsg)) return false
        try {
            await apiDelete(body)
            if (reload) await reload()
            return true
        } catch (e) {
            window.alert('Löschen fehlgeschlagen: ' + (e && e.message ? e.message : e))
            return false
        }
    }

    function StatCard({ label, value, color }) {
        return html`
            <${Card} withBorder padding="md" radius="md">
                <${Text} size="xs" c="dimmed" tt="uppercase" fw={700}>${label}<//>
                <${Text} size="1.8rem" fw={700} c=${color || undefined}>${value}<//>
            <//>`
    }

    // Bewertungsskala -3..+3: Farbe/Format nach Vorzeichen.
    const ratingColor = avg => avg > 0.25 ? 'green' : avg < -0.25 ? 'red' : 'gray'
    const fmtAvg = a => (a > 0 ? '+' : '') + a.toFixed(2)

    function RatingsTable({ ratings, filters, reload }) {
        if (!ratings.length) return html`<${Text} c="dimmed">Keine Bewertungen.<//>`
        const delRow = r => {
            const scope = { ...filterScope(filters), kind: 'rating', pollNull: true }
            if (r.deck) scope.deck = r.deck
            if (r.slide_id) scope.slide_id = r.slide_id; else scope.deckWide = true
            const label = r.slide_id ? `Folie „${r.slide_id}“` : 'ganzes Deck'
            runDelete({ scope }, `Alle ${r.n} Bewertungen für ${label} löschen?`, reload)
        }
        return html`
            <${Table} striped highlightOnHover withTableBorder>
                <${Table.Thead}><${Table.Tr}>
                    <${Table.Th}>Deck<//><${Table.Th}>Folie<//>
                    <${Table.Th} ta="right">n<//><${Table.Th} ta="right">Ø<//>
                    <${Table.Th} w={220}>Verteilung (−/0/+)<//>
                    <${Table.Th} w={90} ta="right">Aktion<//>
                <//><//>
                <${Table.Tbody}>
                    ${ratings.map(r => {
                        const sum = Math.max(r.neg + r.neu + r.pos, 1)
                        return html`
                            <${Table.Tr} key=${r.deck + ':' + r.slide_id}>
                                <${Table.Td}>${r.deck || html`<${Text} c="dimmed">—<//>`}<//>
                                <${Table.Td}>${r.slide_id ? html`<code>${r.slide_id}</code>` : html`<${Badge} size="sm" variant="light" color="gray">ganzes Deck<//>`}<//>
                                <${Table.Td} ta="right">${r.n}<//>
                                <${Table.Td} ta="right">
                                    <${Badge} color=${ratingColor(r.avg)} variant="light">${fmtAvg(r.avg)}<//>
                                <//>
                                <${Table.Td}>
                                    <${Progress.Root} size="lg">
                                        <${Progress.Section} value=${100 * r.neg / sum} color="red"/>
                                        <${Progress.Section} value=${100 * r.neu / sum} color="gray"/>
                                        <${Progress.Section} value=${100 * r.pos / sum} color="green"/>
                                    <//>
                                <//>
                                <${Table.Td} ta="right">
                                    <${Button} size="compact-xs" variant="subtle" color="red"
                                        onClick=${() => delRow(r)} title="Alle Bewertungen dieser Zeile löschen">✕ alle<//>
                                <//>
                            <//>`
                    })}
                <//>
            <//>`
    }

    function Polls({ polls, filters, reload }) {
        if (!polls.length) return html`<${Text} c="dimmed">Keine Umfrage-Antworten.<//>`
        const delPoll = p => runDelete(
            { scope: { ...filterScope(filters), poll_id: p.poll_id, kind: 'poll' } },
            `Alle ${p.total} Antworten der Umfrage „${p.question || p.poll_id}“ löschen?`, reload)
        return html`
            <${Stack}>
                ${polls.map(p => html`
                    <${Card} withBorder radius="md" key=${p.poll_id}>
                        <${Group} justify="space-between" mb="sm">
                            <${Text} fw={700}>${p.question || p.poll_id}<//>
                            <${Group} gap="xs">
                                <${Badge} variant="light" color="gray">${p.poll_id}<//>
                                <${Badge} variant="light">${p.total} Antworten<//>
                                <${Button} size="compact-xs" variant="subtle" color="red"
                                    onClick=${() => delPoll(p)}>✕ alle löschen<//>
                            <//>
                        <//>
                        <${Stack} gap="xs">
                            ${p.options.map(o => {
                                const pct = Math.round(100 * o.count / Math.max(p.total, 1))
                                return html`
                                    <div key=${o.value}>
                                        <${Group} justify="space-between" gap="xs">
                                            <${Text} size="sm">${o.value}<//>
                                            <${Text} size="sm" c="dimmed">${o.count} (${pct}%)<//>
                                        <//>
                                        <${Progress} value=${pct} color="red" size="md" mt={2}/>
                                    </div>`
                            })}
                        <//>
                    <//>`)}
            <//>`
    }

    function CommentsTable({ comments, reload }) {
        const [sel, setSel] = useState(() => new Set())
        // Auswahl zuruecksetzen, wenn sich die Datenmenge aendert (z.B. nach Filter/Reload).
        useEffect(() => { setSel(new Set()) }, [comments])
        if (!comments.length) return html`<${Text} c="dimmed">Keine Kommentare.<//>`

        const ids = comments.map(c => c.id).filter(Boolean)
        const allSel = ids.length > 0 && ids.every(id => sel.has(id))
        const toggle = id => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
        const toggleAll = () => setSel(allSel ? new Set() : new Set(ids))
        const delIds = list => runDelete({ ids: list },
            `${list.length} Kommentar${list.length === 1 ? '' : 'e'} löschen?`, reload)
        const selIds = [...sel]

        return html`
            <${Stack} gap="sm">
                <${Group} justify="space-between">
                    <${Text} size="sm" c="dimmed">${comments.length} Kommentar${comments.length === 1 ? '' : 'e'}${selIds.length ? ` · ${selIds.length} ausgewählt` : ''}<//>
                    <${Button} size="compact-sm" color="red" variant="light" disabled=${!selIds.length}
                        onClick=${() => delIds(selIds)}>Auswahl löschen (${selIds.length})<//>
                <//>
                <${Table} striped withTableBorder>
                    <${Table.Thead}><${Table.Tr}>
                        <${Table.Th} w={34}><input type="checkbox" checked=${allSel} onChange=${toggleAll} title="alle auswählen"/><//>
                        <${Table.Th} w={150}>Zeit<//><${Table.Th}>Gruppe<//>
                        <${Table.Th}>Deck / Folie<//><${Table.Th}>Kommentar<//>
                        <${Table.Th} w={50}><//>
                    <//><//>
                    <${Table.Tbody}>
                        ${comments.map((c, i) => html`
                            <${Table.Tr} key=${c.id || i} bg=${sel.has(c.id) ? 'red.0' : undefined}>
                                <${Table.Td}><input type="checkbox" checked=${sel.has(c.id)} onChange=${() => toggle(c.id)}/><//>
                                <${Table.Td}><${Text} size="xs" c="dimmed">${c.created_at}<//><//>
                                <${Table.Td}>${c.group_account}<//>
                                <${Table.Td}>${c.deck || '—'}<br/>${c.slide_id ? html`<code>${c.slide_id}</code>` : html`<${Text} size="xs" c="dimmed">ganzes Deck<//>`}<//>
                                <${Table.Td}>${c.value}<//>
                                <${Table.Td} ta="right">
                                    <${Button} size="compact-xs" variant="subtle" color="red"
                                        onClick=${() => delIds([c.id])} title="Diesen Kommentar löschen">✕<//>
                                <//>
                            <//>`)}
                    <//>
                <//>
            <//>`
    }

    function TimeGroupTable({ timeseries }) {
        if (!timeseries.length) return html`<${Text} c="dimmed">Keine Daten.<//>`
        return html`
            <${Table} striped withTableBorder>
                <${Table.Thead}><${Table.Tr}>
                    <${Table.Th}>Datum<//><${Table.Th}>Gruppe<//><${Table.Th} ta="right">Einträge<//>
                <//><//>
                <${Table.Tbody}>
                    ${timeseries.map((r, i) => html`
                        <${Table.Tr} key=${i}>
                            <${Table.Td}>${r.day}<//>
                            <${Table.Td}>${r.group_account}<//>
                            <${Table.Td} ta="right">${r.cnt}<//>
                        <//>`)}
                <//>
            <//>`
    }

    // Zeitreihen-Grafik (Feedback-Anzahl je Tag). Ziehen zum Zoomen -> ruft
    // onSelect(minTs, maxTs) auf; from/to steuern den sichtbaren Ausschnitt.
    function TimeChart({ series, from, to, onSelect }) {
        const ref = useRef(null)
        const onSelectRef = useRef(onSelect)
        onSelectRef.current = onSelect

        const points = useMemo(
            () => series.map(r => [new Date(r.day + 'T00:00:00').getTime(), r.cnt]),
            [series]
        )
        const min = from ? new Date(from + 'T00:00:00').getTime() : undefined
        const max = to ? new Date(to + 'T23:59:59').getTime() : undefined

        useEffect(() => {
            if (!ref.current) return
            const chart = new ApexCharts(ref.current, {
                chart: {
                    type: 'area', height: 260, fontFamily: 'Arial, Helvetica, sans-serif',
                    toolbar: { show: false }, animations: { enabled: false },
                    zoom: { enabled: true, type: 'x', autoScaleYaxis: true },
                    events: {
                        zoomed: (ctx, { xaxis }) => {
                            if (xaxis && xaxis.min && xaxis.max) onSelectRef.current(xaxis.min, xaxis.max)
                        },
                    },
                },
                series: [{ name: 'Feedback', data: points }],
                xaxis: { type: 'datetime', min, max },
                yaxis: { min: 0, forceNiceScale: true, labels: { formatter: v => String(Math.round(v)) } },
                colors: ['#e2001a'],
                dataLabels: { enabled: false },
                stroke: { curve: 'smooth', width: 2 },
                fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.45, opacityTo: 0.05 } },
                markers: { size: 0, hover: { size: 4 } },
                tooltip: { x: { format: 'dd.MM.yyyy' } },
                grid: { borderColor: '#eee', strokeDashArray: 3 },
                noData: { text: 'Keine Daten' },
            })
            chart.render()
            return () => chart.destroy()
        }, [points, min, max])

        return html`<div ref=${ref}></div>`
    }

    // Themen-Bewertungen der Kursumfrage (gerankt, schlechteste zuerst).
    function TopicRatings({ topics, filters, reload }) {
        if (!topics.length) return html`<${Text} c="dimmed">Keine Themen-Bewertungen.<//>`
        const delTopic = r => runDelete(
            { scope: { ...filterScope(filters), poll_id: r.poll_id, kind: 'rating' } },
            `Alle ${r.n} Bewertungen für „${r.question || r.poll_id}“ löschen?`, reload)
        return html`
            <${Table} striped highlightOnHover withTableBorder>
                <${Table.Thead}><${Table.Tr}>
                    <${Table.Th}>Thema<//><${Table.Th} ta="right">n<//><${Table.Th} ta="right">Ø<//>
                    <${Table.Th} w={220}>Verteilung (−/0/+)<//>
                    <${Table.Th} w={90} ta="right">Aktion<//>
                <//><//>
                <${Table.Tbody}>
                    ${topics.map(r => {
                        const sum = Math.max(r.neg + r.neu + r.pos, 1)
                        return html`
                            <${Table.Tr} key=${r.poll_id}>
                                <${Table.Td}>${r.question || r.poll_id}<//>
                                <${Table.Td} ta="right">${r.n}<//>
                                <${Table.Td} ta="right"><${Badge} color=${ratingColor(r.avg)} variant="light">${fmtAvg(r.avg)}<//><//>
                                <${Table.Td}>
                                    <${Progress.Root} size="lg">
                                        <${Progress.Section} value=${100 * r.neg / sum} color="red"/>
                                        <${Progress.Section} value=${100 * r.neu / sum} color="gray"/>
                                        <${Progress.Section} value=${100 * r.pos / sum} color="green"/>
                                    <//>
                                <//>
                                <${Table.Td} ta="right">
                                    <${Button} size="compact-xs" variant="subtle" color="red"
                                        onClick=${() => delTopic(r)} title="Alle Bewertungen dieses Themas löschen">✕ alle<//>
                                <//>
                            <//>`
                    })}
                <//>
            <//>`
    }

    // Freitext-Antworten der Kursumfrage, je Frage gruppiert.
    function SurveyTexts({ groups, reload }) {
        if (!groups.length) return html`<${Text} c="dimmed">Keine Freitext-Antworten.<//>`
        const delIds = (list, msg) => runDelete({ ids: list }, msg, reload)
        return html`
            <${Stack}>
                ${groups.map(g => {
                    const gids = g.answers.map(a => a.id).filter(Boolean)
                    return html`
                    <${Card} withBorder radius="md" key=${g.poll_id}>
                        <${Group} justify="space-between" mb="xs">
                            <${Text} fw={700}>${g.question || g.poll_id}<//>
                            <${Group} gap="xs">
                                <${Badge} variant="light">${g.answers.length}<//>
                                <${Button} size="compact-xs" variant="subtle" color="red" disabled=${!gids.length}
                                    onClick=${() => delIds(gids, `Alle ${gids.length} Freitext-Antworten zu „${g.question || g.poll_id}“ löschen?`)}>✕ alle löschen<//>
                            <//>
                        <//>
                        <${Stack} gap="sm">
                            ${g.answers.map((a, i) => html`
                                <${Group} key=${a.id || i} justify="space-between" align="flex-start" wrap="nowrap">
                                    <div>
                                        <${Text} size="sm">${a.value}<//>
                                        <${Text} size="xs" c="dimmed">${a.group_account} · ${a.created_at}<//>
                                    </div>
                                    ${a.id ? html`<${Button} size="compact-xs" variant="subtle" color="red"
                                        onClick=${() => delIds([a.id], 'Diese Antwort löschen?')} title="Löschen">✕<//>` : null}
                                <//>`)}
                        <//>
                    <//>`
                })}
            <//>`
    }

    function App() {
        const [meta, setMeta] = useState({ courses: [], decks: [], groups: [] })
        // Kurs/Deck aus dem aktuell geoeffneten Foliensatz als sinnvolle Vorbelegung.
        const [filters, setFilters] = useState(() => ({
            course: optCourse || '', deck: optDeck || '', group: '',
            from: isoDay(daysAgo(365)), to: '',
        }))
        const [data, setData] = useState(null)
        const [chart, setChart] = useState({ series: [] })
        const [loading, setLoading] = useState(true)
        const [error, setError] = useState(null)
        const [me, setMe] = useState(null)
        const [tab, setTab] = useState('ratings')

        const setF = (key, val) => setFilters(f => ({ ...f, [key]: val || '' }))
        // Ziehen im Chart / Presets setzen den Zeitbereich (from+to gemeinsam).
        const setRange = (minTs, maxTs) => setFilters(f => ({ ...f, from: isoDay(new Date(minTs)), to: isoDay(new Date(maxTs)) }))
        const applyPreset = p => setFilters(f => ({
            ...f,
            from: p.days === null ? '' : isoDay(daysAgo(p.days)),
            to:   p.days === null ? '' : isoDay(new Date()),
        }))

        useEffect(() => {
            apiGet({ action: 'whoami' }).then(setMe).catch(() => {})
            apiGet({ action: 'meta' }).then(setMeta).catch(e => setError(e.message))
        }, [])

        // Chart-Daten: nur Kurs/Deck/Gruppe (NICHT from/to) -> volle Zeitachse.
        useEffect(() => {
            apiGet({ action: 'timeseries', course: filters.course, deck: filters.deck, group: filters.group })
                .then(setChart).catch(() => {})
        }, [filters.course, filters.deck, filters.group])

        const load = useCallback(() => {
            setLoading(true); setError(null)
            apiGet({ action: 'stats', ...filters })
                .then(setData)
                .catch(e => setError(e.message))
                .finally(() => setLoading(false))
        }, [filters])

        useEffect(() => { load() }, [load])

        const exportUrl = `${API}?${new URLSearchParams({ action: 'export', ...filters })}`

        const courseOptions = meta.courses.map(c => ({ value: c.course, label: c.title || c.course }))
        const deckOptions = meta.decks.map(d => ({ value: d, label: d }))
        const groupOptions = meta.groups.map(g => ({ value: g, label: g }))

        let body
        if (error === 'forbidden') {
            body = html`<${Alert} color="red" title="Kein Zugriff">
                <${Text} size="sm">Dieser Account darf das Dashboard nicht sehen. Erkannter Account:<//>
                <${Text} fw={700} my={4}><code>${me && me.account !== null ? me.account : '(keiner erkannt)'}</code><//>
                <${Text} size="sm">Diesen Wert in <code>config.php</code> unter <code>admins</code> eintragen.<//>
            <//>`
        } else if (error) {
            body = html`<${Alert} color="red" title="Fehler">${error}<//>`
        } else if (loading && !data) {
            body = html`<${Center} mih={200}><${Loader} color="red"/><//>`
        } else if (data) {
            const totalRatings = data.overview.reduce((a, o) => a + o.ratings, 0)
            const wN = data.ratings.reduce((a, r) => a + r.n, 0)
            const avgRating = wN ? data.ratings.reduce((a, r) => a + r.avg * r.n, 0) / wN : null

            body = html`
                <${Card} withBorder radius="md" mb="lg">
                    <${Group} justify="space-between" mb="xs">
                        <${Text} fw={600} size="sm">Feedback über die Zeit<//>
                        <${Button.Group}>
                            ${PRESETS.map(p => html`
                                <${Button} key=${p.label} size="xs" variant="default" onClick=${() => applyPreset(p)}>${p.label}<//>`)}
                        <//>
                    <//>
                    <${TimeChart} series=${chart.series} from=${filters.from} to=${filters.to} onSelect=${setRange}/>
                <//>

                <${SimpleGrid} cols=${{ base: 2, sm: 5 }} mb="lg">
                    <${StatCard} label="Gesamt" value=${data.total}/>
                    <${StatCard} label="Ø Bewertung" value=${avgRating === null ? '–' : fmtAvg(avgRating)}
                        color=${avgRating === null ? undefined : ratingColor(avgRating)}/>
                    <${StatCard} label="Bewertungen" value=${totalRatings}/>
                    <${StatCard} label="Kommentare" value=${data.overview.reduce((a, o) => a + o.comments, 0)}/>
                    <${StatCard} label="Umfragen" value=${data.overview.reduce((a, o) => a + o.polls, 0)}/>
                <//>

                <${Tabs} value=${tab} onChange=${setTab} color="red">
                    <${Tabs.List}>
                        <${Tabs.Tab} value="ratings">Folien<//>
                        <${Tabs.Tab} value="survey">Kurs-Umfrage<//>
                        <${Tabs.Tab} value="polls">Umfragen<//>
                        <${Tabs.Tab} value="comments">Kommentare<//>
                        <${Tabs.Tab} value="time">Zeit × Gruppe<//>
                        <${Tabs.Tab} value="courses">Kurse<//>
                    <//>
                    <${Tabs.Panel} value="ratings" pt="md"><${RatingsTable} ratings=${data.ratings} filters=${filters} reload=${load}/><//>
                    <${Tabs.Panel} value="survey" pt="md">
                        <${Title} order=5 mb="xs">Themen-Bewertung<//>
                        <${TopicRatings} topics=${data.topicRatings || []} filters=${filters} reload=${load}/>
                        <${Title} order=5 mt="lg" mb="xs">Freitext<//>
                        <${SurveyTexts} groups=${data.surveyTexts || []} reload=${load}/>
                    <//>
                    <${Tabs.Panel} value="polls" pt="md"><${Polls} polls=${data.polls} filters=${filters} reload=${load}/><//>
                    <${Tabs.Panel} value="comments" pt="md"><${CommentsTable} comments=${data.comments} reload=${load}/><//>
                    <${Tabs.Panel} value="time" pt="md"><${TimeGroupTable} timeseries=${data.timeseries}/><//>
                    <${Tabs.Panel} value="courses" pt="md">
                        <${Table} striped withTableBorder>
                            <${Table.Thead}><${Table.Tr}>
                                <${Table.Th}>Kurs<//><${Table.Th} ta="right">Gesamt<//>
                                <${Table.Th} ta="right">Ø Bewertung<//><${Table.Th} ta="right">Bewertungen<//>
                                <${Table.Th} ta="right">Kommentare<//><${Table.Th} ta="right">Umfragen<//>
                            <//><//>
                            <${Table.Tbody}>
                                ${data.overview.map(o => html`
                                    <${Table.Tr} key=${o.course}>
                                        <${Table.Td}>${o.title || o.course}<br/><${Text} size="xs" c="dimmed">${o.course}<//><//>
                                        <${Table.Td} ta="right">${o.total}<//>
                                        <${Table.Td} ta="right">
                                            ${o.rating_avg === null ? '–' : html`<${Badge} color=${ratingColor(o.rating_avg)} variant="light">${fmtAvg(o.rating_avg)}<//>`}
                                        <//>
                                        <${Table.Td} ta="right">${o.ratings}<//>
                                        <${Table.Td} ta="right">${o.comments}<//>
                                        <${Table.Td} ta="right">${o.polls}<//>
                                    <//>`)}
                            <//>
                        <//>
                    <//>
                <//>`
        }

        return html`
            <${Container} size="xl" py="lg">
                <${Group} justify="space-between" mb="md">
                    <${Title} order=2>Feedback-Dashboard<//>
                    <${Group} gap="sm">
                        ${me && me.account && html`<${Text} size="sm" c="dimmed">angemeldet als <b>${me.account}</b><//>`}
                        ${data && html`<${Badge} size="lg" variant="light">${data.total} Einträge<//>`}
                        <${Button} variant="subtle" color="gray" size="compact-sm" onClick=${() => close && close()} title="Schließen (Esc)">✕ Schließen<//>
                    <//>
                <//>

                <${Card} withBorder radius="md" mb="lg">
                    <${Group} align="flex-end" gap="sm">
                        <${Select} label="Kurs" placeholder="alle" clearable searchable comboboxProps=${comboboxProps}
                            nothingFoundMessage="keine Einträge"
                            data=${courseOptions} value=${filters.course} onChange=${v => setF('course', v)} w={220}/>
                        <${Select} label="Deck" placeholder="alle" clearable searchable comboboxProps=${comboboxProps}
                            nothingFoundMessage="keine Einträge"
                            data=${deckOptions} value=${filters.deck} onChange=${v => setF('deck', v)} w={220}/>
                        <${Select} label="Gruppe" placeholder="alle" clearable searchable comboboxProps=${comboboxProps}
                            nothingFoundMessage="keine Einträge"
                            data=${groupOptions} value=${filters.group} onChange=${v => setF('group', v)} w={180}/>
                        <${TextInput} label="von" type="date" value=${filters.from}
                            onChange=${e => setF('from', e.currentTarget.value)}/>
                        <${TextInput} label="bis" type="date" value=${filters.to}
                            onChange=${e => setF('to', e.currentTarget.value)}/>
                        <${Button} color="red" onClick=${load}>Aktualisieren<//>
                        <${Button} variant="light" component="a" href=${exportUrl}>CSV<//>
                    <//>
                <//>

                ${body}
            <//>`
    }

    // Container leeren und die App hineinrendern (fuellt das Vollbild-Overlay).
    container.innerHTML = ''
    render(
        html`<${MantineProvider} theme=${theme} defaultColorScheme="light"><${App}/><//>`,
        container
    )
}
