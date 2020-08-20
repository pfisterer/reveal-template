# reveal-template

## Installation

Install using `npm install @farberg/reveal-template`

## Usage

Example:

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
</head>

<body>
	<div class="reveal">
		<div class="slides">
			<script type="module">
				import { initReveal } from 'node_modules/@farberg/reveal-template/init-reveal.js'
				initReveal("00 - Introduction.md");
			</script>
		</div>
	</div>
</body>
```

## Publish a new version (maintainers only)

- Bump version in `package.json`
- Run `npm publish --access public`