/*
Create a zip from existing files for download and display a tree of files

Attributes on <pre class="dirtree">:
  data-zipname="archive.zip"      — name of the downloaded zip; omit to hide the download button
  data-root="my-project"          — label for the root folder when files have no common top-level dir
                                    (default: zip name without ".zip", else ".")
  data-line-height="1.6"          — line spacing (default: 1.85)
  data-width="auto"               — container width, e.g. "400px", "60%", "auto" (default: auto)

<pre class="dirtree" data-zipname="k8s-Exercise.zip" data-line-height="1.6" data-width="480px">
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
					background: transparent;
					border-radius: 10px;
					padding: 38px 18px 14px 18px;
					border: 1px solid #d0d7de;
					display: inline-block;
					min-width: 280px;
					max-width: 90%;
					text-align: left;
					position: relative !important;
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

				li.dirtree.root {
					color: #0969da;
					font-weight: 600;
					margin-bottom: 2px;
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

				.dirtree-icon {
					margin-right: 4px;
					flex-shrink: 0;
				}
			`;
			document.head.appendChild(style);
		}

		function getFileIcon(name, ext) {
			if (name.toLowerCase() === 'dockerfile') return '🐳';
			const icons = {
				js: '📜', ts: '📜', jsx: '📜', tsx: '📜',
				json: '📋', yaml: '📋', yml: '📋', toml: '📋', xml: '📋',
				md: '📝', txt: '📝', rst: '📝',
				html: '🌐', css: '🎨', scss: '🎨',
				sh: '⚙️', bash: '⚙️', zsh: '⚙️',
				py: '🐍', rb: '💎', go: '🔷', rs: '🦀', java: '☕',
				png: '🖼️', jpg: '🖼️', jpeg: '🖼️', svg: '🖼️', gif: '🖼️',
				zip: '📦', tar: '📦', gz: '📦',
				sql: '🗄️',
			};
			return icons[ext] || '📄';
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

		function download(files, zipName) {
			Promise.all(files.map(f => fetch(f, { credentials: 'include' })))
				.then(responses => {
					if (responses.some(r => r.status === 401)) {
						window.location.reload();
						return;
					}
					return Promise.all(responses.map(r => r.text())).then(values => {
						const entries = {};
						values.forEach((text, i) => { entries[files[i]] = strToU8(text); });
						zip(entries, (err, data) => {
							if (err) { console.error('zip failed', err); return; }
							downloadBlob(new Blob([data], { type: 'application/zip' }), zipName);
						});
					});
				});
		}

		function displayTree(el, treeNode, path, files, zipName, ancestorLast) {
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
					const icon = document.createElement('span');
					icon.classList.add('dirtree-icon');
					icon.textContent = '📂';

					const nameSpan = document.createElement('span');
					nameSpan.classList.add('dirtree-dir-name');
					nameSpan.textContent = name;

					li.appendChild(icon);
					li.appendChild(nameSpan);
					el.appendChild(li);

					const ul = document.createElement('ul');
					ul.classList.add('dirtree');
					li.appendChild(ul);
					displayTree(ul, o, `${path}/${name}`, files, zipName, [...ancestorLast, isLast]);

				} else {
					const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';

					const icon = document.createElement('span');
					icon.classList.add('dirtree-icon');
					icon.textContent = getFileIcon(name, ext);

					const finalPath = `${path}/${o}`.replace(/^\//, '');
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
		function displayRoot(el, tree, rootLabel, files, zipName) {
			const topNames = Object.getOwnPropertyNames(tree);
			const singleRootDir = topNames.length === 1 && typeof tree[topNames[0]] === 'object';
			const rootName = singleRootDir ? topNames[0] : rootLabel;
			const childTree = singleRootDir ? tree[rootName] : tree;
			const childPath = singleRootDir ? `/${rootName}` : '';

			const li = document.createElement('li');
			li.classList.add('dirtree', 'root');

			const icon = document.createElement('span');
			icon.classList.add('dirtree-icon');
			icon.textContent = '📁';

			const nameSpan = document.createElement('span');
			nameSpan.classList.add('dirtree-dir-name');
			nameSpan.textContent = rootName;

			li.appendChild(icon);
			li.appendChild(nameSpan);
			el.appendChild(li);

			const ul = document.createElement('ul');
			ul.classList.add('dirtree');
			li.appendChild(ul);
			displayTree(ul, childTree, childPath, files, zipName, []);
		}

		deck.on('ready', () => {
			injectStyles();

			for (const el of deck.getRevealElement().querySelectorAll('pre.dirtree')) {
				const zipName = el.getAttribute('data-zipname');
				const lineHeight = el.getAttribute('data-line-height') || '1.85';
				const width = el.getAttribute('data-width') || 'auto';

				const files = getFileList(el);
				const tree = createTree(files);

				const container = document.createElement('div');
				container.classList.add('dirtree-container');
				container.style.lineHeight = lineHeight;
				if (width !== 'auto') container.style.width = width;

				// Forward font-size (and other inline styles) from the <pre>
				if (el.getAttribute('style')) container.setAttribute('style', el.getAttribute('style'));
				// Re-apply data-driven styles on top (inline style from <pre> must not override these)
				container.style.lineHeight = lineHeight;
				if (width !== 'auto') container.style.width = width;

				// Only show the download button when a zip name is configured.
				if (zipName) {
					const btn = document.createElement('a');
					btn.classList.add('dirtree-download-btn');
					btn.textContent = '⬇ ' + zipName;
					btn.href = '#zip/' + zipName;
					btn.addEventListener('click', e => { e.preventDefault(); download(files, zipName); });
					container.appendChild(btn);
				} else {
					// No button means no need to reserve top padding for it.
					container.classList.add('no-download');
				}

				const ul = document.createElement('ul');
				ul.classList.add('dirtree');
				container.appendChild(ul);

				const rootLabel = el.getAttribute('data-root') || (zipName ? zipName.replace(/\.zip$/i, '') : '.');
				displayRoot(ul, tree, rootLabel, files, zipName);

				el.parentElement.replaceChild(container, el);
			}
		});
	}
})

export default dirTreeFactory;
