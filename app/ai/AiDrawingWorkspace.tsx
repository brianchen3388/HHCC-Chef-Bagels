'use client';

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';

type Tool = 'select' | 'pen' | 'erase' | 'line' | 'frame' | 'text';

type Point = {
  x: number;
  y: number;
  pressure?: number;
  timestamp: number;
};

type PenItem = {
  id: string;
  kind: 'pen';
  points: Point[];
};

type LineItem = {
  id: string;
  kind: 'line';
  start: Point;
  end: Point;
};

type FrameItem = {
  id: string;
  kind: 'frame';
  start: Point;
  end: Point;
};

type TextItem = {
  id: string;
  kind: 'text';
  position: Point;
  content: string;
};

type CanvasItem = PenItem | LineItem | FrameItem | TextItem;
type DrawableItem = PenItem | LineItem | FrameItem;

type DrawingWorkspaceProps = {
  hasPreviousSubmission: boolean;
  isGenerating: boolean;
  onClear: () => void;
  onExportError: (message: string) => void;
  onGenerate: (imageDataUrl: string) => Promise<void>;
};

const CANVAS_STORAGE_KEY = 'sketchsite-canvas-v1';
const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = 3000;

type DrawGesture = {
  kind: 'draw';
  pointerId: number;
  item: DrawableItem;
};

type MoveGesture = {
  kind: 'move';
  pointerId: number;
  itemId: string;
  origin: Point;
  originalItems: CanvasItem[];
  moved: boolean;
};

type EraseGesture = {
  kind: 'erase';
  pointerId: number;
  originalItems: CanvasItem[];
  changed: boolean;
};

type Gesture = DrawGesture | MoveGesture | EraseGesture;

type Bounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

const toolOptions: Array<{ id: Tool; label: string }> = [
  { id: 'select', label: 'Select' },
  { id: 'pen', label: 'Pen' },
  { id: 'erase', label: 'Erase' },
  { id: 'line', label: 'Line' },
  { id: 'frame', label: 'Frame' },
  { id: 'text', label: 'Text' },
];

let itemSequence = 0;

function isStoredPoint(value: unknown): value is Point {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const point = value as Record<string, unknown>;
  return (
    typeof point.x === 'number' &&
    Number.isFinite(point.x) &&
    point.x >= 0 &&
    point.x <= 1 &&
    typeof point.y === 'number' &&
    Number.isFinite(point.y) &&
    point.y >= 0 &&
    point.y <= 1 &&
    typeof point.timestamp === 'number' &&
    Number.isFinite(point.timestamp) &&
    (point.pressure === undefined ||
      (typeof point.pressure === 'number' && Number.isFinite(point.pressure)))
  );
}

function parseStoredCanvasItems(value: unknown): CanvasItem[] | null {
  if (!Array.isArray(value) || value.length > 500) return null;

  const items: CanvasItem[] = [];
  for (const rawItem of value) {
    if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) {
      return null;
    }
    const item = rawItem as Record<string, unknown>;
    if (typeof item.id !== 'string' || item.id.length > 100) return null;

    if (item.kind === 'pen') {
      if (
        !Array.isArray(item.points) ||
        item.points.length < 1 ||
        item.points.length > 10000 ||
        !item.points.every(isStoredPoint)
      ) {
        return null;
      }
      items.push({ id: item.id, kind: 'pen', points: item.points });
      continue;
    }

    if (item.kind === 'line' || item.kind === 'frame') {
      if (!isStoredPoint(item.start) || !isStoredPoint(item.end)) return null;
      items.push({
        id: item.id,
        kind: item.kind,
        start: item.start,
        end: item.end,
      });
      continue;
    }

    if (item.kind === 'text') {
      if (
        !isStoredPoint(item.position) ||
        typeof item.content !== 'string' ||
        item.content.length > 500
      ) {
        return null;
      }
      items.push({
        id: item.id,
        kind: 'text',
        position: item.position,
        content: item.content,
      });
      continue;
    }

    return null;
  }

  return items;
}

