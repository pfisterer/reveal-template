/*
Create a zip from existing files for download and display a tree of files

Attributes on <pre class="dirtree">:
  data-zipname="archive.zip"      — name of the downloaded zip; omit to hide the download button
  data-root="my-project"          — label for the root folder when files have no common top-level dir
									(default: zip name without ".zip", else ".")
  data-strip-prefix="code/"       — hide this leading path segment in the displayed tree (and in the
									zip entry names); links and downloads still use the full path.
									Paths that do not start with the prefix are shown unchanged.
  data-width="auto"               — container width, e.g. "400px", "60%", "auto" (default: auto)
  data-columns="auto"             — wrap a dense tree into multiple columns when it
									gets too tall for the slide (default: "auto").
									"auto" picks the count from the number of entries
									(>12 → 2, >24 → 3); "2"/"3"/… forces a fixed
									count; "1" (or "none") keeps a single column.

<pre class="dirtree" data-zipname="k8s-Exercise.zip" data-width="480px">
code/k8s-demo-app/01-mariadb-deployment.yaml
code/k8s-demo-app/02-k8s-mariadb-service.yaml
code/k8s-demo-app/Dockerfile
code/k8s-demo-app/package.json
</pre>
*/

const dirTreeFactory = ({ zip, strToU8 }) => ({
	id: 'dir_tree',
	init: (deck) => {

		function injectStyles() {
			if (document.getElementById('dirtree-styles')) return;
			const style = document.createElement('style');
			style.id = 'dirtree-styles';
			style.textContent = `
				.dirtree-container {
					font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Courier New', monospace;
					/* Tight enough that the │ connectors of consecutive lines nearly
					   join into a continuous rule, the way tree(1) output looks.
					   Every line in the tree inherits this — see the rule below. */
					line-height: 1.0;
					background: transparent;
					border-radius: 10px;
					padding: 38px 18px 14px 18px;
					border: 1px solid #d0d7de;
					display: inline-block;
					max-width: 90%;
					text-align: left;
					position: relative !important;
				}

					/* The download button needs a minimum width to not overlap the
					   tree; without one the box shrink-wraps the file names. */
					.dirtree-container:not(.no-download) {
						min-width: 280px;
					}

					/* Without a download button there is nothing to clear at the top,
					   so drop the reserved space the button would otherwise occupy. */
					.dirtree-container.no-download {
						padding-top: 14px;
					}

				ul.dirtree {
					list-style: none !important;
					padding: 0 !important;
					margin: 0 !important;
				}

				/* Reveal styles .reveal ul/li with a higher specificity than this
				   plugin can reach with element selectors, so the tree's lines
				   picked up reveal's line-heights instead of the configured one —
				   different ones for the root (46.5px) and the nested lists (24px),
				   which showed up as a blank line's worth of slack under the root.
				   Force every line back onto the container's line-height. */
				ul.dirtree,
				li.dirtree {
					line-height: inherit !important;
				}

				ul.dirtree ul.dirtree {
					padding-left: 0 !important;
				}

				li.dirtree {
					color: #1f2328;
					position: relative;
					white-space: nowrap;
					display: flex;
					align-items: center;
				}

				li.dirtree::before,
				li.dirtree::after {
					display: none !important;
					content: none !important;
					border: none !important;
				}

				/* The root is the same line as any other, only weighted heavier —
				   the extra gap made it read as a heading above the tree instead
				   of as the branch the connectors hang off. */
				li.dirtree.root {
					color: #0969da;
					font-weight: 600;
				}

				.dirtree-dir-name {
					color: #0969da;
				}

				a.dirtree-file-link {
					color: #116329;
					text-decoration: none;
					transition: color 0.15s;
				}

				a.dirtree-file-link:hover {
					color: #6639ba;
					text-decoration: underline;
				}

				/* Copy button — hidden by default, shown on li hover */
				.dirtree-copy-btn {
					display: inline-flex;
					align-items: center;
					margin-left: 8px;
					padding: 0px 6px;
					background: transparent;
					border: 1px solid #d0d7de;
					border-radius: 4px;
					color: #57606a;
					font-size: 0.78em;
					cursor: pointer;
					opacity: 0 !important;
					pointer-events: none !important;
					transition: opacity 0.15s, background 0.15s, color 0.15s;
					user-select: none;
					line-height: 1.6;
					font-family: inherit;
				}

				li.dirtree:hover > .dirtree-copy-btn {
					opacity: 1 !important;
					pointer-events: auto !important;
				}

				.dirtree-copy-btn:hover {
					background: #f6f8fa;
					border-color: #8c959f;
					color: #1f2328;
				}

				.dirtree-copy-btn.copied {
					color: #116329;
					border-color: #116329;
					background: #dafbe1;
				}

				/* Preview button — same hover behaviour as the copy button */
				.dirtree-preview-btn {
					display: inline-flex;
					align-items: center;
					margin-left: 6px;
					padding: 0px 6px;
					background: transparent;
					border: 1px solid #d0d7de;
					border-radius: 4px;
					color: #57606a;
					font-size: 0.78em;
					cursor: pointer;
					opacity: 0 !important;
					pointer-events: none !important;
					transition: opacity 0.15s, background 0.15s, color 0.15s;
					user-select: none;
					line-height: 1.6;
					font-family: inherit;
				}

				li.dirtree:hover > .dirtree-preview-btn {
					opacity: 1 !important;
					pointer-events: auto !important;
				}

				.dirtree-preview-btn:hover {
					background: #f6f8fa;
					border-color: #8c959f;
					color: #1f2328;
				}

				/* Preview modal */
				.dirtree-modal-overlay {
					position: fixed;
					inset: 0;
					background: rgba(27, 31, 36, 0.55);
					display: flex;
					align-items: center;
					justify-content: center;
					z-index: 10000;
					padding: 4vh 4vw;
				}

				.dirtree-modal {
					background: #ffffff;
					border: 1px solid #d0d7de;
					border-radius: 10px;
					box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
					display: flex;
					flex-direction: column;
					max-width: 1100px;
					width: 100%;
					max-height: 92vh;
					overflow: hidden;
					text-align: left;
				}

				.dirtree-modal-header {
					display: flex;
					align-items: center;
					justify-content: space-between;
					gap: 12px;
					padding: 10px 14px;
					border-bottom: 1px solid #d0d7de;
					background: #f6f8fa;
					font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Courier New', monospace;
				}

				.dirtree-modal-title {
					color: #1f2328;
					font-size: 0.95rem;
					font-weight: 600;
					word-break: break-all;
				}

				.dirtree-modal-actions {
					display: flex;
					align-items: center;
					gap: 8px;
					flex-shrink: 0;
				}

				.dirtree-modal-btn {
					padding: 2px 10px;
					background: transparent;
					border: 1px solid #d0d7de;
					border-radius: 6px;
					color: #57606a;
					font-size: 0.85rem;
					cursor: pointer;
					font-family: inherit;
					transition: background 0.15s, border-color 0.15s, color 0.15s;
				}

				.dirtree-modal-btn:hover {
					background: #ffffff;
					border-color: #8c959f;
					color: #1f2328;
				}

				.dirtree-modal-btn.copied {
					color: #116329;
					border-color: #116329;
					background: #dafbe1;
				}

				.dirtree-modal-body {
					margin: 0;
					padding: 0;
					overflow: auto;
					background: #ffffff;
				}

				.dirtree-modal-body pre {
					margin: 0;
					box-shadow: none;
					background: transparent;
				}

				.dirtree-modal-body code {
					font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Courier New', monospace;
					/* Default size; the A−/A+ buttons override this via inline style. */
					font-size: 16px;
					line-height: 1.55;
					color: #24292e;
					white-space: pre;
					tab-size: 4;
					padding: 14px 16px;
					display: block;
				}

				/* ── Light syntax theme (GitHub), scoped to the preview modal ──
				   The slides use the global dark zenburn theme; these rules win by
				   specificity (.dirtree-modal-body .hljs-* beats .hljs-*) so only
				   the modal renders light. */
				.dirtree-modal-body code.hljs {
					background: transparent;
					color: #24292e;
				}
				.dirtree-modal-body .hljs-comment,
				.dirtree-modal-body .hljs-quote {
					color: #6a737d;
				}
				.dirtree-modal-body .hljs-keyword,
				.dirtree-modal-body .hljs-selector-tag,
				.dirtree-modal-body .hljs-doctag {
					color: #d73a49;
				}
				.dirtree-modal-body .hljs-string,
				.dirtree-modal-body .hljs-meta .hljs-string,
				.dirtree-modal-body .hljs-regexp {
					color: #032f62;
				}
				.dirtree-modal-body .hljs-number,
				.dirtree-modal-body .hljs-literal,
				.dirtree-modal-body .hljs-attr,
				.dirtree-modal-body .hljs-attribute,
				.dirtree-modal-body .hljs-variable,
				.dirtree-modal-body .hljs-template-variable {
					color: #005cc5;
				}
				.dirtree-modal-body .hljs-title,
				.dirtree-modal-body .hljs-section,
				.dirtree-modal-body .hljs-name,
				.dirtree-modal-body .hljs-selector-id,
				.dirtree-modal-body .hljs-selector-class {
					color: #6f42c1;
				}
				.dirtree-modal-body .hljs-built_in,
				.dirtree-modal-body .hljs-type,
				.dirtree-modal-body .hljs-symbol,
				.dirtree-modal-body .hljs-bullet,
				.dirtree-modal-body .hljs-link {
					color: #e36209;
				}
				.dirtree-modal-body .hljs-meta {
					color: #6a737d;
				}
				.dirtree-modal-body .hljs-emphasis { font-style: italic; }
				.dirtree-modal-body .hljs-strong   { font-weight: bold; }

				/* ── Dark syntax theme (GitHub Dark), scoped + .dark modifier ──
				   Higher specificity than the light rules above so toggling the
				   .dark class on the body switches the whole modal. */
				.dirtree-modal-body.dark { background: #0d1117; }
				.dirtree-modal-body.dark code { color: #c9d1d9; }
				.dirtree-modal-body.dark code.hljs { background: transparent; color: #c9d1d9; }
				.dirtree-modal-body.dark .hljs-comment,
				.dirtree-modal-body.dark .hljs-quote,
				.dirtree-modal-body.dark .hljs-meta {
					color: #8b949e;
				}
				.dirtree-modal-body.dark .hljs-keyword,
				.dirtree-modal-body.dark .hljs-selector-tag,
				.dirtree-modal-body.dark .hljs-doctag {
					color: #ff7b72;
				}
				.dirtree-modal-body.dark .hljs-string,
				.dirtree-modal-body.dark .hljs-meta .hljs-string,
				.dirtree-modal-body.dark .hljs-regexp {
					color: #a5d6ff;
				}
				.dirtree-modal-body.dark .hljs-number,
				.dirtree-modal-body.dark .hljs-literal,
				.dirtree-modal-body.dark .hljs-attr,
				.dirtree-modal-body.dark .hljs-attribute,
				.dirtree-modal-body.dark .hljs-variable,
				.dirtree-modal-body.dark .hljs-template-variable {
					color: #79c0ff;
				}
				.dirtree-modal-body.dark .hljs-title,
				.dirtree-modal-body.dark .hljs-section,
				.dirtree-modal-body.dark .hljs-name,
				.dirtree-modal-body.dark .hljs-selector-id,
				.dirtree-modal-body.dark .hljs-selector-class {
					color: #d2a8ff;
				}
				.dirtree-modal-body.dark .hljs-built_in,
				.dirtree-modal-body.dark .hljs-type,
				.dirtree-modal-body.dark .hljs-symbol,
				.dirtree-modal-body.dark .hljs-bullet,
				.dirtree-modal-body.dark .hljs-link {
					color: #ffa657;
				}

				/* Download button */
				.dirtree-download-btn {
					position: absolute !important;
					top: 8px !important;
					right: 12px !important;
					padding: 1px 6px;
					background: transparent;
					border: 1px solid #e1e4e8;
					border-radius: 5px;
					color: #8c959f !important;
					font-size: 0.6em;
					opacity: 0.6;
					cursor: pointer;
					text-decoration: none !important;
					transition: opacity 0.15s, background 0.15s, border-color 0.15s, color 0.15s;
					font-family: inherit;
				}

				.dirtree-download-btn:hover {
					background: #f6f8fa !important;
					border-color: #d0d7de !important;
					color: #57606a !important;
					opacity: 1;
				}

				.dirtree-prefix {
					color: #8c959f;
					user-select: none;
					white-space: pre;
					flex-shrink: 0;
				}

				/* Icons are inline SVG, sized in em so they track the line's font
				   size (incl. the smaller multi-column mode) and sit on the text
				   baseline — which emoji, rendered by the platform's own font,
				   never reliably did. */
				.dirtree-icon {
					display: inline-flex;
					align-items: center;
					margin-right: 6px;
					flex-shrink: 0;
					color: #57606a;
				}

				.dirtree-icon svg {
					width: 1em;
					height: 1em;
					display: block;
					fill: currentColor;
				}

				/* Folders take the same blue as their label; files stay neutral so
				   the green link text carries the emphasis. */
				.dirtree-icon.dirtree-icon-dir {
					color: #54aeff;
				}

				/* Multi-column layout for dense trees (opt-in via data-columns).
				   column-count is set inline so the number can be dynamic. The
				   whole tree flows through the columns and may break anywhere, so
				   every column starts at the top of the box — see applyColumns. */
				ul.dirtree.dirtree-columns {
					column-gap: 1.6em;
					column-rule: 1px solid #e1e4e8;
				}

				/* Several non-wrapping columns side by side can grow wider than the
				   slide. Shrink the tree a touch and trim the side padding in
				   multi-column mode so both columns fit the slide width. */
				.dirtree-container.dirtree-multicol {
					padding-left: 12px;
					padding-right: 12px;
				}

				.dirtree-container.dirtree-multicol li.dirtree {
					font-size: 13px;
				}
			`;
			document.head.appendChild(style);
		}

		// Octicons (GitHub, MIT licensed), inlined so the plugin stays
		// dependency-free and renders identically on every platform.
		const ICON_DIR = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z"/></svg>';
		const ICON_FILE = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5Zm6.75.062V4.25c0 .138.112.25.25.25h2.688l-.011-.013-2.914-2.914-.013-.011Z"/></svg>';

		function makeIcon(svg, isDir) {
			const span = document.createElement('span');
			span.classList.add('dirtree-icon');
			if (isDir) span.classList.add('dirtree-icon-dir');
			span.innerHTML = svg;
			return span;
		}

		function writeToClipboard(text) {
			if (navigator.clipboard && navigator.clipboard.writeText) {
				return navigator.clipboard.writeText(text);
			}
			// Fallback for HTTP / non-secure contexts
			const ta = document.createElement('textarea');
			ta.value = text;
			ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
			document.body.appendChild(ta);
			ta.focus();
			ta.select();
			try {
				document.execCommand('copy');
				return Promise.resolve();
			} catch (e) {
				return Promise.reject(e);
			} finally {
				document.body.removeChild(ta);
			}
		}

		function makeCopyButton(filePath) {
			const btn = document.createElement('button');
			btn.classList.add('dirtree-copy-btn');
			btn.title = 'Copy file contents';
			btn.textContent = 'copy';
			btn.addEventListener('click', e => {
				e.preventDefault();
				btn.textContent = '…';
				fetch(filePath, { credentials: 'include' })
					.then(r => {
						if (!r.ok) throw new Error(`HTTP ${r.status}`);
						return r.text();
					})
					.then(text => writeToClipboard(text))
					.then(() => {
						btn.textContent = '✓ copied';
						btn.classList.add('copied');
						setTimeout(() => {
							btn.textContent = 'copy';
							btn.classList.remove('copied');
						}, 1500);
					})
					.catch(() => {
						btn.textContent = '✗ error';
						setTimeout(() => { btn.textContent = 'copy'; }, 1500);
					});
			});
			return btn;
		}

		// Reveal's highlight plugin owns the hljs instance (window.hljs is not set).
		// Returns it if the plugin is loaded, else null.
		function getHljs() {
			const plugin = deck.getPlugin('highlight');
			return (plugin && plugin.hljs) || null;
		}

		// Maps file extensions to highlight.js language classes so the modal can
		// syntax-highlight the preview when reveal's highlight plugin is loaded.
		// Unknown extensions fall back to plain text.
		function hljsLanguage(ext) {
			const map = {
				js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
				json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'ini', xml: 'xml', html: 'xml',
				css: 'css', scss: 'scss', md: 'markdown',
				sh: 'bash', bash: 'bash', zsh: 'bash',
				py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java', sql: 'sql',
				dockerfile: 'dockerfile',
			};
			return map[ext] || null;
		}

		// Single, lazily-created modal reused for every preview. Closing hides it
		// (display:none) rather than removing it from the DOM.
		let modalRefs = null;

		// View preferences persist across previews within a session.
		// FONT_FIT_MAX caps the automatic enlarge-to-fit for small files so a
		// two-line file does not blow up to an absurd size; manual A+ can still
		// climb to FONT_MAX.
		const FONT_MIN = 11, FONT_MAX = 32, FONT_FIT_MAX = 28, FONT_STEP = 2;
		const FONT_BASE = 16;
		let previewFontPx = FONT_BASE;
		let previewTheme = 'light';   // 'light' | 'dark'

		function ensureModal() {
			if (modalRefs) return modalRefs;

			const overlay = document.createElement('div');
			overlay.classList.add('dirtree-modal-overlay');
			overlay.style.display = 'none';

			const modal = document.createElement('div');
			modal.classList.add('dirtree-modal');

			const header = document.createElement('div');
			header.classList.add('dirtree-modal-header');

			const title = document.createElement('span');
			title.classList.add('dirtree-modal-title');

			const actions = document.createElement('div');
			actions.classList.add('dirtree-modal-actions');

			const body = document.createElement('div');
			body.classList.add('dirtree-modal-body');
			const pre = document.createElement('pre');
			const code = document.createElement('code');
			pre.appendChild(code);
			body.appendChild(pre);

			// Applies the current font-size and theme preferences to the modal.
			function applyView() {
				code.style.fontSize = previewFontPx + 'px';
				body.classList.toggle('dark', previewTheme === 'dark');
				themeBtn.textContent = previewTheme === 'dark' ? '☀ light' : '🌙 dark';
			}

			// Small files render a few short lines of fixed-size text marooned in a
			// big modal, which reads as "tiny font in an undersized window". Scale
			// the font UP so the content fills the available width/height — but only
			// up (scale > 1), so large files that already fill the modal keep their
			// comfortable base size. Measured at FONT_BASE, then capped at
			// FONT_FIT_MAX so a two-liner doesn't balloon. Sets previewFontPx so the
			// A−/A+ buttons continue from the fitted size.
			function fitFontToContent() {
				code.style.fontSize = FONT_BASE + 'px';
				// scrollWidth/Height force a layout read of the content's natural size
				// (white-space:pre means width is the longest line).
				const contentW = code.scrollWidth;
				const contentH = code.scrollHeight;
				if (!contentW || !contentH) { applyView(); return; }
				// Available space: body width is the modal's fixed width; for height
				// the modal grows with content, so derive the ceiling from the
				// viewport (overlay is fixed inset:0) minus the header, matching the
				// modal's max-height:92vh with a little slack.
				const availW = body.clientWidth;
				const availH = overlay.clientHeight * 0.9 - header.offsetHeight;
				const scale = Math.min(availW / contentW, availH / contentH);
				if (scale > 1)
					previewFontPx = Math.min(FONT_FIT_MAX, Math.floor(FONT_BASE * scale));
				applyView();
			}

			const fontDecBtn = document.createElement('button');
			fontDecBtn.classList.add('dirtree-modal-btn');
			fontDecBtn.title = 'Decrease font size';
			fontDecBtn.textContent = 'A−';
			fontDecBtn.addEventListener('click', () => {
				previewFontPx = Math.max(FONT_MIN, previewFontPx - FONT_STEP);
				applyView();
			});

			const fontIncBtn = document.createElement('button');
			fontIncBtn.classList.add('dirtree-modal-btn');
			fontIncBtn.title = 'Increase font size';
			fontIncBtn.textContent = 'A+';
			fontIncBtn.addEventListener('click', () => {
				previewFontPx = Math.min(FONT_MAX, previewFontPx + FONT_STEP);
				applyView();
			});

			const themeBtn = document.createElement('button');
			themeBtn.classList.add('dirtree-modal-btn');
			themeBtn.title = 'Toggle light / dark theme';
			themeBtn.addEventListener('click', () => {
				previewTheme = previewTheme === 'dark' ? 'light' : 'dark';
				applyView();
			});

			const copyBtn = document.createElement('button');
			copyBtn.classList.add('dirtree-modal-btn');
			copyBtn.textContent = 'copy';

			const closeBtn = document.createElement('button');
			closeBtn.classList.add('dirtree-modal-btn');
			closeBtn.textContent = '✕ close';

			actions.appendChild(fontDecBtn);
			actions.appendChild(fontIncBtn);
			actions.appendChild(themeBtn);
			actions.appendChild(copyBtn);
			actions.appendChild(closeBtn);
			header.appendChild(title);
			header.appendChild(actions);

			modal.appendChild(header);
			modal.appendChild(body);
			overlay.appendChild(modal);
			document.body.appendChild(overlay);

			function close() {
				overlay.style.display = 'none';
				// Re-enable reveal's keyboard navigation that we paused while open.
				deck.configure({ keyboard: true });
			}

			// Close on backdrop click, but not when clicking inside the modal.
			overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
			closeBtn.addEventListener('click', close);
			document.addEventListener('keydown', e => {
				if (overlay.style.display !== 'none' && e.key === 'Escape') {
					e.stopPropagation();
					close();
				}
			}, true);

			copyBtn.addEventListener('click', () => {
				writeToClipboard(code.textContent).then(() => {
					copyBtn.textContent = '✓ copied';
					copyBtn.classList.add('copied');
					setTimeout(() => {
						copyBtn.textContent = 'copy';
						copyBtn.classList.remove('copied');
					}, 1500);
				});
			});

			applyView();   // initialise font-size, theme class and toggle label

			modalRefs = { overlay, title, code, body, close, applyView, fitFontToContent };
			return modalRefs;
		}

		function openPreview(filePath, fileName, ext) {
			const { overlay, title, code, body, applyView, fitFontToContent } = ensureModal();
			title.textContent = fileName;
			// Re-fit each file from the base size rather than carrying over the last
			// file's fitted size.
			previewFontPx = FONT_BASE;
			code.textContent = 'Loading…';
			// Reset highlight state so the reused element can be re-highlighted.
			code.removeAttribute('class');
			code.removeAttribute('data-highlighted');
			applyView();   // re-apply font-size/theme (class reset above clears nothing inline, but keeps them in sync)
			body.scrollTop = 0;

			// Pause reveal navigation so arrow keys scroll the code, not the slides.
			deck.configure({ keyboard: false });
			overlay.style.display = 'flex';

			fetch(filePath, { credentials: 'include' })
				.then(r => {
					if (!r.ok) throw new Error(`HTTP ${r.status}`);
					return r.text();
				})
				.then(text => {
					code.textContent = text;
					const hljs = getHljs();
					const lang = hljsLanguage(fileName.toLowerCase() === 'dockerfile' ? 'dockerfile' : ext);
					if (hljs) {
						// Hint the language when known; otherwise let hljs auto-detect.
						if (lang) code.classList.add('language-' + lang);
						try { hljs.highlightElement(code); } catch (e) { /* leave as plain text */ }
					}
					// Enlarge small files to fill the modal (no-op for large files).
					fitFontToContent();
				})
				.catch(err => { code.textContent = 'Failed to load file: ' + err.message; });
		}

		function makePreviewButton(filePath, fileName, ext) {
			const btn = document.createElement('button');
			btn.classList.add('dirtree-preview-btn');
			btn.title = 'Preview file contents';
			btn.textContent = 'view';
			btn.addEventListener('click', e => {
				e.preventDefault();
				openPreview(filePath, fileName, ext);
			});
			return btn;
		}

		function getFileList(el) {
			return el.innerText.split('\n').filter(e => e.trim().length > 0);
		}

		// "code", "code/" and "/code" all mean the same thing to the author, so
		// normalise to a "code/" form that can be tested with startsWith().
		function normalizePrefix(prefix) {
			if (!prefix) return '';
			let s = prefix.trim().replace(/^\/+/, '');
			if (s && !s.endsWith('/')) s += '/';
			return s;
		}

		function createTree(files) {
			function getPath(tree, path) {
				let node = tree[path[0]];
				if (!node) { node = {}; tree[path[0]] = node; }
				const rest = path.slice(1);
				return rest.length > 0 ? getPath(node, rest) : node;
			}
			const tree = {};
			for (const file of files) {
				const parts = file.split('/');
				const filename = parts.pop();
				// Files without a folder prefix attach to the tree root directly;
				// otherwise getPath(tree, []) would create a bogus "undefined" node.
				const dir = parts.length > 0 ? getPath(tree, parts) : tree;
				dir[filename] = filename;
			}
			return tree;
		}

		function downloadBlob(blob, filename) {
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = filename;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
		}

		// files are fetched by their real path; entryNames[i] is the name file[i]
		// gets inside the zip (stripped, so the archive matches the displayed tree).
		function download(files, entryNames, zipName) {
			Promise.all(files.map(f => fetch(f, { credentials: 'include' })))
				.then(responses => {
					if (responses.some(r => r.status === 401)) {
						window.location.reload();
						return;
					}
					return Promise.all(responses.map(r => r.text())).then(values => {
						const entries = {};
						values.forEach((text, i) => { entries[entryNames[i]] = strToU8(text); });
						zip(entries, (err, data) => {
							if (err) { console.error('zip failed', err); return; }
							downloadBlob(new Blob([data], { type: 'application/zip' }), zipName);
						});
					});
				});
		}

		// path is the displayed path (prefix already stripped); pathMap translates
		// it back to the real path used for links, previews and copying.
		function displayTree(el, treeNode, path, pathMap, ancestorLast) {
			const names = Object.getOwnPropertyNames(treeNode);

			names.forEach((name, index) => {
				const o = treeNode[name];
				const isDir = typeof o === 'object';
				const isLast = index === names.length - 1;

				const li = document.createElement('li');
				li.classList.add('dirtree');

				const contPrefix = ancestorLast.map(last => last ? '    ' : '│   ').join('');
				const connector = isLast ? '└── ' : '├── ';

				const prefixSpan = document.createElement('span');
				prefixSpan.classList.add('dirtree-prefix');
				prefixSpan.textContent = contPrefix + connector;
				li.appendChild(prefixSpan);

				if (isDir) {
					const icon = makeIcon(ICON_DIR, true);

					const nameSpan = document.createElement('span');
					nameSpan.classList.add('dirtree-dir-name');
					nameSpan.textContent = name;

					li.appendChild(icon);
					li.appendChild(nameSpan);
					el.appendChild(li);

					const ul = document.createElement('ul');
					ul.classList.add('dirtree');
					li.appendChild(ul);
					displayTree(ul, o, `${path}/${name}`, pathMap, [...ancestorLast, isLast]);

				} else {
					const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';

					const icon = makeIcon(ICON_FILE, false);

					const displayPath = `${path}/${o}`.replace(/^\//, '');
					const finalPath = pathMap.get(displayPath) || displayPath;
					const a = document.createElement('a');
					a.classList.add('dirtree-file-link');
					a.href = finalPath;
					a.textContent = o;

					li.appendChild(icon);
					li.appendChild(a);
					li.appendChild(makePreviewButton(finalPath, o, ext));
					li.appendChild(makeCopyButton(finalPath));
					el.appendChild(li);
				}
			});
		}

		// Render the decorative root folder, then its contents. When every file
		// shares a single top-level directory, that directory becomes the root
		// (and stays in the file paths). Otherwise we show a label-only root
		// (data-root, else the zip name, else ".") that is NOT part of any path.
		function displayRoot(el, tree, rootLabel, pathMap) {
			const topNames = Object.getOwnPropertyNames(tree);
			const singleRootDir = topNames.length === 1 && typeof tree[topNames[0]] === 'object';
			const rootName = singleRootDir ? topNames[0] : rootLabel;
			const childTree = singleRootDir ? tree[rootName] : tree;
			const childPath = singleRootDir ? `/${rootName}` : '';

			const li = document.createElement('li');
			li.classList.add('dirtree', 'root');

			const icon = makeIcon(ICON_DIR, true);

			const nameSpan = document.createElement('span');
			nameSpan.classList.add('dirtree-dir-name');
			nameSpan.textContent = rootName;

			li.appendChild(icon);
			li.appendChild(nameSpan);
			el.appendChild(li);

			const ul = document.createElement('ul');
			ul.classList.add('dirtree');
			li.appendChild(ul);
			displayTree(ul, childTree, childPath, pathMap, []);
		}

		// Spread a dense tree over several columns. The multi-column context goes
		// on the OUTERMOST ul and subtrees are allowed to break across it, so both
		// columns fill from the top of the box. Columnising the deepest branch
		// instead (and keeping its subtrees whole) sounds tidier, but a column box
		// cannot start above its own element: with the branch sitting several
		// levels down the root chain, every column but the first began halfway
		// down the container and left the top corner empty. A subtree split across
		// the boundary stays readable because each line carries its full ASCII
		// prefix as text.
		function applyColumns(rootUl, columns) {
			if (!columns || columns === '1' || columns === 'none') return;

			// "auto" scales with the total number of rendered lines (the tree's
			// height), not the entries of any single directory — a tree can be
			// tall while every individual folder stays small.
			let n;
			if (columns === 'auto') {
				const total = rootUl.querySelectorAll('li.dirtree').length;
				n = total > 40 ? 3 : total > 14 ? 2 : 1;
			} else {
				n = parseInt(columns, 10);
			}
			if (!Number.isFinite(n) || n < 2) return;

			rootUl.classList.add('dirtree-columns');
			rootUl.style.columnCount = String(n);

			// Mark the container so the multi-column sizing rules apply (smaller
			// font + tighter padding to keep the wider layout on the slide).
			const container = rootUl.closest('.dirtree-container');
			if (container) container.classList.add('dirtree-multicol');
		}

		deck.on('ready', () => {
			injectStyles();

			for (const el of deck.getRevealElement().querySelectorAll('pre.dirtree')) {
				const zipName = el.getAttribute('data-zipname');
				const width = el.getAttribute('data-width') || 'auto';
				const columns = el.getAttribute('data-columns') || 'auto';
				const stripPrefix = normalizePrefix(el.getAttribute('data-strip-prefix'));

				const files = getFileList(el);
				// The tree (and therefore every label in it) is built from the
				// stripped paths; pathMap maps each of them back to the real file.
				const displayFiles = files.map(f => f.startsWith(stripPrefix) ? f.slice(stripPrefix.length) : f);
				const pathMap = new Map(displayFiles.map((d, i) => [d, files[i]]));
				const tree = createTree(displayFiles);

				const container = document.createElement('div');
				container.classList.add('dirtree-container');

				// Forward font-size (and other inline styles) from the <pre>
				if (el.getAttribute('style')) container.setAttribute('style', el.getAttribute('style'));
				// Re-apply data-driven styles on top (inline style from <pre> must not override these)
				if (width !== 'auto') container.style.width = width;

				// Only show the download button when a zip name is configured.
				if (zipName) {
					const btn = document.createElement('a');
					btn.classList.add('dirtree-download-btn');
					btn.textContent = '⬇ ' + zipName;
					btn.href = '#zip/' + zipName;
					btn.addEventListener('click', e => { e.preventDefault(); download(files, displayFiles, zipName); });
					container.appendChild(btn);
				} else {
					// No button means no need to reserve top padding for it.
					container.classList.add('no-download');
				}

				const ul = document.createElement('ul');
				ul.classList.add('dirtree');
				container.appendChild(ul);

				const rootLabel = el.getAttribute('data-root') || (zipName ? zipName.replace(/\.zip$/i, '') : '.');
				displayRoot(ul, tree, rootLabel, pathMap);
				applyColumns(ul, columns);

				el.parentElement.replaceChild(container, el);
			}
		});
	}
})

export default dirTreeFactory;
