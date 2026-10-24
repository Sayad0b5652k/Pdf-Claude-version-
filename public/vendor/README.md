# Self-hosted browser libraries

Served from this app's own origin (cached by the service worker, so they also work offline).
They were copied unchanged from the official npm packages:

| File | Package | License |
|------|---------|---------|
| `katex/` (css, js, auto-render, woff2 fonts) | katex@0.16.11 | MIT |
| `mermaid.min.js` | mermaid@10.9.0 (`dist/mermaid.min.js`) | MIT |
| `pdf-lib.min.js` | pdf-lib@1.17.1 (`dist/pdf-lib.min.js`) | MIT |

`mermaid` and `pdf-lib` are loaded on demand by `window.ensureLib()` (see `index.html`),
so they cost nothing at startup. To upgrade, replace the file with the one from the new npm package.
