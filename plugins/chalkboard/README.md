# chalkboard (vendored)

This is a **vendored copy** of the `chalkboard` plugin from
[rajgoel/reveal.js-plugins](https://github.com/rajgoel/reveal.js-plugins),
so this template no longer depends on the `reveal.js-plugins` npm package
(which pulled in an old, vulnerable `npm@6` dependency tree).

- **Base version:** 2.3.3 (see the header in `plugin.js`)
- **Author:** Asvin Goel — <goel@telematique.eu>
- **License:** MIT — see [`LICENSE`](./LICENSE) (Copyright © 2021 Asvin Goel)
- **Upstream:** https://github.com/rajgoel/reveal.js-plugins/tree/master/chalkboard

Files: `plugin.js` (publishes `window.RevealChalkboard`) and `style.css`. This
copy is **image-free** — there is no `img/` folder; all icons/cursors are inline
SVG or CSS and the board background is a solid colour.

## Local changes (re-apply after updating from upstream)

All marked with `LOCAL` / `LOCAL PATCH` / `LOCAL FEATURE` in `plugin.js`.

1. **Sticky eraser cursor fix** (`changeCursor()`): when `boardmarkers`/`chalks`
   have a `color` but no `cursor`, upstream set `style.cursor = undefined`, so the
   eraser cursor stuck after erasing. Falls back to `'auto'`.
2. **Image-free**: the whole `img/` folder was removed.
   - Erase cursor and the palette eraser button are inline SVG (Lucide "eraser",
     MIT), not `img/sponge.png`.
   - Board background is a solid colour (`#000` for `chalkboard`, `#efefef` for
     `whiteboard`) instead of `blackboard.png`/`whiteboard.png`. Colour-vs-image
     is handled by `bgIsColor()` / `bgCss()` and in the print-bake path.
   - Colour swatches are CSS squares (`.chalkboard-swatch`), not FontAwesome.
   - The default `boardmarkers`/`chalks` `cursor:` entries (which referenced
     `img/*.png`) were removed; pens fall back to the `auto` cursor.
3. **Text tool**: a `T` button in the palette writes text on the board. Click to
   place an input, type, Enter to commit (Esc cancels). Stored as a `text` event
   so it survives resize/reload. Config: `textSize`, `textFont`.
4. **Centred eraser + circle**: the erase area is centred on the pointer (was
   offset down-right) and the cursor shows a small grey circle (`r = 13`) marking
   exactly what gets erased. Radius in `var eraser`.
5. **Palette look** (mostly `style.css`): uniform 30×30 flex-centred cells; the
   deck theme's list bullet (`.reveal ul li:before` en-dash) and hanging
   `text-indent` are neutralised so items — especially the `T` — stay centred.

`style.css` also forces a pure-black `#chalkboard` (belt-and-suspenders with the
solid-colour background) and keeps the palette usable regardless of the deck
theme's `.reveal ul` / `.reveal img` rules.

## Updating

Copy `plugin.js` and `style.css` from the upstream `chalkboard/` folder over the
files here, keep this README + `LICENSE`, then re-apply the local changes above
(and do **not** re-introduce the `img/` folder). The `customcontrols` plugin was
intentionally dropped (unused — this deck hides the on-screen controls).
