# reveal-template

This is a helper package to simplify the generation of reveal.js presentations using Markdown files only. It contains a set of (optional) reveal plugins to simplify the creation of lectures.

It is primarily used by myself so it is quite opinionated and makes certains assumptions on the structure of the lecture. Markdown files should follow a certain naming pattern:
- Single level: `00 - Introduction.md`, `01 - Bla.md`, etc.
- Two level: `00 - Introduction.md`, `01 - Topic 1.md`, `01a - Sub-Topic 1.md`, `01b - Sub-Topic 1.md`, `02 - Topic 2`, etc.

The resulting files can be published on any web server and do not require server-side components. Everything is rendered by the browser.

## Requirements and Installation

To use this project, [node.js and npm](https://nodejs.org) are required.

Create a new lecture:
- Create a new folder and initialize an empty node.js project (e.g., `npm init --yes`)
- Add this package as a dependency (`npm i @farberg/reveal-template`)
- Read the documentation below

## Usage

1. Create a file `package.json` describing your presentation (e.g., [like this one)](docs/package.json).
2. Create an HTML file (e.g., `index.html`, see [npm.html](docs/npm.html) for an example)
3. Create your presentation in [Markdown](https://en.wikipedia.org/wiki/Markdown)
   - See <a href="docs/00 - Introduction.md">this file</a> for an example).
   - Using npm (`npm install @farberg/reveal-template`), see [npm.html](docs/npm.html) for an example.

## Plugins

Click on the link for documentation

*Tested and working* 

| Name                                                                                   | Description                                                                                               |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| [reveal-plugin-dir-tree.js](http://plugins/reveal-plugin-dir-tree.js)                  | Create a zip from existing files for download and display a tree of files                                 |
| [reveal-plugin-html-example.js](plugins/reveal-plugin-html-example.js)                 | Renders a code example as innerHTML of a target element                                                   |
| [reveal-plugin-prefix-with-base-url.js](plugins/reveal-plugin-prefix-with-base-url.js) | Prefixes the pages base URL to an element's inner Text. Optionally converts it to inline code.            |
| [reveal-plugin-show-attribution.js](plugins/reveal-plugin-show-attribution.js)         | Shows credits on the lower right corner                                                                   |
| [reveal-plugin-show-code-snippets.js](plugins/reveal-plugin-show-code-snippets.js)     | Shows a code snippet after loading it from a file.                                                        |
| [reveal-plugin-show-qr-code.js](plugins/reveal-plugin-show-qr-code.js)                 | Display a QR code and link to the presentation on the slides slides                                       |
| [reveal-plugin-show-title.js](plugins/reveal-plugin-show-title.js)                     | Create a title slide automatically                                                                        |
| [reveal-plugin-show-toc.js](plugins/reveal-plugin-show-toc.js)                         | Create a table of contents automatically (run `npx dennis_generate_toc > generated_toc.html` to generate) |

*Non-functional, untested or in development*

| Name                                                                           | Description                                          |
| ------------------------------------------------------------------------------ | ---------------------------------------------------- |
| [reveal-plugin-modify-font-size.js](plugins/reveal-plugin-modify-font-size.js) | Add keybindings `+` and `-` to change base font size |
| [reveal-plugin-toggle-solutions.js](plugins/reveal-plugin-toggle-solutions.js) | Show of hide solutions                               |

## Conversion to PDF

Run `npx dennis_generate_pdfs` to create PDFs. Requires a running [Docker](https://www.docker.com/) daemon.

## Local Development

To start developing on this repository:
- Check out this repository (`git clone https://github.com/pfisterer/reveal-template.git`)
- Run `npm install` to install required dependencies
- Start a web server from the root directory (e.g., `npx http-server -p 5500`)
- Open <http://localhost:5500/docs/local-dev.html>

## Publish a new version (maintainers only)

```bash
# Bump version in `package.json`

# Run this command to publish on npm
npm publish --access public
```