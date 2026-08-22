import {
  boundsCenter,
  boundsContain,
  CANVAS_PAGE_RATIO,
  clamp,
  getCanvasItemBounds,
  pageBounds,
  type CanvasItem,
  type Bounds,
  type ElementCustomizations,
  type GeneratedWebsite,
  type LayoutDirection,
  type Point,
  type RecognizedPrimitive,
  type StructureLayout,
  type StructureOverrides,
  type WebsiteNode,
  type WebsiteNodeType,
} from './model';

function distance(first: Point, second: Point) {
  return Math.hypot(
    first.x - second.x,
    (first.y - second.y) * CANVAS_PAGE_RATIO,
  );
}

function visualHeight(height: number) {
  return height * CANVAS_PAGE_RATIO;
}

function pathLength(points: Point[]) {
  return points.slice(1).reduce(
    (total, point, index) => total + distance(points[index], point),
    0,
  );
}

function directionChanges(points: Point[]) {
  const directions = points.slice(1).map((point, index) => {
    const delta = point.y - points[index].y;
    return Math.abs(delta) < 0.0007 ? 0 : Math.sign(delta);
  }).filter(Boolean);

  return directions.slice(1).reduce(
    (changes, direction, index) => changes + (direction !== directions[index] ? 1 : 0),
    0,
  );
}

type StrokeItem = Extract<CanvasItem, { kind: 'pen' | 'line' }>;

function strokePoints(stroke: StrokeItem) {
  return stroke.kind === 'pen' ? stroke.points : [stroke.start, stroke.end];
}

function pointToSegmentDistance(point: Point, start: Point, end: Point) {
  const pointX = point.x;
  const pointY = point.y * CANVAS_PAGE_RATIO;
  const startX = start.x;
  const startY = start.y * CANVAS_PAGE_RATIO;
  const endX = end.x;
  const endY = end.y * CANVAS_PAGE_RATIO;
  const lengthSquared = (endX - startX) ** 2 + (endY - startY) ** 2;
  if (lengthSquared === 0) return Math.hypot(pointX - startX, pointY - startY);
  const projection = clamp(
    ((pointX - startX) * (endX - startX) +
      (pointY - startY) * (endY - startY)) /
      lengthSquared,
  );
  return Math.hypot(
    pointX - (startX + projection * (endX - startX)),
    pointY - (startY + projection * (endY - startY)),
  );
}

function segmentsCross(firstStart: Point, firstEnd: Point, secondStart: Point, secondEnd: Point) {
  const cross = (a: Point, b: Point, c: Point) =>
    (b.x - a.x) * ((c.y - a.y) * CANVAS_PAGE_RATIO) -
    ((b.y - a.y) * CANVAS_PAGE_RATIO) * (c.x - a.x);
  const firstSide = cross(firstStart, firstEnd, secondStart);
  const secondSide = cross(firstStart, firstEnd, secondEnd);
  const thirdSide = cross(secondStart, secondEnd, firstStart);
  const fourthSide = cross(secondStart, secondEnd, firstEnd);
  const boxesOverlap =
    Math.max(Math.min(firstStart.x, firstEnd.x), Math.min(secondStart.x, secondEnd.x)) <=
      Math.min(Math.max(firstStart.x, firstEnd.x), Math.max(secondStart.x, secondEnd.x)) + 0.002 &&
    Math.max(Math.min(firstStart.y, firstEnd.y), Math.min(secondStart.y, secondEnd.y)) <=
      Math.min(Math.max(firstStart.y, firstEnd.y), Math.max(secondStart.y, secondEnd.y)) + 0.002;
  return boxesOverlap && firstSide * secondSide <= 0 && thirdSide * fourthSide <= 0;
}

function strokesIntersect(first: StrokeItem, second: StrokeItem) {
  const firstPoints = strokePoints(first);
  const secondPoints = strokePoints(second);
  const firstSegments = firstPoints.length > 1
    ? firstPoints.slice(1).map((end, index) => [firstPoints[index], end] as const)
    : [[firstPoints[0], firstPoints[0]] as const];
  const secondSegments = secondPoints.length > 1
    ? secondPoints.slice(1).map((end, index) => [secondPoints[index], end] as const)
    : [[secondPoints[0], secondPoints[0]] as const];

  return firstSegments.some(([firstStart, firstEnd]) =>
    secondSegments.some(([secondStart, secondEnd]) =>
      segmentsCross(firstStart, firstEnd, secondStart, secondEnd) ||
      pointToSegmentDistance(firstStart, secondStart, secondEnd) < 0.012 ||
      pointToSegmentDistance(firstEnd, secondStart, secondEnd) < 0.012 ||
      pointToSegmentDistance(secondStart, firstStart, firstEnd) < 0.012 ||
      pointToSegmentDistance(secondEnd, firstStart, firstEnd) < 0.012,
    ),
  );
}

