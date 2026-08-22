import {
  boundsCenter,
  boundsContain,
  CANVAS_PAGE_RATIO,
  clamp,
  getCanvasItemBounds,
  pageBounds,
  type CanvasItem,
  type Bounds,
  type DividerOrientation,
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
  const firstCenter = boundsCenter(first);
  const secondCenter = boundsCenter(second);
  const xDistance = Math.abs(firstCenter.x - secondCenter.x);
  const yDistance = Math.abs(firstCenter.y - secondCenter.y) * CANVAS_PAGE_RATIO;
  return {
    horizontal: yOverlap === xOverlap ? yDistance <= xDistance : yOverlap > xOverlap,
    overlapAmount: Math.max(xOverlap, yOverlap),
    distance: Math.hypot(xDistance, yDistance),
  };
}

function combinedBounds(bounds: Bounds[]) {
  const left = Math.min(...bounds.map((item) => item.x));
  const top = Math.min(...bounds.map((item) => item.y));
  const right = Math.max(...bounds.map((item) => item.x + item.width));
  const bottom = Math.max(...bounds.map((item) => item.y + item.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function canMergeStackedParagraphs(
  upper: WebsiteNode,
  lower: WebsiteNode,
  siblings: WebsiteNode[],
) {
  const upperCenter = boundsCenter(upper.bounds);
  const lowerCenter = boundsCenter(lower.bounds);
  if (lowerCenter.y <= upperCenter.y) return false;

  const horizontalOverlap = axisOverlapRatio(
    upper.bounds.x,
    upper.bounds.width,
    lower.bounds.x,
    lower.bounds.width,
  );
  if (horizontalOverlap < 0.55) return false;

  const upperBottom = upper.bounds.y + upper.bounds.height;
  const verticalGap = lower.bounds.y - upperBottom;
  const maximumGap = Math.min(
    0.04,
    Math.max(0.018, Math.max(upper.bounds.height, lower.bounds.height) * 2.2),
  );
  if (verticalGap > maximumGap) return false;

  const sharedLeft = Math.max(upper.bounds.x, lower.bounds.x);
  const sharedRight = Math.min(
    upper.bounds.x + upper.bounds.width,
    lower.bounds.x + lower.bounds.width,
  );
  const gapTop = Math.min(upperBottom, lower.bounds.y);
  const gapBottom = Math.max(upperBottom, lower.bounds.y);
  return !siblings.some((candidate) => {
    if (candidate.id === upper.id || candidate.id === lower.id) return false;
    const crossesSharedWidth =
      candidate.bounds.x + candidate.bounds.width > sharedLeft &&
      candidate.bounds.x < sharedRight;
    const sitsBetween =
      candidate.bounds.y + candidate.bounds.height > gapTop - 0.002 &&
      candidate.bounds.y < gapBottom + 0.002;
    return crossesSharedWidth && sitsBetween;
  });
}

function dividerOrientation(node: WebsiteNode): DividerOrientation {
  return node.orientation ?? (
    node.bounds.width >= visualHeight(node.bounds.height) ? 'horizontal' : 'vertical'
  );
}

function dividerSeparates(first: WebsiteNode, second: WebsiteNode, divider: WebsiteNode) {
  const firstCenter = boundsCenter(first.bounds);
  const secondCenter = boundsCenter(second.bounds);
  const dividerCenter = boundsCenter(divider.bounds);
  if (dividerOrientation(divider) === 'vertical') {
    const liesBetween =
      dividerCenter.x > Math.min(firstCenter.x, secondCenter.x) &&
      dividerCenter.x < Math.max(firstCenter.x, secondCenter.x);
    const crossesPair =
      divider.bounds.y + divider.bounds.height >
        Math.min(first.bounds.y, second.bounds.y) &&
      divider.bounds.y <
        Math.max(
          first.bounds.y + first.bounds.height,
          second.bounds.y + second.bounds.height,
        );
    return liesBetween && crossesPair;
  }

  const liesBetween =
    dividerCenter.y > Math.min(firstCenter.y, secondCenter.y) &&
    dividerCenter.y < Math.max(firstCenter.y, secondCenter.y);
  const crossesPair =
    divider.bounds.x + divider.bounds.width >
      Math.min(first.bounds.x, second.bounds.x) &&
    divider.bounds.x <
      Math.max(
        first.bounds.x + first.bounds.width,
        second.bounds.x + second.bounds.width,
      );
  return liesBetween && crossesPair;
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

  const structuralContainerTypes = new Set<WebsiteNodeType>([
    'navbar',
    'hero',
    'section',
    'cardGrid',
    'card',
    'form',
    'footer',
  ]);
  const textNodeTypes = new Set<WebsiteNodeType>(['heading', 'paragraph']);
  const canContainChild = (parent: WebsiteNode, child: WebsiteNode) =>
    structuralContainerTypes.has(parent.type) ||
    (
      (parent.type === 'button' || parent.type === 'input') &&
      textNodeTypes.has(child.type)
    );
  const parentByNodeId: Record<string, string> = {};

  nodes.forEach((current) => {
    const automaticParent = [...nodes.values()]
      .filter(
        (candidate) =>
          candidate.id !== current.id &&
          canContainChild(candidate, current) &&
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
    const source = nodes.get(sourceId);
    const target = nodes.get(targetId);
    if (
      source &&
      (targetId === 'page' || (target && canContainChild(target, source))) &&
      !createsCycle(sourceId, targetId)
    ) {
      parentByNodeId[sourceId] = targetId;
    }
  });

  const isManuallyTyped = (node: WebsiteNode) =>
    Boolean(overrides[node.sourcePrimitiveIds[0]]);
  const directChildren = (parentId: string) => [...nodes.values()].filter(
    (node) => parentByNodeId[node.id] === parentId,
  );
  const isContainerPrimitive = (node: WebsiteNode) =>
    primitiveByNodeId.get(node.id)?.type === 'container';
  const similarlySized = (first: WebsiteNode, second: WebsiteNode) => {
    const widthRatio =
      Math.min(first.bounds.width, second.bounds.width) /
      Math.max(0.0001, Math.max(first.bounds.width, second.bounds.width));
    const firstHeight = visualHeight(first.bounds.height);
    const secondHeight = visualHeight(second.bounds.height);
    const heightRatio =
      Math.min(firstHeight, secondHeight) /
      Math.max(0.0001, Math.max(firstHeight, secondHeight));
    return widthRatio >= 0.62 && heightRatio >= 0.62;
  };
  const strongestRepeatedGroup = (children: WebsiteNode[]) => children
    .filter(isContainerPrimitive)
    .map((anchor) => children.filter(
      (candidate) => isContainerPrimitive(candidate) && similarlySized(anchor, candidate),
    ))
    .sort((first, second) => second.length - first.length)[0] ?? [];
  const inferContextualControl = (node: WebsiteNode) => {
    const height = visualHeight(node.bounds.height);
    const aspect = node.bounds.width / Math.max(0.001, height);
    const looksLikeButton = node.bounds.width < 0.27 && height < 0.13 && aspect > 1.5;
    node.type = looksLikeButton ? 'button' : 'input';
    node.content = looksLikeButton ? 'Submit' : 'Your details';
    node.confidence = Math.max(node.confidence, 0.9);
  };

  // Establish semantic container roles before any sibling pairing or row ordering.
  // Repeating the pass lets a newly inferred form or card grid inform its children.
  for (let pass = 0; pass < 3; pass += 1) {
    nodes.forEach((current) => {
      if (isManuallyTyped(current) || !isContainerPrimitive(current)) return;
      const children = directChildren(current.id);
      const inputCount = children.filter((child) => child.type === 'input').length;
      const buttonCount = children.filter((child) => child.type === 'button').length;
      if (
        current.type !== 'navbar' &&
        current.type !== 'footer' &&
        (inputCount >= 2 || (inputCount >= 1 && buttonCount >= 1))
      ) {
        current.type = 'form';
        current.content = undefined;
        current.confidence = Math.max(current.confidence, 0.94);
        return;
      }
      if (current.type === 'navbar' || current.type === 'footer') return;

      const repeatedGroup = strongestRepeatedGroup(children);
      if (current.bounds.width > 0.35 && repeatedGroup.length >= 2) {
        current.type = 'cardGrid';
        current.content = undefined;
        current.confidence = Math.max(current.confidence, 0.92);
        return;
      }

      const childTypes = new Set(children.map((child) => child.type));
      const heroContent =
        childTypes.has('heading') &&
        (childTypes.has('paragraph') || childTypes.has('image') || childTypes.has('button'));
      if (
        current.bounds.width > 0.55 &&
        current.bounds.y < 0.48 &&
        visualHeight(current.bounds.height) > 0.16 &&
        heroContent
      ) {
        current.type = 'hero';
        current.content = undefined;
        current.confidence = Math.max(current.confidence, 0.92);
        return;
      }

      const cardContentCount = children.filter((child) =>
        ['image', 'heading', 'paragraph', 'button'].includes(child.type),
      ).length;
      if (
        current.bounds.width <= 0.48 &&
        visualHeight(current.bounds.height) >= 0.1 &&
        visualHeight(current.bounds.height) <= 0.6 &&
        cardContentCount >= 2
      ) {
        current.type = 'card';
        current.content = current.content ?? 'Feature';
        current.confidence = Math.max(current.confidence, 0.9);
      }
    });

    nodes.forEach((current) => {
      if (isManuallyTyped(current) || !isContainerPrimitive(current)) return;
      const parent = nodes.get(parentByNodeId[current.id]);
      if (parent?.type === 'form' && current.type !== 'form') {
        inferContextualControl(current);
      } else if (
        parent?.type === 'cardGrid' &&
        current.type !== 'form' &&
        current.type !== 'cardGrid'
      ) {
        current.type = 'card';
        current.content = current.content ?? 'Feature';
        current.confidence = Math.max(current.confidence, 0.92);
      }
    });
  }

  const enforceSingleton = (type: 'navbar' | 'footer') => {
    const candidates = [...nodes.values()].filter((node) => node.type === type);
    if (candidates.length < 2) return;
    candidates.sort((first, second) => {
      const manualDifference = Number(isManuallyTyped(second)) - Number(isManuallyTyped(first));
      if (manualDifference !== 0) return manualDifference;
      if (type === 'navbar') {
        return (
          first.bounds.y - second.bounds.y ||
          second.bounds.width - first.bounds.width ||
          second.confidence - first.confidence
        );
      }
      return (
        second.bounds.y + second.bounds.height - (first.bounds.y + first.bounds.height) ||
        second.bounds.width - first.bounds.width ||
        second.confidence - first.confidence
      );
    });
    candidates.slice(1).forEach((node) => {
      node.type = 'section';
      if (node.content === '© 2026 Your studio') node.content = undefined;
      node.confidence = Math.min(node.confidence, 0.82);
    });
  };
  enforceSingleton('navbar');
  enforceSingleton('footer');

  nodes.forEach((current) => {
    const parent = nodes.get(parentByNodeId[current.id]);
    if (
      !parent ||
      !['button', 'input', 'image'].includes(parent.type) ||
      textNodeTypes.has(current.type)
    ) {
      return;
    }
    parentByNodeId[current.id] = parentByNodeId[parent.id] ?? 'page';
  });

  // Buttons and inputs are semantic leaves. Text drawn inside becomes their
  // label/placeholder and is removed as a separate layout node.
  [...nodes.values()].forEach((current) => {
    if (current.type !== 'button' && current.type !== 'input') return;
    const textChildren = directChildren(current.id).filter(
      (child) => textNodeTypes.has(child.type) && !isManuallyTyped(child),
    );
    if (textChildren.length === 0) return;
    const labels = textChildren
      .map((child) => {
        const sourceId = child.sourcePrimitiveIds[0];
        return customizations[sourceId]?.content ?? primitiveByNodeId.get(child.id)?.content;
      })
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value));
    if (labels.length > 0) current.content = labels.join(' ');
    current.sourcePrimitiveIds = [
      ...new Set([
        ...current.sourcePrimitiveIds,
        ...textChildren.flatMap((child) => child.sourcePrimitiveIds),
      ]),
    ];
    textChildren.forEach((child) => {
      nodes.delete(child.id);
      delete parentByNodeId[child.id];
    });
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

  const paragraphPlaceholder = 'A clear, purposeful section generated from your wireframe.';
  const parentIds = new Set(Object.values(parentByNodeId));
  parentIds.forEach((parentId) => {
    const siblings = [...nodes.values()].filter(
      (node) => parentByNodeId[node.id] === parentId,
    );
    const paragraphs = siblings
      .filter((node) => node.type === 'paragraph')
      .sort(
        (first, second) =>
          first.bounds.y - second.bounds.y || first.bounds.x - second.bounds.x,
      );
    const paragraphGroups = new Map(paragraphs.map((paragraph) => [paragraph.id, paragraph.id]));
    const findParagraphGroup = (id: string): string => {
      const parent = paragraphGroups.get(id) ?? id;
      if (parent === id) return id;
      const root = findParagraphGroup(parent);
      paragraphGroups.set(id, root);
      return root;
    };
    const joinParagraphGroups = (firstId: string, secondId: string) => {
      const firstRoot = findParagraphGroup(firstId);
      const secondRoot = findParagraphGroup(secondId);
      if (firstRoot !== secondRoot) paragraphGroups.set(secondRoot, firstRoot);
    };

    paragraphs.forEach((upper, index) => {
      paragraphs.slice(index + 1).forEach((lower) => {
        if (canMergeStackedParagraphs(upper, lower, siblings)) {
          joinParagraphGroups(upper.id, lower.id);
        }
      });
    });

    const mergedGroups = new Map<string, WebsiteNode[]>();
    paragraphs.forEach((paragraph) => {
      const root = findParagraphGroup(paragraph.id);
      const group = mergedGroups.get(root) ?? [];
      group.push(paragraph);
      mergedGroups.set(root, group);
    });
    mergedGroups.forEach((group) => {
      if (group.length < 2) return;
      group.sort(
        (first, second) =>
          first.bounds.y - second.bounds.y || first.bounds.x - second.bounds.x,
      );
      const leader = group[0];
      const content = group
        .map((paragraph) => paragraph.content?.trim())
        .filter((value): value is string => Boolean(value));
      const authoredContent = content.filter((value) => value !== paragraphPlaceholder);
      leader.bounds = combinedBounds(group.map((paragraph) => paragraph.bounds));
      leader.confidence = group.reduce((sum, paragraph) => sum + paragraph.confidence, 0) / group.length;
      leader.content = authoredContent.length > 0
        ? authoredContent.join(' ')
        : content[0] ?? paragraphPlaceholder;
      leader.sourcePrimitiveIds = group.flatMap((paragraph) => paragraph.sourcePrimitiveIds);
      group.slice(1).forEach((paragraph) => {
        nodes.delete(paragraph.id);
        delete parentByNodeId[paragraph.id];
      });
    });
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
    const groupParent = new Map(children.map((child) => [child.id, child.id]));
    const findGroup = (id: string): string => {
      const parent = groupParent.get(id) ?? id;
      if (parent === id) return id;
      const root = findGroup(parent);
      groupParent.set(id, root);
      return root;
    };
    const joinGroups = (firstId: string, secondId: string) => {
      const firstRoot = findGroup(firstId);
      const secondRoot = findGroup(secondId);
      if (firstRoot !== secondRoot) groupParent.set(secondRoot, firstRoot);
    };
    const dividers = children.filter((child) => child.type === 'divider');
    const separatedByDivider = (first: WebsiteNode, second: WebsiteNode) =>
      dividers.some((divider) => dividerSeparates(first, second, divider));

    // Every candidate here is a direct child of the same parent. Each child ranks
    // all siblings once by overlap and once by distance, with equal rank weight.
    children.forEach((child) => {
      if (child.type === 'divider') return;
      const comparisons = children
        .filter(
          (candidate) =>
            candidate.id !== child.id &&
            candidate.type !== 'divider' &&
            !separatedByDivider(child, candidate),
        )
        .map((candidate) => ({
          candidate,
          relationship: rectangleRelationship(child.bounds, candidate.bounds),
        }));
      if (comparisons.length === 0) return;

      const overlapOrder = [...comparisons].sort(
        (first, second) =>
          second.relationship.overlapAmount - first.relationship.overlapAmount ||
          first.relationship.distance - second.relationship.distance ||
          Number(second.relationship.horizontal) - Number(first.relationship.horizontal) ||
          first.candidate.id.localeCompare(second.candidate.id),
      );
      const distanceOrder = [...comparisons].sort(
        (first, second) =>
          first.relationship.distance - second.relationship.distance ||
          second.relationship.overlapAmount - first.relationship.overlapAmount ||
          Number(second.relationship.horizontal) - Number(first.relationship.horizontal) ||
          first.candidate.id.localeCompare(second.candidate.id),
      );
      const overlapRank = new Map<string, number>();
      const distanceRank = new Map<string, number>();
      let currentOverlapRank = 0;
      let currentDistanceRank = 0;
      overlapOrder.forEach((comparison, index) => {
        if (
          index > 0 &&
          Math.abs(
            comparison.relationship.overlapAmount -
              overlapOrder[index - 1].relationship.overlapAmount,
          ) > 0.000001
        ) {
          currentOverlapRank = index;
        }
        overlapRank.set(comparison.candidate.id, currentOverlapRank);
      });
      distanceOrder.forEach((comparison, index) => {
        if (
          index > 0 &&
          Math.abs(
            comparison.relationship.distance - distanceOrder[index - 1].relationship.distance,
          ) > 0.000001
        ) {
          currentDistanceRank = index;
        }
        distanceRank.set(comparison.candidate.id, currentDistanceRank);
      });
      const winner = [...comparisons].sort((first, second) => {
        const firstRank = (overlapRank.get(first.candidate.id) ?? 0) +
          (distanceRank.get(first.candidate.id) ?? 0);
        const secondRank = (overlapRank.get(second.candidate.id) ?? 0) +
          (distanceRank.get(second.candidate.id) ?? 0);
        return (
          firstRank - secondRank ||
          second.relationship.overlapAmount - first.relationship.overlapAmount ||
          first.relationship.distance - second.relationship.distance ||
          Number(second.relationship.horizontal) - Number(first.relationship.horizontal) ||
          first.candidate.id.localeCompare(second.candidate.id)
        );
      })[0];

      if (winner.relationship.horizontal) joinGroups(child.id, winner.candidate.id);
    });

    dividers
      .filter((divider) => dividerOrientation(divider) === 'vertical')
      .forEach((divider) => {
        const dividerCenter = boundsCenter(divider.bounds);
        const alignedSiblings = children.filter(
          (candidate) =>
            candidate.type !== 'divider' &&
            axisOverlapRatio(
              divider.bounds.y,
              divider.bounds.height,
              candidate.bounds.y,
              candidate.bounds.height,
            ) >= 0.2,
        );
        const left = alignedSiblings
          .filter((candidate) => boundsCenter(candidate.bounds).x < dividerCenter.x)
          .sort(
            (first, second) =>
              Math.abs(boundsCenter(first.bounds).x - dividerCenter.x) -
              Math.abs(boundsCenter(second.bounds).x - dividerCenter.x),
          )[0];
        const right = alignedSiblings
          .filter((candidate) => boundsCenter(candidate.bounds).x > dividerCenter.x)
          .sort(
            (first, second) =>
              Math.abs(boundsCenter(first.bounds).x - dividerCenter.x) -
              Math.abs(boundsCenter(second.bounds).x - dividerCenter.x),
          )[0];
        if (left) joinGroups(divider.id, left.id);
        if (right) joinGroups(divider.id, right.id);
      });

    const rowsByGroup = new Map<string, WebsiteNode[]>();
    spatialOrder.forEach((child) => {
      const root = findGroup(child.id);
      const row = rowsByGroup.get(root) ?? [];
      row.push(child);
      rowsByGroup.set(root, row);
    });
    const rows = [...rowsByGroup.values()];

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
