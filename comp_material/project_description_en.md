# Sketchly: Dual-Mode Wireframe-to-Website Generation

## 1. Project Overview

Sketchly is a browser-based prototype that converts a digital wireframe into an editable, previewable, and exportable static website. The current `main` branch provides two independent conversion pipelines over a shared drawing interface: Generative Mode uses Kimi models for semantic recognition and HTML/CSS generation, while Realtime Mode uses local geometry and deterministic code generation. Both modes preserve the wireframe's component hierarchy and relative spatial relationships while allowing visual refinement.

## 2. Problem, Users, and Value

## 3. Solution and Technical Design Decisions

### 3.1 Two conversion pipelines

| Mode | Recognition | Code generation | Main trade-off |
| --- | --- | --- | --- |
| Generative Mode | Kimi Vision converts the rendered canvas into a validated component scene or delta | Kimi Code produces HTML and CSS under a spatial layout contract | Higher semantic and stylistic flexibility, with API latency and model dependence |
| Realtime Mode | Local stroke grouping, geometry, containment, and semantic heuristics | Deterministic React, HTML, and CSS generation | Immediate and structurally controllable, with less semantic inference |

The modes remain separate because they optimize different constraints. They share drawing, preview, editing, responsive viewport controls, and export behavior without forcing one recognition method into the other.

### 3.2 Normalized canvas model

Drawing operations are stored as structured items rather than only as pixels. Items include their tool type, normalized points, timestamps, pressure where available, and text or frame data. This representation supports undo, redo, selection, movement, erasing, local geometric analysis, and image rendering for the AI pipeline.

### 3.3 Structure before styling

Both pipelines separate structural interpretation from visual styling. Component identity, hierarchy, order, and relative placement are established first. Styling can then change colors, typography, borders, shadows, margins, padding, and component size without reversing relationships such as left/right placement or moving sidebar children above the main content.

## 4. Implemented Product Modules

### 4.1 Shared workspace

- Freehand pen, straight line, frame, text, selection/movement, and eraser tools.
- Undo, redo, clear, and canvas navigation controls.
- Preview, structure, and code views.
- Desktop, tablet, and mobile preview sizes.
- Direct text editing through stable component identifiers.
- ZIP export with static pages, CSS, bundled font files, licence information, and a README.

### 4.2 Generative Mode

- Exports the digital canvas as a PNG data URL.
- Recognizes a complete component scene on the first generation.
- Compares the previous and current sketches on later generations.
- Produces explicit `added`, `updated`, and `deleted` component operations.
- Supports user-provided theme and style instructions.
- Preserves the previous page when no structural or style change is detected.
- Persists the wireframe and generated output in browser local storage.

### 4.3 Realtime Mode

- Recognizes components locally without requiring an API call.
- Updates the inferred structure as the canvas changes.
- Allows component type overrides, reparenting, and sibling reordering.
- Supports editable text, font size, style variants, images, buttons, and linked pages.
- Generates both React source and static HTML/CSS.
- Can optionally ask Kimi to redesign only the visual CSS.

## 5. System Architecture and Data Flow

### 5.1 Generative Mode

```text
Canvas items
    -> SVG/PNG rendering
    -> POST /api/recognize
    -> Kimi Vision structured output
    -> ComponentScene or ComponentDelta validation
    -> POST /api/generate
    -> spatial layout contract + Kimi Code
    -> GeneratedPage validation
    -> sanitised iframe preview
    -> editing / persistence / ZIP export
```

### 5.2 Realtime Mode

```text
Canvas items
    -> local stroke grouping and geometric features
    -> primitive component candidates
    -> containment and semantic inference
    -> editable website tree
    -> deterministic React and HTML/CSS generation
    -> optional visual-only Kimi CSS pass
    -> preview / editing / multi-page ZIP export
```

### 5.3 Implementation map

| Area | Current implementation |
| --- | --- |
| Mode selection | `app/page.tsx`, with `/ai` and `/geometric` routes |
| Generative workspace | `app/ai/page.tsx`, `app/ai/AiDrawingWorkspace.tsx`, and related output components |
| AI recognition endpoint | `app/api/recognize/route.ts` |
| AI generation endpoint | `app/api/generate/route.ts` |
| Shared AI contracts | `lib/contracts.ts` |
| Kimi transport and retries | `lib/kimi.ts` |
| Realtime recognition | `app/sketch/recognition.ts` |
| Realtime code generation | `app/sketch/codegen.ts` |
| Optional CSS assistance | `app/sketch/kimi-assist.ts` and `app/api/kimi-assist/route.ts` |
| ZIP export | `app/export-html.ts` and mode-specific export integration |

## 6. Core Technical Implementation

### 6.1 Strict AI data contracts

