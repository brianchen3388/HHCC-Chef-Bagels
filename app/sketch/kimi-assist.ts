import type {
  GeneratedWebsite,
  RecognizedPrimitive,
  StructureOverrideType,
  StructureOverrides,
  WebsiteNode,
} from './model';

type BottomLeft = { x: number; y: number };

type SpatialChild = {
  id: string;
  type: WebsiteNode['type'];
  confidence: number;
  bottomLeft: BottomLeft;
};

type ParentContext = {
  id: string;
  type: WebsiteNode['type'];
  bottomLeft: BottomLeft;
  children: SpatialChild[];
};

type ClassificationTask = {
  primitiveId: string;
  currentType: WebsiteNode['type'];
  context: ParentContext;
};

type PairingTask = {
  primitiveId: string;
  candidateIds: string[];
  currentPairWith: string | null;
  context: ParentContext;
};

type AssistResponse<T> = {
  ok: boolean;
  value: T | null;
};

export type KimiRecognitionResult = {
  aiOverrides: StructureOverrides;
  pairWithByPrimitiveId: Record<string, string | null>;
  usedKimi: boolean;
  fallbackUsed: boolean;
  kimiAvailable: boolean;
};

const MAX_PAIR_TASKS = 24;

function rounded(value: number) {
  return Math.round(value * 1000) / 1000;
}

function bottomLeft(node: WebsiteNode): BottomLeft {
  return {
    x: rounded(node.bounds.x),
    y: rounded(node.bounds.y + node.bounds.height),
  };
}

function parentContext(parent: WebsiteNode): ParentContext {
  return {
    id: parent.id,
    type: parent.type,
    bottomLeft: bottomLeft(parent),
    children: parent.children.map((child) => ({
      id: child.sourcePrimitiveIds[0] ?? child.id,
      type: child.type,
      confidence: rounded(child.confidence),
      bottomLeft: bottomLeft(child),
    })),
  };
}

function walkParents(node: WebsiteNode, visit: (parent: WebsiteNode) => void) {
  visit(node);
  node.children.forEach((child) => walkParents(child, visit));
}

function classificationTasks(
  site: GeneratedWebsite,
  primitives: RecognizedPrimitive[],
  manualOverrides: StructureOverrides,
) {
  const uncertainIds = new Set(
    primitives
      .filter((primitive) => primitive.confidence < 0.75 && !manualOverrides[primitive.id])
      .map((primitive) => primitive.id),
  );
  const tasks: ClassificationTask[] = [];

  walkParents(site.tree, (parent) => {
    const context = parentContext(parent);
    parent.children.forEach((child) => {
      const primitiveId = child.sourcePrimitiveIds[0];
      if (!primitiveId || !uncertainIds.has(primitiveId)) return;
      tasks.push({ primitiveId, currentType: child.type, context });
    });
  });

  return tasks;
}

function distance(first: WebsiteNode, second: WebsiteNode) {
  const firstPoint = bottomLeft(first);
  const secondPoint = bottomLeft(second);
  return Math.hypot(firstPoint.x - secondPoint.x, firstPoint.y - secondPoint.y);
}

function pairingTasks(site: GeneratedWebsite) {
  const tasks: PairingTask[] = [];

  walkParents(site.tree, (parent) => {
    if (tasks.length >= MAX_PAIR_TASKS || parent.children.length < 2) return;
    const siblings = [...parent.children].sort(
      (first, second) => first.bounds.y - second.bounds.y || first.bounds.x - second.bounds.x,
    );
    const context = parentContext(parent);

    siblings.slice(1).forEach((child, index) => {
      if (tasks.length >= MAX_PAIR_TASKS) return;
      const primitiveId = child.sourcePrimitiveIds[0];
      const candidates = siblings.slice(0, index + 1);
      if (!primitiveId || candidates.length === 0) return;
      const nearest = [...candidates].sort(
        (first, second) => distance(child, first) - distance(child, second),
      )[0];
      const nearestId = nearest.sourcePrimitiveIds[0];
      const baselineRow = parent.childRows?.find((row) => row.includes(child.id));
      const currentPairWith = nearestId && baselineRow?.includes(nearest.id) ? nearestId : null;
      tasks.push({
        primitiveId,
        candidateIds: candidates
          .map((candidate) => candidate.sourcePrimitiveIds[0])
          .filter((id): id is string => Boolean(id)),
        currentPairWith,
        context,
      });
    });
  });

  return tasks;
}

