import { CANVAS_PAGE_RATIO, type GeneratedProjectPage, type WebsiteNode } from './model';

function jsxText(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('{', '&#123;')
    .replaceAll('}', '&#125;');
}

function jsxAttribute(value: string) {
  return jsxText(value).replaceAll('"', '&quot;');
}

function nestedText(node: WebsiteNode) {
  return node.children
    .map((child) => child.content)
    .filter(Boolean)
    .join(' ');
}

function variantClass(node: WebsiteNode, base: string) {
  return node.styleVariant === 'alternate' ? `${base} variant-alternate` : base;
}

function renderRows(
  node: WebsiteNode,
  depth: number,
  insideForm: boolean,
  pageById: Map<string, GeneratedProjectPage>,
): string[] {
  const rows = node.childRows ?? node.children.map((child) => [child.id]);
  if (rows.length === 0) return [];
  const childById = new Map(node.children.map((child) => [child.id, child]));
  const pad = '  '.repeat(depth);
  const lines = [`${pad}<div className="mixed-layout">`];

  rows.forEach((row) => {
    lines.push(`${pad}  <div className="spatial-row${row.length === 1 ? ' single' : ''}">`);
    row.forEach((childId) => {
      const child = childById.get(childId);
      if (child) lines.push(...renderNode(child, depth + 2, insideForm, pageById));
    });
    lines.push(`${pad}  </div>`);
  });
  lines.push(`${pad}</div>`);
  return lines;
}

function renderNode(
  node: WebsiteNode,
  depth: number,
  insideForm: boolean,
  pageById: Map<string, GeneratedProjectPage>,
): string[] {
  const pad = '  '.repeat(depth);
  const content = jsxText(node.content ?? '');
  const childIsInsideForm = insideForm || node.type === 'form';
  const children = renderRows(node, depth + 1, childIsInsideForm, pageById);
  const textStyle = node.fontSize ? ` style={{ fontSize: ${node.fontSize} }}` : '';

  if (node.type === 'navbar') {
    const navbarMidpoint = node.bounds.x + node.bounds.width / 2;
    const orderedChildren = [...node.children].sort(
      (first, second) => first.bounds.x - second.bounds.x || first.bounds.y - second.bounds.y,
    );
    const leftChildren = orderedChildren.filter(
      (child) => child.bounds.x + child.bounds.width / 2 < navbarMidpoint,
    );
    const rightChildren = orderedChildren.filter(
      (child) => child.bounds.x + child.bounds.width / 2 >= navbarMidpoint,
    );
    return [
      `${pad}<nav className="${variantClass(node, 'site-nav')}">`,
      `${pad}  <div className="nav-content nav-left">`,
      ...(content ? [`${pad}    <a className="brand" href="#"${textStyle}>${content}</a>`] : []),
      ...leftChildren.flatMap((child) => renderNode(child, depth + 2, childIsInsideForm, pageById)),
      `${pad}  </div>`,
      `${pad}  <div className="nav-content nav-right">`,
      ...rightChildren.flatMap((child) => renderNode(child, depth + 2, childIsInsideForm, pageById)),
      `${pad}  </div>`,
      `${pad}</nav>`,
    ];
  }
  if (node.type === 'hero') {
    return [`${pad}<section className="${variantClass(node, 'hero')}">`, ...children, `${pad}</section>`];
  }
  if (node.type === 'section') {
    return [`${pad}<section className="${variantClass(node, 'section')}">`, ...children, `${pad}</section>`];
  }
  if (node.type === 'cardGrid') {
    return [
      `${pad}<section className="${variantClass(node, 'features')}">`,
      `${pad}  <div className="card-grid">`,
      ...node.children.flatMap((child) => renderNode(child, depth + 2, childIsInsideForm, pageById)),
      `${pad}  </div>`,
      `${pad}</section>`,
    ];
  }
  if (node.type === 'card') {
    return [
      `${pad}<article className="${variantClass(node, 'card')}">`,
      ...(node.children.length > 0
        ? children
        : [
            `${pad}  <h2>${content || 'Feature'}</h2>`,
            `${pad}  <p>A clear, purposeful section generated from your wireframe.</p>`,
          ]),
      `${pad}</article>`,
    ];
  }
  if (node.type === 'heading') return [`${pad}<h1 className="${variantClass(node, 'site-heading')}"${textStyle}>${content || 'Your headline'}</h1>`];
  if (node.type === 'paragraph') return [`${pad}<p className="${variantClass(node, 'site-paragraph')}"${textStyle}>${content || 'Your supporting copy.'}</p>`];
  if (node.type === 'image') {
    if (node.imageDataUrl) {
      return [
        `${pad}<img className="${variantClass(node, 'site-image imported')}" src="${jsxAttribute(node.imageDataUrl)}" alt="" />`,
      ];
    }
    return [`${pad}<div className="${variantClass(node, 'site-image')}" role="img" aria-label="Website visual" />`];
  }
  if (node.type === 'button') {
    const label = content || jsxText(nestedText(node)) || 'Get started';
    const linkedPage = node.linkPageId ? pageById.get(node.linkPageId) : undefined;
    if (linkedPage) {
      return [`${pad}<a className="${variantClass(node, 'primary-button')}" href="/${jsxAttribute(linkedPage.slug)}"${textStyle}>${label}</a>`];
    }
    return [`${pad}<button className="${variantClass(node, 'primary-button')}" type="${insideForm ? 'submit' : 'button'}"${textStyle}>${label}</button>`];
  }
  if (node.type === 'input') {
    const inputId = node.id.replace(/[^a-zA-Z0-9-]/g, '');
    const rawLabel = nestedText(node) || node.content || 'Your details';
    const label = jsxText(rawLabel);
    return [
      `${pad}<label className="${variantClass(node, 'field')}" htmlFor="${inputId}">`,
      `${pad}  ${label}`,
      `${pad}  <input id="${inputId}" name="${inputId}" placeholder="${jsxAttribute(rawLabel)}" />`,
      `${pad}</label>`,
    ];
  }
  if (node.type === 'form') {
    return [`${pad}<form className="${variantClass(node, 'contact-form')}">`, ...children, `${pad}</form>`];
  }
  if (node.type === 'divider') {
    const orientation = node.orientation ?? (
      node.bounds.width >= node.bounds.height * CANVAS_PAGE_RATIO ? 'horizontal' : 'vertical'
    );
    return [
      `${pad}<div className="${variantClass(node, `divider divider-${orientation}`)}" role="separator" aria-orientation="${orientation}" />`,
    ];
  }
  if (node.type === 'footer') {
    return [
      `${pad}<footer className="${variantClass(node, 'site-footer')}">`,
      ...(node.children.length > 0 ? children : [`${pad}  ${content || '© 2026 Your studio'}`]),
      `${pad}</footer>`,
    ];
  }
  return children;
}