Generative recognition does not pass an unstructured paragraph into the code model. Kimi Vision must return a `ComponentScene` or `ComponentDelta` matching a strict JSON schema. Supported component types include page, navigation, header, hero, section, container, heading, text, image, button, form controls, card, grid, list, divider, footer, and unknown.

Runtime validation rejects unexpected keys, invalid types, out-of-range coordinates, duplicate identifiers, missing parents, containment cycles, and invalid delta operations. Component alternatives and confidence values are retained so uncertain recognition remains explicit.

### 6.2 Incremental sketch comparison

After the first generation, the recognition endpoint receives the previous image, current image, and previous scene. The model reports only additions, updates, and deletions while keeping stable identifiers. Deleted parent components are checked as a cascade, and change identifiers must remain consistent with the previous scene.

The generation endpoint applies only the delta unless the user requests a complete restyle. If every previous non-page component is deleted and new components are added, the client treats the sketch as a new topic and requests a full generation instead of preserving the old design.

### 6.3 Spatial layout contract

Before calling Kimi Code, the server derives parent-child relationships and horizontal or vertical spatial bands from normalized bounds. The prompt permits reasonable changes to size, padding, margin, and gap, but requires containment and relative direction to remain intact. Generated elements use `data-component-id` attributes so later updates and direct text editing can target the same logical component.

### 6.4 Local geometric recognition

Realtime Mode groups intersecting strokes drawn within a short time window and computes bounds, point-to-segment distance, segment intersection, path closure, direction changes, and path complexity. These measurements distinguish likely frames, dividers, freehand text, and image placeholders.

Frames with internal diagonal strokes are treated as likely images. Compact framed labels can become buttons, shallow wide frames can become inputs, and remaining frames become containers. Explicit canvas text receives the highest local confidence. The recognizer then uses containment, relative position, repeated dimensions, and neighbouring components to infer navigation bars, heroes, sections, cards, card grids, forms, and footers.

Semantic inference occurs before final sibling layout. Stacked paragraph strokes can be merged, contained labels can be absorbed by buttons or inputs, and row grouping uses overlap, distance, dividers, and manual order overrides. The resulting tree records vertical, horizontal, mixed, or grid layout information.

### 6.5 Deterministic website generation

The Realtime generator converts the inferred tree into semantic elements such as `nav`, `section`, `article`, headings, paragraphs, images, labels, inputs, forms, buttons, links, dividers, and footers. Text and attributes are escaped before insertion. Multi-page buttons resolve to unique, safe relative filenames.

The generator produces React source for inspection and static HTML/CSS for preview and export. A local structural stylesheet establishes responsive layout independently of any AI-generated visual theme.

### 6.6 Visual-only AI CSS

Realtime Mode can send the current nested structure, a limited text sample, the original stylesheet, and the user's design brief to Kimi. The response is checked against a required selector catalogue. Protected layout properties—including display, grid, flex, positioning, dimensions, spacing, overflow, and font size—are removed from model CSS, then the local layout lock is appended again. This keeps Kimi responsible for visual treatment rather than structure.

### 6.7 Preview isolation and failure handling

Generative HTML is filtered through an allow-list of tags and attributes. Scripts, external assets, external URLs, form submission, and interactive controls are removed or disabled. The preview uses a restrictive Content Security Policy and a sandboxed iframe.

Kimi requests are server-side, accept only approved Moonshot HTTPS hosts, and map authentication, rate-limit, timeout, truncation, and invalid-output failures into controlled responses. Empty, truncated, or schema-invalid model output can be retried with a larger token allowance. Client request sequencing prevents an older response from overwriting a newer generation.

### 6.8 Export pipeline

Exports are assembled with JSZip. The archive contains `index.html`, shared CSS, any linked static pages, the bundled Bukhari font, its licence, and a README. Generated page links are relative, so the exported site can run without the Sketchly application or an API connection.

## 7. Version History

Git records commit timestamps, not branch creation timestamps. The branch timeline below is therefore inferred from the shared base and the first unique commit reachable from each development branch. Times use UTC+08:00.

