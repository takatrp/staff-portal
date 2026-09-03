import {
  ALCOHOL_CATEGORY_IDS,
  CATEGORY_IDS,
  POOL_IDS,
  type AlcoholCategoryId,
  type CalculationResult,
  type CategoryId,
  type CategoryMap,
  type PoolId,
  type ProductCostResult,
  type SakeCostModel,
  type ValidationCheck,
} from "../types";
import { calculateAllocationRow } from "./allocation";
import { isMoneyEqual, isQuantityEqual, numeric, roundMoney, roundQuantity, sum } from "./number";

function moneyMap(): CategoryMap<number> {
  return Object.fromEntries(CATEGORY_IDS.map((id) => [id, 0])) as CategoryMap<number>;
}

function check(
  id: string,
  severity: "error" | "warning",
  area: string,
  screenId: ValidationCheck["screenId"],
  title: string,
  detail: string,
  context: { categoryId?: CategoryId; rowId?: string } = {},
): ValidationCheck {
  return { id, severity, area, screenId, title, detail, ...context, fingerprint: [id, title, detail].join("|") };
}

function calculateMaterialGroup(model: SakeCostModel, group: "manufacturing" | "packaging"): CategoryMap<number> {
  const result = moneyMap();
  for (const row of model.materials[group]) {
    for (const id of CATEGORY_IDS) {
      const entry = row.entries[id];
      result[id] = roundMoney(result[id] + numeric(entry.opening) + numeric(entry.occurred) - numeric(entry.closing) + numeric(entry.transfer));
    }
  }
  return result;
}

function calculateProductCost(model: SakeCostModel, categoryId: AlcoholCategoryId, manufacturingCost: number, packagingCost: number): ProductCostResult {
  const flow = model.productRollforwards[categoryId];
  const productionQty = numeric(model.allocationDrivers.manufacturing[categoryId]);
  const rawQty = roundQuantity(
    numeric(flow.raw.openingQty) + productionQty + numeric(flow.raw.purchaseQty) - numeric(flow.raw.closingQty) - numeric(flow.raw.transferQty) - numeric(flow.raw.lossQty),
  );
  const rawAmount = roundMoney(
    numeric(flow.raw.openingAmount) + manufacturingCost + numeric(flow.raw.purchaseAmount) - numeric(flow.raw.closingAmount) - numeric(flow.raw.transferAmount) - numeric(flow.raw.lossAmount),
  );
  const middleQty = roundQuantity(numeric(flow.middle.openingQty) + rawQty - numeric(flow.middle.closingQty));
  const middleAmount = roundMoney(numeric(flow.middle.openingAmount) + rawAmount - numeric(flow.middle.closingAmount) + packagingCost);
  const cogsQty = roundQuantity(numeric(flow.finished.openingQty) + middleQty - numeric(flow.finished.closingQty) - numeric(flow.finished.valuationLossQty));
  const cogsAmount = roundMoney(
    numeric(flow.finished.openingAmount) + middleAmount - numeric(flow.finished.closingAmount) - numeric(flow.finished.valuationLossAmount),
  );
  return {
    raw: { outputQty: rawQty, outputAmount: rawAmount, unitCost: rawQty === 0 ? 0 : roundMoney((rawAmount / rawQty) * 1000) },
    middle: { outputQty: middleQty, outputAmount: middleAmount, unitCost: middleQty === 0 ? 0 : roundMoney((middleAmount / middleQty) * 1000) },
    finished: { cogsQty, cogsAmount, unitCost: cogsQty === 0 ? 0 : roundMoney((cogsAmount / cogsQty) * 1000) },
  };
}

