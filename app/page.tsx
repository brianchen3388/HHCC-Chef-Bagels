import Link from 'next/link';

export default function Home() {
  return (
    <main className="mode-home">
      <nav className="mode-home-nav" aria-label="SketchSite home">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">S</span>
          <span>SketchSite</span>
        </Link>
        <span>Sketch once. Build your way.</span>
      </nav>

      <section className="mode-hero">
        <p className="eyebrow">Wireframe to website</p>
        <h1>Choose how your sketch becomes a site.</h1>
        <p>
          Use Kimi for semantic interpretation and polished HTML/CSS, or use the
          fast local geometric engine for predictable conversion without an AI
          generation request.
        </p>
      </section>

      <section className="mode-grid" aria-label="Generation modes">
        <Link className="mode-card ai" href="/ai">
          <span className="mode-card-index">01</span>
          <div>
            <p className="eyebrow">AI API</p>
            <h2>Kimi generation</h2>
            <p>Vision understands the sketch, then Kimi creates complete HTML and CSS.</p>
          </div>
          <ul>
            <li>Semantic component recognition</li>
            <li>Theme-aware HTML and CSS</li>
            <li>Incremental sketch updates</li>
          </ul>
          <strong>Open AI editor →</strong>
        </Link>

        <Link className="mode-card geometric" href="/geometric">
          <span className="mode-card-index">02</span>
          <div>
            <p className="eyebrow">Geometric</p>
            <h2>Local conversion</h2>
            <p>Geometry becomes a deterministic component tree and local generated code.</p>
          </div>
          <ul>
            <li>Fast local recognition</li>
            <li>Editable structure and text</li>
            <li>Optional Kimi CSS designer</li>
          </ul>
          <strong>Open geometric editor →</strong>
        </Link>
      </section>
    </main>
  );
}
