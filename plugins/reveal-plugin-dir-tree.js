/*
Create a zip from existing files for download and display a tree of files

Attributes on <pre class="dirtree">:
  data-zipname="archive.zip"      — name of the downloaded zip (default: download.zip)
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

				/* Download button */
				.dirtree-download-btn {
					position: absolute !important;
					top: 10px !important;
					right: 14px !important;
					padding: 2px 10px;
					background: transparent;
					border: 1px solid #d0d7de;
					border-radius: 6px;
					color: #cf222e !important;
					font-size: 0.85em;
					cursor: pointer;
					text-decoration: none !important;
					transition: background 0.15s, border-color 0.15s;
					font-family: inherit;
				}

				.dirtree-download-btn:hover {
					background: #fff5f5 !important;
					border-color: #cf222e !important;
					color: #cf222e !important;
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
				getPath(tree, parts)[filename] = filename;
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

		function displayTree(el, treeNode, path, isRoot, files, zipName, ancestorLast) {
			const names = Object.getOwnPropertyNames(treeNode);

			names.forEach((name, index) => {
				const o = treeNode[name];
				const isDir = typeof o === 'object';
				const isLast = index === names.length - 1;

				const li = document.createElement('li');
				li.classList.add('dirtree');

				if (isRoot) {
					li.classList.add('root');

					const icon = document.createElement('span');
					icon.classList.add('dirtree-icon');
					icon.textContent = '📁';

					const nameSpan = document.createElement('span');
					nameSpan.classList.add('dirtree-dir-name');
					nameSpan.textContent = name;

					li.appendChild(icon);
					li.appendChild(nameSpan);
					el.appendChild(li);

					const ul = document.createElement('ul');
					ul.classList.add('dirtree');
					li.appendChild(ul);
					displayTree(ul, o, `${path}/${name}`, false, files, zipName, []);

				} else {
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
						displayTree(ul, o, `${path}/${name}`, false, files, zipName, [...ancestorLast, isLast]);

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
						li.appendChild(makeCopyButton(finalPath));
						el.appendChild(li);
					}
				}
			});
		}

		deck.on('ready', () => {
			injectStyles();

			for (const el of deck.getRevealElement().querySelectorAll('pre.dirtree')) {
				const zipName = el.getAttribute('data-zipname') || 'download.zip';
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

				const btn = document.createElement('a');
				btn.classList.add('dirtree-download-btn');
				btn.textContent = '⬇ ' + zipName;
				btn.href = '#zip/' + zipName;
				btn.addEventListener('click', e => { e.preventDefault(); download(files, zipName); });
				container.appendChild(btn);

				const ul = document.createElement('ul');
				ul.classList.add('dirtree');
				container.appendChild(ul);

				displayTree(ul, tree, '', true, files, zipName, []);

				el.parentElement.replaceChild(container, el);
			}
		});
	}
})

export default dirTreeFactory;
