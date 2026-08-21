const tools = ['Select', 'Pen', 'Erase', 'Frame', 'Text'];

const previewSizes = ['Desktop', 'Tablet', 'Mobile'];

export default function Home() {
  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand" aria-label="SketchSite home">
          <span className="brand-mark" aria-hidden="true">S</span>
          <span>SketchSite</span>
        </div>

        <div className="status" aria-label="Application status">
          <span className="status-dot" aria-hidden="true" />
          AI ready
        </div>

        <nav className="preview-sizes" aria-label="Preview size">
          {previewSizes.map((size, index) => (
            <button
              className={index === 0 ? 'segment active' : 'segment'}
              disabled
              key={size}
              type="button"
            >
              {size}
            </button>
          ))}
        </nav>
      </header>

      <section className="workspace" aria-label="SketchSite workspace">
        <section className="panel sketch-panel" aria-labelledby="sketch-heading">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Input</p>
              <h1 id="sketch-heading">Sketch wireframe</h1>
            </div>
            <span className="panel-meta">Untitled</span>
          </div>

          <div className="drawing-toolbar" aria-label="Drawing tools">
            {tools.map((tool, index) => (
              <button
                className={index === 1 ? 'tool active' : 'tool'}
                disabled
                key={tool}
                type="button"
              >
                <span aria-hidden="true">{tool.slice(0, 1)}</span>
                {tool}
              </button>
            ))}
            <span className="toolbar-spacer" />
            <button className="icon-button" disabled type="button">Undo</button>
            <button className="icon-button" disabled type="button">Redo</button>
          </div>

          <div className="canvas-wrap">
            <div className="canvas-empty">
              <div className="empty-icon" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <h2>Your canvas is ready</h2>
              <p>Draw a navbar, hero, cards, buttons, or a form.</p>
              <button disabled type="button">Load example</button>
            </div>
            <span className="zoom-label">100%</span>
          </div>

          <footer className="panel-footer">
            <span>0 strokes</span>
            <span>Auto-recognize · 500 ms</span>
          </footer>
        </section>

        <section className="panel preview-panel" aria-labelledby="preview-heading">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Output</p>
              <h2 id="preview-heading">Live website</h2>
            </div>
            <div className="view-tabs" aria-label="Output view">
              <button className="active" disabled type="button">Preview</button>
              <button disabled type="button">Structure</button>
              <button disabled type="button">Code</button>
            </div>
          </div>

          <div className="preview-stage">
            <div className="browser-frame">
              <div className="browser-bar" aria-hidden="true">
                <span />
                <span />
                <span />
                <div>your-site.local</div>
              </div>
              <div className="preview-empty">
                <div className="spark" aria-hidden="true">✦</div>
                <h2>Your website will appear here</h2>
                <p>
                  Start sketching on the left. SketchSite will turn your layout
                  into a polished responsive page.
                </p>
              </div>
            </div>
          </div>

          <footer className="panel-footer">
            <span>Modern SaaS</span>
            <span>No elements recognized</span>
          </footer>
        </section>
      </section>

      <aside className="inspector" aria-label="Element inspector">
        <div>
          <p className="eyebrow">Inspector</p>
          <h2>No element selected</h2>
        </div>
        <p>Select a recognized element to edit its content and appearance.</p>
        <button disabled type="button">Recognize now</button>
      </aside>
    </main>
  );
}
