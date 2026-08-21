'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import DrawingWorkspace from './DrawingWorkspace';
import { generateCss, generateReact } from './sketch/codegen';
import type {
  CanvasItem,
  GeneratedWebsite,
  RecognizedPrimitive,
  StructureOverrides,
  StructureOverrideType,
  WebsiteNode,
} from './sketch/model';
import { inferWebsite, recognizeCanvas } from './sketch/recognition';

type PreviewSize = 'desktop' | 'tablet' | 'mobile';
type OutputView = 'preview' | 'structure' | 'code';
type CodeView = 'react' | 'css';
type RecognitionStatus = 'idle' | 'analyzing' | 'ready';

const previewSizes: Array<{ id: PreviewSize; label: string }> = [
  { id: 'desktop', label: 'Desktop' },
  { id: 'tablet', label: 'Tablet' },
  { id: 'mobile', label: 'Mobile' },
];

const outputViews: Array<{ id: OutputView; label: string }> = [
  { id: 'preview', label: 'Preview' },
  { id: 'structure', label: 'Structure' },
  { id: 'code', label: 'Code' },
];

const correctionTypes: Array<{ value: StructureOverrideType; label: string }> = [
  { value: 'navbar', label: 'Navbar' },
  { value: 'hero', label: 'Hero section' },
  { value: 'card', label: 'Card' },
  { value: 'heading', label: 'Heading' },
  { value: 'paragraph', label: 'Paragraph' },
  { value: 'image', label: 'Image' },
  { value: 'button', label: 'Button' },
  { value: 'input', label: 'Input' },
  { value: 'form', label: 'Form' },
  { value: 'footer', label: 'Footer' },
];

