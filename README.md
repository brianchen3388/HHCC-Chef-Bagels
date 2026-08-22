# HHCC-Chef-Bagels · Sketchly

Our project code for HHCC 2026.

Sketchly provides two separate wireframe-to-website workflows from one homepage: an AI API editor powered by Kimi Vision and Kimi Code, and a deterministic local geometric editor.

The AI editor recognizes complete or changed sketches, generates themed HTML/CSS, supports direct text editing in the preview, and preserves layout relationships while allowing polished spacing. The geometric editor keeps recognition and component generation local, infers forms, card grids, cards, and heroes from their children, limits automatic navbar and footer roles, absorbs control labels, respects divider boundaries, supports structure and text editing, and can optionally ask Kimi to redesign only the CSS. Both editors can export the current result as a standalone HTML file.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`, then choose AI API or Geometric on the homepage.

Kimi is required for the AI API editor and optional for CSS redesign in the geometric editor. Copy `.env.example` to `.env.local` and set `MOONSHOT_API_KEY`. Without a key, the geometric recognizer and original local CSS remain usable.

## Validate

```bash
npm run build
```