function componentName(page: GeneratedProjectPage, index: number) {
  const cleaned = page.name.replace(/[^a-zA-Z0-9]+/g, ' ').trim();
  const name = cleaned.split(/\s+/).filter(Boolean).map((word) => `${word[0]?.toUpperCase() ?? ''}${word.slice(1)}`).join('');
  return `${name || `Page${index + 1}`}Page`;
}

function staticPageFilenames(pages: GeneratedProjectPage[]) {
  const used = new Set<string>();
  return new Map(pages.map((page, index) => {
    if (index === 0 || page.slug.trim() === '') {
      used.add('index.html');
      return [page.id, 'index.html'];
    }
    const cleaned = page.slug
      .trim()
      .replace(/^\/+|\/+$/g, '')
      .replace(/[^a-zA-Z0-9-_]+/g, '-')
      .replace(/^-+|-+$/g, '') || `page-${index + 1}`;
    let filename = `${cleaned}.html`;
    let suffix = 2;
    while (used.has(filename)) {
      filename = `${cleaned}-${suffix}.html`;
      suffix += 1;
    }
    used.add(filename);
    return [page.id, filename];
  }));
}

function htmlStyle(node: WebsiteNode) {
  return node.fontSize ? ` style="font-size: ${node.fontSize}px"` : '';
}

function renderStaticRows(
  node: WebsiteNode,
  depth: number,
  insideForm: boolean,
  filenameByPageId: Map<string, string>,
): string[] {
  const rows = node.childRows ?? node.children.map((child) => [child.id]);
  if (rows.length === 0) return [];
  const childById = new Map(node.children.map((child) => [child.id, child]));
  const pad = '  '.repeat(depth);
  const lines = [`${pad}<div class="mixed-layout">`];

  rows.forEach((row) => {
    lines.push(`${pad}  <div class="spatial-row${row.length === 1 ? ' single' : ''}">`);
    row.forEach((childId) => {
      const child = childById.get(childId);
      if (child) {
        lines.push(...renderStaticNode(child, depth + 2, insideForm, filenameByPageId));
      }
    });
    lines.push(`${pad}  </div>`);
  });
  lines.push(`${pad}</div>`);
  return lines;
}

