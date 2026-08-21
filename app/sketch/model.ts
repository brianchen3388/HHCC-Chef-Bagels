export type Point = {
  x: number;
  y: number;
  pressure?: number;
  timestamp: number;
};

export type PenItem = {
  id: string;
  kind: 'pen';
  points: Point[];
};

export type LineItem = {
  id: string;
  kind: 'line';
  start: Point;
  end: Point;
};

export type FrameItem = {
  id: string;
  kind: 'frame';
  start: Point;
  end: Point;
};

export type TextItem = {
  id: string;
  kind: 'text';
  position: Point;
  content: string;
};

export type CanvasItem = PenItem | LineItem | FrameItem | TextItem;
export type DrawableItem = PenItem | LineItem | FrameItem;

export type Bounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PrimitiveType =
  | 'container'
  | 'text'
  | 'image'
  | 'button'
  | 'input'
  | 'unknown';

export type RecognizedPrimitive = {
  id: string;
  sourceItemIds: string[];
  type: PrimitiveType;
  bounds: Bounds;
  confidence: number;
  manuallyCorrected: boolean;
  content?: string;
};

export type WebsiteNodeType =
  | 'page'
  | 'navbar'
  | 'hero'
  | 'section'
  | 'cardGrid'
  | 'card'
  | 'heading'
  | 'paragraph'
  | 'image'
  | 'button'
  | 'input'
  | 'form'
  | 'divider'
  | 'footer';

export type WebsiteNode = {
  id: string;
  type: WebsiteNodeType;
  bounds: Bounds;
  confidence: number;
  children: WebsiteNode[];
  content?: string;
  sourcePrimitiveIds: string[];
};

export type GeneratedWebsite = {
  tree: WebsiteNode;
  navbar: null | {
    brand: string;
    links: string[];
  };
  hero: null | {
    heading: string;
    body: string;
    cta: string | null;
    showImage: boolean;
  };
  cards: Array<{
    title: string;
    body: string;
  }>;
  form: null | {
    fields: string[];
    button: string;
  };
  footer: null | {
    text: string;
  };
};

export function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function getCanvasItemBounds(item: CanvasItem): Bounds {
  if (item.kind === 'text') {
    const width = Math.max(0.055, item.content.length * 0.016);
    return {
      x: item.position.x,
      y: clamp(item.position.y - 0.045),
      width: Math.min(width, 1 - item.position.x),
      height: 0.057,
    };
  }

  const points = item.kind === 'pen' ? item.points : [item.start, item.end];
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);

  return {
    x,
    y,
    width: Math.max(0.001, Math.max(...xs) - x),
    height: Math.max(0.001, Math.max(...ys) - y),
  };
}

export function boundsContain(outer: Bounds, inner: Bounds, margin = 0.012) {
  return (
    inner.x >= outer.x - margin &&
    inner.y >= outer.y - margin &&
    inner.x + inner.width <= outer.x + outer.width + margin &&
    inner.y + inner.height <= outer.y + outer.height + margin
  );
}

export function boundsCenter(bounds: Bounds) {
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
}

export const pageBounds: Bounds = { x: 0, y: 0, width: 1, height: 1 };
