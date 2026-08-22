# HHCC-Chef-Bagels · Sketchly

Our project code for HHCC 2026.

Sketchly provides two separate wireframe-to-website workflows from one homepage: an AI API editor powered by Kimi Vision and Kimi Code, and a deterministic local geometric editor.

The AI editor recognizes complete or changed sketches, generates themed HTML/CSS, supports direct text editing in the preview, and preserves layout relationships while allowing polished spacing. The geometric editor keeps recognition and component generation local, infers forms, card grids, cards, and heroes from their children, limits automatic navbar and footer roles, absorbs control labels, respects divider boundaries, supports structure and text editing, and can optionally ask Kimi to redesign only the CSS. Both editors export a ZIP project containing HTML pages, shared CSS, and working relative links between generated pages.

## Run locally

```bash
npm ci
npm run dev
```

`npm ci` downloads the exact dependency versions recorded in
`package-lock.json`. See `dependencies.txt` for a readable list of the runtime
and development packages.

Open `http://localhost:3000`, then choose AI API or Geometric on the homepage.

Kimi is required for the AI API editor and optional for CSS redesign in the geometric editor. Copy `.env.example` to `.env.local` and set `MOONSHOT_API_KEY`. Without a key, the geometric recognizer and original local CSS remain usable.

Generated themes can use Inter, Manrope, DM Sans, Space Grotesk, Lora,
Playfair Display, Bitter, and JetBrains Mono. These fonts and their license
notices are bundled locally and included in exported ZIPs. Bukhari remains
reserved for the Sketchly brand rather than generated website content.

## Validate

```bash
npm run build
```
