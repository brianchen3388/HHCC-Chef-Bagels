export type Point = {
  x: number;
  y: number;
  pressure?: number;
  timestamp: number;
};

export const CANVAS_PAGE_RATIO = 3;

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

export type BitmapItem = {
  id: string;
  kind: 'bitmap';
  position: Point;
  width: number;
  height: number;
  pixelWidth: number;
  pixelHeight: number;
  dataUrl: string;
};

export type CanvasItem = PenItem | LineItem | FrameItem | TextItem | BitmapItem;
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
  | 'divider';

export type LayoutDirection = 'horizontal' | 'vertical' | 'mixed' | 'grid';
export type DividerOrientation = 'horizontal' | 'vertical';

export type RecognizedPrimitive = {
  id: string;
  sourceItemIds: string[];
  type: PrimitiveType;
  bounds: Bounds;
  confidence: number;
  manuallyCorrected: boolean;
  content?: string;
  imageDataUrl?: string;
  orientation?: DividerOrientation;
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

export type StructureOverrideType = Exclude<WebsiteNodeType, 'page'>;
export type StructureOverrides = Record<string, StructureOverrideType>;

export type StructureLayout = {
  parentByPrimitiveId: Record<string, string>;
  orderByParentId: Record<string, string[]>;
};

export type ElementCustomization = {
  content?: string;
  imageDataUrl?: string;
  fontSize?: number;
  linkPageId?: string;
};

export type ElementCustomizations = Record<string, ElementCustomization>;

export type WebsiteNode = {
  id: string;
  type: WebsiteNodeType;
  bounds: Bounds;
  confidence: number;
  children: WebsiteNode[];
  childRows?: string[][];
  content?: string;
  fontSize?: number;
  linkPageId?: string;
  layout?: LayoutDirection;
  orientation?: DividerOrientation;
  sourcePrimitiveIds: string[];
};

export type GeneratedWebsite = {
  tree: WebsiteNode;
};

export type GeneratedProjectPage = {
  id: string;
  name: string;
  slug: string;
  site: GeneratedWebsite;
};

export function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function getCanvasItemBounds(item: CanvasItem): Bounds {
  if (item.kind === 'bitmap') {
    return {
      x: item.position.x,
      y: item.position.y,
      width: item.width,
      height: item.height,
    };
  }

  if (item.kind === 'text') {
    const width = Math.max(0.055, item.content.length * 0.016);
    return {
      x: item.position.x,
      y: clamp(item.position.y - 0.018),
      width: Math.min(width, 1 - item.position.x),
      height: 0.022,
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