function createItemId(kind: CanvasItem['kind']) {
  itemSequence += 1;
  return `${kind}-${Date.now()}-${itemSequence}`;
}

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function getPoint(event: ReactPointerEvent<SVGSVGElement>): Point {
  const bounds = event.currentTarget.getBoundingClientRect();

  return {
    x: clamp((event.clientX - bounds.left) / bounds.width),
    y: clamp((event.clientY - bounds.top) / bounds.height),
    pressure: event.pressure || 0.5,
    timestamp: Date.now(),
  };
}

function getHitTolerance(event: ReactPointerEvent<SVGSVGElement>) {
  const bounds = event.currentTarget.getBoundingClientRect();
  return 10 / Math.min(bounds.width, bounds.height);
}

function isNewPoint(points: Point[], point: Point) {
  const previous = points.at(-1);
  return (
    !previous ||
    Math.hypot(point.x - previous.x, point.y - previous.y) > 0.0015
  );
}

function distanceToSegment(point: Point, start: Point, end: Point) {
  const lengthSquared =
    (end.x - start.x) ** 2 + (end.y - start.y) ** 2;

  if (lengthSquared === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const projection = clamp(
    ((point.x - start.x) * (end.x - start.x) +
      (point.y - start.y) * (end.y - start.y)) /
      lengthSquared,
  );
  const projectedX = start.x + projection * (end.x - start.x);
  const projectedY = start.y + projection * (end.y - start.y);

  return Math.hypot(point.x - projectedX, point.y - projectedY);
}

function getItemBounds(item: CanvasItem): Bounds {
  if (item.kind === 'text') {
    const width = Math.max(0.055, item.content.length * 0.016);
    return {
      left: item.position.x,
      top: item.position.y - 0.045,
      right: item.position.x + width,
      bottom: item.position.y + 0.012,
    };
  }

  const points = item.kind === 'pen' ? item.points : [item.start, item.end];
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);

  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  };
}

function itemContainsPoint(
  item: CanvasItem,
  point: Point,
  tolerance: number,
  mode: 'select' | 'erase',
) {
  if (item.kind === 'pen') {
    if (item.points.length === 1) {
      return distanceToSegment(point, item.points[0], item.points[0]) <= tolerance;
    }

    return item.points.slice(1).some((currentPoint, index) =>
      distanceToSegment(point, item.points[index], currentPoint) <= tolerance,
    );
  }

  if (item.kind === 'line') {
    return distanceToSegment(point, item.start, item.end) <= tolerance;
  }

  const bounds = getItemBounds(item);
  const insideExpandedBounds =
    point.x >= bounds.left - tolerance &&
    point.x <= bounds.right + tolerance &&
    point.y >= bounds.top - tolerance &&
    point.y <= bounds.bottom + tolerance;

  if (!insideExpandedBounds) {
    return false;
  }

  if (item.kind === 'text' || mode === 'select') {
    return true;
  }

  const distanceToEdge = Math.min(
    Math.abs(point.x - bounds.left),
    Math.abs(point.x - bounds.right),
    Math.abs(point.y - bounds.top),
    Math.abs(point.y - bounds.bottom),
  );

  return distanceToEdge <= tolerance;
}

function findItemAtPoint(
  items: CanvasItem[],
  point: Point,
  tolerance: number,
  mode: 'select' | 'erase',
) {
  return [...items]
    .reverse()
    .find((item) => itemContainsPoint(item, point, tolerance, mode));
}

function translatePoint(point: Point, deltaX: number, deltaY: number): Point {
  return {
    ...point,
    x: point.x + deltaX,
    y: point.y + deltaY,
    timestamp: Date.now(),
  };
}

function translateItem(item: CanvasItem, requestedX: number, requestedY: number) {
  const bounds = getItemBounds(item);
  const deltaX = clamp(requestedX, -bounds.left, 1 - bounds.right);
  const deltaY = clamp(requestedY, -bounds.top, 1 - bounds.bottom);

  if (item.kind === 'pen') {
    return {
      ...item,
      points: item.points.map((point) =>
        translatePoint(point, deltaX, deltaY),
      ),
    };
  }

  if (item.kind === 'line' || item.kind === 'frame') {
    return {
      ...item,
      start: translatePoint(item.start, deltaX, deltaY),
      end: translatePoint(item.end, deltaX, deltaY),
    };
  }

  return {
    ...item,
    position: translatePoint(item.position, deltaX, deltaY),
  };
}

