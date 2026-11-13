// Build-time structure of a deck, applied to the prerendered slides (the runtime part is plugins/reveal-plugin-navigation.js):
// - chapter overview from data-summary / data-level
// - numbered menu names for data-name values used on several slides
// - file trees under code embeds with data-files

const fs = require('fs')
const path = require('path')

// Directory trees for code embeds: <a data-code ... data-files href="code/x/steps/demo.sh"> gets a collapsed tree of all files the demo works with, built from the file system at build time (no list in the slides).
// data-files without a value: the directory the script runs in ("cd \"$(dirname \"$0\")/..\"" in the script -> the parent of its directory, otherwise its own directory); data-files="code/x": that directory.
// The tree is a <pre class="dirtree"> (links, view, zip download by the dir-tree plugin) inside a closed <details>, so it costs one line on the slide.
// Files git would publish (tracked or new, not ignored, e.g. no local Terraform state); outside a git repo all files
function gitFiles(root, dir) {
	try {
		const out = require('child_process').execFileSync('git', ['ls-files', '-co', '--exclude-standard', '--', dir], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
		return out.split('\n').filter(f => f && fs.existsSync(path.join(root, f))).sort()
	} catch (e) {
		return null
	}
}

function listFiles(root, dir, excluded) {
	const out = []
	for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
		if (entry.name.startsWith('.')) continue
		const rel = dir + '/' + entry.name
		if (excluded(rel)) continue
		if (entry.isDirectory()) out.push(...listFiles(root, rel, excluded))
		else if (entry.isFile()) out.push(rel)
	}
	return out
}

function codeFilesDir(root, link, value) {
	if (value) return value.replace(/\/+$/, '')
	const scriptDir = path.posix.dirname(link)
	let script = ''
	try { script = fs.readFileSync(path.join(root, link), 'utf8') } catch (e) { return scriptDir }
	const cd = script.match(/^\s*cd\s+"\$\(dirname\s+"\$0"\)(\/[^"\s]*)?"/m)
	return cd && cd[1] ? path.posix.normalize(path.posix.join(scriptDir, cd[1])) : scriptDir
}

function addCodeFileTrees(container, { root, assetExclude = [], file }) {
	const excluded = rel => assetExclude.some(e => rel === e || rel.startsWith(e + '/'))
	const doc = container.ownerDocument
	for (const a of container.querySelectorAll('a[data-code][data-files]')) {
		const link = a.getAttribute('href')
		if (!link) continue
		const dir = codeFilesDir(root, link, a.getAttribute('data-files'))
		let files
		try { files = (gitFiles(root, dir) || listFiles(root, dir, excluded)).filter(f => !excluded(f) && !path.posix.basename(f).startsWith('.')) } catch (e) {
			console.warn(`Warning: ${file}: data-files directory ${dir} not found`)
			continue
		}
		if (!files.length) continue
		const details = doc.createElement('details')
		details.className = 'code-files'
		const summary = doc.createElement('summary')
		summary.textContent = `Files in ${dir} (${files.length})`
		const pre = doc.createElement('pre')
		pre.className = 'dirtree'
		pre.setAttribute('data-zipname', path.posix.basename(dir) + '.zip')
		pre.setAttribute('data-strip-prefix', path.posix.dirname(dir) + '/')
		pre.textContent = files.join('\n')
		details.append(summary, pre)
		// After the paragraph that wraps the link (markdown puts inline HTML into a <p>)
		const anchor = a.parentElement && a.parentElement.tagName === 'P' ? a.parentElement : a
		anchor.after(details)
	}
}

