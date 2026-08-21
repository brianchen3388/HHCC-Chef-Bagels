'use client';

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  CANVAS_PAGE_RATIO,
  clamp,
  getCanvasItemBounds,
  type CanvasItem,
  type DrawableItem,
  type Point,
  type RecognizedPrimitive,
  type TextItem,
} from './sketch/model';
import { confidenceLabel, primitiveLabel } from './sketch/recognition';

type Tool = 'select' | 'pen' | 'erase' | 'line' | 'frame' | 'text';

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

type SelectionBounds = {
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
const CANVAS_WIDTH = 1000;
const CANVAS_HEIGHT = CANVAS_WIDTH * CANVAS_PAGE_RATIO;

function createItemId(kind: CanvasItem['kind']) {
  itemSequence += 1;
  return `${kind}-${Date.now()}-${itemSequence}`;
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

function getItemBounds(item: CanvasItem): SelectionBounds {
  const bounds = getCanvasItemBounds(item);
  return {
    left: bounds.x,
    top: bounds.y,
    right: bounds.x + bounds.width,
    bottom: bounds.y + bounds.height,
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

  if (item.kind === 'text' || item.kind === 'bitmap' || mode === 'select') {
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

  if (item.kind === 'bitmap') {
    return {
      ...item,
      position: translatePoint(item.position, deltaX, deltaY),
    };
  }

  return {
    ...item,
    position: translatePoint(item.position, deltaX, deltaY),
  };
}

function CanvasItemShape({ item }: { item: CanvasItem }) {
  const itemAttributes = { 'data-item-id': item.id };

  if (item.kind === 'bitmap') {
    return (
      <image
        {...itemAttributes}
        height={item.height * CANVAS_HEIGHT}
        href={item.dataUrl}
        preserveAspectRatio="none"
        style={{ imageRendering: 'pixelated' }}
        width={item.width * CANVAS_WIDTH}
        x={item.position.x * CANVAS_WIDTH}
        y={item.position.y * CANVAS_HEIGHT}
      />
    );
  }

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

type DrawingWorkspaceProps = {
  items: CanvasItem[];
  onItemsChange: (items: CanvasItem[]) => void;
  onPageChange: (pageId: string) => void;
  pageId: string;
  pages: Array<{ id: string; name: string }>;
  recognizedPrimitives: RecognizedPrimitive[];
};

export default function DrawingWorkspace({
  items,
  onItemsChange,
  onPageChange,
  pageId,
  pages,
  recognizedPrimitives,
}: DrawingWorkspaceProps) {
  const [activeTool, setActiveTool] = useState<Tool>('pen');
  const [historyByPage, setHistoryByPage] = useState<Record<string, CanvasItem[][]>>({});
  const [futureByPage, setFutureByPage] = useState<Record<string, CanvasItem[][]>>({});
  const [draftItem, setDraftItem] = useState<DrawableItem | null>(null);
  const [selectedIdByPage, setSelectedIdByPage] = useState<Record<string, string | null>>({});
  const [textValue, setTextValue] = useState('Text');
  const [imageImportStatus, setImageImportStatus] = useState<'idle' | 'processing' | 'error'>('idle');
  const imageInputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<CanvasItem[]>(items);
  const gestureRef = useRef<Gesture | null>(null);
  const history = historyByPage[pageId] ?? [];
  const future = futureByPage[pageId] ?? [];
  const selectedId = selectedIdByPage[pageId] ?? null;

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    gestureRef.current = null;
  }, [pageId]);

  function setHistory(next: CanvasItem[][] | ((current: CanvasItem[][]) => CanvasItem[][])) {
    setHistoryByPage((current) => ({
      ...current,
      [pageId]: typeof next === 'function' ? next(current[pageId] ?? []) : next,
    }));
  }

  function setFuture(next: CanvasItem[][] | ((current: CanvasItem[][]) => CanvasItem[][])) {
    setFutureByPage((current) => ({
      ...current,
      [pageId]: typeof next === 'function' ? next(current[pageId] ?? []) : next,
    }));
  }

  function setSelectedId(next: string | null) {
    setSelectedIdByPage((current) => ({ ...current, [pageId]: next }));
  }

  function updateItems(nextItems: CanvasItem[]) {
    itemsRef.current = nextItems;
    onItemsChange(nextItems);
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
  }

  async function importImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setImageImportStatus('processing');
    let bitmap: ImageBitmap | null = null;

    try {
      bitmap = await createImageBitmap(file);
      const sampleScale = Math.min(1, 160 / Math.max(bitmap.width, bitmap.height));
      const pixelWidth = Math.max(1, Math.round(bitmap.width * sampleScale));
      const pixelHeight = Math.max(1, Math.round(bitmap.height * sampleScale));
      const raster = document.createElement('canvas');
      raster.width = pixelWidth;
      raster.height = pixelHeight;
      const context = raster.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Canvas processing is unavailable.');
      context.drawImage(bitmap, 0, 0, pixelWidth, pixelHeight);
      const imageData = context.getImageData(0, 0, pixelWidth, pixelHeight);

      for (let index = 0; index < imageData.data.length; index += 4) {
        const alpha = imageData.data[index + 3];
        const luminance =
          imageData.data[index] * 0.2126 +
          imageData.data[index + 1] * 0.7152 +
          imageData.data[index + 2] * 0.0722;
        const value = alpha < 128 || luminance >= 128 ? 255 : 0;
        imageData.data[index] = value;
        imageData.data[index + 1] = value;
        imageData.data[index + 2] = value;
        imageData.data[index + 3] = 255;
      }

      context.putImageData(imageData, 0, 0);
      const imageAspect = pixelHeight / pixelWidth;
      let width = 0.62;
      let height = width * imageAspect / CANVAS_PAGE_RATIO;
      if (height > 0.24) {
        height = 0.24;
        width = height * CANVAS_PAGE_RATIO / imageAspect;
      }
      const lowestItem = itemsRef.current.reduce(
        (lowest, item) => Math.max(lowest, getCanvasItemBounds(item).y + getCanvasItemBounds(item).height),
        0.025,
      );
      const importedItem: CanvasItem = {
        id: createItemId('bitmap'),
        kind: 'bitmap',
        position: {
          x: clamp((1 - width) / 2, 0, 1 - width),
          y: clamp(lowestItem + 0.025, 0, 1 - height),
          timestamp: Date.now(),
        },
        width,
        height,
        pixelWidth,
        pixelHeight,
        dataUrl: raster.toDataURL('image/png'),
      };
      commitItems([...itemsRef.current, importedItem]);
      setSelectedId(importedItem.id);
      setActiveTool('select');
      setImageImportStatus('idle');
    } catch {
      setImageImportStatus('error');
    } finally {
      bitmap?.close();
      event.target.value = '';
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
        <label className="page-picker">
          <span>Page</span>
          <select onChange={(event) => onPageChange(event.target.value)} value={pageId}>
            {pages.map((page) => (
              <option key={page.id} value={page.id}>{page.name}</option>
            ))}
          </select>
        </label>
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
        <input
          accept="image/*"
          hidden
          onChange={(event) => void importImage(event)}
          ref={imageInputRef}
          type="file"
        />
        <button
          className="icon-button"
          disabled={imageImportStatus === 'processing'}
          onClick={() => imageInputRef.current?.click()}
          type="button"
        >
          {imageImportStatus === 'processing'
            ? 'Processing…'
            : imageImportStatus === 'error'
              ? 'Try image again'
              : 'Import image'}
        </button>
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

      <div className="canvas-shell">
        <div className="canvas-wrap">
          <div className="canvas-page">
          {items.length === 0 && draftItem === null && (
            <div className="canvas-empty">
              <div className="empty-icon" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <h2>Your canvas is ready</h2>
              <p>Choose a tool, then draw or scroll down to build a full page.</p>
            </div>
          )}

          <svg
            aria-label={`Scrollable wireframe canvas. ${toolOptions.find((tool) => tool.id === activeTool)?.label} tool selected.`}
            className={`drawing-surface tool-${activeTool}`}
            onPointerCancel={cancelGesture}
            onPointerDown={startGesture}
            onPointerMove={continueGesture}
            onPointerUp={finishGesture}
            preserveAspectRatio="none"
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
            <g className="recognition-layer" aria-hidden="true">
              {recognizedPrimitives.map((primitive) => (
                <g
                  className={`recognition-box ${confidenceLabel(primitive.confidence)}`}
                  key={primitive.id}
                >
                  <rect
                    height={Math.max(24, primitive.bounds.height * CANVAS_HEIGHT)}
                    width={Math.max(38, primitive.bounds.width * CANVAS_WIDTH)}
                    x={primitive.bounds.x * CANVAS_WIDTH}
                    y={primitive.bounds.y * CANVAS_HEIGHT}
                  />
                  <text
                    x={primitive.bounds.x * CANVAS_WIDTH + 7}
                    y={Math.max(14, primitive.bounds.y * CANVAS_HEIGHT - 7)}
                  >
                    {primitiveLabel(primitive.type)}{' '}
                    {Math.round(primitive.confidence * 100)}%
                  </text>
                </g>
              ))}
            </g>
          </svg>
          </div>
        </div>

        <span className="zoom-label">Full page · 100%</span>
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
