# reveal-template

## Installation

Install using `npm install @farberg/reveal-template`

## Usage

1. Create a file `package.json` describing your presentation (e.g., [like this one)](docs/package.json).
1. Create your Presentation in Markdown (`00 - Introduction.md` in the examples below, see [this file](docs/00 - Introduction.md) for an example).
2. Create an HTML file (e.g., index.html)
   - Using npm (`npm install @farberg/reveal-template`), see <docs/npm.html> for an example.
   - Using a CDN, see <docs/cdn.html> for an example ([see the result here](https://htmlpreview.github.io/?https://github.com/pfisterer/reveal-template/demo/cdn.html))

## Publish a new version (maintainers only)

- Bump version in `package.json`
- Run `npm publish --access public`