function CanvasItemShape({ item }: { item: CanvasItem }) {
  const itemAttributes = { 'data-item-id': item.id };

  if (item.kind === 'pen') {
    if (item.points.length === 1) {
      const point = item.points[0];
      return (
        <circle
          {...itemAttributes}
          className="canvas-dot"
          cx={point.x * CANVAS_WIDTH}
          cy={point.y * CANVAS_HEIGHT}
          r="2.5"
        />
      );
    }

    return (
      <polyline
        {...itemAttributes}
        className="canvas-pen"
        points={item.points
          .map((point) => `${point.x * CANVAS_WIDTH},${point.y * CANVAS_HEIGHT}`)
          .join(' ')}
      />
    );
  }

  if (item.kind === 'line') {
    return (
      <line
        {...itemAttributes}
        className="canvas-line"
        x1={item.start.x * CANVAS_WIDTH}
        x2={item.end.x * CANVAS_WIDTH}
        y1={item.start.y * CANVAS_HEIGHT}
        y2={item.end.y * CANVAS_HEIGHT}
      />
    );
  }

  if (item.kind === 'frame') {
    const bounds = getItemBounds(item);
    return (
      <rect
        {...itemAttributes}
        className="canvas-frame"
        height={(bounds.bottom - bounds.top) * CANVAS_HEIGHT}
        width={(bounds.right - bounds.left) * CANVAS_WIDTH}
        x={bounds.left * CANVAS_WIDTH}
        y={bounds.top * CANVAS_HEIGHT}
      />
    );
  }

  return (
    <text
      {...itemAttributes}
      className="canvas-text"
      x={item.position.x * CANVAS_WIDTH}
      y={item.position.y * CANVAS_HEIGHT}
    >
      {item.content}
    </text>
  );
}

function SelectionOutline({ item }: { item: CanvasItem }) {
  const bounds = getItemBounds(item);
  const padding = 8;
  const width = Math.max(12, (bounds.right - bounds.left) * CANVAS_WIDTH);
  const height = Math.max(12, (bounds.bottom - bounds.top) * CANVAS_HEIGHT);

  return (
    <rect
      className="selection-outline"
      height={height + padding * 2}
      width={width + padding * 2}
      x={bounds.left * CANVAS_WIDTH - padding}
      y={bounds.top * CANVAS_HEIGHT - padding}
    />
  );
}

function exportSvgAsPng(svg: SVGSVGElement) {
  const exportSvg = svg.cloneNode(true) as SVGSVGElement;
  exportSvg.querySelectorAll('.selection-outline').forEach((node) => node.remove());
  exportSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  exportSvg.setAttribute('width', String(CANVAS_WIDTH));
  exportSvg.setAttribute('height', String(CANVAS_HEIGHT));

  exportSvg
    .querySelectorAll<SVGElement>('.canvas-pen, .canvas-line, .canvas-frame')
    .forEach((node) => {
      node.setAttribute('fill', 'none');
      node.setAttribute('stroke', '#17211b');
      node.setAttribute('stroke-width', '4');
      node.setAttribute('stroke-linecap', 'round');
      node.setAttribute('stroke-linejoin', 'round');
    });
  exportSvg.querySelectorAll<SVGElement>('.canvas-dot').forEach((node) => {
    node.setAttribute('fill', '#17211b');
    node.setAttribute('stroke', 'none');
  });
  exportSvg.querySelectorAll<SVGElement>('.canvas-text').forEach((node) => {
    node.setAttribute('fill', '#17211b');
    node.setAttribute('font-family', 'Arial, Helvetica, sans-serif');
    node.setAttribute('font-size', '26');
    node.setAttribute('font-weight', '650');
  });

  const blob = new Blob([new XMLSerializer().serializeToString(exportSvg)], {
    type: 'image/svg+xml;charset=utf-8',
  });
  const objectUrl = URL.createObjectURL(blob);

  return new Promise<string>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = CANVAS_WIDTH;
        canvas.height = CANVAS_HEIGHT;
        const context = canvas.getContext('2d');
        if (!context) {
          reject(new Error('无法创建画布快照。'));
          return;
        }
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        reject(new Error('无法导出画布，请重试。'));
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('无法读取画布快照，请重试。'));
    };
    image.src = objectUrl;
  });
}

