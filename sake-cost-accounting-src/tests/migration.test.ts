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
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.categories.sake.label).toBe("清酒（移行値）");
    expect(migrated.categories.sake.allocationEligible).toBe(false);
    expect(migrated.categories.sake.deprecatedAlcoholBasis).toBe(18);
    expect(migrated.meta.operatorName).toBe("");
    expect(migrated.finalizationSnapshots).toEqual([]);
    expect(migrated.auditLog[0].action).toContain("schemaVersion 1から2へ移行");
  });

  it("不正JSONと未対応スキーマを拒否する", () => {
    expect(() => parseAndMigrateJson("{broken")).toThrow("JSONの形式が不正");
    expect(() => migrateModel({ schemaVersion: 99 })).toThrow("対応していないJSONスキーマ");
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
