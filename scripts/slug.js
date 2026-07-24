// URL slug for a markdown basename, e.g. "02a - Immutable Infrastructure"
// -> "02a-immutable-infrastructure". The number prefix survives naturally.
const umlauts = { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'Ä': 'ae', 'Ö': 'oe', 'Ü': 'ue', 'ß': 'ss' }

function slugify(basename) {
	return basename
		.replace(/[äöüÄÖÜß]/g, c => umlauts[c])
		.replace(/&/g, ' and ')
		.normalize('NFKD').replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
}

module.exports = { slugify }
