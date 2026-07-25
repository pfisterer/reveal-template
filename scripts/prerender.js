// Build-time markdown prerendering: runs the REAL reveal.js markdown plugin
// in jsdom against the exact same section markup the browser used to see, so
// the resulting <section> HTML is identical to what runtime parsing produced.

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

let revealMarkdownModule = null
async function loadRevealMarkdown() {
	if (!revealMarkdownModule)
		revealMarkdownModule = (await import('reveal.js/plugin/markdown')).default
	return revealMarkdownModule
}

// Render one deck's markdown to reveal <section> HTML.
// markdownConfig is what deck.getConfig().markdown returns at runtime
// (default { smartypants: true }, overridable via pkg.farberg.markdown).
async function prerenderDeck(md, { file, markdownConfig }) {
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
		return { slidesHtml: container.innerHTML }
	} finally {
		if (prevNode === undefined) delete globalThis.Node
		else globalThis.Node = prevNode
		dom.window.close()
	}
}

module.exports = { prerenderDeck, escapeMarkdownForInlineTemplate, SCRIPT_END_SENTINEL }
