export const COMPONENT_TYPES = [
  'page',
  'navbar',
  'header',
  'hero',
  'section',
  'container',
  'heading',
  'text',
  'image',
  'button',
  'input',
  'textarea',
  'checkbox',
  'form',
  'card',
  'grid',
  'list',
  'divider',
  'footer',
  'unknown',
] as const;

export const PAGE_INTENT_TYPES = [
  'landing-page',
  'portfolio',
  'dashboard',
  'form',
  'article',
  'storefront',
  'unknown',
] as const;

export type ComponentType = (typeof COMPONENT_TYPES)[number];
export type PageIntentType = (typeof PAGE_INTENT_TYPES)[number];

export type ComponentAlternative = {
  type: ComponentType;
  confidence: number;
};

export type RecognizedComponent = {
  id: string;
  type: ComponentType;
  parentId: string | null;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  text: string | null;
  visualHint: string | null;
  confidence: number;
  alternatives: ComponentAlternative[];
};

export type ComponentScene = {
  schemaVersion: '1';
  canvas: {
    width: 1000;
    height: 1000;
  };
  pageIntent: {
    type: PageIntentType;
    description: string;
    confidence: number;
  };
  components: RecognizedComponent[];
};

export type DeletedComponent = {
  id: string;
  reason: string;
  confidence: number;
};

export type ComponentDelta = {
  schemaVersion: '1';
  changeSummary: string;
  pageIntent: ComponentScene['pageIntent'];
  added: RecognizedComponent[];
  updated: RecognizedComponent[];
  deleted: DeletedComponent[];
};

export type GeneratedPage = {
  schemaVersion: '1';
  style: {
    name: string;
    rationale: string;
    characteristics: string[];
    palette: string[];
    typography: string;
  };
  html: string;
  css: string;
};

const boundsSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    x: { type: 'number', minimum: 0, maximum: 1 },
    y: { type: 'number', minimum: 0, maximum: 1 },
    width: { type: 'number', exclusiveMinimum: 0, maximum: 1 },
    height: { type: 'number', exclusiveMinimum: 0, maximum: 1 },
  },
  required: ['x', 'y', 'width', 'height'],
} as const;

const alternativeSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    type: { type: 'string', enum: COMPONENT_TYPES },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
  },
  required: ['type', 'confidence'],
} as const;

export const componentSceneJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    schemaVersion: { type: 'string', const: '1' },
    canvas: {
      type: 'object',
      additionalProperties: false,
      properties: {
        width: { type: 'number', const: 1000 },
        height: { type: 'number', const: 1000 },
      },
      required: ['width', 'height'],
    },
    pageIntent: {
      type: 'object',
      additionalProperties: false,
      properties: {
        type: { type: 'string', enum: PAGE_INTENT_TYPES },
        description: { type: 'string', maxLength: 500 },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
      },
      required: ['type', 'description', 'confidence'],
    },
    components: {
      type: 'array',
      minItems: 1,
      maxItems: 80,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', minLength: 1, maxLength: 80 },
          type: { type: 'string', enum: COMPONENT_TYPES },
          parentId: { type: ['string', 'null'], maxLength: 80 },
          bounds: boundsSchema,
          text: { type: ['string', 'null'], maxLength: 500 },
          visualHint: { type: ['string', 'null'], maxLength: 300 },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          alternatives: {
            type: 'array',
            maxItems: 3,
            items: alternativeSchema,
          },
        },
        required: [
          'id',
          'type',
          'parentId',
          'bounds',
          'text',
          'visualHint',
          'confidence',
          'alternatives',
        ],
      },
    },
  },
  required: ['schemaVersion', 'canvas', 'pageIntent', 'components'],
} as const;

const recognizedComponentJsonSchema =
  componentSceneJsonSchema.properties.components.items;

