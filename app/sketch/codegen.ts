import type { GeneratedWebsite } from './model';

function jsxText(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('{', '&#123;')
    .replaceAll('}', '&#125;');
}

export function generateReact(site: GeneratedWebsite) {
  const lines = [
    "import './generated-site.css';",
    '',
    'export default function GeneratedSite() {',
    '  return (',
    '    <main className="site">',
  ];

  if (site.navbar) {
    lines.push(
      '      <nav className="site-nav">',
      `        <a className="brand" href="#">${jsxText(site.navbar.brand)}</a>`,
      '        <div className="nav-links">',
      ...site.navbar.links.map(
        (link) => `          <a href="#">${jsxText(link)}</a>`,
      ),
      '        </div>',
      '      </nav>',
    );
  }

  if (site.hero) {
    lines.push(
      '      <section className="hero">',
      '        <div className="hero-copy">',
      `          <h1>${jsxText(site.hero.heading)}</h1>`,
      `          <p>${jsxText(site.hero.body)}</p>`,
    );
    if (site.hero.cta) {
      lines.push(`          <a className="primary-button" href="#">${jsxText(site.hero.cta)}</a>`);
    }
    lines.push('        </div>');
    if (site.hero.showImage) {
      lines.push(
        '        <div className="hero-image" role="img" aria-label="Website hero visual" />',
      );
    }
    lines.push('      </section>');
  }

  if (site.cards.length > 0) {
    lines.push(
      '      <section className="features">',
      '        <div className="card-grid">',
      ...site.cards.flatMap((card) => [
        '          <article className="card">',
        `            <h2>${jsxText(card.title)}</h2>`,
        `            <p>${jsxText(card.body)}</p>`,
        '          </article>',
      ]),
      '        </div>',
      '      </section>',
    );
  }

  if (site.form) {
    lines.push(
      '      <section className="contact">',
      '        <form>',
      ...site.form.fields.flatMap((field, index) => [
        `          <label htmlFor="field-${index + 1}">${jsxText(field)}</label>`,
        `          <input id="field-${index + 1}" name="field-${index + 1}" />`,
      ]),
      `          <button type="submit">${jsxText(site.form.button)}</button>`,
      '        </form>',
      '      </section>',
    );
  }

  if (site.footer) {
    lines.push(`      <footer>${jsxText(site.footer.text)}</footer>`);
  }

  lines.push('    </main>', '  );', '}', '');
  return lines.join('\n');
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
.site-nav { display: flex; align-items: center; justify-content: space-between; padding: 24px 6vw; }
.brand { color: var(--ink); font-weight: 750; text-decoration: none; }
.nav-links { display: flex; gap: 24px; }
.nav-links a { color: var(--muted); text-decoration: none; }
.hero { display: grid; grid-template-columns: 1.05fr 0.95fr; align-items: center; gap: 7vw; padding: 80px 6vw 96px; }
.hero h1 { max-width: 12ch; margin: 0; font-size: clamp(44px, 7vw, 88px); line-height: 0.96; }
.hero p { max-width: 52ch; color: var(--muted); line-height: 1.7; }
.primary-button, form button { display: inline-block; border: 0; border-radius: 10px; background: var(--accent); color: white; padding: 14px 20px; text-decoration: none; }
.hero-image { min-height: 360px; border-radius: 24px; background: linear-gradient(145deg, #dcecdf, #9fc4ad); }
.features, .contact { padding: 72px 6vw; background: var(--surface); }
.card-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
.card { border-radius: 18px; background: white; padding: 28px; }
.card p { color: var(--muted); line-height: 1.6; }
form { display: grid; max-width: 560px; gap: 10px; }
input { min-height: 48px; margin-bottom: 12px; border: 1px solid #cdd7cf; border-radius: 9px; padding: 0 14px; }
footer { padding: 32px 6vw; color: var(--muted); }

@media (max-width: 700px) {
  .nav-links { display: none; }
  .hero { grid-template-columns: 1fr; padding-top: 56px; }
  .hero-image { min-height: 260px; }
  .card-grid { grid-template-columns: 1fr; }
}`;
}