async function postAssist<T>(body: unknown, signal: AbortSignal): Promise<T> {
  const response = await fetch('/api/kimi-assist', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) throw new Error('Kimi assist unavailable');
  return response.json() as Promise<T>;
}

async function runSmallTasks<TTask, TResult>(
  tasks: TTask[],
  worker: (task: TTask) => Promise<TResult>,
) {
  const results: AssistResponse<TResult>[] = new Array(tasks.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(3, tasks.length) }, async () => {
    while (cursor < tasks.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = { ok: true, value: await worker(tasks[index]) };
      } catch {
        results[index] = { ok: false, value: null };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

export async function refineRecognitionWithKimi(
  site: GeneratedWebsite,
  primitives: RecognizedPrimitive[],
  manualOverrides: StructureOverrides,
  rebuildSite: (aiOverrides: StructureOverrides) => GeneratedWebsite,
  signal: AbortSignal,
): Promise<KimiRecognitionResult> {
  const classify = classificationTasks(site, primitives, manualOverrides);
  const classificationResults = await runSmallTasks(classify, (task) =>
    postAssist<{ type: StructureOverrideType }>(
      { task: 'classify', ...task },
      signal,
    ),
  );
  const aiOverrides: StructureOverrides = {};
  classificationResults.forEach((result, index) => {
    if (result.ok && result.value) aiOverrides[classify[index].primitiveId] = result.value.type;
  });

  const classificationSuccesses = classificationResults.filter((result) => result.ok).length;
  const classificationUnavailable = classify.length > 0 && classificationSuccesses === 0;
  if (classificationUnavailable) {
    return {
      aiOverrides,
      pairWithByPrimitiveId: {},
      usedKimi: false,
      fallbackUsed: true,
      kimiAvailable: false,
    };
  }

  const refinedSite = Object.keys(aiOverrides).length > 0 ? rebuildSite(aiOverrides) : site;
  const pair = pairingTasks(refinedSite);
  const pairingResults = await runSmallTasks(pair, (task) =>
    postAssist<{ pairWith: string | null }>(
      { task: 'pair', ...task },
      signal,
    ),
  );
  const pairWithByPrimitiveId: Record<string, string | null> = {};
  pairingResults.forEach((result, index) => {
    if (result.ok && result.value) {
      pairWithByPrimitiveId[pair[index].primitiveId] = result.value.pairWith;
    }
  });

  const allResults = [...classificationResults, ...pairingResults];
  const successCount = allResults.filter((result) => result.ok).length;
  const failureCount = allResults.length - successCount;
  return {
    aiOverrides,
    pairWithByPrimitiveId,
    usedKimi: successCount > 0,
    fallbackUsed: failureCount > 0,
    kimiAvailable: allResults.length === 0 || successCount > 0,
  };
}

export function visibleText(site: GeneratedWebsite) {
  const values: string[] = [];
  const visit = (node: WebsiteNode) => {
    const value = node.content?.trim();
    if (value && !values.includes(value)) values.push(value);
    node.children.forEach(visit);
  };
  visit(site.tree);
  return values.slice(0, 100);
}

export async function generateKimiCss(
  site: GeneratedWebsite,
  originalCss: string,
  signal: AbortSignal,
) {
  const result = await postAssist<{ css: string }>(
    { task: 'css', originalCss, visibleText: visibleText(site) },
    signal,
  );
  return result.css;
}