export const componentDeltaJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    schemaVersion: { type: 'string', const: '1' },
    changeSummary: { type: 'string', minLength: 1, maxLength: 500 },
    pageIntent: componentSceneJsonSchema.properties.pageIntent,
    added: {
      type: 'array',
      maxItems: 80,
      items: recognizedComponentJsonSchema,
    },
    updated: {
      type: 'array',
      maxItems: 80,
      items: recognizedComponentJsonSchema,
    },
    deleted: {
      type: 'array',
      maxItems: 80,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', minLength: 1, maxLength: 80 },
          reason: { type: 'string', minLength: 1, maxLength: 300 },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
        required: ['id', 'reason', 'confidence'],
      },
    },
  },
  required: [
    'schemaVersion',
    'changeSummary',
    'pageIntent',
    'added',
    'updated',
    'deleted',
  ],
} as const;

export const generatedPageJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    schemaVersion: { type: 'string', const: '1' },
    style: {
      type: 'object',
      additionalProperties: false,
      properties: {
        name: { type: 'string', minLength: 1, maxLength: 80 },
        rationale: { type: 'string', minLength: 1, maxLength: 500 },
        characteristics: {
          type: 'array',
          minItems: 3,
          maxItems: 6,
          items: { type: 'string', minLength: 1, maxLength: 80 },
        },
        palette: {
          type: 'array',
          minItems: 2,
          maxItems: 6,
          items: { type: 'string', minLength: 1, maxLength: 40 },
        },
        typography: { type: 'string', minLength: 1, maxLength: 160 },
      },
      required: [
        'name',
        'rationale',
        'characteristics',
        'palette',
        'typography',
      ],
    },
    html: { type: 'string', minLength: 1, maxLength: 100000 },
    css: { type: 'string', minLength: 1, maxLength: 100000 },
  },
  required: ['schemaVersion', 'style', 'html', 'css'],
} as const;

function asRecord(value: unknown, label: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireExactKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
  label: string,
) {
  const actualKeys = Object.keys(record);
  if (
    actualKeys.length !== keys.length ||
    actualKeys.some((key) => !keys.includes(key))
  ) {
    throw new Error(`${label} contains unexpected or missing fields.`);
  }
}

function asString(
  value: unknown,
  label: string,
  maximumLength: number,
  allowEmpty = false,
) {
  if (
    typeof value !== 'string' ||
    (!allowEmpty && value.length === 0) ||
    value.length > maximumLength
  ) {
    throw new Error(`${label} is not a valid string.`);
  }
  return value;
}

function asNullableString(
  value: unknown,
  label: string,
  maximumLength: number,
) {
  return value === null ? null : asString(value, label, maximumLength, true);
}

function asUnitNumber(value: unknown, label: string) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    throw new Error(`${label} must be a number between 0 and 1.`);
  }
  return value;
}

function asEnum<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  label: string,
) {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new Error(`${label} is not supported.`);
  }
  return value as T[number];
}

