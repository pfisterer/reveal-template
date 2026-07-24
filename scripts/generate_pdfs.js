#!/usr/bin/env node

// Local PDF generation (puppeteer-based alternative to the Gotenberg CI step).
// Renders the print pages of a built dist/ into dist/pdfs/<slug>.pdf and
// merges them into one combined PDF. Run `dennis_build` first.

const connect = require('connect')
const serveStatic = require('serve-static')
const path = require('path')
const fs = require('fs')
const puppeteer = require('puppeteer')
const { combined_pdf, pdf_exists_and_is_newer_than_markdown } = require('./helpers')

const cwd = process.cwd()
const dist_dir = path.join(cwd, 'dist')
const pdf_dir = path.join(dist_dir, 'pdfs')
const port = 1252
const verbose = true
const package_json = JSON.parse(fs.readFileSync('package.json'))
const combined_pdf_name = combined_pdf(package_json)
const args = process.argv.slice(2);
const url = args[0] ? args[0] : `http://localhost:${port}`

function start_web_server() {
	var app = connect();
	app.use(serveStatic(dist_dir, { extensions: ['html'] }));
	app.use(function onerror(err, req, res, next) {
		if (err)
			console.error(err)
	});
	app.listen(port);
	console.log(`Listening on port ${port}, serving ${dist_dir}`);
	return app
}

function get_todos(url) {
	const toc_file = path.join(dist_dir, 'toc.json')
	if (!fs.existsSync(toc_file)) {
		console.error('Error: dist/toc.json not found — run dennis_build first')
		process.exit(1)
	}
	const toc = JSON.parse(fs.readFileSync(toc_file))

	if (verbose)
		console.log("Decks:", toc.decks.map(d => d.slug))

	let todos = toc.decks.map(deck => {
		let pdf_name = `${deck.slug}.pdf`
		let pdf_file = path.join(pdf_dir, pdf_name)
		let pdf_exists = fs.existsSync(pdf_file)
		let pdf_size = pdf_exists ? fs.statSync(pdf_file)["size"] : 0;
		let pdf_newer = pdf_size > 0 ? pdf_exists_and_is_newer_than_markdown(path.join(cwd, deck.file), pdf_file, verbose) : 0
		let presentation_url = `${url}/${deck.printPath}.html#/`

		let o = {
			md_file: deck.file,
			pdf_dir,
			pdf_name,
			pdf_file,
			pdf_exists,
			pdf_newer,
			requires_conversion: !pdf_exists || !pdf_newer,
			presentation_url,
		}

		return o
	})

	const todos_that_require_action = todos.filter(todo => todo.requires_conversion === true)
	const todos_that_dont_require_action = todos.filter(todo => todo.requires_conversion === false)
	return { todos, todos_that_require_action, todos_that_dont_require_action };
}

function delete_stale_pdf_files(todos, pdf_dir, combined_pdf_name) {
	let pdf_files_in_dir = fs.readdirSync(pdf_dir)
		//Keep PDFs only
		.filter(f => path.extname(f).toLowerCase() === ".pdf")
		//Map to filename only
		.map(f => path.basename(f))

	let desired_pdfs = todos.map(todo => todo.pdf_name)

	const files_to_delete = pdf_files_in_dir
		//Keep for removal if not in the list of desired PDFs and not the Combined PDF name
		.filter((file) => {
			const desired = desired_pdfs.indexOf(file) >= 0
			const combined = (file === combined_pdf_name)
			return !(desired || combined);
		})

	files_to_delete.forEach(f => {
		try {
			console.log(`Deleting PDF ${f}`)
			fs.unlinkSync(path.join(pdf_dir, f))
		} catch (e) {
			console.error("Unable to delete", e)
		}
	})
}

async function convert_to_pdf_single(todo) {
	const browser = await puppeteer.launch({ headless: 'new' })
	const page = await browser.newPage();

	// Match Gotenberg's emulatedMediaType=screen — Reveal's print view is
	// designed for screen media; with print emulation the PDF comes out blank.
	await page.emulateMediaType('screen');

	await page.goto(todo.presentation_url, { timeout: 10000, waitUntil: ['load', 'domcontentloaded'] });

	const selector = 'div.lecturetitle > h1'
	try {
		await page.waitForSelector(selector, { timeout: 10000 })
	} catch (e) {
		console.error(`Unable to find selector ${selector} on ${todo.presentation_url}`)
	}

	if (verbose)
		console.log(`Converting ${todo.md_file} to ${todo.pdf_file} using ${todo.presentation_url}`)

	const optionsa4 = {
		format: 'A4',
		printBackground: true,
		landscape: true,
		margin: {
			top: '0.25cm',
			bottom: '0.25cm',
			left: '0.25cm',
			right: '0.25cm'
		},
		path: todo.pdf_file
	}

	const pdf = await page.pdf(optionsa4);
	await browser.close();
	return pdf
}


async function merge_pdfs(todos, out_file) {
	const out_file_path = path.join(pdf_dir, path.basename(out_file))
	const { default: PDFMerger } = await import("pdf-merger-js");
	const merger = new PDFMerger()

	let pdfs = todos
		.filter(todo => fs.existsSync(todo.pdf_file))
		.filter(todo => fs.statSync(todo.pdf_file).size > 0)
		.map(todo => todo.pdf_file)

	for (const pdf of pdfs) {
		//if (verbose)console.log(`Adding ${pdf} to merged file`)
		await merger.add(pdf)
	}
	if (verbose)
		console.log(`Saving merged file to ${out_file_path}`)

	await merger.save(out_file_path);
}


async function main() {
	//Start an embedded web server to load the slides from
	const app = start_web_server();

	//Create PDF dir
	fs.mkdirSync(pdf_dir, { recursive: true })

	//Get decks from dist/toc.json
	const { todos, todos_that_require_action /*, todos_that_dont_require_action */ } = get_todos(url);

	delete_stale_pdf_files(todos, pdf_dir, combined_pdf_name)

	for (const todo of todos_that_require_action) {
		await convert_to_pdf_single(todo)
	}

	await merge_pdfs(todos, combined_pdf_name)
}

main().then(() => {
	console.log("Done")
	process.exit(0)
}).catch(e => {
	console.error(e)
	process.exit(1)
})
