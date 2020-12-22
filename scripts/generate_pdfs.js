#!/usr/bin/env node
const connect = require('connect')
const serveStatic = require('serve-static')
const os = require('os');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { combined_pdf, pdf_exists_and_is_newer_than_markdown } = require('./helpers')

const cwd = process.cwd()
const slides_dir = cwd
const pdf_dir = path.join(cwd, '__pdfs__')
const host = os.hostname()
const port = 1256
const verbose = true
const package_json = JSON.parse(fs.readFileSync('package.json'))
const combined_pdf_name = combined_pdf(package_json)
const args = process.argv.slice(2);
const url = args[0] ? args[0] : `http://${host}:${port}`
const maxProcessesRunning = Math.max(Math.floor(os.cpus().length / 2, 1))

function start_web_server() {
	var app = connect();
	app.use(serveStatic(slides_dir));
	app.use(function onerror(err, req, res, next) {
		if (err)
			console.error(err)
	});
	app.listen(port);
	console.log(`Listening on port ${port}, running in ${cwd}`);
	return app
}

function update_docker_image() {
	return new Promise((resolve, reject) => {

		let cmd = "docker"
		let args = ["pull", "astefanutti/decktape"]
		let cmdLine = `${cmd} ${args.reduce((a, b) => `${a} '${b}'`, "")}`

		if (verbose)
			console.log(`Running ${cmdLine}`)

		const update_process = spawn(cmd, args)

		update_process.on('close', code => resolve(code))
	})
}

function spawn_convert_md_to_pdf(url, pdf_dir, pdf_name) {
	let cmd = "docker"
	let args = ["run", "--rm", "-u", `${os.userInfo().uid}`, "-v", `${pdf_dir}:/slides`, "astefanutti/decktape", "--load-pause", "2000", "--pause", "500", "-s", "1200x800", "automatic", url, `/slides/${path.basename(pdf_name)}`]

	let cmdLine = `${cmd} ${args.reduce((a, b) => `${a} '${b}'`, "")}`

	if (verbose)
		console.log(`Running ${cmdLine}`)

	return spawn(cmd, args)
}

function spawn_merge_to_single_pdf(pdfs, pdf, pdf_dir) {
	let output_pdf = `/slides/${path.basename(pdf)}`
	let cmd = "docker"
	let args = ["run", "--rm", "-v", `${pdf_dir}:/slides`, "agileek/pdftk"]
	args = args.concat(
		pdfs.map(pdf_file => '/slides/' + path.basename(pdf_file)),
		["cat", "output", output_pdf]
	)

	let cmdLine = `${cmd} ${args.reduce((a, b) => `${a} '${b}'`, "")}`
	if (verbose)
		console.log(`Running ${cmdLine}`)

	return spawn(cmd, args)
}

function touch_file(path) {
	const time = new Date();
	fs.utimesSync(path, time, time);
}

function get_todos(md_dir, pdf_dir, url) {
	//Get list of markdown files
	let md_files = fs.readdirSync(md_dir)
		// Keep markdown files
		.filter(file => path.extname(file).toLowerCase() === ".md")
		// Skip files starting with __
		.filter(file => !path.basename(file, ".md").startsWith("__"))
		// Skip README.md
		.filter(file => path.basename(file, ".md") !== "README")

	if (verbose)
		console.log("Markdown files:", md_files)

	let todos = md_files.map(md_file => {
		let pdf_name = path.basename(md_file, ".md") + ".pdf"
		let pdf_file = path.join(pdf_dir, pdf_name)
		let pdf_exists = fs.existsSync(pdf_file)
		let pdf_size = pdf_exists ? fs.statSync(pdf_file)["size"] : 0;
		let pdf_newer = pdf_size > 0 ? pdf_exists_and_is_newer_than_markdown(md_file, pdf_file, verbose) : 0
		let presentation_url = `${url}/index.html?${encodeURIComponent(md_file)}`

		let o = {
			md_file,
			pdf_dir,
			pdf_name,
			pdf_file,
			pdf_exists,
			pdf_newer,
			requires_conversion: !pdf_exists || !pdf_newer,
			presentation_url,
			start_conversion: () => {
				o.process = spawn_convert_md_to_pdf(presentation_url, pdf_dir, pdf_name)
				o.process.stdout.on('data', data => o.stdout.push(data))
				o.process.stderr.on('data', data => o.stderr.push(data))
				o.process.on('close', code => {
					touch_file(pdf_file)
					console.log(`Processed file ${md_file}, exited with code ${code}`)
				})
			},
			process: null,
			stdout: [],
			stderr: []
		}

		return o
	})

	//if (verbose) console.log("All todos (not filtered):", todos)

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

function run_todos(todos, maxProcessesRunning) {
	return new Promise((resolve, reject) => {

		let interval = setInterval(() => {
			const running_processes = todos.filter(todo => todo.process && todo.process.exitCode == null)
			const waiting_processes = todos.filter(todo => !todo.process)

			//console.log(`Running ${running_processes.length}, waiting ${waiting_processes.length}`)
			//console.log("todos_that_require_action", todos_that_require_action); console.log("running_processes", running_processes); console.log("waiting_processes", waiting_processes);

			if (running_processes.length < maxProcessesRunning && waiting_processes.length > 0) {
				console.log(`Starting next process: ${waiting_processes[0].md_file}`)
				waiting_processes[0].start_conversion()

			} else if (running_processes.length === 0 && waiting_processes.length === 0) {
				console.log(`No more running/required processes, done converting.`)
				clearInterval(interval)
				resolve()
			}
		}, 300)

	})
}

function merge_pdfs(todos, out_file) {
	return new Promise((resolve, reject) => {

		//Merge to a single PDF (only if the PDFs have more than 0 bytes)
		let pdfs = todos.filter(todo => fs.statSync(todo.pdf_file).size > 0).map(todo => todo.pdf_name)
		let p = spawn_merge_to_single_pdf(pdfs, out_file, pdf_dir)

		p.on('close', code => {
			console.log(`PDF merge exited with code ${code} `)
			resolve(code)
			process.exit(0)
		})
	})
}

//Update docker image first
update_docker_image().then(code => {
	if (verbose)
		console.log("Docker image updated")

	//Start an embedded web server to load the slides from
	const app = start_web_server();

	//Create PDF dir
	fs.mkdirSync(pdf_dir, { recursive: true })

	//Get markdown files
	const { todos, todos_that_require_action /*, todos_that_dont_require_action */ } = get_todos(slides_dir, pdf_dir, url);

	delete_stale_pdf_files(todos, pdf_dir, combined_pdf_name)

	run_todos(todos_that_require_action, maxProcessesRunning).then(() => {
		console.log("Merging pdfs");
		merge_pdfs(todos, combined_pdf_name)
		console.log("Done")
	})
})
