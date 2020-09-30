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

```html
<html>

<head>
	<meta charset="utf-8">
	<meta name="apple-mobile-web-app-capable" content="yes" />
	<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=yes, minimal-ui">

	<link rel="stylesheet" href="node_modules/reveal.js/dist/reveal.css">
	<link rel="stylesheet" href="node_modules/reveal.js/plugin/highlight/zenburn.css">
	<link rel="stylesheet" href="node_modules/@farberg/reveal-template/css/dhbw.css" id="theme">

	<script type="module">
		import { initReveal } from 'node_modules/@farberg/reveal-template/init-reveal.js'
		initReveal("00 - Introduction.md");
	</script>
</head>

<body>
	<div class="reveal"><div class="slides"></div></div>
</body>
```

### Using a CDN

```html
<html>

<head>
	<meta charset="utf-8">
	<meta name="apple-mobile-web-app-capable" content="yes" />
	<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=yes, minimal-ui">

	<link rel="stylesheet" href="https://unpkg.com/reveal.js/dist/reveal.css">
	<link rel="stylesheet" href="https://unpkg.com/reveal.js/plugin/highlight/zenburn.css">
	<link rel="stylesheet" href="https://unpkg.com/@farberg/reveal-template/css/dhbw.css" id="theme">
	
	<script type="module">
		import { initReveal } from 'https://unpkg.com/@farberg/reveal-template/init-reveal.js'
		const revealPath = "https://unpkg.com/reveal.js/"
		initReveal("00 - Introduction.md", null, null, null, revealPath);
	</script>
</head>

<body>
	<div class="reveal"> <div class="slides"></div></div>
</body>
```

## Publish a new version (maintainers only)

- Bump version in `package.json`
- Run `npm publish --access public`