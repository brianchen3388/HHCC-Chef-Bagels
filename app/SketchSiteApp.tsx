'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import DrawingWorkspace from './DrawingWorkspace';
import { generateCss, generateReact } from './sketch/codegen';
import type {
  CanvasItem,
  GeneratedWebsite,
  RecognizedPrimitive,
  StructureLayout,
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
  { value: 'section', label: 'Section' },
  { value: 'cardGrid', label: 'Card grid' },
  { value: 'card', label: 'Card' },
  { value: 'heading', label: 'Heading' },
  { value: 'paragraph', label: 'Paragraph' },
  { value: 'image', label: 'Image' },
  { value: 'button', label: 'Button' },
  { value: 'input', label: 'Input' },
  { value: 'form', label: 'Form' },
  { value: 'divider', label: 'Divider' },
  { value: 'footer', label: 'Footer' },
];

const containerTypes = new Set<WebsiteNode['type']>([
  'navbar',
  'hero',
  'section',
  'cardGrid',
  'card',
  'form',
  'footer',
]);

function GeneratedNode({ node, insideForm = false }: { node: WebsiteNode; insideForm?: boolean }) {
  const childIsInsideForm = insideForm || node.type === 'form';
  const children = node.children.map((child) => (
    <GeneratedNode insideForm={childIsInsideForm} key={child.id} node={child} />
  ));

  if (node.type === 'navbar') {
    return (
      <nav className="generated-nav">
        <strong>{node.content ?? 'Studio'}</strong>
        <div className="generated-nav-content">{children}</div>
      </nav>
    );
  }
  if (node.type === 'hero') return <section className="generated-hero">{children}</section>;
  if (node.type === 'section') return <section className="generated-section">{children}</section>;
  if (node.type === 'cardGrid') {
    return <section className="generated-features"><div className="generated-card-grid">{children}</div></section>;
  }
  if (node.type === 'card') {
    return (
      <article className="generated-card">
        {children.length > 0 ? children : <><h2>{node.content ?? 'Feature'}</h2><p>Generated from your wireframe.</p></>}
      </article>
    );
  }
  if (node.type === 'heading') return <h1>{node.content ?? 'Your headline'}</h1>;
  if (node.type === 'paragraph') return <p>{node.content ?? 'Your supporting copy.'}</p>;
  if (node.type === 'image') {
    return <div aria-label="Generated visual placeholder" className="generated-image" role="img"><span>Image</span></div>;
  }
  if (node.type === 'button') return <button className="generated-button" type={insideForm ? 'submit' : 'button'}>{node.content ?? 'Get started'}</button>;
  if (node.type === 'input') {
    return <label className="generated-field">{node.content ?? 'Your details'}<input /></label>;
  }
  if (node.type === 'form') {
    return <form className="generated-form" onSubmit={(event) => event.preventDefault()}>{children}</form>;
  }
  if (node.type === 'divider') return <hr className="generated-divider" />;
  if (node.type === 'footer') return <footer>{children.length > 0 ? children : node.content}</footer>;
  return null;
}

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
      {site.tree.children.map((node) => <GeneratedNode key={node.id} node={node} />)}
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

function findParentNode(node: WebsiteNode, childId: string): WebsiteNode | null {
  if (node.children.some((child) => child.id === childId)) return node;
  for (const child of node.children) {
    const match = findParentNode(child, childId);
    if (match) return match;
  }
  return null;
}

function flattenStructure(node: WebsiteNode): WebsiteNode[] {
  return [node, ...node.children.flatMap(flattenStructure)];
}

function descendantIds(node: WebsiteNode) {
  return new Set(node.children.flatMap((child) => flattenStructure(child).map((item) => item.id)));
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
  onStructureParent: (primitiveId: string, parentId: string) => void;
  onStructureMove: (primitiveId: string, direction: -1 | 1) => void;
  layout: StructureLayout;
  overrides: StructureOverrides;
};