function renderStaticNode(
  node: WebsiteNode,
  depth: number,
  insideForm: boolean,
  filenameByPageId: Map<string, string>,
): string[] {
  const pad = '  '.repeat(depth);
  const content = jsxText(node.content ?? '');
  const childIsInsideForm = insideForm || node.type === 'form';
  const children = renderStaticRows(node, depth + 1, childIsInsideForm, filenameByPageId);
  const textStyle = htmlStyle(node);

  if (node.type === 'navbar') {
    const navbarMidpoint = node.bounds.x + node.bounds.width / 2;
    const orderedChildren = [...node.children].sort(
      (first, second) => first.bounds.x - second.bounds.x || first.bounds.y - second.bounds.y,
    );
    const leftChildren = orderedChildren.filter(
      (child) => child.bounds.x + child.bounds.width / 2 < navbarMidpoint,
    );
    const rightChildren = orderedChildren.filter(
      (child) => child.bounds.x + child.bounds.width / 2 >= navbarMidpoint,
    );
    return [
      `${pad}<nav class="${variantClass(node, 'site-nav')}">`,
      `${pad}  <div class="nav-content nav-left">`,
      ...(content ? [`${pad}    <a class="brand" href="./index.html"${textStyle}>${content}</a>`] : []),
      ...leftChildren.flatMap((child) => renderStaticNode(child, depth + 2, childIsInsideForm, filenameByPageId)),
      `${pad}  </div>`,
      `${pad}  <div class="nav-content nav-right">`,
      ...rightChildren.flatMap((child) => renderStaticNode(child, depth + 2, childIsInsideForm, filenameByPageId)),
      `${pad}  </div>`,
      `${pad}</nav>`,
    ];
  }
  if (node.type === 'hero') {
    return [`${pad}<section class="${variantClass(node, 'hero')}">`, ...children, `${pad}</section>`];
  }
  if (node.type === 'section') {
    return [`${pad}<section class="${variantClass(node, 'section')}">`, ...children, `${pad}</section>`];
  }
  if (node.type === 'cardGrid') {
    return [
      `${pad}<section class="${variantClass(node, 'features')}">`,
      `${pad}  <div class="card-grid">`,
      ...node.children.flatMap((child) => renderStaticNode(child, depth + 2, childIsInsideForm, filenameByPageId)),
      `${pad}  </div>`,
      `${pad}</section>`,
    ];
  }
  if (node.type === 'card') {
    return [
      `${pad}<article class="${variantClass(node, 'card')}">`,
      ...(node.children.length > 0
        ? children
        : [
            `${pad}  <h2>${content || 'Feature'}</h2>`,
            `${pad}  <p>A clear, purposeful section generated from your wireframe.</p>`,
          ]),
      `${pad}</article>`,
    ];
  }
  if (node.type === 'heading') {
    return [`${pad}<h1 class="${variantClass(node, 'site-heading')}"${textStyle}>${content || 'Your headline'}</h1>`];
  }
  if (node.type === 'paragraph') {
    return [`${pad}<p class="${variantClass(node, 'site-paragraph')}"${textStyle}>${content || 'Your supporting copy.'}</p>`];
  }
  if (node.type === 'image') {
    if (node.imageDataUrl) {
      return [
        `${pad}<img class="${variantClass(node, 'site-image imported')}" src="${jsxAttribute(node.imageDataUrl)}" alt="">`,
      ];
    }
    return [`${pad}<div class="${variantClass(node, 'site-image')}" role="img" aria-label="Website visual"></div>`];
  }
  if (node.type === 'button') {
    const label = content || jsxText(nestedText(node)) || 'Get started';
    const linkedFilename = node.linkPageId
      ? filenameByPageId.get(node.linkPageId)
      : undefined;
    if (linkedFilename) {
      return [`${pad}<a class="${variantClass(node, 'primary-button')}" href="./${jsxAttribute(linkedFilename)}"${textStyle}>${label}</a>`];
    }
    return [`${pad}<button class="${variantClass(node, 'primary-button')}" type="${insideForm ? 'submit' : 'button'}"${textStyle}>${label}</button>`];
  }
  if (node.type === 'input') {
    const inputId = node.id.replace(/[^a-zA-Z0-9-]/g, '');
    const rawLabel = nestedText(node) || node.content || 'Your details';
    const label = jsxText(rawLabel);
    return [
      `${pad}<label class="${variantClass(node, 'field')}" for="${inputId}">`,
      `${pad}  ${label}`,
      `${pad}  <input id="${inputId}" name="${inputId}" placeholder="${jsxAttribute(rawLabel)}">`,
      `${pad}</label>`,
    ];
  }
  if (node.type === 'form') {
    return [`${pad}<form class="${variantClass(node, 'contact-form')}" action="#">`, ...children, `${pad}</form>`];
  }
  if (node.type === 'divider') {
    const orientation = node.orientation ?? (
      node.bounds.width >= node.bounds.height * CANVAS_PAGE_RATIO ? 'horizontal' : 'vertical'
    );
    return [
      `${pad}<div class="${variantClass(node, `divider divider-${orientation}`)}" role="separator" aria-orientation="${orientation}"></div>`,
    ];
  }
  if (node.type === 'footer') {
    return [
      `${pad}<footer class="${variantClass(node, 'site-footer')}">`,
      ...(node.children.length > 0 ? children : [`${pad}  ${content || '© 2026 Your studio'}`]),
      `${pad}</footer>`,
    ];
  }
  return children;
}

