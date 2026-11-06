// Build-time markdown prerendering: runs the REAL reveal.js markdown plugin
// in jsdom against the exact same section markup the browser used to see, so
// the resulting <section> HTML is identical to what runtime parsing produced.

const fs = require('fs')
const path = require('path')
const { JSDOM } = require('jsdom')

// The reveal markdown plugin un-escapes this sentinel back to </script> when
// reading inline templates (constant Q in dist/plugin/markdown.mjs).
const SCRIPT_END_SENTINEL = '__SCRIPT_END__'

function escapeMarkdownForInlineTemplate(md, file) {
	if (md.includes(SCRIPT_END_SENTINEL))
		console.warn(`Warning: ${file} contains the literal ${SCRIPT_END_SENTINEL} sentinel; it will render as </script>.`)
	const escaped = md.replace(/<\/script>/gi, SCRIPT_END_SENTINEL)
	if (/<\/script/i.test(escaped))
		console.warn(`Warning: ${file} contains an unterminated </script sequence that may break the inline template.`)
	return escaped
}

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

// Chapter overview: <div data-chapter-overview></div> becomes a list with one entry per slide that has data-summary (e.g. <!-- .slide: data-name="Object Storage" data-summary="Object storage with an S3 API (SeaweedFS)" -->), in slide order, each linking to its slide. Only data-summary is used; a trailing "(...)" is shown as <comment>. data-level (default 1): level 1 is a paragraph like plain text on a slide, level 2 a list item below it, level 3 a nested list item.
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
	function entryContent(parent, summary, href) {
		const a = doc.createElement('a')
		a.setAttribute('href', href)
		const m = summary.match(/^(.*?)\s*(\([^()]*\))\s*$/)
		a.textContent = m ? m[1] : summary
		parent.appendChild(a)
		if (m) {
			const comment = doc.createElement('comment')
			comment.textContent = m[2]
			parent.append(' ', comment)
		}
	}

	for (const target of targets) {
		const nodes = []
		// Level 1 is a paragraph like the plain text lines of a slide, level 2 a list item below it, level 3 a nested list item, and so on; lists[i] is the open list of level i + 2 (a jump of several levels is treated as one level deeper)
		let lists = []
		for (const { summary, level, href } of entries) {
			if (level === 1) {
				const p = doc.createElement('p')
				entryContent(p, summary, href)
				nodes.push(p)
				lists = []
				continue
			}
			const last = lists.length ? lists[lists.length - 1].lastElementChild : null
			const depth = Math.min(level - 1, lists.length + (last ? 1 : 0)) || 1
			lists.length = Math.min(lists.length, depth)
			if (depth > lists.length) {
				const ul = doc.createElement('ul')
				if (lists.length) lists[lists.length - 1].lastElementChild.appendChild(ul)
				else nodes.push(ul)
				lists.push(ul)
			}
			const li = doc.createElement('li')
			entryContent(li, summary, href)
			lists[lists.length - 1].appendChild(li)
		}
		target.replaceChildren(...nodes)
	}
}

let revealMarkdownModule = null
async function loadRevealMarkdown() {
	if (!revealMarkdownModule)
		revealMarkdownModule = (await import('reveal.js/plugin/markdown')).default
	return revealMarkdownModule
}

// Render one deck's markdown to reveal <section> HTML.
// markdownConfig is what deck.getConfig().markdown returns at runtime
// (default { smartypants: true }, overridable via pkg.farberg.markdown).
async function prerenderDeck(md, { file, markdownConfig, codeFiles }) {
	const RevealMarkdown = await loadRevealMarkdown()

	const dom = new JSDOM('<!DOCTYPE html><html><body><div class="slides"></div></body></html>')
	const container = dom.window.document.querySelector('.slides')

	// Exactly the markup deck-template.html carried in 2.0 — the plugin's
	// inline-template code path (no fetch) takes over from here.
	const section = dom.window.document.createElement('section')
	section.setAttribute('data-markdown', '')
	section.setAttribute('data-separator', '^---')
	section.setAttribute('data-separator-vertical', '^vvv')
	section.setAttribute('data-charset', 'utf-8')
	const template = dom.window.document.createElement('script')
	template.setAttribute('type', 'text/template')
	template.textContent = escapeMarkdownForInlineTemplate(md, file)
	section.appendChild(template)
	container.appendChild(section)

	// The plugin's comment-directive walker references the bare global Node
	// (Node.COMMENT_NODE) — expose jsdom's while it runs.
	const prevNode = globalThis.Node
	globalThis.Node = dom.window.Node
	try {
		await RevealMarkdown().init({
			getRevealElement: () => container,
			getConfig: () => ({ markdown: markdownConfig })
		})
		if (codeFiles) addCodeFileTrees(container, Object.assign({ file }, codeFiles))
		addChapterOverviews(container)
		return { slidesHtml: container.innerHTML }
	} finally {
		if (prevNode === undefined) delete globalThis.Node
		else globalThis.Node = prevNode
		dom.window.close()
	}
}

module.exports = { prerenderDeck, escapeMarkdownForInlineTemplate, SCRIPT_END_SENTINEL }