export default function DrawingWorkspace({
  hasPreviousSubmission,
  isGenerating,
  onClear,
  onExportError,
  onGenerate,
}: DrawingWorkspaceProps) {
  const [activeTool, setActiveTool] = useState<Tool>('pen');
  const [items, setItems] = useState<CanvasItem[]>([]);
  const [history, setHistory] = useState<CanvasItem[][]>([]);
  const [future, setFuture] = useState<CanvasItem[][]>([]);
  const [draftItem, setDraftItem] = useState<DrawableItem | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [textValue, setTextValue] = useState('Text');
  const [isExporting, setIsExporting] = useState(false);
  const [hasLoadedStoredCanvas, setHasLoadedStoredCanvas] = useState(false);
  const itemsRef = useRef<CanvasItem[]>([]);
  const gestureRef = useRef<Gesture | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const restoreFrame = window.requestAnimationFrame(() => {
      try {
        const storedValue = localStorage.getItem(CANVAS_STORAGE_KEY);
        if (storedValue !== null) {
          const restoredItems = parseStoredCanvasItems(JSON.parse(storedValue));
          if (restoredItems) {
            itemsRef.current = restoredItems;
            setItems(restoredItems);
          }
        }
      } catch {
        // Ignore corrupted or unavailable local storage and keep a blank canvas.
      } finally {
        setHasLoadedStoredCanvas(true);
      }
    });

    return () => window.cancelAnimationFrame(restoreFrame);
  }, []);

  useEffect(() => {
    if (!hasLoadedStoredCanvas) return;
    try {
      localStorage.setItem(CANVAS_STORAGE_KEY, JSON.stringify(items));
    } catch {
      // The editor remains usable if the browser refuses local persistence.
    }
  }, [hasLoadedStoredCanvas, items]);

  function updateItems(nextItems: CanvasItem[]) {
    itemsRef.current = nextItems;
    setItems(nextItems);
  }

  function commitItems(nextItems: CanvasItem[]) {
    setHistory((currentHistory) => [...currentHistory, itemsRef.current]);
    updateItems(nextItems);
    setFuture([]);
  }

  function chooseTool(tool: Tool) {
    setActiveTool(tool);
    if (tool !== 'select') {
      setSelectedId(null);
    }
  }

  function eraseAtPoint(point: Point, tolerance: number) {
    const hitItem = findItemAtPoint(
      itemsRef.current,
      point,
      tolerance,
      'erase',
    );

    if (!hitItem) {
      return;
    }

    updateItems(itemsRef.current.filter((item) => item.id !== hitItem.id));
    if (selectedId === hitItem.id) {
      setSelectedId(null);
    }

    const gesture = gestureRef.current;
    if (gesture?.kind === 'erase') {
      gestureRef.current = { ...gesture, changed: true };
    }
  }

  function startGesture(event: ReactPointerEvent<SVGSVGElement>) {
    if (
      gestureRef.current ||
      (event.pointerType === 'mouse' && event.button !== 0)
    ) {
      return;
    }

    const point = getPoint(event);
    const tolerance = getHitTolerance(event);

    if (activeTool === 'text') {
      const textItem: TextItem = {
        id: createItemId('text'),
        kind: 'text',
        position: point,
        content: textValue.trim() || 'Text',
      };
      commitItems([...itemsRef.current, textItem]);
      setSelectedId(textItem.id);
      return;
    }

    if (activeTool === 'select') {
      const hitItem = findItemAtPoint(
        itemsRef.current,
        point,
        tolerance,
        'select',
      );
      setSelectedId(hitItem?.id ?? null);

      if (!hitItem) {
        return;
      }

      event.currentTarget.setPointerCapture(event.pointerId);
      gestureRef.current = {
        kind: 'move',
        pointerId: event.pointerId,
        itemId: hitItem.id,
        origin: point,
        originalItems: itemsRef.current,
        moved: false,
      };
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);

    if (activeTool === 'erase') {
      gestureRef.current = {
        kind: 'erase',
        pointerId: event.pointerId,
        originalItems: itemsRef.current,
        changed: false,
      };
      eraseAtPoint(point, tolerance);
      return;
    }

    const item: DrawableItem =
      activeTool === 'pen'
        ? {
            id: createItemId('pen'),
            kind: 'pen',
            points: [point],
          }
        : {
            id: createItemId(activeTool),
            kind: activeTool,
            start: point,
            end: point,
          };

    gestureRef.current = {
      kind: 'draw',
      pointerId: event.pointerId,
      item,
    };
    setDraftItem(item);
    setSelectedId(null);
  }

  function continueGesture(event: ReactPointerEvent<SVGSVGElement>) {
    const gesture = gestureRef.current;

    if (!gesture || gesture.pointerId !== event.pointerId) {
      return;
    }

    const point = getPoint(event);

    if (gesture.kind === 'erase') {
      eraseAtPoint(point, getHitTolerance(event));
      return;
    }

    if (gesture.kind === 'move') {
      const deltaX = point.x - gesture.origin.x;
      const deltaY = point.y - gesture.origin.y;
      const moved = Math.hypot(deltaX, deltaY) > 0.001;
      const nextItems = gesture.originalItems.map((item) =>
        item.id === gesture.itemId
          ? translateItem(item, deltaX, deltaY)
          : item,
      );

      updateItems(nextItems);
      gestureRef.current = { ...gesture, moved: gesture.moved || moved };
      return;
    }

    const currentItem = gesture.item;
    let nextItem: DrawableItem;

    if (currentItem.kind === 'pen') {
      if (!isNewPoint(currentItem.points, point)) {
        return;
      }
      nextItem = { ...currentItem, points: [...currentItem.points, point] };
    } else {
      nextItem = { ...currentItem, end: point };
    }

    gestureRef.current = { ...gesture, item: nextItem };
    setDraftItem(nextItem);
  }

  function finishGesture(event: ReactPointerEvent<SVGSVGElement>) {
    continueGesture(event);
    const gesture = gestureRef.current;

    if (!gesture || gesture.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (gesture.kind === 'draw') {
      const bounds = getItemBounds(gesture.item);
      const isVisible =
        gesture.item.kind === 'pen' ||
        Math.hypot(bounds.right - bounds.left, bounds.bottom - bounds.top) >
          0.003;

      if (isVisible) {
        commitItems([...itemsRef.current, gesture.item]);
        setSelectedId(gesture.item.id);
      }
    } else if (gesture.kind === 'move' && gesture.moved) {
      setHistory((currentHistory) => [
        ...currentHistory,
        gesture.originalItems,
      ]);
      setFuture([]);
    } else if (gesture.kind === 'erase' && gesture.changed) {
      setHistory((currentHistory) => [
        ...currentHistory,
        gesture.originalItems,
      ]);
      setFuture([]);
    }

    gestureRef.current = null;
    setDraftItem(null);
  }

  function cancelGesture(event: ReactPointerEvent<SVGSVGElement>) {
    const gesture = gestureRef.current;

    if (!gesture || gesture.pointerId !== event.pointerId) {
      return;
    }

    if (gesture.kind === 'move' || gesture.kind === 'erase') {
      updateItems(gesture.originalItems);
    }

    gestureRef.current = null;
    setDraftItem(null);
  }

  function undo() {
    const previousItems = history.at(-1);

    if (!previousItems || gestureRef.current) {
      return;
    }

    setHistory(history.slice(0, -1));
    setFuture([itemsRef.current, ...future]);
    updateItems(previousItems);
    setSelectedId(null);
  }

  function redo() {
    const nextItems = future[0];

    if (!nextItems || gestureRef.current) {
      return;
    }

    setHistory([...history, itemsRef.current]);
    setFuture(future.slice(1));
    updateItems(nextItems);
    setSelectedId(null);
  }

  function clearCanvas() {
    if (itemsRef.current.length === 0 || gestureRef.current) {
      return;
    }

    commitItems([]);
    setSelectedId(null);
    onClear();
  }

  async function generateWebsite() {
    if (
      (itemsRef.current.length === 0 && !hasPreviousSubmission) ||
      gestureRef.current ||
      !svgRef.current ||
      isExporting ||
      isGenerating
    ) {
      return;
    }

    setIsExporting(true);
    try {
      const imageDataUrl = await exportSvgAsPng(svgRef.current);
      await onGenerate(imageDataUrl);
    } catch (error) {
      onExportError(
        error instanceof Error ? error.message : '无法生成画布快照，请重试。',
      );
    } finally {
      setIsExporting(false);
    }
  }

  const selectedItem = items.find((item) => item.id === selectedId);
  const visibleItems = draftItem ? [...items, draftItem] : items;

  return (
    <section className="panel sketch-panel" aria-labelledby="sketch-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Input</p>
          <h1 id="sketch-heading">Sketch wireframe</h1>
        </div>
        <div className="panel-heading-actions">
          <span className="panel-meta">Untitled</span>
          <button
            aria-busy={isExporting || isGenerating}
            className="generate-button"
            disabled={
              (items.length === 0 && !hasPreviousSubmission) ||
              isExporting ||
              isGenerating
            }
            onClick={generateWebsite}
            type="button"
          >
            {isExporting
              ? 'Preparing…'
              : isGenerating
                ? 'Generating…'
                : 'Generate website'}
          </button>
        </div>
      </div>

      <div className="drawing-toolbar" aria-label="Drawing tools">
        {toolOptions.map((tool) => (
          <button
            aria-pressed={activeTool === tool.id}
            className={activeTool === tool.id ? 'tool active' : 'tool'}
            key={tool.id}
            onClick={() => chooseTool(tool.id)}
            type="button"
          >
            <span aria-hidden="true">{tool.label.slice(0, 1)}</span>
            {tool.label}
          </button>
        ))}

        {activeTool === 'text' && (
          <input
            aria-label="Text to place"
            className="text-tool-input"
            onChange={(event) => setTextValue(event.target.value)}
            placeholder="Text"
            type="text"
            value={textValue}
          />
        )}

        <span className="toolbar-spacer" />
        <button
          className="icon-button"
          disabled={history.length === 0}
          onClick={undo}
          type="button"
        >
          Undo
        </button>
        <button
          className="icon-button"
          disabled={future.length === 0}
          onClick={redo}
          type="button"
        >
          Redo
        </button>
        <button
          className="icon-button"
          disabled={items.length === 0}
          onClick={clearCanvas}
          type="button"
        >
          Clear
        </button>
      </div>

      <div className="ai-canvas-wrap">
        <div className="ai-canvas-page">
          {items.length === 0 && draftItem === null && (
            <div className="canvas-empty">
              <div className="empty-icon" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <h2>Your canvas is ready</h2>
              <p>
                {hasPreviousSubmission
                  ? 'Generate this blank canvas to remove the previous components.'
                  : 'Choose a tool, then draw or place an element.'}
              </p>
            </div>
          )}

          <svg
            aria-label={`Scrollable wireframe canvas. ${toolOptions.find((tool) => tool.id === activeTool)?.label} tool selected.`}
            className={`drawing-surface tool-${activeTool}`}
            onPointerCancel={cancelGesture}
            onPointerDown={startGesture}
            onPointerMove={continueGesture}
            onPointerUp={finishGesture}
            preserveAspectRatio="xMinYMin meet"
            ref={svgRef}
            role="application"
            viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
          >
            <g className="canvas-items">
              {visibleItems.map((item) => (
                <CanvasItemShape item={item} key={item.id} />
              ))}
            </g>
            {activeTool === 'select' && selectedItem && (
              <SelectionOutline item={selectedItem} />
            )}
          </svg>

          <span className="zoom-label">100%</span>
        </div>
      </div>

      <footer className="panel-footer">
        <span>
          {items.length} {items.length === 1 ? 'element' : 'elements'}
        </span>
        <span>
          {activeTool === 'select'
            ? selectedItem
              ? `${selectedItem.kind} selected`
              : 'Select an element to move it'
            : `${toolOptions.find((tool) => tool.id === activeTool)?.label} tool active`}
        </span>
      </footer>
    </section>
  );
}
