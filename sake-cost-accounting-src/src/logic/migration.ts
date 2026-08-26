import { ALCOHOL_CATEGORY_IDS, CATEGORY_IDS, POOL_IDS, type AuditEntry, type SakeCostModel, type SnapshotInput } from "../types";
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

function invalidStructure(detail: string): never {
  throw new Error(`JSONデータの構造が不正です（${detail}）。`);
}

function isNullableFiniteNumber(value: unknown): boolean {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function hasFields(record: unknown, fields: readonly string[], validator: (value: unknown) => boolean): record is UnknownRecord {
  return isRecord(record) && fields.every((field) => validator(record[field]));
}

function isCategoryMap(record: unknown, validator: (value: unknown) => boolean): record is UnknownRecord {
  return isRecord(record) && CATEGORY_IDS.every((id) => validator(record[id]));
}

function assertRecordRows(value: unknown, label: string): void {
  if (!Array.isArray(value) || value.some((row) => !isRecord(row))) invalidStructure(label);
}

function assertUniqueIds(rows: Array<{ id: string }>, label: string): void {
  const ids = rows.map((row) => row.id.trim());
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) invalidStructure(`${label}のID`);
}

function validateCore(model: SakeCostModel): void {
  const stringMetaFields = ["companyName", "periodLabel", "startDate", "endDate", "updatedAt", "sourceNote", "operatorName"] as const;
  if (!isRecord(model.meta) || !stringMetaFields.every((field) => typeof model.meta[field] === "string") || !["draft", "finalized"].includes(model.meta.status)) invalidStructure("基本情報");
  if (![model.meta.finalizedAt, model.meta.finalizedBy, model.meta.finalizationId].every((value) => value === null || typeof value === "string")) invalidStructure("確定メタ情報");
  if (!isRecord(model.categories)) invalidStructure("酒種マスター");
  for (const id of CATEGORY_IDS) {
    const category = model.categories[id];
    if (!isRecord(category) || typeof category.label !== "string" || typeof category.short !== "string" || typeof category.allocationEligible !== "boolean" || !["alcohol", "amazake"].includes(category.workflow)) invalidStructure(`酒種マスター:${id}`);
  }
  if (!isRecord(model.allocationDrivers) || !isCategoryMap(model.allocationDrivers.manufacturing, isNullableFiniteNumber) || !isCategoryMap(model.allocationDrivers.packaging, isNullableFiniteNumber)) invalidStructure("配賦基準数量");
  if (!isRecord(model.materials)) invalidStructure("材料費");
  for (const group of ["manufacturing", "packaging"] as const) {
    if (!Array.isArray(model.materials[group])) invalidStructure(`${group}材料費`);
    for (const row of model.materials[group]) {
      if (!isRecord(row) || typeof row.id !== "string" || typeof row.label !== "string" || typeof row.standard !== "boolean" || !isRecord(row.entries)) invalidStructure(`${group}材料行`);
      for (const id of CATEGORY_IDS) {
        if (!hasFields(row.entries[id], ["opening", "occurred", "closing", "transfer"], isNullableFiniteNumber)) invalidStructure(`${group}材料行:${id}`);
      }
    }
    assertUniqueIds(model.materials[group], `${group}材料行`);
  }
  if (!isRecord(model.pools)) invalidStructure("配賦データ");
  for (const poolId of POOL_IDS) {
    if (!Array.isArray(model.pools[poolId])) invalidStructure(`配賦データ:${poolId}`);
    for (const row of model.pools[poolId]) {
      if (!isRecord(row) || typeof row.id !== "string" || typeof row.label !== "string" || typeof row.standard !== "boolean" || !isNullableFiniteNumber(row.total) || !["manufacturing-volume", "packaging-volume", "custom", "manual"].includes(row.method)) invalidStructure(`配賦行:${poolId}`);
      if (!isCategoryMap(row.direct, isNullableFiniteNumber) || !isCategoryMap(row.manual, isNullableFiniteNumber) || !isCategoryMap(row.customWeights, isNullableFiniteNumber)) invalidStructure(`配賦行入力:${poolId}`);
    }
    assertUniqueIds(model.pools[poolId], `配賦行:${poolId}`);
  }
  assertUniqueIds(POOL_IDS.flatMap((poolId) => model.pools[poolId]), "配賦行全体");
  if (!isRecord(model.productRollforwards)) invalidStructure("製品原価");
  const rawFields = ["openingQty", "openingAmount", "purchaseQty", "purchaseAmount", "closingQty", "closingAmount", "transferQty", "transferAmount", "lossQty", "lossAmount"] as const;
  const middleFields = ["openingQty", "openingAmount", "closingQty", "closingAmount"] as const;
  for (const id of ALCOHOL_CATEGORY_IDS) {
    const flow = model.productRollforwards[id];
    if (!isRecord(flow) || !hasFields(flow.raw, rawFields, isNullableFiniteNumber) || !hasFields(flow.middle, middleFields, isNullableFiniteNumber) || !hasFields(flow.finished, [...middleFields, "valuationLossQty", "valuationLossAmount"], isNullableFiniteNumber)) invalidStructure(`製品原価:${id}`);
  }
  if (!Array.isArray(model.byproducts)) invalidStructure("副産物");
  for (const row of model.byproducts) {
    if (!isRecord(row) || typeof row.id !== "string" || typeof row.label !== "string" || typeof row.standard !== "boolean" || !["sake", "shochu", "liqueur", "spirits", "contract", "whisky"].includes(row.creditCategory) || typeof row.includeInFinancialTotals !== "boolean") invalidStructure("副産物行");
    if (!hasFields(row, ["producedQty", "valuationUnit", "openingAmount", "purchaseAmount", "internalIssueAmount", "closingQty", "closingUnit"], isNullableFiniteNumber)) invalidStructure("副産物金額");
  }
  assertUniqueIds(model.byproducts, "副産物行");
  if (!hasFields(model.amazake, ["openingQty", "openingAmount", "productionQty", "closingQty", "closingAmount"], isNullableFiniteNumber)) invalidStructure("甘酒原価");
  if (!isRecord(model.food) || !hasFields(model.food, ["materialOpening", "materialPurchases", "materialClosing", "wages", "welfare", "outsourcing"], isNullableFiniteNumber) || !Array.isArray(model.food.products)) invalidStructure("食品原価");
  for (const row of model.food.products) {
    if (!isRecord(row) || typeof row.id !== "string" || typeof row.label !== "string" || typeof row.standard !== "boolean" || !hasFields(row, ["openingAmount", "producedAmount", "closingAmount"], isNullableFiniteNumber)) invalidStructure("食品製品行");
  }
  assertUniqueIds(model.food.products, "食品製品行");
  if (!hasFields(model.merchandise, ["openingInventory", "openingAdjustment", "purchases", "liquorTax", "taxFreeTransferOut", "purchaseDiscount", "otherTransfer", "closingInventory"], isNullableFiniteNumber)) invalidStructure("商品原価");
  if (!isRecord(model.miscIncome) || !isCategoryMap(model.miscIncome.packaging, isNullableFiniteNumber)) invalidStructure("雑収入等");
  if (!isRecord(model.review) || !Array.isArray(model.review.items) || model.review.items.some((item) => !isRecord(item) || typeof item.id !== "string" || typeof item.title !== "string" || typeof item.detail !== "string" || typeof item.done !== "boolean" || typeof item.note !== "string")) invalidStructure("人による確認");
  assertUniqueIds(model.review.items, "人による確認");
  if (!isRecord(model.warningAcknowledgements) || Object.values(model.warningAcknowledgements).some((item) => !isRecord(item) || typeof item.confirmed !== "boolean" || typeof item.note !== "string" || (item.confirmedAt !== undefined && typeof item.confirmedAt !== "string"))) invalidStructure("警告確認");
  if (!Array.isArray(model.auditLog) || model.auditLog.some((item) => !isRecord(item) || typeof item.id !== "string" || typeof item.at !== "string" || typeof item.actor !== "string" || typeof item.target !== "string" || typeof item.action !== "string")) invalidStructure("操作履歴");
  assertUniqueIds(model.auditLog, "操作履歴");
  if (!Array.isArray(model.finalizationSnapshots)) invalidStructure("確定スナップショット");
  for (const snapshot of model.finalizationSnapshots) {
    if (!isRecord(snapshot) || typeof snapshot.id !== "string" || typeof snapshot.finalizedAt !== "string" || typeof snapshot.finalizedBy !== "string" || (snapshot.inputHash !== undefined && typeof snapshot.inputHash !== "string") || !isRecord(snapshot.inputData) || !hasFields(snapshot.summary, ["manufacturingCostTotal", "packagingCostTotal", "endingInventoryTotal", "costOfSalesTotal"], (value) => typeof value === "number" && Number.isFinite(value))) invalidStructure("確定スナップショット");
    validateCore({ ...snapshot.inputData, finalizationSnapshots: [] } as SakeCostModel);
  }
  assertUniqueIds(model.finalizationSnapshots, "確定スナップショット");
  const serialized = JSON.stringify(model);
  if (serialized.length > 15_000_000) throw new Error("JSONデータが大きすぎます。");
}