export function generateStaticPages(pages: GeneratedProjectPage[]) {
  const filenameByPageId = staticPageFilenames(pages);
  return pages.map((page) => ({
    filename: filenameByPageId.get(page.id) ?? 'index.html',
    name: page.name,
    bodyHtml: [
      '<main class="site">',
      ...renderStaticRows(page.site.tree, 1, false, filenameByPageId),
      '</main>',
    ].join('\n'),
  }));
}

export function generateReact(pages: GeneratedProjectPage[]) {
  const pageById = new Map(pages.map((page) => [page.id, page]));
  const components = pages.flatMap((page, index) => [
    `export function ${componentName(page, index)}() {`,
    '  return (',
    '    <main className="site">',
    ...renderRows(page.site.tree, 3, false, pageById),
    '    </main>',
    '  );',
    '}',
    '',
  ]);
  const routeEntries = pages.map((page, index) => (
    `  '/${jsxAttribute(page.slug)}': <${componentName(page, index)} />`
  ));
  const homeName = pages[0] ? componentName(pages[0], 0) : 'GeneratedHomePage';

  return [
    "import './generated-site.css';",
    '',
    ...components,
    'const generatedRoutes = {',
    ...routeEntries.map((entry, index) => `${entry}${index < routeEntries.length - 1 ? ',' : ''}`),
    '};',
    '',
    'export default function GeneratedSite({ pathname = \'/\' }) {',
    `  return generatedRoutes[pathname] ?? <${homeName} />;`,
    '}',
    '',
  ].join('\n');
}

