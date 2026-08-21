# HHCC-Chef-Bagels · SketchSite

Our project code for HHCC 2026.

SketchSite is an early interface foundation for a browser-based wireframe-to-website generator.

This version contains a responsive editor with working Select, Pen, Erase, Line, Frame, and Text tools on a vertically scrollable full-page canvas; geometric recognition with confidence overlays, smallest-container nesting, rapid intersecting-stroke grouping, directional layout inference, and horizontal or vertical dividers; an editable semantic structure tree with type, parent, and order controls; flexible nested layouts with multiple card grids; a responsive generated preview; and deterministic React/CSS output. Persistence, advanced canvas editing, and project export are not implemented yet.

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
