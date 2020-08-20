#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const pdf_exists_and_is_newer_than_markdown = require('./pdf_exists_and_is_newer_than_markdown.js')

const structuredNameRegexp = new RegExp('(\\S+)\\s-\\s(.*)')
const subchapterRegexp = new RegExp('([0-9]+)([a-zA-Z]+)')
const pdf_folder = "__pdfs__"

const package_json = JSON.parse(fs.readFileSync('package.json'))
const combined_pdf_name = `${package_json.description} - ${package_json.author}`
	.replace(/[^\w- ]/gi, '') + ".pdf"

const verbose = false

let md_files = fs.readdirSync(".")
	.filter(file => path.extname(file).toLowerCase() === ".md")
	.filter(file => !path.basename(file, ".md").startsWith("__"))
	.filter(file => path.basename(file, ".md") !== "README")

let generateTable = md_files.map(file => file.match(structuredNameRegexp)).reduce((a, b) => a && b, true)

if (generateTable)
	console.log("<table class='toc_table'>")
else
	console.log("<ul class='toc_ul'>")

for (let f of md_files) {
	let basename = path.basename(f, ".md");

	let pdf_available = pdf_exists_and_is_newer_than_markdown(f, path.join(pdf_folder, `${basename}.pdf`), verbose)
	let printlink = `<a href='./?${f}/print-pdf'> <img src="reveal/printer-symbol.svg" style="height: 0.7em; margin: 0;"> </a>`

	if (generateTable) {
		let sn = structuredNameRegexp.exec(basename)
		let sn2 = subchapterRegexp.exec(sn[1])
		let isSubchapter = sn2 && sn2.length > 1

		let a1 = isSubchapter ? "" : sn[1]
		let a2 = isSubchapter ? sn2[2] : ""

		let b = `<a href='./?${f}'>${sn[2]}</a>`
		let p = `<a href='./${pdf_folder + "/" + encodeURIComponent(basename) + ".pdf"} '>  <img src="reveal/pdf-symbol.svg" style="height: 0.7em; margin: 0;"> </a>`

		let usePrinterSymbol = true
		let c = `<a href='./?${f}/print-pdf'>printable</a>`

		console.log(`
			<tr class="${isSubchapter ? "toc_tr_subchapter" : "toc_tr_chapter"}">
				<td class="toc_no">${a1}</td>
				<td class="toc_sub_no">${a2}</td>
				<td class="toc_title">${b}</td>
				<td class="toc_print">${usePrinterSymbol ? printlink : c}</td>
				<td class="toc_pdf">${pdf_available ? p : ""}</td>
			</tr>`)
	} else {
		console.log(`
			<li> 
				<a href='./?${f}'>${basename}</a> 
				${printlink}
			</li>`)
	}
}


if (generateTable) {
	console.log("</table>")
} else {
	console.log("</ul>")
}

let exists = fs.existsSync(path.join(pdf_folder, combined_pdf_name))
if (exists) {
	console.log(`
		<credits>
			<a href='./${pdf_folder + "/" + encodeURIComponent(combined_pdf_name)} '>  
				All slides combined as PDF</a>
		</credits>
	`)
}