export function generateCss() {
  return `:root {
  --ink: #17211b;
  --muted: #637067;
  --accent: #246b47;
  --surface: #f3f6f2;
}

* { box-sizing: border-box; }
body { margin: 0; color: var(--ink); font-family: Inter, sans-serif; }
.site { min-height: 100vh; background: white; }
.site-nav { display: flex; height: 72px; max-height: 72px; align-items: center; gap: 24px; overflow: hidden; padding: 24px 6vw; }
.brand { color: var(--ink); font-weight: 750; text-decoration: none; }
.nav-content { display: flex; align-items: center; gap: 18px; }
.nav-left { justify-content: flex-start; }
.nav-right { justify-content: flex-end; margin-left: auto; }
.hero { display: flex; flex-wrap: wrap; align-items: center; gap: 32px; padding: 80px 6vw 96px; }
.hero h1 { max-width: 12ch; margin: 0; font-size: clamp(44px, 7vw, 88px); line-height: 0.96; }
.hero p, .section p { max-width: 52ch; color: var(--muted); line-height: 1.7; }
.section, .features { padding: 72px 6vw; }
.features { background: var(--surface); }
.card-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px; }
.card { border-radius: 18px; background: white; padding: 28px; }
.card p { color: var(--muted); line-height: 1.6; }
.primary-button { display: inline-flex; min-width: 0; align-items: center; justify-content: center; border: 0; border-radius: 10px; background: var(--accent); color: white; padding: 14px 20px; overflow-wrap: anywhere; text-align: center; text-decoration: none; white-space: normal; }
.site-image { width: 100%; min-width: 0; max-width: 100%; min-height: 0; aspect-ratio: 16 / 9; flex: 1 1 0; overflow: hidden; border-radius: 24px; background: linear-gradient(145deg, #dcecdf, #9fc4ad) center / contain no-repeat; }
.site-image.imported { width: 100%; min-height: 0; background-color: white; background-position: center; background-repeat: no-repeat; background-size: contain; }
.site-nav .site-image { width: min(96px, 18vw); height: 40px; min-height: 0; max-height: 40px; aspect-ratio: auto; flex: 0 1 96px; border-radius: 8px; }
.contact-form { display: grid; width: min(560px, 100%); gap: 10px; padding: 48px 6vw; }
.field { display: grid; gap: 6px; }
input { min-height: 48px; margin-bottom: 12px; border: 1px solid #cdd7cf; border-radius: 9px; padding: 0 14px; }
.divider { flex: 0 0 auto; background: #dce3dd; }
.divider-horizontal { width: 88%; height: 1px; }
.divider-vertical { width: 1px; min-height: 96px; align-self: stretch; }
footer { display: flex; align-items: center; gap: 20px; padding: 32px 6vw; color: var(--muted); }
.mixed-layout { display: flex; width: 100%; flex-direction: column; gap: 18px; }
.spatial-row { display: flex; width: 100%; flex-flow: row nowrap; align-items: center; gap: 24px; }
.spatial-row.single { display: block; }
.spatial-row:not(.single) > * { min-width: 0; max-width: 100%; flex: 1 1 0; }
.spatial-row:not(.single) > .primary-button { width: 100%; }
.site-nav.variant-alternate { background: var(--ink); color: white; }
.site-nav.variant-alternate .brand { color: white; }
.hero.variant-alternate { justify-content: center; background: linear-gradient(135deg, #edf7f0, #d4eadb); text-align: center; }
.section.variant-alternate { margin: 24px 4vw; border: 1px solid #bdd2c4; border-radius: 20px; background: #f7faf7; }
.features.variant-alternate { background: #dfece2; }
.card.variant-alternate { border: 2px solid var(--accent); box-shadow: 0 10px 28px rgb(36 107 71 / 12%); }
.site-heading.variant-alternate { color: var(--accent); font-family: Georgia, serif; font-style: italic; }
.site-paragraph.variant-alternate { border-left: 4px solid var(--accent); background: #f0f6f2; padding: 12px 16px; }
.site-image.variant-alternate { border: 5px solid var(--ink); border-radius: 4px; box-shadow: 8px 8px 0 #a9c7b3; }
.primary-button.variant-alternate { border: 2px solid var(--accent); background: transparent; color: var(--accent); }
.field.variant-alternate { border-radius: 12px; background: #edf5ef; padding: 12px; }
.contact-form.variant-alternate { margin: 24px 6vw; border: 1px solid #bdd2c4; border-radius: 18px; background: white; box-shadow: 0 14px 34px rgb(23 33 27 / 10%); }
.divider.variant-alternate { background: repeating-linear-gradient(90deg, var(--accent) 0 10px, transparent 10px 17px); }
.divider-vertical.variant-alternate { background: repeating-linear-gradient(180deg, var(--accent) 0 10px, transparent 10px 17px); }
.site-footer.variant-alternate { background: var(--ink); color: white; }

@media (max-width: 700px) {
  .site-nav { height: 64px; max-height: 64px; align-items: center; gap: 12px; padding: 16px 4vw; }
  .site-nav .brand { min-width: 0; flex: 0 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .nav-content { min-width: 0; margin-left: auto; flex-direction: row; flex-wrap: nowrap; gap: 8px; overflow-x: auto; }
  .nav-left { margin-left: 0; }
  .site-nav .mixed-layout { width: max-content; flex-direction: row; gap: 8px; }
  .site-nav .spatial-row { width: auto; flex: 0 0 auto; gap: 8px; }
  .site-nav .primary-button { width: auto; max-width: 120px; flex: 0 1 auto; padding: 10px 12px; overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
  .site-nav .site-image { width: min(72px, 20vw); height: 32px; max-height: 32px; flex-basis: 72px; }
  .hero { padding-top: 56px; }
  .card-grid { grid-template-columns: 1fr; }
}`;
}