export function migrateModel(value: unknown, now = new Date().toISOString()): SakeCostModel {
  if (!isRecord(value) || (value.schemaVersion !== 1 && value.schemaVersion !== 2 && value.schemaVersion !== 3)) throw new Error("対応していないJSONスキーマです。");
  const defaults = createNormalDemoModel(now);

  if (value.schemaVersion === 3) {
    const merged = mergeSafe(defaults, value) as SakeCostModel;
    merged.schemaVersion = 3;
    if (!isRecord(merged.meta) || typeof merged.meta.operatorName !== "string") invalidStructure("基本情報");
    merged.auditLog = normalizeAuditLog(merged.auditLog, merged.meta.operatorName);
    merged.finalizationSnapshots = Array.isArray(merged.finalizationSnapshots) ? merged.finalizationSnapshots.slice(0, 10) : [];
    validateCore(merged);
    return merged;
  }

  const migrated = mergeSafe(defaults, value) as SakeCostModel;
  migrated.schemaVersion = 3;
  if (!isRecord(migrated.categories) || !isRecord(migrated.materials) || !isRecord(migrated.pools) || !isRecord(migrated.food)) invalidStructure("主要データ");
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
    assertRecordRows(migrated.materials[group], `${group}材料費`);
    migrated.materials[group] = migrated.materials[group].map((row, index) => ({
      ...row,
      id: typeof row.id === "string" && row.id ? row.id : createId(`${group}-material-${index}`),
      label: typeof row.label === "string" && row.label ? row.label : `移行項目${index + 1}`,
      standard: defaults.materials[group].some((candidate) => candidate.id === row.id),
    }));
  }
  for (const poolId of POOL_IDS) {
    assertRecordRows(migrated.pools[poolId], `配賦データ:${poolId}`);
    migrated.pools[poolId] = migrated.pools[poolId].map((row, index) => ({
      ...row,
      id: typeof row.id === "string" && row.id ? row.id : createId(`${poolId}-${index}`),
      label: typeof row.label === "string" && row.label ? row.label : `移行項目${index + 1}`,
      standard: defaults.pools[poolId].some((candidate) => candidate.id === row.id),
    }));
  }
  assertRecordRows(migrated.byproducts, "副産物");
  migrated.byproducts = migrated.byproducts.map((row, index) => ({
    ...row,
    id: typeof row.id === "string" && row.id ? row.id : createId(`byproduct-${index}`),
    label: typeof row.label === "string" && row.label ? row.label : `副産物${index + 1}`,
    standard: defaults.byproducts.some((candidate) => candidate.id === row.id),
    internalIssueAmount: typeof row.internalIssueAmount === "number" ? row.internalIssueAmount : 0,
    includeInFinancialTotals: typeof row.includeInFinancialTotals === "boolean" ? row.includeInFinancialTotals : true,
  }));
  assertRecordRows(migrated.food.products, "食品製品");
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
      action: `schemaVersion ${value.schemaVersion}から3へ移行`,
      detail: "既存入力を保持し、新規統制項目と副産物内部払出項目へ安全な初期値を設定",
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
