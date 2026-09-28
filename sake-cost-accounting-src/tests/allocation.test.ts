import { describe, expect, it } from "vitest";
import { calculateAllocationRow } from "../src/logic/allocation";
import { createNormalDemoModel } from "../src/data/defaults";
import { CATEGORY_IDS, type AllocationRow, type CategoryId } from "../src/types";

function onlyEligible(ids: CategoryId[]) {
  const model = createNormalDemoModel();
  for (const id of CATEGORY_IDS) model.categories[id].allocationEligible = ids.includes(id);
  return model;
}

function row(method: AllocationRow["method"]): AllocationRow {
  const base = createNormalDemoModel().pools.manufacturingLabor[0];
  return structuredClone({ ...base, total: 100, method });
}

describe("配賦計算", () => {
  it("最大剰余法で100円を1:2へ33円・67円に確定配賦する", () => {
    const model = onlyEligible(["sake", "shochu"]);
    const target = row("custom");
    target.customWeights.sake = 1;
    target.customWeights.shochu = 2;
    const result = calculateAllocationRow(model, target, "manufacturing-allocation");
    expect(result.valid).toBe(true);
    expect(result.allocations.sake).toBe(33);
    expect(result.allocations.shochu).toBe(67);
    expect(result.difference).toBe(0);
  });

  it("製造数量比・詰口数量比と直課額を対象酒種だけに反映する", () => {
    const model = onlyEligible(["sake", "shochu"]);
    model.allocationDrivers.manufacturing.sake = 1;
    model.allocationDrivers.manufacturing.shochu = 2;
    model.allocationDrivers.packaging.sake = 2;
    model.allocationDrivers.packaging.shochu = 1;

    const manufacturing = row("manufacturing-volume");
    expect(calculateAllocationRow(model, manufacturing, "manufacturing-allocation").allocations).toMatchObject({ sake: 33, shochu: 67 });

    const packaging = row("packaging-volume");
    expect(calculateAllocationRow(model, packaging, "packaging-allocation").allocations).toMatchObject({ sake: 67, shochu: 33 });

    const direct = row("custom");
    direct.customWeights.sake = 1;
    direct.customWeights.shochu = 2;
    direct.direct.sake = 10;
    const result = calculateAllocationRow(model, direct, "manufacturing-allocation");
    expect(result.allocations).toMatchObject({ sake: 40, shochu: 60 });
    expect(result.difference).toBe(0);
  });

  it("任意比率0はエラーにして、残差を特定酒種へ押し込まない", () => {
    const model = onlyEligible(["sake", "shochu"]);
    const target = row("custom");
    target.customWeights.sake = 0;
    target.customWeights.shochu = 0;
    const result = calculateAllocationRow(model, target, "manufacturing-allocation");
    expect(result.valid).toBe(false);
    expect(result.checks.some((item) => item.id.endsWith(":zero-custom-ratio"))).toBe(true);
    expect(result.allocations.sake).toBe(0);
    expect(result.allocations.shochu).toBe(0);
    expect(result.difference).toBe(100);
  });

  it("対象酒種ゼロ、対象外直課、手入力不一致、直課超過をそれぞれ遮断する", () => {
    const none = onlyEligible([]);
    const noTarget = calculateAllocationRow(none, row("custom"), "manufacturing-allocation");
    expect(noTarget.checks.some((item) => item.id.endsWith(":no-targets"))).toBe(true);

    const model = onlyEligible(["sake"]);
    const inactive = row("custom");
    inactive.customWeights.sake = 1;
    inactive.direct.shochu = 1;
    expect(calculateAllocationRow(model, inactive, "manufacturing-allocation").checks.some((item) => item.id.endsWith(":inactive-direct"))).toBe(true);

    const manual = row("manual");
    manual.manual.sake = 99;
    expect(calculateAllocationRow(model, manual, "manufacturing-allocation").checks.some((item) => item.id.endsWith(":manual-difference"))).toBe(true);

    const over = row("custom");
    over.customWeights.sake = 1;
    over.direct.sake = 101;
    expect(calculateAllocationRow(model, over, "manufacturing-allocation").checks.some((item) => item.id.endsWith(":direct-over-total"))).toBe(true);
  });

  it.each([
    ["negative-driver", "manufacturing-volume", (model: ReturnType<typeof createNormalDemoModel>, target: AllocationRow) => { model.allocationDrivers.manufacturing.sake = -1; target.direct.sake = 0; }],
    ["negative-direct", "custom", (_model: ReturnType<typeof createNormalDemoModel>, target: AllocationRow) => { target.customWeights.sake = 1; target.direct.sake = -1; }],
    ["negative-manual", "manual", (_model: ReturnType<typeof createNormalDemoModel>, target: AllocationRow) => { target.manual.sake = -1; }],
    ["negative-custom-weight", "custom", (_model: ReturnType<typeof createNormalDemoModel>, target: AllocationRow) => { target.customWeights.sake = -1; }],
  ] as const)("%sを安定IDで検出し、無効値を配賦しない", (suffix, method, mutate) => {
    const model = onlyEligible(["sake"]);
    const target = row(method);
    mutate(model, target);
    const result = calculateAllocationRow(model, target, "manufacturing-allocation");
    expect(result.checks.map((item) => item.id)).toContain(`allocation:${target.id}:${suffix}`);
    expect(Object.values(result.allocations).every((value) => value === 0)).toBe(true);
  });
});
