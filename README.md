# reveal-template

## Installation

Install using `npm install @farberg/reveal-template`

## Prerequisites

Create a file `package.json` describing your presentation like this:

```json
{
	"title": "Big Data",
	"description": "Big Data",
	"homepage": "https://farberg.de/talks/big-data",
	"authors": [
		{
		"name": "Prof. Dr.-Ing. habil. Dennis Pfisterer",
		"shortname": "Pfisterer",
		"homepage": "https://dennis-pfisterer.de"
		}
	]
}
```

Create your Presentation in Markdown (`00 - Introduction.md` in the examples below):

```markdown
<div class="lecturetitle">Introduction</div>

---
## Some Heading

Some text

---
## Next Heading
```

## Usage

### Using npm (`npm install @farberg/reveal-template`)

See <demo/npm.html> for an example.

### Using a CDN

See <demo/cdn.html> for an example ([see the result here](https://htmlpreview.github.io/?https://github.com/pfisterer/reveal-template/demo/cdn.html))

## Publish a new version (maintainers only)

- Bump version in `package.json`
- Run `npm publish --access public`