| Time | Branch or phase | Technical milestone |
| --- | --- | --- |
| 21 Aug, 22:17–23:42 | Shared history | Initial interface, freehand drawing, and canvas tools through [`b9ec44f`](https://github.com/brianchen3388/HHCC-Chef-Bagels/commit/b9ec44f) |
| 22 Aug, 00:23 | `codex/kimi-css-designer` lineage | First unique Realtime commit, [`c0340c1`](https://github.com/brianchen3388/HHCC-Chef-Bagels/commit/c0340c1), added local wireframe recognition and code generation |
| 22 Aug, 00:35–03:31 | Realtime lineage | Structure overrides, nesting, mixed layouts, form inference, linked pages, image tracing, preview themes, and image replacement |
| 22 Aug, 02:01 | `feature/recognition` lineage | First unique Generative commit, [`ce16d84`](https://github.com/brianchen3388/HHCC-Chef-Bagels/commit/ce16d84), added Kimi sketch recognition and website generation |
| 22 Aug, 02:01–13:02 | Parallel development | Generative delta editing, JSON safety, richer generation, and custom style work overlapped with continuing Realtime development |
| 22 Aug, 09:16 | Realtime integration lineage | [`f2ccbe5`](https://github.com/brianchen3388/HHCC-Chef-Bagels/commit/f2ccbe5) merged Generative work into the integration lineage before Kimi-assisted recognition/CSS hardening |
| 22 Aug, 13:29 | Realtime lineage | [`940824f`](https://github.com/brianchen3388/HHCC-Chef-Bagels/commit/940824f) completed layout preservation for Kimi CSS themes |
| 22 Aug, 14:41 | `main` | [`0884b67`](https://github.com/brianchen3388/HHCC-Chef-Bagels/commit/0884b67) introduced the unified homepage and both generation modes |
| 22 Aug, 15:03–17:44 | `main` | Scroll fixes, semantic-container ordering, Sketchly branding, export access, linked-page ZIP export, and bundled export styles/fonts |

The evidence shows that the Realtime lineage's first unique commit predates the Generative lineage's first unique commit by approximately 1 hour 38 minutes. The two lineages then developed concurrently; later merges mean their final branch histories are no longer completely isolated. Full histories are available for [`feature/recognition`](https://github.com/brianchen3388/HHCC-Chef-Bagels/commits/feature/recognition/), [`codex/kimi-css-designer`](https://github.com/brianchen3388/HHCC-Chef-Bagels/commits/codex/kimi-css-designer/), and [`main`](https://github.com/brianchen3388/HHCC-Chef-Bagels/commits/main/).

## 8. Technology Stack and Runtime

| Layer | Technology |
| --- | --- |
| Application | Next.js 16, React 19, TypeScript |
| Styling | CSS and Tailwind CSS tooling |
| AI provider | Moonshot Kimi API |
| Default vision model | `kimi-k3` |
| Default code model | `kimi-k2.7-code-highspeed` |
| Export | JSZip |
| Client persistence | Web Storage (`localStorage`) |

Required environment variables are documented in `.env.example`. `MOONSHOT_API_KEY` is required for AI features; the base URL and both model names are configurable. The API key is read only by server routes and is not intentionally exposed to browser code.

The application starts with `npm install` followed by `npm run dev`. Production compilation uses `npm run build`. The current routes are `/`, `/ai`, `/geometric`, `/api/recognize`, `/api/generate`, and `/api/kimi-assist`.

## 9. Verification and Current Status

- `npm run lint`: passed on the current snapshot.
- `npm run build`: passed after installing the lockfile dependencies.
- Production routes compiled successfully for the homepage, both modes, and all three API endpoints.
- The repository currently has no dedicated automated unit or integration test suite.
- No live Kimi API generation was performed during this documentation pass.
- `npm audit --omit=dev` currently reports three high-severity production dependency advisories involving the installed Next.js version and transitive PostCSS and Sharp packages. A dependency upgrade must be tested before deployment.

## 10. Practical and Social Value

## 11. Technical Limitations and Future Work

1. Generative Mode depends on a valid Moonshot API key, network access, model availability, and model latency.
2. Realtime semantic inference is heuristic and can misclassify ambiguous shapes or dense overlapping strokes.
3. Generated websites are static HTML/CSS prototypes; application logic, databases, authentication, and backend actions are outside the current generator.
4. The Generative drawing surface exports a tall canvas while the recognition schema and prompt still describe a `1000 x 1000` canvas. Coordinates are normalized, but the metadata should be made consistent.
5. The project needs automated contract, recognizer, delta-update, sanitisation, export, and end-to-end tests.
6. The dependency advisories reported by `npm audit` should be resolved and the application rebuilt and regression-tested.
7. Public deployment would require authentication, per-user rate limits, request quotas, and secret-management review for the AI endpoints.
8. Recognition accuracy and latency have not yet been measured against a labelled benchmark set.

## 12. Team Contributions and AI-Use Disclosure

### 12.1 Team Contributions

### 12.2 Runtime AI Use

Generative Mode uses Kimi Vision to convert canvas images into structured component scenes or deltas and Kimi Code to convert validated structure into HTML/CSS. Realtime Mode performs recognition and base code generation locally; Kimi is optional and limited to visual CSS redesign. Model output is treated as untrusted input and is validated, constrained, or sanitised before use.

### 12.3 Development AI Tools

## 13. Current Technical Conclusion

The current prototype implements two complete wireframe-to-static-site paths with different latency, control, and interpretation characteristics. Their shared output model enables preview, structure inspection, direct content editing, responsive display, and offline export while keeping AI-generated structure separate from locally enforced structural constraints.
