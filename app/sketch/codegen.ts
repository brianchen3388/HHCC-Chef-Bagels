import type { GeneratedWebsite, WebsiteNode } from './model';

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

function renderNode(node: WebsiteNode, depth: number, insideForm = false): string[] {
  const pad = '  '.repeat(depth);
  const content = jsxText(node.content ?? '');
  const childIsInsideForm = insideForm || node.type === 'form';
  const children = node.children.flatMap((child) =>
    renderNode(child, depth + 1, childIsInsideForm),
  );

  if (node.type === 'navbar') {
    return [
      `${pad}<nav className="site-nav">`,
      `${pad}  <a className="brand" href="#">${content || 'Studio'}</a>`,
      `${pad}  <div className="nav-content">`,
      ...node.children.flatMap((child) => renderNode(child, depth + 2, childIsInsideForm)),
      `${pad}  </div>`,
      `${pad}</nav>`,
    ];
  }
  if (node.type === 'hero') {
    return [`${pad}<section className="hero">`, ...children, `${pad}</section>`];
  }
  if (node.type === 'section') {
    return [`${pad}<section className="section">`, ...children, `${pad}</section>`];
  }
  if (node.type === 'cardGrid') {
    return [
      `${pad}<section className="features">`,
      `${pad}  <div className="card-grid">`,
      ...node.children.flatMap((child) => renderNode(child, depth + 2, childIsInsideForm)),
      `${pad}  </div>`,
      `${pad}</section>`,
    ];
  }
  if (node.type === 'card') {
    return [
      `${pad}<article className="card">`,
      ...(node.children.length > 0
        ? children
        : [
            `${pad}  <h2>${content || 'Feature'}</h2>`,
            `${pad}  <p>A clear, purposeful section generated from your wireframe.</p>`,
          ]),
      `${pad}</article>`,
    ];
  }
  if (node.type === 'heading') return [`${pad}<h1>${content || 'Your headline'}</h1>`];
  if (node.type === 'paragraph') return [`${pad}<p>${content || 'Your supporting copy.'}</p>`];
  if (node.type === 'image') {
    return [`${pad}<div className="site-image" role="img" aria-label="Website visual" />`];
  }
  if (node.type === 'button') {
    const label = jsxText(nestedText(node)) || content || 'Get started';
    return [`${pad}<button className="primary-button" type="${insideForm ? 'submit' : 'button'}">${label}</button>`];
  }
  if (node.type === 'input') {
    const inputId = node.id.replace(/[^a-zA-Z0-9-]/g, '');
    const rawLabel = nestedText(node) || node.content || 'Your details';
    const label = jsxText(rawLabel);
    return [
      `${pad}<label htmlFor="${inputId}">${label}</label>`,
      `${pad}<input id="${inputId}" name="${inputId}" placeholder="${jsxAttribute(rawLabel)}" />`,
    ];
  }
  if (node.type === 'form') {
    return [`${pad}<form className="contact-form">`, ...children, `${pad}</form>`];
  }
  if (node.type === 'divider') return [`${pad}<hr />`];
  if (node.type === 'footer') {
    return [
      `${pad}<footer>`,
      ...(node.children.length > 0 ? children : [`${pad}  ${content || '© 2026 Your studio'}`]),
      `${pad}</footer>`,
    ];
  }
  return children;
}

export function generateReact(site: GeneratedWebsite) {
  return [
    "import './generated-site.css';",
    '',
    'export default function GeneratedSite() {',
    '  return (',
    '    <main className="site">',
    ...site.tree.children.flatMap((child) => renderNode(child, 3)),
    '    </main>',
    '  );',
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
.site-nav { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 24px 6vw; }
.brand { color: var(--ink); font-weight: 750; text-decoration: none; }
.nav-content { display: flex; align-items: center; gap: 18px; }
.hero { display: flex; flex-wrap: wrap; align-items: center; gap: 32px; padding: 80px 6vw 96px; }
.hero h1 { max-width: 12ch; margin: 0; font-size: clamp(44px, 7vw, 88px); line-height: 0.96; }
.hero p, .section p { max-width: 52ch; color: var(--muted); line-height: 1.7; }
.section, .features { padding: 72px 6vw; }
.features { background: var(--surface); }
.card-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px; }
.card { border-radius: 18px; background: white; padding: 28px; }
.card p { color: var(--muted); line-height: 1.6; }
.primary-button { display: inline-flex; border: 0; border-radius: 10px; background: var(--accent); color: white; padding: 14px 20px; text-decoration: none; }
.site-image { flex: 1 1 320px; min-height: 300px; border-radius: 24px; background: linear-gradient(145deg, #dcecdf, #9fc4ad); }
.contact-form { display: grid; width: min(560px, 100%); gap: 10px; padding: 48px 6vw; }
input { min-height: 48px; margin-bottom: 12px; border: 1px solid #cdd7cf; border-radius: 9px; padding: 0 14px; }
hr { width: 88%; border: 0; border-top: 1px solid #dce3dd; }
footer { display: flex; align-items: center; gap: 20px; padding: 32px 6vw; color: var(--muted); }

@media (max-width: 700px) {
  .site-nav, .nav-content { align-items: flex-start; flex-direction: column; }
  .hero { padding-top: 56px; }
  .card-grid { grid-template-columns: 1fr; }
}`;
}
