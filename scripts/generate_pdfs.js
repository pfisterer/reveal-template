#!/usr/bin/env node
const connect = require('connect')
const serveStatic = require('serve-static')
const os = require('os');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const pdf_exists_and_is_newer_than_markdown = require('./pdf_exists_and_is_newer_than_markdown.js')

const cwd = process.cwd()
const slides_dir = cwd
const pdf_dir = path.join(cwd, '__pdfs__')
const host = os.hostname()
const port = 1256
const verbose = true

const package_json = JSON.parse(fs.readFileSync('package.json'))
const combined_pdf_name = `${package_json.description} - ${package_json.author}`
	.replace(/[^\w- ]/gi, '') + ".pdf"

const args = process.argv.slice(2);

const url = args[0] ? args[0] : `http://${host}:${port}`

function merge_to_single_pdf(pdfs, pdf) {
	console.log(`Merging ${pdfs} to ${pdf}`)
	let output_pdf = `/slides/${pdf}`
	let cmd = "docker"
	let args = ["run", "--rm", "-v", `${pdf_dir}:/slides`, "agileek/pdftk"]
	args = args.concat(pdfs.map(e => '/slides/' + e), ["cat", "output", output_pdf])
	let cmdLine = `${cmd} ${args.reduce((a, b) => `${a} '${b}'`, "")}`

	if (verbose)
		console.log(`Running ${cmdLine}`)

	return spawn(cmd, args)
}

function convert_md_to_pdf(url, pdf_dir, pdf_name) {
	let cmd = "docker"
	let args = ["run", "--rm",
		"-v", `${pdf_dir}:/slides`,
		"astefanutti/decktape",
		"--load-pause", "2000",
		"--pause", "500",
		"-s", "1200x800",
		"reveal",
		url,
		`/slides/${pdf_name}`]

	let cmdLine = `${cmd} ${args.reduce((a, b) => `${a} '${b}'`, "")}`

	if (verbose)
		console.log(`Running ${cmdLine}`)

	return spawn(cmd, args)
}

//Create PDF dir
fs.mkdirSync(pdf_dir, { recursive: true })

//Start an embedded web server to load the slides from
var app = connect();
app.use(serveStatic(slides_dir));
app.use(function onerror(err, req, res, next) {
	if (err)
		console.error(err)
});
app.listen(port);
console.log(`Listening on port ${port}, running in ${cwd}`);

//Get list of markdown files
let md_files = fs.readdirSync(".")
	.filter(file => path.extname(file).toLowerCase() === ".md")
	.filter(file => !path.basename(file, ".md").startsWith("__"))

//Spawn processes to create PDFs
let processes = []

//Delete stale pdf files
let required_pdf_files = md_files.map(f => path.basename(f, ".md") + ".pdf")
fs.readdirSync(pdf_dir)
	.filter(f => path.extname(f).toLowerCase() === ".pdf")
	.filter(f => required_pdf_files.indexOf(f) < 0)
	.map(f => {
		console.log(`Deleting stale PDF ${f}`)
		fs.unlinkSync(path.join(pdf_dir, f))
	})

for (let f of md_files) {
	let pdfname = path.basename(f, ".md") + ".pdf"
	let full_pdf_path = path.join(pdf_dir, `${pdfname}`)
	let pdf_exists = pdf_exists_and_is_newer_than_markdown(f, full_pdf_path, verbose)

	if (pdf_exists) {
		if (verbose)
			console.error(`Skipping ${f} because ${full_pdf_path} is newer`)
		continue
	}

	let presentation_url = `${url}/index.html?${encodeURIComponent(f)}`

	let obj = {
		start_function: function () {
			obj.process = convert_md_to_pdf(presentation_url, pdf_dir, pdfname)

			obj.process.stdout.on('data', data => obj.stdout.push(data))
			obj.process.stderr.on('data', data => obj.stderr.push(data))
			obj.process.on('close', code => console.log(`Processing file ${f} exited with code ${code} `))
		},
		markdown_name: f,
		process: null,
		stdout: [],
		stderr: []
	}

	processes.push(obj)
}

//Wait for processes to finish, print error messages for failed ones
let interval = setInterval(() => {
	let maxProcessesRunning = 1
	let processesToStart = processes.map(p => !p.process ? 1 : 0).reduce((a, b) => a + b, 0)
	let runningProcesses = processes.map(p => p.process && p.process.exitCode == null ? 1 : 0).reduce((a, b) => a + b, 0)

	if (processesToStart > 0) {
		if (runningProcesses < maxProcessesRunning) {
			let nextProcessToStart = processes.filter(p => !p.process)[0]
			console.log(`Starting next process: ${nextProcessToStart.markdown_name}`)
			nextProcessToStart.start_function();
		}

	} else if (runningProcesses === 0) {
		console.log(`No more running processes, merging pdfs.`)

		//Stop the interval
		clearInterval(interval)

		//Debug output
		processes.forEach(p => {
			if (p.process.exitCode != 0 || verbose) {
				console.log(`Process ${p.process.exitCode === 0 ? "successful" : "failed"}, exitCode ${p.process.exitCode}, file ${p.markdown_name}`)
				console.log(`stdout = ${p.stdout.reduce((a, b) => a + "\n" + b, "")}`)
				console.log(`stderr = ${p.stderr.reduce((a, b) => a + "\n" + b, "")}`)
			}
		})

		//Merge to a single PDF
		let pdfs = fs.readdirSync(pdf_dir)
			.filter(file => path.extname(file).toLowerCase() === ".pdf")
			.filter(file => fs.statSync(path.join(pdf_dir, file)).size > 0)

		let p = merge_to_single_pdf(pdfs, combined_pdf_name)

		p.on('close', code => {
			console.log(`PDF merge exited with code ${code} `)
			process.exit(0)
		})

	}

}, 300)
