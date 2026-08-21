import {
  boundsContain,
  clamp,
  getCanvasItemBounds,
  pageBounds,
  type CanvasItem,
  type GeneratedWebsite,
  type Point,
  type RecognizedPrimitive,
  type StructureLayout,
  type StructureOverrides,
  type WebsiteNode,
  type WebsiteNodeType,
} from './model';

function distance(first: Point, second: Point) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function pathLength(points: Point[]) {
  return points.slice(1).reduce(
    (total, point, index) => total + distance(points[index], point),
    0,
  );
}

function getRectangularity(item: Extract<CanvasItem, { kind: 'pen' }>) {
  const bounds = getCanvasItemBounds(item);
  if (bounds.width < 0.015 || bounds.height < 0.015) {
    return 0;
  }

  const averageEdgeDistance =
    item.points.reduce((total, point) => {
      const horizontalEdge = Math.min(
        Math.abs(point.y - bounds.y),
        Math.abs(point.y - (bounds.y + bounds.height)),
      );
      const verticalEdge = Math.min(
        Math.abs(point.x - bounds.x),
        Math.abs(point.x - (bounds.x + bounds.width)),
      );
      return (
        total +
        Math.min(
          horizontalEdge / bounds.height,
          verticalEdge / bounds.width,
        )
      );
    }, 0) / item.points.length;

  return clamp(1 - averageEdgeDistance * 5);
}

function isDiagonal(item: CanvasItem) {
  if (item.kind !== 'line') {
    return false;
  }
  const bounds = getCanvasItemBounds(item);
  const slope = bounds.height / bounds.width;
  return bounds.width > 0.04 && slope > 0.35 && slope < 2.8;
}

function framePrimitive(
  item: Extract<CanvasItem, { kind: 'frame' }>,
  items: CanvasItem[],
): RecognizedPrimitive {
  const bounds = getCanvasItemBounds(item);
  const aspect = bounds.width / bounds.height;
  const internalItems = items.filter(
    (candidate) =>
      candidate.id !== item.id &&
      boundsContain(bounds, getCanvasItemBounds(candidate), 0.02),
  );
  const diagonals = internalItems.filter(isDiagonal);
  const internalText = internalItems.find((candidate) => candidate.kind === 'text');

  if (diagonals.length >= 2) {
    return {
      id: `primitive-${item.id}`,
      sourceItemIds: [item.id],
      type: 'image',
      bounds,
      confidence: 0.97,
      manuallyCorrected: false,
    };
  }

  if (bounds.width < 0.27 && bounds.height < 0.13 && aspect > 1.5) {
    return {
      id: `primitive-${item.id}`,
      sourceItemIds: [item.id],
      type: 'button',
      bounds,
      confidence: internalText ? 0.96 : 0.82,
      manuallyCorrected: false,
      content: internalText?.kind === 'text' ? internalText.content : 'Get started',
    };
  }

  if (
    bounds.width >= 0.27 &&
    bounds.width < 0.62 &&
    bounds.height < 0.105 &&
    aspect > 3
  ) {
    return {
      id: `primitive-${item.id}`,
      sourceItemIds: [item.id],
      type: 'input',
      bounds,
      confidence: internalText ? 0.94 : 0.79,
      manuallyCorrected: false,
      content: internalText?.kind === 'text' ? internalText.content : 'Your details',
    };
  }

  return {
    id: `primitive-${item.id}`,
    sourceItemIds: [item.id],
    type: 'container',
    bounds,
    confidence: 0.96,
    manuallyCorrected: false,
  };
}

function recognizePen(
  item: Extract<CanvasItem, { kind: 'pen' }>,
): RecognizedPrimitive {
  const bounds = getCanvasItemBounds(item);
  const first = item.points[0];
  const last = item.points.at(-1) ?? first;
  const length = pathLength(item.points);
  const directDistance = distance(first, last);
  const closed =
    item.points.length > 5 &&
    directDistance < Math.max(0.025, Math.min(bounds.width, bounds.height) * 0.4);
  const rectangularity = getRectangularity(item);
  const horizontal = bounds.width > 0.045 && bounds.height < 0.025;

  if (closed && rectangularity > 0.56 && bounds.width > 0.05) {
    const aspect = bounds.width / bounds.height;
    const compact = bounds.width < 0.27 && bounds.height < 0.13;
    return {
      id: `primitive-${item.id}`,
      sourceItemIds: [item.id],
      type: compact && aspect > 1.5 ? 'button' : 'container',
      bounds,
      confidence: clamp(0.62 + rectangularity * 0.25),
      manuallyCorrected: false,
      content: compact ? 'Get started' : undefined,
    };
  }

  if (horizontal && length < bounds.width * 1.55) {
    return {
      id: `primitive-${item.id}`,
      sourceItemIds: [item.id],
      type: 'text',
      bounds: { ...bounds, height: Math.max(bounds.height, 0.03) },
      confidence: 0.78,
      manuallyCorrected: false,
    };
  }

  return {
    id: `primitive-${item.id}`,
    sourceItemIds: [item.id],
    type: 'image',
    bounds,
    confidence: closed || horizontal ? 0.48 : 0.38,
    manuallyCorrected: false,
  };
}