function negativeResultChecks(model: SakeCostModel, results: Record<AlcoholCategoryId, ProductCostResult>): ValidationCheck[] {
  const checks: ValidationCheck[] = [];
  for (const id of ALCOHOL_CATEGORY_IDS) {
    const label = model.categories[id].label;
    const result = results[id];
    const fields: Array<[string, string, number]> = [
      ["raw-output-qty", "原酒から詰口酒への払出数量", result.raw.outputQty],
      ["raw-output-amount", "原酒から詰口酒への払出金額", result.raw.outputAmount],
      ["middle-output-qty", "詰口酒から詰口製品への払出数量", result.middle.outputQty],
      ["middle-output-amount", "詰口酒から詰口製品への払出金額", result.middle.outputAmount],
      ["finished-negative-cogs-qty", "詰口製品の売上原価数量", result.finished.cogsQty],
      ["finished-negative-cogs", "詰口製品の売上原価金額", result.finished.cogsAmount],
    ];
    for (const [suffix, fieldLabel, value] of fields) {
      if (value < 0) {
        checks.push(
          check(`product:${id}:${suffix}`, "error", "製品原価", "products", `${label}の${fieldLabel}がマイナスです`, "期首・受入・期末・振替・欠減の入力を見直してください。", { categoryId: id }),
        );
      }
    }
  }
  return checks;
}

function findNonFinite(value: unknown, path = "model", found: string[] = []): string[] {
  if (typeof value === "number" && !Number.isFinite(value)) found.push(path);
  else if (Array.isArray(value)) value.forEach((item, index) => findNonFinite(item, `${path}[${index}]`, found));
  else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (key !== "finalizationSnapshots") findNonFinite(child, `${path}.${key}`, found);
    }
  }
  return found;
}

