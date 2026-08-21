# HHCC-Chef-Bagels · SketchSite

Our project code for HHCC 2026.

SketchSite is an early interface foundation for a browser-based wireframe-to-website generator.

This version contains a responsive editor with working Select, Pen, Erase, Line, Frame, and Text tools on a vertically scrollable full-page canvas; geometric recognition with confidence overlays, squiggle-to-text detection, smallest-container nesting, rapid intersecting-stroke grouping, pairwise mixed-row layout inference, contextual form controls, and horizontal or vertical dividers; an editable semantic structure tree with type, parent, and order controls; flexible nested layouts with multiple card grids; multi-page wireframes with configurable button links; live preview editing for text, navbar names, font size, per-element style variants, and unmodified image replacement; compact mobile navbars and responsive same-line element sizing; and deterministic multi-page React/CSS output. Persistence, advanced canvas editing, and project export are not implemented yet.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Validate

```bash
npm run build
```