function OutputPanel({
  codeView,
  copiedLabel,
  cssCode,
  onCopy,
  onStructureOverride,
  onStructureParent,
  onStructureMove,
  outputView,
  previewSize,
  primitives,
  layout,
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
  const selectedPrimitiveId = selectedStructureNode?.sourcePrimitiveIds[0];
  const currentParent = selectedStructureNode
    ? findParentNode(site.tree, selectedStructureNode.id)
    : null;
  const currentSiblingIndex = currentParent && selectedStructureNode
    ? currentParent.children.findIndex((child) => child.id === selectedStructureNode.id)
    : -1;
  const excludedParentIds = selectedStructureNode
    ? new Set([selectedStructureNode.id, ...descendantIds(selectedStructureNode)])
    : new Set<string>();
  const parentOptions = flattenStructure(site.tree).filter(
    (node) =>
      (node.type === 'page' || containerTypes.has(node.type)) &&
      !excludedParentIds.has(node.id),
  );
  const manualParentId = selectedPrimitiveId
    ? layout.parentByPrimitiveId[selectedPrimitiveId]
    : undefined;
  const parentSelection = manualParentId && parentOptions.some((node) => node.id === manualParentId)
    ? manualParentId
    : 'automatic';

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
                      ? 'Change its type, place it inside another element, or adjust its order.'
                      : 'Click any element in the tree to edit its role and placement.'}
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
                <label>
                  Place inside
                  <select
                    disabled={!selectedPrimitiveId}
                    onChange={(event) => {
                      if (selectedPrimitiveId) onStructureParent(selectedPrimitiveId, event.target.value);
                    }}
                    value={parentSelection}
                  >
                    <option value="automatic">Automatic ({currentParent?.type ?? 'page'})</option>
                    {parentOptions.map((parent) => (
                      <option key={parent.id} value={parent.id}>
                        {parent.type === 'page' ? 'Page (top level)' : `${parent.type} · ${parent.content ?? 'element'}`}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="structure-order" aria-label="Element order">
                  <button
                    disabled={!selectedPrimitiveId || currentSiblingIndex <= 0}
                    onClick={() => selectedPrimitiveId && onStructureMove(selectedPrimitiveId, -1)}
                    type="button"
                  >
                    Move up
                  </button>
                  <button
                    disabled={!selectedPrimitiveId || !currentParent || currentSiblingIndex >= currentParent.children.length - 1}
                    onClick={() => selectedPrimitiveId && onStructureMove(selectedPrimitiveId, 1)}
                    type="button"
                  >
                    Move down
                  </button>
                </div>
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
  const [structureLayout, setStructureLayout] = useState<StructureLayout>({
    parentByPrimitiveId: {},
    orderByParentId: {},
  });
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
    () => inferWebsite(primitives, structureOverrides, structureLayout),
    [primitives, structureOverrides, structureLayout],
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
      setStructureLayout({ parentByPrimitiveId: {}, orderByParentId: {} });
    }
  }

  function handleStructureParent(primitiveId: string, parentId: string) {
    setStructureLayout((current) => {
      const parentByPrimitiveId = { ...current.parentByPrimitiveId };
      if (parentId === 'automatic') {
        delete parentByPrimitiveId[primitiveId];
      } else {
        parentByPrimitiveId[primitiveId] = parentId;
      }
      return { ...current, parentByPrimitiveId };
    });
  }

  function handleStructureMove(primitiveId: string, direction: -1 | 1) {
    const selectedNode = findStructureNode(site.tree, [primitiveId]);
    if (!selectedNode) return;
    const parent = findParentNode(site.tree, selectedNode.id);
    if (!parent) return;
    const siblingIds = parent.children.map((child) => child.sourcePrimitiveIds[0]);
    const index = siblingIds.indexOf(primitiveId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= siblingIds.length) return;
    [siblingIds[index], siblingIds[targetIndex]] = [siblingIds[targetIndex], siblingIds[index]];
    setStructureLayout((current) => ({
      ...current,
      orderByParentId: { ...current.orderByParentId, [parent.id]: siblingIds },
    }));
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
          onStructureParent={handleStructureParent}
          onStructureMove={handleStructureMove}
          outputView={outputView}
          previewSize={previewSize}
          primitives={primitives}
          layout={structureLayout}
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