export function recognizeCanvas(items: CanvasItem[]) {
  const primitives: RecognizedPrimitive[] = [];

  items
    .filter((item) => item.kind === 'frame')
    .forEach((item) => {
      primitives.push(framePrimitive(item, items));
    });

  items.forEach((item) => {
    if (item.kind === 'frame') {
      return;
    }

    if (item.kind === 'text') {
      primitives.push({
        id: `primitive-${item.id}`,
        sourceItemIds: [item.id],
        type: 'text',
        bounds: getCanvasItemBounds(item),
        confidence: 0.99,
        manuallyCorrected: false,
        content: item.content,
      });
      return;
    }

    if (item.kind === 'line') {
      const bounds = getCanvasItemBounds(item);
      const horizontal = bounds.width > 0.045 && bounds.height < 0.025;
      primitives.push({
        id: `primitive-${item.id}`,
        sourceItemIds: [item.id],
        type: horizontal ? 'text' : 'divider',
        bounds: horizontal
          ? { ...bounds, height: Math.max(bounds.height, 0.028) }
          : bounds,
        confidence: horizontal ? 0.88 : 0.7,
        manuallyCorrected: false,
      });
      return;
    }

    primitives.push(recognizePen(item));
  });

  return primitives.sort((first, second) =>
    first.bounds.y === second.bounds.y
      ? first.bounds.x - second.bounds.x
      : first.bounds.y - second.bounds.y,
  );
}

function isWideTopContainer(primitive: RecognizedPrimitive) {
  return (
    primitive.type === 'container' &&
    primitive.bounds.width > 0.58 &&
    primitive.bounds.y < 0.18 &&
    primitive.bounds.height < 0.2
  );
}

function isWideBottomContainer(primitive: RecognizedPrimitive) {
  return (
    primitive.type === 'container' &&
    primitive.bounds.width > 0.58 &&
    primitive.bounds.y + primitive.bounds.height > 0.78
  );
}