function groupRapidIntersectingStrokes(items: CanvasItem[]) {
  const strokes = items
    .filter((item): item is StrokeItem => item.kind === 'pen' || item.kind === 'line')
    .sort((first, second) => strokePoints(first)[0].timestamp - strokePoints(second)[0].timestamp);
  const groups: StrokeItem[][] = [];

  strokes.forEach((stroke) => {
    const current = groups.at(-1);
    const previous = current?.at(-1);
    const previousEnd = previous ? strokePoints(previous).at(-1)?.timestamp ?? 0 : 0;
    const currentStart = strokePoints(stroke)[0].timestamp;
    const rapid = Boolean(previous && currentStart - previousEnd >= 0 && currentStart - previousEnd <= 700);
    const intersects = Boolean(current?.some((candidate) => strokesIntersect(candidate, stroke)));
    if (current && rapid && intersects) current.push(stroke);
    else groups.push([stroke]);
  });

  return groups;
}

function getRectangularity(item: Extract<CanvasItem, { kind: 'pen' }>) {
  const bounds = getCanvasItemBounds(item);
  if (bounds.width < 0.015 || visualHeight(bounds.height) < 0.015) {
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
  const slope = visualHeight(bounds.height) / bounds.width;
  return bounds.width > 0.04 && slope > 0.35 && slope < 2.8;
}

function boundsVisuallyContain(outer: Bounds, inner: Bounds) {
  const outerArea = outer.width * outer.height;
  const innerArea = Math.max(0.000001, inner.width * inner.height);
  if (outerArea <= innerArea * 1.04) return false;

  const center = boundsCenter(inner);
  const centerInside =
    center.x >= outer.x &&
    center.x <= outer.x + outer.width &&
    center.y >= outer.y &&
    center.y <= outer.y + outer.height;
  const drawingAnchorInside =
    inner.x >= outer.x &&
    inner.x <= outer.x + outer.width &&
    inner.y >= outer.y &&
    inner.y <= outer.y + outer.height;

  return boundsContain(outer, inner, 0.006) || centerInside || drawingAnchorInside;
}

function visuallyContains(outer: RecognizedPrimitive, inner: RecognizedPrimitive) {
  return boundsVisuallyContain(outer.bounds, inner.bounds);
}

function framePrimitive(
  item: Extract<CanvasItem, { kind: 'frame' }>,
  items: CanvasItem[],
): RecognizedPrimitive {
  const bounds = getCanvasItemBounds(item);
  const height = visualHeight(bounds.height);
  const aspect = bounds.width / height;
  const internalItems = items.filter(
    (candidate) =>
      candidate.id !== item.id &&
      boundsVisuallyContain(bounds, getCanvasItemBounds(candidate)),
  );
  const diagonals = internalItems.filter(isDiagonal);
  const internalText = internalItems.find((candidate) => candidate.kind === 'text');
  const hasNestedElement = internalItems.some(
    (candidate) => candidate.kind !== 'text' && !isDiagonal(candidate),
  );

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

  if (!hasNestedElement && bounds.width < 0.27 && height < 0.13 && aspect > 1.5) {
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
    !hasNestedElement &&
    bounds.width >= 0.27 &&
    bounds.width < 0.62 &&
    height < 0.105 &&
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
    directDistance < Math.max(0.025, Math.min(bounds.width, visualHeight(bounds.height)) * 0.4);
  const rectangularity = getRectangularity(item);
  const horizontal = bounds.width > 0.045 && visualHeight(bounds.height) < 0.025;
  const height = visualHeight(bounds.height);
  const aspect = bounds.width / Math.max(height, 0.001);
  const pathComplexity = length / Math.max(bounds.width, 0.001);
  const squigglyText =
    bounds.width > 0.035 &&
    height >= 0.006 &&
    height < 0.09 &&
    aspect > 1.45 &&
    pathComplexity > 1.16 &&
    pathComplexity < 8 &&
    directionChanges(item.points) >= 2;

  if (closed && rectangularity > 0.56 && bounds.width > 0.05) {
    const compact = bounds.width < 0.27 && visualHeight(bounds.height) < 0.13;
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

  if (squigglyText) {
    return {
      id: `primitive-${item.id}`,
      sourceItemIds: [item.id],
      type: 'text',
      bounds: { ...bounds, height: Math.max(bounds.height, 0.012) },
      confidence: clamp(0.72 + Math.min(directionChanges(item.points), 7) * 0.025),
      manuallyCorrected: false,
    };
  }

  if (horizontal && length < bounds.width * 1.55) {
    return {
      id: `primitive-${item.id}`,
      sourceItemIds: [item.id],
      type: 'text',
      bounds: { ...bounds, height: Math.max(bounds.height, 0.012) },
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
    if (item.kind === 'frame' || item.kind === 'pen' || item.kind === 'line') {
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

  });

  groupRapidIntersectingStrokes(items).forEach((group) => {
    if (group.length === 1 && group[0].kind === 'line') {
      const bounds = getCanvasItemBounds(group[0]);
      const orientation = bounds.width >= visualHeight(bounds.height)
        ? 'horizontal'
        : 'vertical';
      primitives.push({
        id: `primitive-${group[0].id}`,
        sourceItemIds: [group[0].id],
        type: 'divider',
        bounds,
        confidence: 0.96,
        manuallyCorrected: false,
        orientation,
      });
      return;
    }

    const merged: Extract<CanvasItem, { kind: 'pen' }> = {
      id: group[0].id,
      kind: 'pen',
      points: group.flatMap(strokePoints),
    };
    const primitive = recognizePen(merged);
    primitives.push({
      ...primitive,
      id: `primitive-${group[0].id}`,
      sourceItemIds: group.map((item) => item.id),
      confidence: group.length > 1 ? Math.max(0.82, primitive.confidence) : primitive.confidence,
    });
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
    visualHeight(primitive.bounds.height) < 0.2
  );
}

function isWideBottomContainer(primitive: RecognizedPrimitive) {
  return (
    primitive.type === 'container' &&
    primitive.bounds.width > 0.58 &&
    primitive.bounds.y + primitive.bounds.height > 0.78
  );
}

function axisOverlapRatio(
  firstStart: number,
  firstSize: number,
  secondStart: number,
  secondSize: number,
) {
  const overlap = Math.max(
    0,
    Math.min(firstStart + firstSize, secondStart + secondSize) -
      Math.max(firstStart, secondStart),
  );
  return overlap / Math.max(0.0001, Math.min(firstSize, secondSize));
}

function rectangleRelationship(first: Bounds, second: Bounds) {
  const xOverlap = axisOverlapRatio(first.x, first.width, second.x, second.width);
  const yOverlap = axisOverlapRatio(first.y, first.height, second.y, second.height);
  return {
    horizontal: yOverlap > xOverlap,
    horizontalStrength: yOverlap - xOverlap,
  };
}

export function inferWebsite(
  primitives: RecognizedPrimitive[],
  overrides: StructureOverrides = {},
  layout: StructureLayout = {
    parentByPrimitiveId: {},
    orderByParentId: {},
  },
  customizations: ElementCustomizations = {},
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
      visualHeight(primitive.bounds.height) > 0.16
    ) {
      return 'hero';
    }
    const containedContainers = containers.filter(
      (candidate) =>
        candidate.id !== primitive.id &&
        visuallyContains(primitive, candidate),
    );
    if (primitive.bounds.width > 0.35 && containedContainers.length >= 2) {
      return 'cardGrid';
    }
    if (
      primitive.bounds.width <= 0.43 &&
      visualHeight(primitive.bounds.height) >= 0.1 &&
      visualHeight(primitive.bounds.height) <= 0.48
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
    if (type === 'footer') return '© 2026 Your studio';
    if (type === 'card') return 'Feature';
    return undefined;
  }

  const nodes = new Map<string, WebsiteNode>();
  const primitiveByNodeId = new Map<string, RecognizedPrimitive>();
  sorted.forEach((primitive) => {
    const type = overrides[primitive.id] ?? automaticType(primitive);
    nodes.set(`node-${primitive.id}`, {
      id: `node-${primitive.id}`,
      type,
      bounds: primitive.bounds,
      confidence: overrides[primitive.id] ? 1 : primitive.confidence,
      children: [],
      content: defaultContent(type, primitive),
      orientation: primitive.orientation,
      sourcePrimitiveIds: [primitive.id],
    });
    primitiveByNodeId.set(`node-${primitive.id}`, primitive);
  });

  const canContain = (type: WebsiteNodeType) =>
    [
      'navbar',
      'hero',
      'section',
      'cardGrid',
      'card',
      'button',
      'input',
      'image',
      'form',
      'footer',
    ].includes(type);
  const parentByNodeId: Record<string, string> = {};

  nodes.forEach((current) => {
    const automaticParent = [...nodes.values()]
      .filter(
        (candidate) =>
          candidate.id !== current.id &&
          canContain(candidate.type) &&
          visuallyContains(
            primitiveByNodeId.get(candidate.id)!,
            primitiveByNodeId.get(current.id)!,
          ),
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

  nodes.forEach((current) => {
    const parent = nodes.get(parentByNodeId[current.id]);
    const primitiveId = current.sourcePrimitiveIds[0];
    const inferredContainerType = [
      'navbar',
      'hero',
      'section',
      'cardGrid',
      'card',
      'footer',
    ].includes(current.type);
    if (parent?.type !== 'form' || overrides[primitiveId] || !inferredContainerType) return;

    const height = visualHeight(current.bounds.height);
    const looksLikeButton =
      current.bounds.width < 0.27 && height < 0.13 && current.bounds.width / height > 1.5;
    current.type = looksLikeButton ? 'button' : 'input';
    current.content = looksLikeButton ? 'Submit' : 'Your details';
    current.confidence = Math.max(current.confidence, 0.9);
  });

  nodes.forEach((current) => {
    const customization = customizations[current.sourcePrimitiveIds[0]];
    if (!customization) return;
    if (customization.content !== undefined) current.content = customization.content;
    if (customization.imageDataUrl !== undefined) current.imageDataUrl = customization.imageDataUrl;
    if (customization.fontSize !== undefined) current.fontSize = customization.fontSize;
    if (customization.linkPageId !== undefined) current.linkPageId = customization.linkPageId;
    if (customization.styleVariant !== undefined) current.styleVariant = customization.styleVariant;
  });

  const childrenByParent = new Map<string, WebsiteNode[]>();
  nodes.forEach((current) => {
    const parentId = parentByNodeId[current.id] ?? 'page';
    const siblings = childrenByParent.get(parentId) ?? [];
    siblings.push(current);
    childrenByParent.set(parentId, siblings);
  });

  const arrangeChildren = (parentId: string, children: WebsiteNode[]) => {
    const manualOrder = layout.orderByParentId[parentId] ?? [];
    const spatialOrder = [...children].sort(
      (first, second) => first.bounds.y - second.bounds.y || first.bounds.x - second.bounds.x,
    );
    const rows: WebsiteNode[][] = [];

    spatialOrder.forEach((child) => {
      const childCenter = boundsCenter(child.bounds);
      let bestRow: WebsiteNode[] | null = null;
      let bestOverlapStrength = 0;
      let bestDistance = Number.POSITIVE_INFINITY;

      rows.forEach((row) => {
        row.forEach((candidate) => {
          const relationship = rectangleRelationship(child.bounds, candidate.bounds);
          if (!relationship.horizontal) return;
          const candidateCenter = boundsCenter(candidate.bounds);
          const pairDistance = Math.hypot(
            childCenter.x - candidateCenter.x,
            (childCenter.y - candidateCenter.y) * CANVAS_PAGE_RATIO,
          );
          if (
            relationship.horizontalStrength > bestOverlapStrength ||
            (relationship.horizontalStrength === bestOverlapStrength && pairDistance < bestDistance)
          ) {
            bestRow = row;
            bestOverlapStrength = relationship.horizontalStrength;
            bestDistance = pairDistance;
          }
        });
      });

      const targetRow = bestRow as WebsiteNode[] | null;
      if (targetRow) targetRow.push(child);
      else rows.push([child]);
    });

    rows.forEach((row) =>
      row.sort((first, second) => first.bounds.x - second.bounds.x),
    );
    rows.sort(
      (first, second) =>
        Math.min(...first.map((child) => child.bounds.y)) -
        Math.min(...second.map((child) => child.bounds.y)),
    );

    if (manualOrder.length > 0) {
      const rank = (node: WebsiteNode) => {
        const index = manualOrder.indexOf(node.sourcePrimitiveIds[0]);
        return index < 0 ? Number.POSITIVE_INFINITY : index;
      };
      rows.forEach((row) => row.sort((first, second) => rank(first) - rank(second)));
      rows.sort(
        (first, second) => Math.min(...first.map(rank)) - Math.min(...second.map(rank)),
      );
    }

    const hasHorizontalRow = rows.some((row) => row.length > 1);
    const direction: LayoutDirection =
      rows.length === 1 && hasHorizontalRow
        ? 'horizontal'
        : rows.length > 1 && hasHorizontalRow
          ? 'mixed'
          : 'vertical';
    return {
      children: rows.flat(),
      childRows: rows.map((row) => row.map((child) => child.id)),
      direction,
    };
  };

  const attachChildren = (current: WebsiteNode) => {
    const arrangement = arrangeChildren(
      current.id,
      childrenByParent.get(current.id) ?? [],
    );
    current.children = arrangement.children;
    current.childRows = arrangement.childRows;
    current.layout = current.type === 'cardGrid' ? 'grid' : arrangement.direction;
    current.children.forEach(attachChildren);
  };

  const rootArrangement = arrangeChildren('page', childrenByParent.get('page') ?? []);

  const tree: WebsiteNode = {
    id: 'page',
    type: 'page',
    bounds: pageBounds,
    confidence:
      primitives.length > 0
        ? primitives.reduce((sum, primitive) => sum + primitive.confidence, 0) /
          primitives.length
        : 0,
    children: rootArrangement.children,
    childRows: rootArrangement.childRows,
    layout: rootArrangement.direction,
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