export function validateComponentScene(value: unknown): ComponentScene {
  const scene = asRecord(value, 'Component scene');
  requireExactKeys(
    scene,
    ['schemaVersion', 'canvas', 'pageIntent', 'components'],
    'Component scene',
  );

  if (scene.schemaVersion !== '1') {
    throw new Error('Unsupported component schema version.');
  }

  const canvas = asRecord(scene.canvas, 'Canvas');
  requireExactKeys(canvas, ['width', 'height'], 'Canvas');
  if (canvas.width !== 1000 || canvas.height !== 1000) {
    throw new Error('Canvas dimensions must be 1000 by 1000.');
  }

  const pageIntentValue = asRecord(scene.pageIntent, 'Page intent');
  requireExactKeys(
    pageIntentValue,
    ['type', 'description', 'confidence'],
    'Page intent',
  );
  const pageIntent = {
    type: asEnum(pageIntentValue.type, PAGE_INTENT_TYPES, 'Page intent type'),
    description: asString(
      pageIntentValue.description,
      'Page intent description',
      500,
      true,
    ),
    confidence: asUnitNumber(
      pageIntentValue.confidence,
      'Page intent confidence',
    ),
  };

  if (!Array.isArray(scene.components)) {
    throw new Error('Components must be an array.');
  }
  if (scene.components.length < 1 || scene.components.length > 80) {
    throw new Error('The component count is outside the supported range.');
  }

  const components = scene.components.map((rawComponent, index) => {
    const component = asRecord(rawComponent, `Component ${index + 1}`);
    requireExactKeys(
      component,
      [
        'id',
        'type',
        'parentId',
        'bounds',
        'text',
        'visualHint',
        'confidence',
        'alternatives',
      ],
      `Component ${index + 1}`,
    );

    const boundsValue = asRecord(
      component.bounds,
      `Component ${index + 1} bounds`,
    );
    requireExactKeys(
      boundsValue,
      ['x', 'y', 'width', 'height'],
      `Component ${index + 1} bounds`,
    );
    const bounds = {
      x: asUnitNumber(boundsValue.x, `Component ${index + 1} x`),
      y: asUnitNumber(boundsValue.y, `Component ${index + 1} y`),
      width: asUnitNumber(boundsValue.width, `Component ${index + 1} width`),
      height: asUnitNumber(
        boundsValue.height,
        `Component ${index + 1} height`,
      ),
    };
    if (
      bounds.width === 0 ||
      bounds.height === 0 ||
      bounds.x + bounds.width > 1.000001 ||
      bounds.y + bounds.height > 1.000001
    ) {
      throw new Error(`Component ${index + 1} has invalid bounds.`);
    }

    if (!Array.isArray(component.alternatives)) {
      throw new Error(`Component ${index + 1} alternatives must be an array.`);
    }
    if (component.alternatives.length > 3) {
      throw new Error(`Component ${index + 1} has too many alternatives.`);
    }
    const alternatives = component.alternatives.map((rawAlternative, altIndex) => {
      const alternative = asRecord(
        rawAlternative,
        `Component ${index + 1} alternative ${altIndex + 1}`,
      );
      requireExactKeys(
        alternative,
        ['type', 'confidence'],
        `Component ${index + 1} alternative ${altIndex + 1}`,
      );
      return {
        type: asEnum(
          alternative.type,
          COMPONENT_TYPES,
          `Component ${index + 1} alternative type`,
        ),
        confidence: asUnitNumber(
          alternative.confidence,
          `Component ${index + 1} alternative confidence`,
        ),
      };
    });

    return {
      id: asString(component.id, `Component ${index + 1} id`, 80),
      type: asEnum(
        component.type,
        COMPONENT_TYPES,
        `Component ${index + 1} type`,
      ),
      parentId: asNullableString(
        component.parentId,
        `Component ${index + 1} parentId`,
        80,
      ),
      bounds,
      text: asNullableString(
        component.text,
        `Component ${index + 1} text`,
        500,
      ),
      visualHint: asNullableString(
        component.visualHint,
        `Component ${index + 1} visual hint`,
        300,
      ),
      confidence: asUnitNumber(
        component.confidence,
        `Component ${index + 1} confidence`,
      ),
      alternatives,
    } satisfies RecognizedComponent;
  });

  const componentsById = new Map<string, RecognizedComponent>();
  for (const component of components) {
    if (componentsById.has(component.id)) {
      throw new Error(`Duplicate component id: ${component.id}.`);
    }
    componentsById.set(component.id, component);
  }
  for (const component of components) {
    if (component.parentId && !componentsById.has(component.parentId)) {
      throw new Error(`Component ${component.id} has an unknown parent.`);
    }
    const visited = new Set<string>([component.id]);
    let parentId = component.parentId;
    while (parentId) {
      if (visited.has(parentId)) {
        throw new Error('The component hierarchy contains a cycle.');
      }
      visited.add(parentId);
      parentId = componentsById.get(parentId)?.parentId ?? null;
    }
  }

  return {
    schemaVersion: '1',
    canvas: { width: 1000, height: 1000 },
    pageIntent,
    components,
  };
}

