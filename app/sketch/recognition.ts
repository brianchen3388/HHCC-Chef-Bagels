import {
  boundsContain,
  clamp,
  getCanvasItemBounds,
  pageBounds,
  type CanvasItem,
  type GeneratedWebsite,
  type Point,
  type RecognizedPrimitive,
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
  consumed: Set<string>,
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
    diagonals.forEach((diagonal) => consumed.add(diagonal.id));
    return {
      id: `primitive-${item.id}`,
      sourceItemIds: [item.id, ...diagonals.map((diagonal) => diagonal.id)],
      type: 'image',
      bounds,
      confidence: 0.97,
      manuallyCorrected: false,
    };
  }

  if (bounds.width < 0.27 && bounds.height < 0.13 && aspect > 1.5) {
    if (internalText) {
      consumed.add(internalText.id);
    }
    return {
      id: `primitive-${item.id}`,
      sourceItemIds: [item.id, ...(internalText ? [internalText.id] : [])],
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
    if (internalText) {
      consumed.add(internalText.id);
    }
    return {
      id: `primitive-${item.id}`,
      sourceItemIds: [item.id, ...(internalText ? [internalText.id] : [])],
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
    type: 'unknown',
    bounds,
    confidence: closed || horizontal ? 0.48 : 0.32,
    manuallyCorrected: false,
  };
}

export function recognizeCanvas(items: CanvasItem[]) {
  const consumed = new Set<string>();
  const primitives: RecognizedPrimitive[] = [];

  items
    .filter((item) => item.kind === 'frame')
    .forEach((item) => {
      primitives.push(framePrimitive(item, items, consumed));
      consumed.add(item.id);
    });

  items.forEach((item) => {
    if (consumed.has(item.id)) {
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
        type: horizontal ? 'text' : 'unknown',
        bounds: horizontal
          ? { ...bounds, height: Math.max(bounds.height, 0.028) }
          : bounds,
        confidence: horizontal ? 0.88 : 0.42,
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

function node(
  id: string,
  type: WebsiteNodeType,
  primitives: RecognizedPrimitive[],
  children: WebsiteNode[] = [],
  content?: string,
): WebsiteNode {
  const bounds = primitives[0]?.bounds ?? pageBounds;
  return {
    id,
    type,
    bounds,
    confidence:
      primitives.length === 0
        ? 0.75
        : primitives.reduce((sum, primitive) => sum + primitive.confidence, 0) /
          primitives.length,
    children,
    content,
    sourcePrimitiveIds: primitives.map((primitive) => primitive.id),
  };
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
): GeneratedWebsite {
  const isType = (primitive: RecognizedPrimitive, type: string) =>
    overrides[primitive.id] === type ||
    (!overrides[primitive.id] && primitive.type === type);
  const containers = primitives.filter((primitive) => isType(primitive, 'container'));
  const automaticTexts = primitives.filter((primitive) => isType(primitive, 'text'));
  const explicitHeadings = primitives.filter(
    (primitive) => overrides[primitive.id] === 'heading',
  );
  const headingPrimitives = [
    ...explicitHeadings,
    ...automaticTexts.filter((primitive) => !explicitHeadings.includes(primitive)).slice(0, 1),
  ];
  const paragraphPrimitives = [
    ...primitives.filter((primitive) => overrides[primitive.id] === 'paragraph'),
    ...automaticTexts.filter((primitive) => primitive.id !== headingPrimitives[0]?.id),
  ];
  const texts = [...headingPrimitives, ...paragraphPrimitives].filter(
    (primitive, index, list) =>
      list.findIndex((candidate) => candidate.id === primitive.id) === index,
  );
  const buttons = primitives.filter((primitive) => isType(primitive, 'button'));
  const inputs = primitives.filter((primitive) => isType(primitive, 'input'));
  const images = primitives.filter((primitive) => isType(primitive, 'image'));
  const navbarPrimitive =
    primitives.find((primitive) => overrides[primitive.id] === 'navbar') ??
    primitives.find(
      (primitive) => !overrides[primitive.id] && isWideTopContainer(primitive),
    );
  const footerPrimitive =
    primitives.find((primitive) => overrides[primitive.id] === 'footer') ??
    primitives.find(
      (primitive) => !overrides[primitive.id] && isWideBottomContainer(primitive),
    );
  const heroContainer = containers.find(
    (primitive) =>
      overrides[primitive.id] === 'hero' ||
      (primitive.id !== navbarPrimitive?.id &&
      primitive.id !== footerPrimitive?.id &&
      primitive.bounds.width > 0.55 &&
      primitive.bounds.y < 0.48 &&
      primitive.bounds.height > 0.16),
  ) ?? primitives.find((primitive) => overrides[primitive.id] === 'hero');
  const cardContainers = primitives.filter(
    (primitive) =>
      overrides[primitive.id] === 'card' ||
      (!overrides[primitive.id] &&
        primitive.type === 'container' &&
        primitive.id !== navbarPrimitive?.id &&
        primitive.id !== footerPrimitive?.id &&
        primitive.id !== heroContainer?.id &&
        primitive.bounds.width >= 0.12 &&
        primitive.bounds.width <= 0.43 &&
        primitive.bounds.height >= 0.1 &&
        primitive.bounds.height <= 0.48),
  );

  const meaningfulText = texts
    .map((primitive) => primitive.content?.trim())
    .filter((content): content is string => Boolean(content && content !== 'Text'));
  const heroExists = Boolean(
    heroContainer ||
      headingPrimitives.length > 0 ||
      paragraphPrimitives.length > 0 ||
      buttons.length > 0 ||
      images.length > 0,
  );

  const navbarNode = navbarPrimitive
    ? node('navbar', 'navbar', [navbarPrimitive])
    : null;
  const heroChildren: WebsiteNode[] = [];
  if (heroExists) {
    if (headingPrimitives[0]) {
      heroChildren.push(
        node(
          'hero-heading',
          'heading',
          [headingPrimitives[0]],
          [],
          meaningfulText[0] ?? 'Build ideas at the speed of a sketch',
        ),
      );
    }
    if (paragraphPrimitives[0]) {
      heroChildren.push(
        node(
          'hero-copy',
          'paragraph',
          [paragraphPrimitives[0]],
          [],
          meaningfulText[1] ?? 'Turn a rough wireframe into a polished page.',
        ),
      );
    }
    if (buttons[0]) {
      heroChildren.push(
        node(
          'hero-button',
          'button',
          [buttons[0]],
          [],
          buttons[0].content ?? 'Get started',
        ),
      );
    }
    if (images[0]) {
      heroChildren.push(node('hero-image', 'image', [images[0]]));
    }
  }

  const heroNode = heroExists
    ? node(
        'hero',
        'hero',
        heroContainer ? [heroContainer] : heroChildren.flatMap((child) =>
          primitives.filter((primitive) => child.sourcePrimitiveIds.includes(primitive.id)),
        ),
        heroChildren,
      )
    : null;

  const cardNodes = cardContainers.slice(0, 6).map((primitive, index) =>
    node(
      `card-${index + 1}`,
      'card',
      [primitive],
      [],
      `Feature ${index + 1}`,
    ),
  );
  const cardGridNode =
    cardNodes.length > 0
      ? node('card-grid', 'cardGrid', cardContainers.slice(0, 6), cardNodes)
      : null;
  const explicitFormPrimitive = primitives.find(
    (primitive) => overrides[primitive.id] === 'form',
  );
  const formNode =
    inputs.length > 0 || explicitFormPrimitive
      ? node(
          'form',
          'form',
          explicitFormPrimitive ? [explicitFormPrimitive, ...inputs] : inputs,
          inputs.map((primitive, index) =>
            node(
              `input-${index + 1}`,
              'input',
              [primitive],
              [],
              primitive.content ?? `Field ${index + 1}`,
            ),
          ),
        )
      : null;
  const footerNode = footerPrimitive
    ? node('footer', 'footer', [footerPrimitive], [], '© 2026 Your studio')
    : null;

  const children = [navbarNode, heroNode, cardGridNode, formNode, footerNode].filter(
    (child): child is WebsiteNode => Boolean(child),
  );
  const tree: WebsiteNode = {
    id: 'page',
    type: 'page',
    bounds: pageBounds,
    confidence:
      primitives.length > 0
        ? primitives.reduce((sum, primitive) => sum + primitive.confidence, 0) /
          primitives.length
        : 0,
    children,
    sourcePrimitiveIds: primitives.map((primitive) => primitive.id),
  };

  return {
    tree,
    navbar: navbarNode
      ? { brand: meaningfulText[0] ?? 'Studio', links: ['Work', 'About', 'Contact'] }
      : null,
    hero: heroNode
      ? {
          heading: meaningfulText[navbarNode ? 1 : 0] ?? 'Build ideas at the speed of a sketch',
          body:
            meaningfulText[navbarNode ? 2 : 1] ??
            'Turn a rough wireframe into a thoughtful, responsive website.',
          cta: buttons[0]?.content ?? (buttons.length > 0 ? 'Get started' : null),
          showImage: images.length > 0,
        }
      : null,
    cards: cardNodes.map((card, index) => ({
      title: card.content ?? `Feature ${index + 1}`,
      body: 'A clear, purposeful section generated from your wireframe.',
    })),
    form: formNode
      ? {
          fields:
            inputs.length > 0
              ? inputs.map((input, index) => input.content ?? `Field ${index + 1}`)
              : ['Your details'],
          button: buttons.at(-1)?.content ?? 'Submit',
        }
      : null,
    footer: footerNode ? { text: footerNode.content ?? '© 2026 Your studio' } : null,
  };
}

export function confidenceLabel(confidence: number) {
  if (confidence >= 0.75) return 'confident';
  if (confidence >= 0.5) return 'uncertain';
  return 'unknown';
}

export function primitiveLabel(type: RecognizedPrimitive['type']) {
  return type.charAt(0).toUpperCase() + type.slice(1);
}