export function inferWebsite(
  primitives: RecognizedPrimitive[],
  overrides: StructureOverrides = {},
  layout: StructureLayout = {
    parentByPrimitiveId: {},
    orderByParentId: {},
  },
): GeneratedWebsite {
  const sorted = [...primitives].sort((first, second) =>
    first.bounds.y === second.bounds.y
      ? first.bounds.x - second.bounds.x
      : first.bounds.y - second.bounds.y,
  );
  const containers = primitives.filter((primitive) => primitive.type === 'container');
  const firstTextId = sorted.find((primitive) => primitive.type === 'text')?.id;

  function automaticType(primitive: RecognizedPrimitive): WebsiteNodeType {
    if (primitive.type === 'button' || primitive.type === 'input') return primitive.type;
    if (primitive.type === 'image' || primitive.type === 'divider') return primitive.type;
    if (primitive.type === 'text') {
      return primitive.id === firstTextId ? 'heading' : 'paragraph';
    }
    if (isWideTopContainer(primitive)) return 'navbar';
    if (isWideBottomContainer(primitive)) return 'footer';
    if (
      primitive.bounds.width > 0.55 &&
      primitive.bounds.y < 0.48 &&
      primitive.bounds.height > 0.16
    ) {
      return 'hero';
    }
    const containedContainers = containers.filter(
      (candidate) =>
        candidate.id !== primitive.id &&
        boundsContain(primitive.bounds, candidate.bounds, 0.01),
    );
    if (primitive.bounds.width > 0.35 && containedContainers.length >= 2) {
      return 'cardGrid';
    }
    if (
      primitive.bounds.width <= 0.43 &&
      primitive.bounds.height >= 0.1 &&
      primitive.bounds.height <= 0.48
    ) {
      return 'card';
    }
    return 'section';
  }

  function defaultContent(type: WebsiteNodeType, primitive: RecognizedPrimitive) {
    const supplied = primitive.content?.trim();
    if (supplied && supplied !== 'Text') return supplied;
    if (type === 'heading') return 'Build ideas at the speed of a sketch';
    if (type === 'paragraph') return 'A clear, purposeful section generated from your wireframe.';
    if (type === 'button') return 'Get started';
    if (type === 'input') return 'Your details';
    if (type === 'navbar') return 'Studio';
    if (type === 'footer') return '© 2026 Your studio';
    if (type === 'card') return 'Feature';
    return undefined;
  }

  const nodes = new Map<string, WebsiteNode>();
  sorted.forEach((primitive) => {
    const type = overrides[primitive.id] ?? automaticType(primitive);
    nodes.set(`node-${primitive.id}`, {
      id: `node-${primitive.id}`,
      type,
      bounds: primitive.bounds,
      confidence: overrides[primitive.id] ? 1 : primitive.confidence,
      children: [],
      content: defaultContent(type, primitive),
      sourcePrimitiveIds: [primitive.id],
    });
  });

  const canContain = (type: WebsiteNodeType) =>
    ['navbar', 'hero', 'section', 'cardGrid', 'card', 'form', 'footer'].includes(type);
  const parentByNodeId: Record<string, string> = {};

  nodes.forEach((current) => {
    const automaticParent = [...nodes.values()]
      .filter(
        (candidate) =>
          candidate.id !== current.id &&
          canContain(candidate.type) &&
          boundsContain(candidate.bounds, current.bounds, 0.008),
      )
      .sort(
        (first, second) =>
          first.bounds.width * first.bounds.height -
          second.bounds.width * second.bounds.height,
      )[0];
    parentByNodeId[current.id] = automaticParent?.id ?? 'page';
  });

  function createsCycle(sourceId: string, targetId: string) {
    let cursor = targetId;
    const visited = new Set<string>();
    while (cursor !== 'page' && !visited.has(cursor)) {
      if (cursor === sourceId) return true;
      visited.add(cursor);
      cursor = parentByNodeId[cursor] ?? 'page';
    }
    return false;
  }

  Object.entries(layout.parentByPrimitiveId).forEach(([primitiveId, targetId]) => {
    const sourceId = `node-${primitiveId}`;
    const target = nodes.get(targetId);
    if (
      nodes.has(sourceId) &&
      (targetId === 'page' || (target && canContain(target.type))) &&
      !createsCycle(sourceId, targetId)
    ) {
      parentByNodeId[sourceId] = targetId;
    }
  });

  const childrenByParent = new Map<string, WebsiteNode[]>();
  nodes.forEach((current) => {
    const parentId = parentByNodeId[current.id] ?? 'page';
    const siblings = childrenByParent.get(parentId) ?? [];
    siblings.push(current);
    childrenByParent.set(parentId, siblings);
  });

  const sortChildren = (parentId: string, children: WebsiteNode[]) => {
    const manualOrder = layout.orderByParentId[parentId] ?? [];
    return children.sort((first, second) => {
      const firstIndex = manualOrder.indexOf(first.sourcePrimitiveIds[0]);
      const secondIndex = manualOrder.indexOf(second.sourcePrimitiveIds[0]);
      if (firstIndex >= 0 || secondIndex >= 0) {
        if (firstIndex < 0) return 1;
        if (secondIndex < 0) return -1;
        return firstIndex - secondIndex;
      }
      return first.bounds.y === second.bounds.y
        ? first.bounds.x - second.bounds.x
        : first.bounds.y - second.bounds.y;
    });
  };

  const attachChildren = (current: WebsiteNode) => {
    current.children = sortChildren(
      current.id,
      childrenByParent.get(current.id) ?? [],
    );
    current.children.forEach(attachChildren);
  };
  nodes.forEach((current) => {
    if (canContain(current.type)) attachChildren(current);
  });

  const tree: WebsiteNode = {
    id: 'page',
    type: 'page',
    bounds: pageBounds,
    confidence:
      primitives.length > 0
        ? primitives.reduce((sum, primitive) => sum + primitive.confidence, 0) /
          primitives.length
        : 0,
    children: sortChildren('page', childrenByParent.get('page') ?? []),
    sourcePrimitiveIds: primitives.map((primitive) => primitive.id),
  };
  tree.children.forEach(attachChildren);

  return { tree };
}

export function confidenceLabel(confidence: number) {
  if (confidence >= 0.75) return 'confident';
  if (confidence >= 0.5) return 'uncertain';
  return 'unknown';
}

export function primitiveLabel(type: RecognizedPrimitive['type']) {
  return type.charAt(0).toUpperCase() + type.slice(1);
}