export function calculateModel(model: SakeCostModel): CalculationResult {
  const checks: ValidationCheck[] = [];
  const materials = {
    manufacturing: calculateMaterialGroup(model, "manufacturing"),
    packaging: calculateMaterialGroup(model, "packaging"),
  };
  const materialEnding = {
    manufacturing: roundMoney(sum(model.materials.manufacturing.flatMap((row) => CATEGORY_IDS.map((id) => numeric(row.entries[id].closing))))),
    packaging: roundMoney(sum(model.materials.packaging.flatMap((row) => CATEGORY_IDS.map((id) => numeric(row.entries[id].closing))))),
  };

  const pools = {} as CalculationResult["pools"];
  for (const poolId of POOL_IDS) {
    const screenId = poolId.startsWith("manufacturing") ? "manufacturing-allocation" : "packaging-allocation";
    const rows: Record<string, ReturnType<typeof calculateAllocationRow>> = {};
    const totals = moneyMap();
    for (const row of model.pools[poolId]) {
      const rowResult = calculateAllocationRow(model, row, screenId);
      rows[row.id] = rowResult;
      checks.push(...rowResult.checks);
      for (const id of CATEGORY_IDS) totals[id] = roundMoney(totals[id] + rowResult.allocations[id]);
    }
    pools[poolId] = {
      rows,
      totals,
      total: roundMoney(sum(model.pools[poolId].map((row) => numeric(row.total)))),
    };
  }

  const byproductCredits = Object.fromEntries(ALCOHOL_CATEGORY_IDS.map((id) => [id, 0])) as Record<AlcoholCategoryId, number>;
  let byproductEnding = 0;
  let byproductCogs = 0;
  for (const row of model.byproducts) {
    const produced = roundMoney(numeric(row.producedQty) * numeric(row.valuationUnit));
    const ending = roundMoney(numeric(row.closingQty) * numeric(row.closingUnit));
    const cogs = roundMoney(numeric(row.openingAmount) + produced + numeric(row.purchaseAmount) - numeric(row.internalIssueAmount) - ending);
    byproductCredits[row.creditCategory] = roundMoney(byproductCredits[row.creditCategory] + produced);
    const excludedAmounts = [numeric(row.openingAmount), produced, numeric(row.purchaseAmount), numeric(row.internalIssueAmount), ending].map(roundMoney);
    if (!row.includeInFinancialTotals && excludedAmounts.some((amount) => amount !== 0)) {
      checks.push(
        check(
          `byproduct:${row.id}:excluded-nonzero`,
          "error",
          "副産物",
          "special",
          `${row.label}は財務集計対象外ですが、金額が残っています`,
          "財務集計対象外の副産物は、内部振替先の業務ルールが未確定のため、金額がある状態では年度確定できません。財務集計対象に戻すか、業務ルール確定後に振替処理を実装してください。",
          { rowId: row.id },
        ),
      );
    }
    if (row.includeInFinancialTotals) {
      byproductEnding = roundMoney(byproductEnding + ending);
      byproductCogs = roundMoney(byproductCogs + cogs);
      if (cogs < 0) checks.push(check(`byproduct:${row.id}:negative-cogs`, "error", "副産物", "special", `${row.label}の売上原価がマイナスです`, "期首・発生・購入・内部払出・期末を見直してください。", { rowId: row.id }));
    }
  }

  const manufacturingCost = moneyMap();
  const packagingCost = moneyMap();
  for (const id of CATEGORY_IDS) {
    const credit = id === "amazake" ? 0 : byproductCredits[id];
    manufacturingCost[id] = roundMoney(materials.manufacturing[id] + pools.manufacturingLabor.totals[id] + pools.manufacturingExpenses.totals[id] - credit);
    packagingCost[id] = roundMoney(materials.packaging[id] + pools.packagingLabor.totals[id] + pools.packagingExpenses.totals[id] - numeric(model.miscIncome.packaging[id]));
  }

  const productCosts = Object.fromEntries(
    ALCOHOL_CATEGORY_IDS.map((id) => [id, calculateProductCost(model, id, manufacturingCost[id], packagingCost[id])]),
  ) as Record<AlcoholCategoryId, ProductCostResult>;
  checks.push(...negativeResultChecks(model, productCosts));

  for (const id of ALCOHOL_CATEGORY_IDS) {
    const difference = roundQuantity(productCosts[id].middle.outputQty - numeric(model.allocationDrivers.packaging[id]));
    if (!isQuantityEqual(difference, 0)) {
      checks.push(
        check(`quantity:${id}:packaging-mismatch`, "warning", "数量照合", "products", `${model.categories[id].label}の詰口数量差異`, `工程計算と配賦基準数量の差：${difference.toLocaleString("ja-JP")}L`, { categoryId: id }),
      );
    }
  }

  const amazakeCurrentCost = roundMoney(manufacturingCost.amazake + packagingCost.amazake);
  const amazakeCogs = roundMoney(numeric(model.amazake.openingAmount) + amazakeCurrentCost - numeric(model.amazake.closingAmount));
  const amazakeUnitCost = numeric(model.amazake.productionQty) === 0 ? 0 : roundMoney(amazakeCurrentCost / numeric(model.amazake.productionQty));
  if (amazakeCogs < 0) checks.push(check("amazake:negative-cogs", "error", "甘酒", "special", "甘酒の売上原価がマイナスです", "期首・当期原価・期末を見直してください。"));

  const foodCurrentCost = roundMoney(
    numeric(model.food.materialOpening) + numeric(model.food.materialPurchases) - numeric(model.food.materialClosing) + numeric(model.food.wages) + numeric(model.food.welfare) + numeric(model.food.outsourcing),
  );
  const foodProducedTotal = roundMoney(sum(model.food.products.map((row) => numeric(row.producedAmount))));
  const foodDifference = roundMoney(foodCurrentCost - foodProducedTotal);
  if (!isMoneyEqual(foodDifference, 0)) {
    checks.push(
      check("food:allocation-difference", "error", "食品", "special", "食品原価未配賦差額があります", `当期食品製造原価と食品別製造金額の差額は${foodDifference.toLocaleString("ja-JP")}円です。`),
    );
  }
  let foodCogs = 0;
  let foodEndingProducts = 0;
  for (const row of model.food.products) {
    const rowCogs = roundMoney(numeric(row.openingAmount) + numeric(row.producedAmount) - numeric(row.closingAmount));
    foodCogs = roundMoney(foodCogs + rowCogs);
    foodEndingProducts = roundMoney(foodEndingProducts + numeric(row.closingAmount));
    if (rowCogs < 0) checks.push(check(`food:${row.id}:negative-cogs`, "error", "食品", "special", `${row.label}の売上原価がマイナスです`, "期首・製造・期末を見直してください。", { rowId: row.id }));
  }

  const merchandiseCogs = roundMoney(
    numeric(model.merchandise.openingInventory) + numeric(model.merchandise.openingAdjustment) + numeric(model.merchandise.purchases) + numeric(model.merchandise.liquorTax) + numeric(model.merchandise.taxFreeTransferOut) - numeric(model.merchandise.purchaseDiscount) - numeric(model.merchandise.otherTransfer) - numeric(model.merchandise.closingInventory),
  );
  if (merchandiseCogs < 0) checks.push(check("merchandise:negative-cogs", "error", "商品", "inventory", "商品売上原価がマイナスです", "期首・仕入・振替・期末を見直してください。"));

  const rawEnding = roundMoney(sum(ALCOHOL_CATEGORY_IDS.map((id) => numeric(model.productRollforwards[id].raw.closingAmount))));
  const middleEnding = roundMoney(sum(ALCOHOL_CATEGORY_IDS.map((id) => numeric(model.productRollforwards[id].middle.closingAmount))));
  const finishedEnding = roundMoney(sum(ALCOHOL_CATEGORY_IDS.map((id) => numeric(model.productRollforwards[id].finished.closingAmount))));
  const selfManufactured = roundMoney(rawEnding + middleEnding + finishedEnding + numeric(model.amazake.closingAmount) + byproductEnding + foodEndingProducts);
  const inventory = {
    manufacturingMaterials: materialEnding.manufacturing,
    packagingMaterials: materialEnding.packaging,
    raw: rawEnding,
    middle: middleEnding,
    finished: finishedEnding,
    amazake: roundMoney(numeric(model.amazake.closingAmount)),
    byproducts: byproductEnding,
    foodMaterials: roundMoney(numeric(model.food.materialClosing)),
    foodProducts: foodEndingProducts,
    merchandise: roundMoney(numeric(model.merchandise.closingInventory)),
    selfManufactured,
    total: roundMoney(materialEnding.manufacturing + materialEnding.packaging + selfManufactured + numeric(model.food.materialClosing) + numeric(model.merchandise.closingInventory)),
  };

  const alcoholCogs = roundMoney(sum(ALCOHOL_CATEGORY_IDS.map((id) => productCosts[id].finished.cogsAmount)));
  const totalCogs = roundMoney(merchandiseCogs + alcoholCogs + amazakeCogs + byproductCogs + foodCogs);

  const nonFinite = findNonFinite(model);
  if (nonFinite.length > 0) checks.push(check("data:non-finite", "error", "データ", "data", "有限でない数値があります", `${nonFinite.slice(0, 3).join("、")} を修正してください。`));

  return {
    materials,
    materialEnding,
    pools,
    manufacturingCost,
    packagingCost,
    productCosts,
    byproducts: { credits: byproductCredits, endingInventory: byproductEnding, cogsTotal: byproductCogs },
    amazake: { currentCost: amazakeCurrentCost, unitCost: amazakeUnitCost, cogs: amazakeCogs },
    food: { currentCost: foodCurrentCost, producedTotal: foodProducedTotal, allocationDifference: foodDifference, endingProducts: foodEndingProducts, cogsTotal: foodCogs },
    merchandiseCogs,
    inventory,
    alcoholCogs,
    totalCogs,
    checks,
    criticalCount: checks.filter((item) => item.severity === "error").length,
    warningCount: checks.filter((item) => item.severity === "warning").length,
  };
}

export function totalPoolCost(calc: CalculationResult, poolIds: PoolId[]): number {
  return roundMoney(sum(poolIds.map((id) => calc.pools[id].total)));
}
