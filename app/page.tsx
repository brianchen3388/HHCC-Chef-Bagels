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
          Choose a polished AI-generated result or a fast, direct workflow where
          every canvas change immediately shapes the final structure.
        </p>
      </section>

      <section className="mode-grid" aria-label="Generation modes">
        <Link className="mode-card ai" href="/ai">
          <span className="mode-card-index">01</span>
          <div>
            <p className="eyebrow">AI-powered</p>
            <h2>Generative Mode</h2>
            <p>
              Takes longer while Kimi interprets your intent, but produces a more
              polished, expressive website.
            </p>
          </div>
          <ul>
            <li>Semantic component recognition</li>
            <li>Theme-aware HTML and CSS</li>
            <li>Incremental sketch updates</li>
          </ul>
          <strong>Open Generative Mode →</strong>
        </Link>

        <Link className="mode-card geometric" href="/geometric">
          <span className="mode-card-index">02</span>
          <div>
            <p className="eyebrow">Instant local conversion</p>
            <h2>Realtime Mode</h2>
            <p>
              See how every canvas move affects the output and keep direct control
              over component structure and placement.
            </p>
          </div>
          <ul>
            <li>Fast local recognition</li>
            <li>Editable structure and text</li>
            <li>Optional Kimi CSS designer</li>
          </ul>
          <strong>Open Realtime Mode →</strong>
        </Link>
      </section>
    </main>
  );
}