export function generateLayoutLockCss() {
  return `/* Sketchly structural layout lock: visual themes must not alter geometry. */
* { box-sizing: border-box; }
html, body { margin: 0; }
body { font-size: 16px; line-height: 1.5; }
.site { display: block; width: 100%; max-width: 100%; min-height: 100vh; overflow-x: hidden; }
.site-nav { display: flex; width: 100%; max-width: 100%; height: 72px; max-height: 72px; align-items: center; flex-flow: row nowrap; gap: 24px; overflow: hidden; padding: 24px 6vw; }
.brand { min-width: 0; max-width: 100%; }
.nav-content { display: flex; min-width: 0; max-width: 100%; align-items: center; flex-flow: row nowrap; gap: 18px; }
.nav-left { justify-content: flex-start; }
.nav-right { justify-content: flex-end; margin-left: auto; }
.hero { display: flex; width: 100%; max-width: 100%; flex-wrap: wrap; align-items: center; gap: 32px; padding: 80px 6vw 96px; }
.hero h1 { max-width: 12ch; margin: 0; font-size: clamp(44px, 7vw, 88px); line-height: 0.96; overflow-wrap: anywhere; }
.hero p, .section p { max-width: 52ch; line-height: 1.7; }
.section, .features { width: 100%; max-width: 100%; padding: 72px 6vw; }
.card-grid { display: grid; width: 100%; max-width: 100%; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px; }
.card { min-width: 0; max-width: 100%; padding: 28px; }
.site-heading, .site-paragraph { max-width: 100%; overflow-wrap: anywhere; }
.site-image { width: 100%; min-width: 0; max-width: 100%; min-height: 0; aspect-ratio: 16 / 9; flex: 1 1 0; overflow: hidden; background-position: center; background-repeat: no-repeat; background-size: contain; }
.site-nav .site-image { width: min(96px, 18vw); height: 40px; min-height: 0; max-height: 40px; aspect-ratio: auto; flex: 0 1 96px; }
.primary-button { display: inline-flex; min-width: 0; max-width: 100%; align-items: center; justify-content: center; padding: 14px 20px; overflow-wrap: anywhere; white-space: normal; }
.contact-form { display: grid; width: min(560px, 100%); max-width: 100%; gap: 10px; padding: 48px 6vw; }
.field { display: grid; min-width: 0; max-width: 100%; gap: 6px; }
.field input, input { width: 100%; max-width: 100%; min-height: 48px; margin-bottom: 12px; padding: 0 14px; }
.divider { flex: 0 0 auto; }
.divider-horizontal { width: 88%; height: 1px; }
.divider-vertical { width: 1px; min-height: 96px; align-self: stretch; }
.site-footer { display: flex; width: 100%; max-width: 100%; align-items: center; gap: 20px; padding: 32px 6vw; }
.mixed-layout { display: flex; width: 100%; max-width: 100%; flex-direction: column; gap: 18px; }
.spatial-row { display: flex; width: 100%; max-width: 100%; flex-flow: row nowrap; align-items: center; gap: 24px; }
.spatial-row.single { display: block; }
.spatial-row:not(.single) > * { min-width: 0; max-width: 100%; flex: 1 1 0; }
.spatial-row:not(.single) > .primary-button { width: 100%; }

@media (max-width: 700px) {
  .site-nav { height: 64px; max-height: 64px; gap: 12px; padding: 16px 4vw; }
  .site-nav .brand { min-width: 0; flex: 0 1 auto; overflow: hidden; white-space: nowrap; }
  .nav-content { min-width: 0; margin-left: auto; flex-direction: row; flex-wrap: nowrap; gap: 8px; overflow-x: auto; }
  .nav-left { margin-left: 0; }
  .site-nav .mixed-layout { width: max-content; max-width: none; flex-direction: row; gap: 8px; }
  .site-nav .spatial-row { width: auto; flex: 0 0 auto; gap: 8px; }
  .site-nav .primary-button { width: auto; max-width: 120px; flex: 0 1 auto; padding: 10px 12px; overflow: hidden; font-size: 12px; white-space: nowrap; }
  .site-nav .site-image { width: min(72px, 20vw); height: 32px; max-height: 32px; flex-basis: 72px; }
  .hero { padding-top: 56px; }
  .card-grid { grid-template-columns: 1fr; }
  .spatial-row:not(.single) { flex-wrap: wrap; }
}`;
}
