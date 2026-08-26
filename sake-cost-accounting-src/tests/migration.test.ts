import { describe, expect, it } from "vitest";
import { createNormalDemoModel } from "../src/data/defaults";
import { migrateModel, parseAndMigrateJson, sanitizeForSnapshot, stableInputHash } from "../src/logic/migration";

describe("JSON移行と確定入力ハッシュ", () => {
  it("schemaVersion 1の既存値を保持し、新規統制項目を安全な初期値へ移行する", () => {
    const legacy = JSON.parse(JSON.stringify(createNormalDemoModel())) as {
      schemaVersion: number;
      categories: Record<string, { active?: boolean; alcoholBasis?: number; label: string }>;
      meta: { operatorName: string };
      finalizationSnapshots: unknown[];
    };
    legacy.schemaVersion = 1;
    legacy.categories.sake.active = false;
    legacy.categories.sake.alcoholBasis = 18;
    legacy.categories.sake.label = "清酒（移行値）";
    legacy.meta.operatorName = "旧担当者";
    legacy.finalizationSnapshots = [{ unsafe: true }];
    const migrated = migrateModel(legacy, "2026-08-26T00:00:00.000Z");
    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.categories.sake.label).toBe("清酒（移行値）");
    expect(migrated.categories.sake.allocationEligible).toBe(false);
    expect(migrated.categories.sake.deprecatedAlcoholBasis).toBe(18);
    expect(migrated.meta.operatorName).toBe("");
    expect(migrated.finalizationSnapshots).toEqual([]);
    expect(migrated.byproducts[0].internalIssueAmount).toBe(0);
    expect(migrated.byproducts[0].includeInFinancialTotals).toBe(true);
    expect(migrated.auditLog[0].action).toContain("schemaVersion 1から3へ移行");
  });

  it("schemaVersion 2の副産物を内部払出0円・財務集計対象として移行する", () => {
    const legacy = JSON.parse(JSON.stringify(createNormalDemoModel())) as Record<string, unknown> & { schemaVersion: number; byproducts: Array<Record<string, unknown>> };
    legacy.schemaVersion = 2;
    delete legacy.byproducts[0].internalIssueAmount;
    delete legacy.byproducts[0].includeInFinancialTotals;
    const migrated = migrateModel(legacy, "2026-08-26T00:00:00.000Z");
    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.byproducts[0].internalIssueAmount).toBe(0);
    expect(migrated.byproducts[0].includeInFinancialTotals).toBe(true);
    expect(migrated.auditLog[0].action).toContain("schemaVersion 2から3へ移行");
  });

  it("不正JSONと未対応スキーマを拒否する", () => {
    expect(() => parseAndMigrateJson("{broken")).toThrow("JSONの形式が不正");
    expect(() => migrateModel({ schemaVersion: 99 })).toThrow("対応していないJSONスキーマ");
  });

  it("計算で参照する配列内の壊れた行を復元前に拒否する", () => {
    const brokenMaterials = JSON.parse(JSON.stringify(createNormalDemoModel())) as Record<string, unknown> & { schemaVersion: number; materials: { manufacturing: unknown[] } };
    brokenMaterials.schemaVersion = 2;
    brokenMaterials.materials.manufacturing = [null];
    expect(() => migrateModel(brokenMaterials)).toThrow("manufacturing材料費");

    const missingMaterials = JSON.parse(JSON.stringify(createNormalDemoModel())) as Record<string, unknown> & { schemaVersion: number };
    missingMaterials.schemaVersion = 2;
    missingMaterials.materials = null;
    expect(() => migrateModel(missingMaterials)).toThrow("主要データ");

    const brokenPool = JSON.parse(JSON.stringify(createNormalDemoModel())) as Record<string, unknown> & { pools: { manufacturingLabor: Array<Record<string, unknown>> } };
    brokenPool.pools.manufacturingLabor[0].direct = { sake: 100 };
    expect(() => migrateModel(brokenPool)).toThrow("配賦行入力");
  });

  it("重複行IDと壊れた確定証跡を拒否する", () => {
    const duplicate = createNormalDemoModel();
    duplicate.pools.manufacturingLabor[1].id = duplicate.pools.manufacturingLabor[0].id;
    expect(() => migrateModel(duplicate)).toThrow("配賦行");

    const brokenSnapshot = createNormalDemoModel() as unknown as Record<string, unknown> & { finalizationSnapshots: unknown[] };
    brokenSnapshot.finalizationSnapshots = [{ id: "final-1", finalizedAt: "2026-08-26T00:00:00.000Z", finalizedBy: {}, inputHash: {}, inputData: null, summary: { manufacturingCostTotal: 0, packagingCostTotal: 0, endingInventoryTotal: 0, costOfSalesTotal: 0 } }];
    expect(() => migrateModel(brokenSnapshot)).toThrow("確定スナップショット");
  });

  it("スナップショットから履歴を除外し、同じ入力は同じハッシュになる", () => {
    const model = createNormalDemoModel();
    const first = sanitizeForSnapshot(model);
    const second = sanitizeForSnapshot(model);
    expect("finalizationSnapshots" in first).toBe(false);
    expect(stableInputHash(first)).toMatch(/^fnv1a-[0-9a-f]{8}$/);
    expect(stableInputHash(first)).toBe(stableInputHash(second));
  });
});
