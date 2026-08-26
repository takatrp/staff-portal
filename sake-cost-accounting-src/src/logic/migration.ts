import { CATEGORY_IDS, POOL_IDS, type AuditEntry, type SakeCostModel, type SnapshotInput } from "../types";
import { createNormalDemoModel } from "../data/defaults";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function mergeSafe<T>(base: T, source: unknown): T {
  if (Array.isArray(base)) return (Array.isArray(source) ? safeClone(source) : base) as T;
  if (isRecord(base) && isRecord(source)) {
    const result = { ...base } as UnknownRecord;
    for (const [key, value] of Object.entries(source)) {
      if (key === "__proto__" || key === "prototype" || key === "constructor") continue;
      result[key] = key in result ? mergeSafe(result[key], value) : safeClone(value);
    }
    return result as T;
  }
  return (source === undefined ? base : source) as T;
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeAuditLog(value: unknown, operatorName: string): AuditEntry[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 200).map((entry, index) => {
    const item = isRecord(entry) ? entry : {};
    return {
      id: typeof item.id === "string" ? item.id : `migrated-audit-${index}`,
      at: typeof item.at === "string" ? item.at : new Date().toISOString(),
      actor: typeof item.actor === "string" ? item.actor : operatorName || "未設定",
      target: typeof item.target === "string" ? item.target : "全体",
      before: typeof item.before === "string" ? item.before : undefined,
      after: typeof item.after === "string" ? item.after : undefined,
      action: typeof item.action === "string" ? item.action : "旧データから移行",
      detail: typeof item.detail === "string" ? item.detail : undefined,
    };
  });
}

function validateCore(model: SakeCostModel): void {
  if (!model.meta || !model.materials || !model.pools || !model.categories || !model.productRollforwards) throw new Error("必要なデータがありません。");
  if (CATEGORY_IDS.some((id) => !model.categories[id])) throw new Error("酒種マスターが不足しています。");
  if (POOL_IDS.some((id) => !Array.isArray(model.pools[id]))) throw new Error("配賦データが不正です。");
  const serialized = JSON.stringify(model);
  if (serialized.length > 15_000_000) throw new Error("JSONデータが大きすぎます。");
}

export function migrateModel(value: unknown, now = new Date().toISOString()): SakeCostModel {
  if (!isRecord(value) || (value.schemaVersion !== 1 && value.schemaVersion !== 2)) throw new Error("対応していないJSONスキーマです。");
  const defaults = createNormalDemoModel(now);

  if (value.schemaVersion === 2) {
    const merged = mergeSafe(defaults, value) as SakeCostModel;
    merged.schemaVersion = 2;
    merged.auditLog = normalizeAuditLog(merged.auditLog, merged.meta.operatorName);
    merged.finalizationSnapshots = Array.isArray(merged.finalizationSnapshots) ? merged.finalizationSnapshots.slice(0, 10) : [];
    validateCore(merged);
    return merged;
  }

  const migrated = mergeSafe(defaults, value) as SakeCostModel;
  migrated.schemaVersion = 2;
  migrated.meta = {
    ...defaults.meta,
    ...(isRecord(value.meta) ? value.meta : {}),
    status: isRecord(value.meta) && value.meta.status === "finalized" ? "finalized" : "draft",
    finalizedBy: null,
    finalizationId: null,
    operatorName: "",
    updatedAt: now,
  } as SakeCostModel["meta"];

  const oldCategories = isRecord(value.categories) ? value.categories : {};
  for (const id of CATEGORY_IDS) {
    const old = isRecord(oldCategories[id]) ? oldCategories[id] : {};
    migrated.categories[id] = {
      ...defaults.categories[id],
      label: typeof old.label === "string" ? old.label : defaults.categories[id].label,
      short: typeof old.short === "string" ? old.short : defaults.categories[id].short,
      workflow: defaults.categories[id].workflow,
      allocationEligible: typeof old.active === "boolean" ? old.active : defaults.categories[id].allocationEligible,
      deprecatedAlcoholBasis: typeof old.alcoholBasis === "number" ? old.alcoholBasis : defaults.categories[id].deprecatedAlcoholBasis,
    };
  }

  for (const group of ["manufacturing", "packaging"] as const) {
    migrated.materials[group] = migrated.materials[group].map((row, index) => ({
      ...row,
      id: typeof row.id === "string" && row.id ? row.id : createId(`${group}-material-${index}`),
      label: typeof row.label === "string" && row.label ? row.label : `移行項目${index + 1}`,
      standard: defaults.materials[group].some((candidate) => candidate.id === row.id),
    }));
  }
  for (const poolId of POOL_IDS) {
    migrated.pools[poolId] = migrated.pools[poolId].map((row, index) => ({
      ...row,
      id: typeof row.id === "string" && row.id ? row.id : createId(`${poolId}-${index}`),
      label: typeof row.label === "string" && row.label ? row.label : `移行項目${index + 1}`,
      standard: defaults.pools[poolId].some((candidate) => candidate.id === row.id),
    }));
  }
  migrated.byproducts = migrated.byproducts.map((row, index) => ({
    ...row,
    id: typeof row.id === "string" && row.id ? row.id : createId(`byproduct-${index}`),
    label: typeof row.label === "string" && row.label ? row.label : `副産物${index + 1}`,
    standard: defaults.byproducts.some((candidate) => candidate.id === row.id),
  }));
  migrated.food.products = migrated.food.products.map((row, index) => ({
    ...row,
    id: typeof row.id === "string" && row.id ? row.id : createId(`food-${index}`),
    label: typeof row.label === "string" && row.label ? row.label : `食品${index + 1}`,
    standard: defaults.food.products.some((candidate) => candidate.id === row.id),
  }));
  migrated.warningAcknowledgements = {};
  migrated.finalizationSnapshots = [];
  migrated.auditLog = [
    {
      id: createId("migration"),
      at: now,
      actor: "未設定",
      target: "データ全体",
      action: "schemaVersion 1から2へ移行",
      detail: "既存入力を保持し、新規統制項目へ安全な初期値を設定",
    },
    ...normalizeAuditLog(value.auditLog, ""),
  ].slice(0, 200);
  validateCore(migrated);
  return migrated;
}

export function parseAndMigrateJson(text: string): SakeCostModel {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("JSONの形式が不正です。");
  }
  return migrateModel(parsed);
}

export function sanitizeForSnapshot(model: SakeCostModel): SnapshotInput {
  const { finalizationSnapshots, ...input } = safeClone(model);
  void finalizationSnapshots;
  return input;
}

export function stableInputHash(input: SnapshotInput): string {
  const text = JSON.stringify(input);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
