'use client';

import {
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';

type Point = {
  x: number;
  y: number;
  pressure?: number;
  timestamp: number;
};

type Stroke = {
  id: string;
  points: Point[];
  startedAt: number;
  endedAt: number;
};

const tools = ['Select', 'Pen', 'Erase', 'Frame', 'Text'];

function getPoint(event: ReactPointerEvent<SVGSVGElement>): Point {
  const bounds = event.currentTarget.getBoundingClientRect();

  return {
    x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)),
    y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)),
    pressure: event.pressure || 0.5,
    timestamp: Date.now(),
  };
}

function isNewPoint(points: Point[], point: Point) {
  const previous = points.at(-1);

  if (!previous) {
    return true;
  }

  return Math.hypot(point.x - previous.x, point.y - previous.y) > 0.0015;
}

function StrokeLine({ stroke }: { stroke: Stroke }) {
  if (stroke.points.length === 1) {
    const point = stroke.points[0];

    return <circle cx={point.x * 1000} cy={point.y * 1000} r="2" />;
  }

  return (
    <polyline
      points={stroke.points
        .map((point) => `${point.x * 1000},${point.y * 1000}`)
        .join(' ')}
    />
  );
}

export default function DrawingWorkspace() {
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);
  const [activeStroke, setActiveStroke] = useState<Stroke | null>(null);
  const activeStrokeRef = useRef<Stroke | null>(null);
  const pointerIdRef = useRef<number | null>(null);

  function startStroke(event: ReactPointerEvent<SVGSVGElement>) {
    if (
      activeStrokeRef.current ||
      (event.pointerType === 'mouse' && event.button !== 0)
    ) {
      return;
    }

    const timestamp = Date.now();
    const stroke: Stroke = {
      id: `stroke-${timestamp}-${event.pointerId}`,
      points: [getPoint(event)],
      startedAt: timestamp,
      endedAt: timestamp,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
    pointerIdRef.current = event.pointerId;
    activeStrokeRef.current = stroke;
    setActiveStroke(stroke);
  }

  function continueStroke(event: ReactPointerEvent<SVGSVGElement>) {
    const current = activeStrokeRef.current;

    if (!current || pointerIdRef.current !== event.pointerId) {
      return;
    }

    const point = getPoint(event);

    if (!isNewPoint(current.points, point)) {
      return;
    }

    const updatedStroke = {
      ...current,
      points: [...current.points, point],
      endedAt: point.timestamp,
    };

    activeStrokeRef.current = updatedStroke;
    setActiveStroke(updatedStroke);
  }

  function finishStroke(event: ReactPointerEvent<SVGSVGElement>) {
    const current = activeStrokeRef.current;

    if (!current || pointerIdRef.current !== event.pointerId) {
      return;
    }

    const point = getPoint(event);
    const finishedStroke = isNewPoint(current.points, point)
      ? {
          ...current,
          points: [...current.points, point],
          endedAt: point.timestamp,
        }
      : current;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    setStrokes((currentStrokes) => [...currentStrokes, finishedStroke]);
    setRedoStack([]);
    activeStrokeRef.current = null;
    pointerIdRef.current = null;
    setActiveStroke(null);
  }

  function cancelStroke(event: ReactPointerEvent<SVGSVGElement>) {
    if (pointerIdRef.current !== event.pointerId) {
      return;
    }

    activeStrokeRef.current = null;
    pointerIdRef.current = null;
    setActiveStroke(null);
  }

  function undo() {
    const lastStroke = strokes.at(-1);

    if (!lastStroke) {
      return;
    }

    setStrokes(strokes.slice(0, -1));
    setRedoStack((currentRedoStack) => [...currentRedoStack, lastStroke]);
  }

  function redo() {
    const nextStroke = redoStack.at(-1);

    if (!nextStroke) {
      return;
    }

    setRedoStack(redoStack.slice(0, -1));
    setStrokes((currentStrokes) => [...currentStrokes, nextStroke]);
  }

  function clearCanvas() {
    setStrokes([]);
    setRedoStack([]);
  }

  const visibleStrokes = activeStroke
    ? [...strokes, activeStroke]
    : strokes;

  return (
    <section className="panel sketch-panel" aria-labelledby="sketch-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Input</p>
          <h1 id="sketch-heading">Sketch wireframe</h1>
        </div>
        <span className="panel-meta">Untitled</span>
      </div>

      <div className="drawing-toolbar" aria-label="Drawing tools">
        {tools.map((tool) => (
          <button
            aria-pressed={tool === 'Pen'}
            className={tool === 'Pen' ? 'tool active' : 'tool'}
            disabled={tool !== 'Pen'}
            key={tool}
            type="button"
          >
            <span aria-hidden="true">{tool.slice(0, 1)}</span>
            {tool}
          </button>
        ))}
        <span className="toolbar-spacer" />
        <button
          className="icon-button"
          disabled={strokes.length === 0 || activeStroke !== null}
          onClick={undo}
          type="button"
        >
          Undo
        </button>
        <button
          className="icon-button"
          disabled={redoStack.length === 0 || activeStroke !== null}
          onClick={redo}
          type="button"
        >
          Redo
        </button>
        <button
          className="icon-button"
          disabled={strokes.length === 0 || activeStroke !== null}
          onClick={clearCanvas}
          type="button"
        >
          Clear
        </button>
      </div>

      <div className="canvas-wrap">
        {strokes.length === 0 && activeStroke === null && (
          <div className="canvas-empty">
            <div className="empty-icon" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <h2>Your canvas is ready</h2>
            <p>Draw a navbar, hero, cards, buttons, or a form.</p>
          </div>
        )}

        <svg
          aria-label="Freehand wireframe drawing canvas"
          className="drawing-surface"
          onPointerCancel={cancelStroke}
          onPointerDown={startStroke}
          onPointerMove={continueStroke}
          onPointerUp={finishStroke}
          preserveAspectRatio="none"
          role="application"
          viewBox="0 0 1000 1000"
        >
          <g className="stroke-layer">
            {visibleStrokes.map((stroke) => (
              <StrokeLine key={stroke.id} stroke={stroke} />
            ))}
          </g>
        </svg>

        <span className="zoom-label">100%</span>
      </div>

      <footer className="panel-footer">
        <span>
          {strokes.length} {strokes.length === 1 ? 'stroke' : 'strokes'}
        </span>
        <span>Freehand drawing enabled</span>
      </footer>
    </section>
  );
}