function GeneratedPreview({ site }: { site: GeneratedWebsite }) {
  const hasContent = site.tree.children.length > 0;

  if (!hasContent) {
    return (
      <div className="preview-empty">
        <div className="spark" aria-hidden="true">✦</div>
        <h2>Your website will appear here</h2>
        <p>
          Draw a frame, text line, button, input, or image placeholder to start
          generating a page.
        </p>
      </div>
    );
  }

  return (
    <div className="generated-site-preview">
      {site.navbar && (
        <nav className="generated-nav">
          <strong>{site.navbar.brand}</strong>
          <div>
            {site.navbar.links.map((link) => (
              <a href="#generated-content" key={link}>{link}</a>
            ))}
          </div>
          <button aria-label="Open menu" type="button">Menu</button>
        </nav>
      )}

      {site.hero && (
        <section className="generated-hero" id="generated-content">
          <div>
            <p className="generated-kicker">Made from your sketch</p>
            <h1>{site.hero.heading}</h1>
            <p>{site.hero.body}</p>
            {site.hero.cta && <a href="#generated-form">{site.hero.cta}</a>}
          </div>
          {site.hero.showImage && (
            <div
              aria-label="Generated hero visual placeholder"
              className="generated-image"
              role="img"
            >
              <span>Image</span>
            </div>
          )}
        </section>
      )}

      {site.cards.length > 0 && (
        <section className="generated-features">
          <div className="generated-card-grid">
            {site.cards.map((card, index) => (
              <article key={`${card.title}-${index}`}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <h2>{card.title}</h2>
                <p>{card.body}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {site.form && (
        <section className="generated-form-section" id="generated-form">
          <div>
            <p className="generated-kicker">Get in touch</p>
            <h2>Let&apos;s build something clear.</h2>
          </div>
          <form onSubmit={(event) => event.preventDefault()}>
            {site.form.fields.map((field, index) => (
              <label key={`${field}-${index}`}>
                {field}
                <input name={`field-${index + 1}`} />
              </label>
            ))}
            <button type="submit">{site.form.button}</button>
          </form>
        </section>
      )}

      {site.footer && <footer>{site.footer.text}</footer>}
    </div>
  );
}

function StructureBranch({
  node,
  onSelect,
  overrides,
  selectedSourceIds,
}: {
  node: WebsiteNode;
  onSelect: (node: WebsiteNode) => void;
  overrides: StructureOverrides;
  selectedSourceIds: string[];
}) {
  const editable = node.type !== 'page' && node.sourcePrimitiveIds.length > 0;
  const manuallyCorrected = node.sourcePrimitiveIds.some((id) => overrides[id]);
  const selected =
    editable &&
    selectedSourceIds.length === node.sourcePrimitiveIds.length &&
    selectedSourceIds.every((id) => node.sourcePrimitiveIds.includes(id));

  return (
    <li>
      <button
        aria-pressed={selected}
        className={selected ? 'structure-node selected' : 'structure-node'}
        disabled={!editable}
        onClick={() => editable && onSelect(node)}
        type="button"
      >
        <span>{node.type}</span>
        <small>{manuallyCorrected ? 'Manual' : `${Math.round(node.confidence * 100)}%`}</small>
      </button>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <StructureBranch
              key={child.id}
              node={child}
              onSelect={onSelect}
              overrides={overrides}
              selectedSourceIds={selectedSourceIds}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function findStructureNode(node: WebsiteNode, sourceIds: string[]): WebsiteNode | null {
  for (const child of node.children) {
    const match = findStructureNode(child, sourceIds);
    if (match) return match;
  }

  const sameSources =
    node.type !== 'page' &&
    sourceIds.length === node.sourcePrimitiveIds.length &&
    sourceIds.every((id) => node.sourcePrimitiveIds.includes(id));
  return sameSources ? node : null;
}

type OutputPanelProps = {
  codeView: CodeView;
  copiedLabel: string;
  cssCode: string;
  outputView: OutputView;
  previewSize: PreviewSize;
  primitives: RecognizedPrimitive[];
  reactCode: string;
  setCodeView: (view: CodeView) => void;
  setOutputView: (view: OutputView) => void;
  site: GeneratedWebsite;
  onCopy: () => void;
  onStructureOverride: (sourceIds: string[], type: StructureOverrideType | 'automatic') => void;
  overrides: StructureOverrides;
};

function OutputPanel({
  codeView,
  copiedLabel,
  cssCode,
  onCopy,
  onStructureOverride,
  outputView,
  previewSize,
  primitives,
  overrides,
  reactCode,
  setCodeView,
  setOutputView,
  site,
}: OutputPanelProps) {
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const selectedStructureNode = findStructureNode(site.tree, selectedSourceIds);
  const selectedOverride = selectedStructureNode?.sourcePrimitiveIds
    .map((id) => overrides[id])
    .find(Boolean);

  return (
    <section className="panel preview-panel" aria-labelledby="preview-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Output</p>
          <h2 id="preview-heading">Live website</h2>
        </div>
        <div className="view-tabs" aria-label="Output view">
          {outputViews.map((view) => (
            <button
              aria-pressed={outputView === view.id}
              className={outputView === view.id ? 'active' : ''}
              key={view.id}
              onClick={() => setOutputView(view.id)}
              type="button"
            >
              {view.label}
            </button>
          ))}
        </div>
      </div>

      {outputView === 'preview' && (
        <div className="preview-stage">
          <div className={`preview-viewport ${previewSize}`}>
            <div className="browser-frame">
              <div className="browser-bar" aria-hidden="true">
                <span />
                <span />
                <span />
                <div>your-site.local</div>
              </div>
              <GeneratedPreview site={site} />
            </div>
          </div>
        </div>
      )}

      {outputView === 'structure' && (
        <div className="structure-stage">
          {site.tree.children.length > 0 ? (
            <div className="structure-layout">
              <div className="structure-editor">
                <div>
                  <p className="eyebrow">Selected element</p>
                  <h3>{selectedStructureNode ? selectedStructureNode.type : 'Choose an element'}</h3>
                  <p>
                    {selectedStructureNode
                      ? 'Change this element when the automatic guess is not right.'
                      : 'Click any element in the tree to correct its type.'}
                  </p>
                </div>
                <label>
                  Element type
                  <select
                    disabled={!selectedStructureNode}
                    onChange={(event) => {
                      if (!selectedStructureNode) return;
                      onStructureOverride(
                        selectedStructureNode.sourcePrimitiveIds,
                        event.target.value as StructureOverrideType | 'automatic',
                      );
                    }}
                    value={selectedOverride ?? 'automatic'}
                  >
                    <option value="automatic">Automatic ({selectedStructureNode?.type ?? 'detected type'})</option>
                    {correctionTypes.map((type) => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </label>
              </div>
              <ul className="structure-tree">
                <StructureBranch
                  node={site.tree}
                  onSelect={(node) => setSelectedSourceIds(node.sourcePrimitiveIds)}
                  overrides={overrides}
                  selectedSourceIds={selectedSourceIds}
                />
              </ul>
            </div>
          ) : (
            <div className="preview-empty compact">
              <h2>No structure yet</h2>
              <p>Recognized sections will appear here as a semantic tree.</p>
            </div>
          )}
        </div>
      )}

      {outputView === 'code' && (
        <div className="code-stage">
          <div className="code-toolbar">
            <div>
              <button
                className={codeView === 'react' ? 'active' : ''}
                onClick={() => setCodeView('react')}
                type="button"
              >
                React
              </button>
              <button
                className={codeView === 'css' ? 'active' : ''}
                onClick={() => setCodeView('css')}
                type="button"
              >
                CSS
              </button>
            </div>
            <button disabled={site.tree.children.length === 0} onClick={onCopy} type="button">
              {copiedLabel}
            </button>
          </div>
          <pre>
            <code>{codeView === 'react' ? reactCode : cssCode}</code>
          </pre>
        </div>
      )}

      <footer className="panel-footer">
        <span>Modern SaaS</span>
        <span>
          {primitives.length} {primitives.length === 1 ? 'element' : 'elements'} recognized
        </span>
      </footer>
    </section>
  );
}

export default function SketchSiteApp() {
  const [canvasItems, setCanvasItems] = useState<CanvasItem[]>([]);
  const [primitives, setPrimitives] = useState<RecognizedPrimitive[]>([]);
  const [structureOverrides, setStructureOverrides] = useState<StructureOverrides>({});
  const [recognitionStatus, setRecognitionStatus] =
    useState<RecognitionStatus>('idle');
  const [previewSize, setPreviewSize] = useState<PreviewSize>('desktop');
  const [outputView, setOutputView] = useState<OutputView>('preview');
  const [codeView, setCodeView] = useState<CodeView>('react');
  const [copiedLabel, setCopiedLabel] = useState('Copy code');
  const recognitionRevision = useRef(0);

  useEffect(() => {
    const revision = recognitionRevision.current + 1;
    recognitionRevision.current = revision;

    if (canvasItems.length === 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      const result = recognizeCanvas(canvasItems);
      if (recognitionRevision.current === revision) {
        setPrimitives(result);
        setRecognitionStatus('ready');
      }
    }, 500);

    return () => window.clearTimeout(timer);
  }, [canvasItems]);

  const site = useMemo(
    () => inferWebsite(primitives, structureOverrides),
    [primitives, structureOverrides],
  );
  const reactCode = useMemo(() => generateReact(site), [site]);
  const cssCode = useMemo(() => generateCss(), []);

  function handleCanvasItemsChange(nextItems: CanvasItem[]) {
    setCanvasItems(nextItems);
    setRecognitionStatus(nextItems.length > 0 ? 'analyzing' : 'idle');
    if (nextItems.length === 0) {
      recognitionRevision.current += 1;
      setPrimitives([]);
      setStructureOverrides({});
    }
  }

  function handleStructureOverride(
    sourceIds: string[],
    type: StructureOverrideType | 'automatic',
  ) {
    setStructureOverrides((current) => {
      const next = { ...current };
      sourceIds.forEach((sourceId) => {
        if (type === 'automatic') {
          delete next[sourceId];
        } else {
          next[sourceId] = type;
        }
      });
      return next;
    });
  }

  function recognizeNow() {
    recognitionRevision.current += 1;
    setPrimitives(recognizeCanvas(canvasItems));
    setRecognitionStatus(canvasItems.length > 0 ? 'ready' : 'idle');
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(codeView === 'react' ? reactCode : cssCode);
      setCopiedLabel('Copied');
      window.setTimeout(() => setCopiedLabel('Copy code'), 1400);
    } catch {
      setCopiedLabel('Copy failed');
    }
  }

  const confidentCount = primitives.filter(
    (primitive) => primitive.confidence >= 0.75,
  ).length;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand" aria-label="SketchSite home">
          <span className="brand-mark" aria-hidden="true">S</span>
          <span>SketchSite</span>
        </div>

        <div className={`status ${recognitionStatus}`} aria-live="polite">
          <span className="status-dot" aria-hidden="true" />
          {recognitionStatus === 'analyzing'
            ? 'Analyzing sketch'
            : recognitionStatus === 'ready'
              ? 'Recognition ready'
              : 'Canvas ready'}
        </div>

        <nav className="preview-sizes" aria-label="Preview size">
          {previewSizes.map((size) => (
            <button
              aria-pressed={previewSize === size.id}
              className={previewSize === size.id ? 'segment active' : 'segment'}
              key={size.id}
              onClick={() => setPreviewSize(size.id)}
              type="button"
            >
              {size.label}
            </button>
          ))}
        </nav>
      </header>

      <section className="workspace" aria-label="SketchSite workspace">
        <DrawingWorkspace
          onItemsChange={handleCanvasItemsChange}
          recognizedPrimitives={primitives}
        />
        <OutputPanel
          codeView={codeView}
          copiedLabel={copiedLabel}
          cssCode={cssCode}
          onCopy={copyCode}
          onStructureOverride={handleStructureOverride}
          outputView={outputView}
          previewSize={previewSize}
          primitives={primitives}
          overrides={structureOverrides}
          reactCode={reactCode}
          setCodeView={setCodeView}
          setOutputView={setOutputView}
          site={site}
        />
      </section>

      <aside className="inspector" aria-label="Recognition summary">
        <div>
          <p className="eyebrow">Recognition</p>
          <h2>
            {primitives.length > 0
              ? `${primitives.length} elements found`
              : 'Nothing recognized yet'}
          </h2>
        </div>
        <p>
          {primitives.length > 0
            ? `${confidentCount} confident · ${primitives.length - confidentCount} need review`
            : 'Draw a few website elements, then pause for automatic recognition.'}
        </p>
        <button disabled={canvasItems.length === 0} onClick={recognizeNow} type="button">
          Recognize now
        </button>
      </aside>
    </main>
  );
}
