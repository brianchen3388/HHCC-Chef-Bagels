# HHCC-Chef-Bagels · SketchSite

Our project code for HHCC 2026.

SketchSite is an early interface foundation for a browser-based wireframe-to-website generator.

This version contains a responsive editor with working Select, Pen, Erase, Line, Frame, and Text tools on a vertically scrollable full-page canvas; deterministic geometric recognition with confidence overlays, squiggle-to-text detection, smallest-container nesting, rapid intersecting-stroke grouping, same-parent rectangle-overlap pairing, stable top-down/left-right ordering, contextual form controls, and horizontal or vertical dividers; an editable semantic structure tree with type, parent, and order controls; flexible nested layouts with multiple card grids; textless-by-default navbars whose children are divided into left- and right-aligned groups; multi-page wireframes with configurable button links; live preview editing for text, navbar names, font size, per-element style variants, and unmodified image replacement; compact mobile navbars and responsive same-line element sizing; and multi-page React output. The Code view includes a design brief input that asks Kimi to create and apply a complete CSS file covering every supported component, including components absent from the current page. If Kimi is unavailable, the original CSS remains active. Persistence, advanced canvas editing, and project export are not implemented yet.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Kimi is optional. Copy `.env.example` to `.env.local` and set `MOONSHOT_API_KEY` to enable design-prompt CSS generation. Kimi is not used for recognition; without a key, the deterministic recognizer and original CSS remain fully usable.

## Validate

```bash
npm run build
```
