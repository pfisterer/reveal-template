const fs = require('fs');

module.exports.combined_pdf = function (package_json) {

	let authorBlock = package_json.authors.map(entry => {
		return entry.shortname || entry.name || "unknown"
	}).join(" and ")

	const combined_pdf_name = `${package_json.description} - ${authorBlock}`
		.replace(/[^\w- ]/gi, '') + ".pdf"

	return combined_pdf_name
}

module.exports.pdf_exists_and_is_newer_than_markdown = function (markdownpath, pdfpath, verbose) {
	let md_exists = fs.existsSync(markdownpath)
	let pdf_exists = fs.existsSync(pdfpath)
	if (!pdf_exists || !md_exists) {
		if (verbose)
			console.error(`pdf_exists = ${pdf_exists}, markdown_exists= ${md_exists}, pdf = ${pdfpath}, markdown = ${markdownpath}`)
		return false
	}

	let md_stat = fs.statSync(markdownpath)
	let pdf_stat = fs.statSync(pdfpath)

	let pdf_size = pdf_stat.size
	if (pdf_size <= 0) {
		if (verbose)
			console.error(`pdf size is less than 1: ${pdf_size}`)
		return false
	}

	let pdf_newer = pdf_stat.mtime.getTime() > md_stat.mtime.getTime()

	if (!pdf_newer) {
		if (verbose)
			console.error(`pdf is not newer than md`)
		return false
	}
	return true
}