export function validateComponentDelta(
  value: unknown,
  previousSceneValue: unknown,
): { changes: ComponentDelta; scene: ComponentScene } {
  const previousScene = validateComponentScene(previousSceneValue);
  const delta = asRecord(value, 'Component delta');
  requireExactKeys(
    delta,
    [
      'schemaVersion',
      'changeSummary',
      'pageIntent',
      'added',
      'updated',
      'deleted',
    ],
    'Component delta',
  );
  if (delta.schemaVersion !== '1') {
    throw new Error('Unsupported component delta schema version.');
  }

  const pageIntentValue = asRecord(delta.pageIntent, 'Delta page intent');
  requireExactKeys(
    pageIntentValue,
    ['type', 'description', 'confidence'],
    'Delta page intent',
  );
  const pageIntent: ComponentScene['pageIntent'] = {
    type: asEnum(
      pageIntentValue.type,
      PAGE_INTENT_TYPES,
      'Delta page intent type',
    ),
    description: asString(
      pageIntentValue.description,
      'Delta page intent description',
      500,
      true,
    ),
    confidence: asUnitNumber(
      pageIntentValue.confidence,
      'Delta page intent confidence',
    ),
  };

  if (
    !Array.isArray(delta.added) ||
    !Array.isArray(delta.updated) ||
    !Array.isArray(delta.deleted) ||
    delta.added.length > 80 ||
    delta.updated.length > 80 ||
    delta.deleted.length > 80
  ) {
    throw new Error('Component delta arrays are invalid.');
  }

  const previousById = new Map(
    previousScene.components.map((component) => [component.id, component]),
  );
  const getRawComponentId = (rawValue: unknown, label: string) => {
    const component = asRecord(rawValue, label);
    return asString(component.id, `${label} id`, 80);
  };
  const addedIds = delta.added.map((item, index) =>
    getRawComponentId(item, `Added component ${index + 1}`),
  );
  const updatedIds = delta.updated.map((item, index) =>
    getRawComponentId(item, `Updated component ${index + 1}`),
  );

  const deleted = delta.deleted.map((rawValue, index) => {
    const item = asRecord(rawValue, `Deleted component ${index + 1}`);
    requireExactKeys(
      item,
      ['id', 'reason', 'confidence'],
      `Deleted component ${index + 1}`,
    );
    return {
      id: asString(item.id, `Deleted component ${index + 1} id`, 80),
      reason: asString(
        item.reason,
        `Deleted component ${index + 1} reason`,
        300,
      ),
      confidence: asUnitNumber(
        item.confidence,
        `Deleted component ${index + 1} confidence`,
      ),
    } satisfies DeletedComponent;
  });

  const allChangeIds = [...addedIds, ...updatedIds, ...deleted.map(({ id }) => id)];
  if (new Set(allChangeIds).size !== allChangeIds.length) {
    throw new Error('A component cannot appear in multiple delta operations.');
  }
  for (const id of addedIds) {
    if (previousById.has(id)) {
      throw new Error(`Added component ${id} already exists.`);
    }
  }
  for (const id of updatedIds) {
    if (!previousById.has(id)) {
      throw new Error(`Updated component ${id} does not exist.`);
    }
  }
  for (const item of deleted) {
    const previousComponent = previousById.get(item.id);
    if (!previousComponent) {
      throw new Error(`Deleted component ${item.id} does not exist.`);
    }
    if (previousComponent.type === 'page') {
      throw new Error('The root page component cannot be deleted.');
    }
  }

  const updatedIdSet = new Set(updatedIds);
  const deletedById = new Map(deleted.map((item) => [item.id, item]));
  let addedCascadeDeletion = true;
  while (addedCascadeDeletion) {
    addedCascadeDeletion = false;
    for (const component of previousScene.components) {
      if (
        component.type === 'page' ||
        updatedIdSet.has(component.id) ||
        deletedById.has(component.id) ||
        !component.parentId ||
        !deletedById.has(component.parentId)
      ) {
        continue;
      }
      deletedById.set(component.id, {
        id: component.id,
        reason: 'Parent component was deleted from the sketch.',
        confidence: 1,
      });
      addedCascadeDeletion = true;
    }
  }

  const nextById = new Map<string, unknown>(previousById);
  for (const id of deletedById.keys()) {
    nextById.delete(id);
  }
  delta.updated.forEach((component, index) => {
    nextById.set(updatedIds[index], component);
  });
  delta.added.forEach((component, index) => {
    nextById.set(addedIds[index], component);
  });

  const scene = validateComponentScene({
    schemaVersion: '1',
    canvas: { width: 1000, height: 1000 },
    pageIntent,
    components: [...nextById.values()],
  });
  const nextComponentsById = new Map(
    scene.components.map((component) => [component.id, component]),
  );
  const added = addedIds.map((id) => nextComponentsById.get(id)!);
  const updated = updatedIds.map((id) => nextComponentsById.get(id)!);

  return {
    scene,
    changes: {
      schemaVersion: '1',
      changeSummary: asString(
        delta.changeSummary,
        'Component delta summary',
        500,
      ),
      pageIntent,
      added,
      updated,
      deleted: [...deletedById.values()],
    },
  };
}

