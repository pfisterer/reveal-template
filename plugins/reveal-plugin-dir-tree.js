const dir_tree = {
	id: 'dir_tree',
	init: (deck) => {

		function getFileList(el) {
			const text = el.innerText;
			const files = text.split('\n').filter(e => e.trim().length > 0);
			return files
		}

		function createTree(files) {

			function getPath(tree, path) {
				let nextNode = tree[path[0]]

				if (!nextNode) {
					nextNode = {}
					tree[path[0]] = nextNode
				}

				const nextPath = path.slice(1)
				if (nextPath.length > 0) {
					return getPath(nextNode, nextPath)
				}

				return nextNode
			}

			let tree = {}
			for (const file of files) {
				const path = file.split('/')
				const filename = path.pop()

				const treeNode = getPath(tree, path);
				treeNode[filename] = filename
			}
			return tree

		}

		function download(files, zipName) {
			Promise.all(files.map(file => fetch(file)))
				.then(promises => Promise.all(promises.map(p => p.text()))
					.then(values => {
						var zip = new JSZip();
						values.forEach((text, idx) => zip.file(files[idx], text))
						zip.generateAsync({ type: "blob" }).then(blob => {
							saveAs(blob, zipName);
						})
					}))

		}

		function displayTree(el, treeNode, path, isFirst, files, zipName) {

			for (let name of Object.getOwnPropertyNames(treeNode)) {
				const o = treeNode[name]
				const isDir = typeof o === "object"

				if (isDir) {
					const li = document.createElement('li')
					li.classList.add("dirtree")
					el.appendChild(li)

					if (isFirst) {
						li.classList.add("root")
						li.innerHTML = name + " "

						const a = document.createElement('a')
						li.appendChild(a)
						a.innerHTML = `(download ${zipName})`
						a.href = "#zip/" + zipName
						a.style = "color: #e10217";
						a.addEventListener('click', e => {
							e.preventDefault()
							download(files, zipName)
						})


					} else {
						li.innerHTML = name
					}

					const ul = document.createElement('ul')
					ul.classList.add("dirtree")
					li.appendChild(ul)

					displayTree(ul, o, `${path}/${name}`, false, files, zipName)

				} else {

					const li = document.createElement('li')
					li.classList.add("dirtree")

					//Remove trailing slash
					const finalPath = `${path}/${o}`.replace(/^\//, "");
					li.innerHTML = `<a href="${finalPath}">${o}</a>`

					el.appendChild(li)
				}
			}
		}

		deck.on('ready', () => {
			for (let el of deck.getRevealElement().querySelectorAll("pre.dirtree")) {
				const zipName = el.getAttribute("data-zipname") || "download.zip"
				const stripPrefix = el.getAttribute("data-strip-prefix")

				const files = getFileList(el)
				const tree = createTree(files)

				const ul = document.createElement('ul')
				ul.classList.add("dirtree")

				displayTree(ul, tree, '', true, files, zipName)

				el.parentElement.replaceChild(ul, el)
			}

		})


	}
}


export default dir_tree;