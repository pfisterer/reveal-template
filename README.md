# reveal-template

This is a helper package to simplify the generation of reveal.js presentations using Markdown files only. It contains a set of (optional) reveal plugins to simplify the creation of lectures.

It is primarily used by myself so it is quite opinionated and makes certains assumptions on the structure of the lecture. Markdown files should follow a certain naming pattern:
- Single level: `00 - Introduction.md`, `01 - Bla.md`, etc.
- Two level: `00 - Introduction.md`, `01 - Topic 1.md`, `01a - Sub-Topic 1.md`, `01b - Sub-Topic 1.md`, `02 - Topic 2`, etc.

`dennis_build` compiles the markdown files into a fully static `dist/` folder (Vite, minified/hashed assets; the markdown is prerendered to reveal `<section>` HTML at build time — the real reveal markdown plugin runs in jsdom, so output is identical to former runtime parsing — and the pages are minified). The result can be published on any web server and does not require server-side components. Markdown parser options default to `{ smartypants: true }` and can be overridden via `"farberg": { "markdown": { ... } }` in the lecture's `package.json`.

## Requirements and Installation

To use this project, [node.js and npm](https://nodejs.org) are required.

Create a new lecture:
- Create a new folder and initialize an empty node.js project (e.g., `npm init --yes`)
- Add this package as a dependency (`npm i @farberg/reveal-template`)
- Read the documentation below

## Usage

1. Create a file `package.json` describing your presentation (e.g., [like this one)](docs/package.json) — `title`, `authors` and `homepage` end up on the title slide, QR code and in the combined PDF name.
2. Create your presentation in [Markdown](https://en.wikipedia.org/wiki/Markdown) (see <a href="docs/00 - Introduction.md">this file</a> for an example).
3. Optionally create a `deck.config.js` exporting `{ revealOptions, mermaid }` for deck-specific plugins/config.
4. Run `npx dennis_build` — this produces `dist/`:
   - one page per deck at a pretty URL (`02a - Immutable Infrastructure.md` -> `/02a-immutable-infrastructure`, extensionless URLs need a small rewrite rule, see below), plus a `<slug>-print` variant per deck
   - `index.html` redirecting to the first deck
   - `toc.json`, a machine-readable table of contents rendered by the show-toc plugin
   - hashed/minified JS/CSS under `assets/`, static `img/`, `code/`, `data/` copied as-is (configurable via `"farberg": { "assetDirs": [...], "assetExclude": [...] }` in `package.json`)

Other modes:
- `npx dennis_build dev` — Vite dev server with prod-identical routes and auto-reload
  - optional dev hooks run commands when matching files change, then reload the browser, e.g. regenerate SVGs from PowerPoint sources: `"farberg": { "devHooks": [{ "watch": "^img/[^~][^/]*\\.pptx$", "run": "npm run img" }] }` in `package.json` (`watch` is a regex on the repo-relative path; changes are debounced and a hook never runs twice at once)
- `npx dennis_build --watch` — rebuild `dist/` on every change (use any static server on `dist/`, e.g. VS Code Go Live)
- `npx dennis_build --toc-only` — refresh the PDF links in `dist/toc.json` after PDFs were generated
- `npx dennis_serve_dist dist` — tiny static server with extensionless URLs (used by CI for PDF rendering)

Apache rewrite rule for extensionless URLs (put in `.htaccess`, it is copied into `dist/`):

```apache
RewriteEngine on
RewriteCond %{REQUEST_FILENAME}.html -f
RewriteRule ^(.+)$ $1.html [L]
```

## Plugins

Click on the link for documentation

*Tested and working* 

| Name                                                                                   | Description                                                                                               |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [reveal-plugin-dir-tree.js](plugins/reveal-plugin-dir-tree.js)                         | Create a zip from existing files for download and display a tree of files                                 |
| [reveal-plugin-html-example.js](plugins/reveal-plugin-html-example.js)                 | Renders a code example as innerHTML of a target element                                                   |
| [reveal-plugin-prefix-with-base-url.js](plugins/reveal-plugin-prefix-with-base-url.js) | Prefixes the pages base URL to an element's inner Text. Optionally converts it to inline code.            |
| [reveal-plugin-show-attribution.js](plugins/reveal-plugin-show-attribution.js)         | Shows credits on the lower right corner                                                                   |
| [reveal-plugin-show-code-snippets.js](plugins/reveal-plugin-show-code-snippets.js)     | Shows a code snippet loaded from a file (begin/end markers, Nth occurrence, optionally incl. marker lines) |
| [reveal-plugin-show-qr-code.js](plugins/reveal-plugin-show-qr-code.js)                 | Display a QR code and link to the presentation on the slides slides                                       |
| [reveal-plugin-show-title.js](plugins/reveal-plugin-show-title.js)                     | Create a title slide automatically                                                                        |
| [reveal-plugin-show-toc.js](plugins/reveal-plugin-show-toc.js)                         | Renders the table of contents from the `toc.json` generated by `dennis_build`                             |

*Non-functional, untested or in development*

| Name                                                                           | Description                                          |
| ------------------------------------------------------------------------------ | ---------------------------------------------------- |
| [reveal-plugin-modify-font-size.js](plugins/reveal-plugin-modify-font-size.js) | Add keybindings `+` and `-` to change base font size |
| [reveal-plugin-toggle-solutions.js](plugins/reveal-plugin-toggle-solutions.js) | Show of hide solutions                               |

## Conversion to PDF

Run `npx dennis_build && npx dennis_generate_pdfs` to render `dist/pdfs/<slug>.pdf` per deck plus a combined PDF (puppeteer-based; CI uses Gotenberg against the same `<slug>-print` pages instead).

## Local Development

To develop on this repository:
- Check out this repository (`git clone https://github.com/pfisterer/reveal-template.git`)
- Run `npm install` to install required dependencies
- In a lecture repo, run `npm link @farberg/reveal-template`, then use `npx dennis_build dev` there

## Publish a new version (maintainers only)

```bash
# Bump version in `package.json`

# Run this command to publish on npm
npm login && sleep 3s && npm publish --access public
```