export function validateGeneratedPage(value: unknown): GeneratedPage {
  const page = asRecord(value, 'Generated page');
  requireExactKeys(page, ['schemaVersion', 'style', 'html', 'css'], 'Generated page');
  if (page.schemaVersion !== '1') {
    throw new Error('Unsupported generated page schema version.');
  }

  const styleValue = asRecord(page.style, 'Generated style');
  requireExactKeys(
    styleValue,
    ['name', 'rationale', 'characteristics', 'palette', 'typography'],
    'Generated style',
  );
  if (
    !Array.isArray(styleValue.characteristics) ||
    styleValue.characteristics.length < 3 ||
    styleValue.characteristics.length > 6
  ) {
    throw new Error('Generated style characteristics are invalid.');
  }
  const characteristics = styleValue.characteristics.map((item, index) =>
    asString(item, `Style characteristic ${index + 1}`, 80),
  );
  if (
    !Array.isArray(styleValue.palette) ||
    styleValue.palette.length < 2 ||
    styleValue.palette.length > 6
  ) {
    throw new Error('Generated palette is invalid.');
  }
  const palette = styleValue.palette.map((color, index) =>
    asString(color, `Palette color ${index + 1}`, 40),
  );
  const html = asString(page.html, 'Generated HTML', 100000);
  const css = asString(page.css, 'Generated CSS', 100000);

  if (/<\/?(?:html|head|body)\b/i.test(html)) {
    throw new Error('Generated HTML must be a fragment.');
  }
  if (
    /<(?:script|iframe|object|embed|base|meta|link|style|svg|math)\b/i.test(
      html,
    ) ||
    /\son[a-z]+\s*=/i.test(html) ||
    /javascript\s*:/i.test(html)
  ) {
    throw new Error('Generated HTML contains unsupported active content.');
  }
  if (
    /@import\b/i.test(css) ||
    /url\s*\(/i.test(css) ||
    /expression\s*\(/i.test(css) ||
    /javascript\s*:/i.test(css) ||
    /<\/style/i.test(css)
  ) {
    throw new Error('Generated CSS contains unsupported external or active content.');
  }
  if (/\bbukhari\b/i.test(css)) {
    throw new Error('Generated CSS contains the brand-only Bukhari font.');
  }

  return {
    schemaVersion: '1',
    style: {
      name: asString(styleValue.name, 'Style name', 80),
      rationale: asString(styleValue.rationale, 'Style rationale', 500),
      characteristics,
      palette,
      typography: asString(styleValue.typography, 'Typography', 160),
    },
    html,
    css,
  };
}