// Chapter overview: <div data-chapter-overview></div> becomes a list with one entry per slide that has data-summary (e.g. <!-- .slide: data-name="Object Storage" data-summary="Object storage with an S3 API (SeaweedFS)" -->), in slide order, each linking to its slide. Only data-summary is used; a trailing "(...)" is shown as <comment>. data-level (default 1): level 1 entries are numbered, deeper levels are small lines below their level-1 entry. Every line is a link to its slide.
function addChapterOverviews(container) {
	const targets = container.querySelectorAll('[data-chapter-overview]')
	if (!targets.length) return
	const doc = container.ownerDocument
	const entries = []
	;[...container.children].filter(c => c.tagName === 'SECTION').forEach((top, h) => {
		const inner = [...top.children].filter(c => c.tagName === 'SECTION')
		const slides = inner.length ? inner.map((s, v) => [s, v]) : [[top, 0]]
		for (const [slide, v] of slides) {
			const summary = slide.getAttribute('data-summary')
			const level = Math.max(1, parseInt(slide.getAttribute('data-level') || '1', 10) || 1)
			if (summary) entries.push({ summary, level, href: v ? `#/${h}/${v}` : `#/${h}` })
		}
	})
	function el(tag, cls, text) {
		const e = doc.createElement(tag)
		if (cls) e.className = cls
		if (text) e.textContent = text
		return e
	}

	// "Title (note)" -> title and note
	function split(summary) {
		const m = summary.match(/^(.*?)\s*\(([^()]*)\)\s*$/)
		return m ? [m[1], m[2]] : [summary, '']
	}

	for (const target of targets) {
		// A numbered list of the level-1 entries (title, note in grey); deeper levels become small lines below their level-1 entry
		const ol = el('ol', 'chapter-overview')
		let current = null
		for (const { summary, level, href } of entries) {
			const [title, note] = split(summary)
			if (level === 1 || !current) {
				current = el('li')
				const head = el('a', 'co-title', title)
				head.setAttribute('href', href)
				current.appendChild(head)
				// the note of a level-1 entry is the first small line below it, styled like the sub-sections
				if (note) current.appendChild(el('div', 'co-sub')).appendChild(el('a', null, note)).setAttribute('href', href)
				ol.appendChild(current)
				continue
			}
			let sub = current.querySelector('.co-sub')
			if (!sub) current.appendChild(sub = el('div', 'co-sub'))
			const a = el('a', null, note ? `${title} (${note})` : title)
			a.setAttribute('href', href)
			sub.appendChild(a)
		}
		target.replaceChildren(ol)
	}
}

// simplemenu shows one menu item per data-name: number names that occur on several slides ("Exercise" -> "Exercise 1", "Exercise 2", ...), so each gets its own item
function numberDuplicateNames(container) {
	const named = [...container.querySelectorAll('section[data-name]')]
	const count = {}
	for (const s of named) count[s.getAttribute('data-name')] = (count[s.getAttribute('data-name')] || 0) + 1
	const seen = {}
	for (const s of named) {
		const name = s.getAttribute('data-name')
		if (count[name] < 2) continue
		seen[name] = (seen[name] || 0) + 1
		s.setAttribute('data-name', `${name} ${seen[name]}`)
	}
}

// codeFiles: { root, assetExclude } of the lecture repo; without it no file trees are built
function addStructure(container, { file, root, assetExclude } = {}) {
	if (root) addCodeFileTrees(container, { root, assetExclude, file })
	addChapterOverviews(container)
	numberDuplicateNames(container)
}

// Sections of a deck for the contents overlay (toc.json, reveal-plugin-contents.js): every slide with data-name or data-summary, in slide order, with its position. Runs after numberDuplicateNames so the names match the menu and the course profile.
function collectSections(container) {
	const sections = []
	;[...container.children].filter(c => c.tagName === 'SECTION').forEach((top, h) => {
		const inner = [...top.children].filter(c => c.tagName === 'SECTION')
		const slides = inner.length ? inner.map((s, v) => [s, v]) : [[top, 0]]
		for (const [slide, v] of slides) {
			const name = slide.getAttribute('data-name')
			const summary = slide.getAttribute('data-summary')
			if (!name && !summary) continue
			const level = Math.max(1, parseInt(slide.getAttribute('data-level') || '1', 10) || 1)
			const entry = { level, h, v }
			if (name) entry.name = name
			if (summary) entry.summary = summary
			sections.push(entry)
		}
	})
	return sections
}

module.exports = { addStructure, collectSections }
