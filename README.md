# reveal-template

## Installation

Install using `npm install @farberg/reveal-template`

## Usage

1. Create a file `package.json` describing your presentation (e.g., [like this one)](docs/package.json).
2. Create your Presentation in Markdown (`00 - Introduction.md` in the examples below, see <a href="docs/00 - Introduction.md">this file</a> for an example).
3. Create an HTML file (e.g., index.html)
   - Using npm (`npm install @farberg/reveal-template`), see [npm.html](docs/npm.html) for an example.
   - Using a CDN, see [cdn.html](docs/cdn.html) for an example ([see the published result here](https://pfisterer.github.io/reveal-template/cdn.html))

## Publish a new version (maintainers only)

```bash
# Bump version in `package.json`

# Run this command to publish on npm

npm publish --access public
```