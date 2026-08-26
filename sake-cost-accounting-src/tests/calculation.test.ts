import { describe, expect, it } from "vitest";
import { calculateModel } from "../src/logic/calculation";
import { createErrorDemoModel, createNormalDemoModel } from "../src/data/defaults";
import { CATEGORY_IDS } from "../src/types";

describe("原価・数量・棚卸・売上原価", () => {
  it("通常デモは計算エラーと警告が0件で、主要恒等式が一致する", () => {
    const result = calculateModel(createNormalDemoModel());
    expect(result.criticalCount).toBe(0);
    expect(result.warningCount).toBe(0);
    expect(result.food.allocationDifference).toBe(0);
    expect(result.inventory.selfManufactured).toBe(
      result.inventory.raw + result.inventory.middle + result.inventory.finished + result.inventory.amazake + result.inventory.byproducts + result.inventory.foodProducts,
    );
    expect(result.inventory.total).toBe(
      result.inventory.manufacturingMaterials + result.inventory.packagingMaterials + result.inventory.selfManufactured + result.inventory.foodMaterials + result.inventory.merchandise,
    );
    expect(result.totalCogs).toBe(
      result.merchandiseCogs + result.alcoholCogs + result.amazake.cogs + result.byproducts.cogsTotal + result.food.cogsTotal,
    );
  });

  it("原材料使用額は期首+当期発生-期末+振替で集計する", () => {
    const model = createNormalDemoModel();
    for (const row of model.materials.manufacturing) {
      for (const id of CATEGORY_IDS) row.entries[id] = { opening: 0, occurred: 0, closing: 0, transfer: 0 };
    }
    model.materials.manufacturing[0].entries.sake = { opening: 100, occurred: 200, closing: 50, transfer: 10 };
    expect(calculateModel(model).materials.manufacturing.sake).toBe(260);
  });

  it("包装材料も期首+当期発生-期末+振替で集計する", () => {
    const model = createNormalDemoModel();
    for (const row of model.materials.packaging) {
      for (const id of CATEGORY_IDS) row.entries[id] = { opening: 0, occurred: 0, closing: 0, transfer: 0 };
    }
    model.materials.packaging[0].entries.sake = { opening: 20, occurred: 80, closing: 10, transfer: -5 };
    expect(calculateModel(model).materials.packaging.sake).toBe(85);
  });

  it("期首100L・受入50L・期末20L・評価減5Lの売上原価数量を125Lとする", () => {
    const model = createNormalDemoModel();
    model.allocationDrivers.manufacturing.sake = 50;
    model.allocationDrivers.packaging.sake = 50;
    model.productRollforwards.sake.raw = { openingQty: 0, openingAmount: 0, purchaseQty: 0, purchaseAmount: 0, closingQty: 0, closingAmount: 0, transferQty: 0, transferAmount: 0, lossQty: 0, lossAmount: 0 };
    model.productRollforwards.sake.middle.openingQty = 0;
    model.productRollforwards.sake.middle.closingQty = 0;
    model.productRollforwards.sake.finished.openingQty = 100;
    model.productRollforwards.sake.finished.closingQty = 20;
    model.productRollforwards.sake.finished.valuationLossQty = 5;
    expect(calculateModel(model).productCosts.sake.finished.cogsQty).toBe(125);
  });

  it("副産物発生額を指定酒種の製造原価から控除し、副産物原価にも反映する", () => {
    const model = createNormalDemoModel();
    const result = calculateModel(model);
    const produced = 100 * 500 + 20 * 400;
    expect(result.byproducts.credits.sake).toBe(produced);
    expect(result.byproducts.endingInventory).toBe(12_000);
    expect(result.byproducts.cogsTotal).toBe(61_000);
  });

  it("副産物の内部払出を控除し、財務集計対象外品目は棚卸・売上原価合計から外す", () => {
    const model = createNormalDemoModel();
    const riceKoji = model.byproducts.find((row) => row.id === "rice-koji")!;
    riceKoji.internalIssueAmount = 3_000;
    let result = calculateModel(model);
    expect(result.byproducts.cogsTotal).toBe(61_000);
    expect(result.byproducts.endingInventory).toBe(12_000);

    riceKoji.includeInFinancialTotals = true;
    result = calculateModel(model);
    expect(result.byproducts.cogsTotal).toBe(64_000);
    expect(result.byproducts.endingInventory).toBe(14_000);
  });

  it("評価損金額を期末金額とは独立して詰口製品売上原価から控除する", () => {
    const model = createNormalDemoModel();
    model.productRollforwards.sake.finished.valuationLossAmount = 12_345;
    const withoutLoss = createNormalDemoModel();
    withoutLoss.productRollforwards.sake.finished.valuationLossAmount = 0;
    expect(calculateModel(withoutLoss).productCosts.sake.finished.cogsAmount - calculateModel(model).productCosts.sake.finished.cogsAmount).toBe(12_345);
  });

  it("原酒から詰口酒・詰口製品へ金額を順番に繰り越す", () => {
    const model = createNormalDemoModel();
    for (const group of [model.materials.manufacturing, model.materials.packaging]) {
      for (const row of group) for (const id of CATEGORY_IDS) row.entries[id] = { opening: 0, occurred: 0, closing: 0, transfer: 0 };
    }
    for (const pool of Object.values(model.pools)) {
      for (const row of pool) {
        row.total = 0;
        for (const id of CATEGORY_IDS) {
          row.direct[id] = 0;
          row.manual[id] = 0;
          row.customWeights[id] = 0;
        }
      }
    }
    model.byproducts = [];
    for (const id of CATEGORY_IDS) model.miscIncome.packaging[id] = 0;
    model.productRollforwards.sake.raw = { openingQty: 0, openingAmount: 1_000, purchaseQty: 0, purchaseAmount: 2_000, closingQty: 0, closingAmount: 300, transferQty: 0, transferAmount: 100, lossQty: 0, lossAmount: 50 };
    model.productRollforwards.sake.middle.openingAmount = 400;
    model.productRollforwards.sake.middle.closingAmount = 250;
    model.productRollforwards.sake.finished.openingAmount = 500;
    model.productRollforwards.sake.finished.closingAmount = 350;
    model.productRollforwards.sake.finished.valuationLossAmount = 75;
    const result = calculateModel(model).productCosts.sake;
    expect(result.raw.outputAmount).toBe(2_550);
    expect(result.middle.outputAmount).toBe(2_700);
    expect(result.finished.cogsAmount).toBe(2_775);
  });

  it("食品未配賦差額と商品売上原価を独立して検算する", () => {
    const model = createNormalDemoModel();
    model.food.products[0].producedAmount = 600_001;
    const result = calculateModel(model);
    expect(result.food.allocationDifference).toBe(-1);
    expect(result.checks.some((item) => item.id === "food:allocation-difference")).toBe(true);
    expect(result.merchandiseCogs).toBe(1_700_000);
  });

  it("異常系デモで手入力差額、数量差異、負の売上原価、食品差額を検出する", () => {
    const result = calculateModel(createErrorDemoModel());
    const ids = result.checks.map((item) => item.id);
    expect(ids.some((id) => id.endsWith(":manual-difference"))).toBe(true);
    expect(ids).toContain("quantity:sake:packaging-mismatch");
    expect(ids).toContain("product:sake:finished-negative-cogs");
    expect(ids).toContain("food:allocation-difference");
  });
});
