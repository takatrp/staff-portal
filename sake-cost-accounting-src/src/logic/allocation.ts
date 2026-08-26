import {
  CATEGORY_IDS,
  type AllocationRow,
  type AllocationRowResult,
  type CategoryId,
  type CategoryMap,
  type SakeCostModel,
  type ScreenId,
  type ValidationCheck,
} from "../types";
import { isMoneyEqual, numeric, roundMoney, sum } from "./number";

function emptyMoneyMap(): CategoryMap<number> {
  return Object.fromEntries(CATEGORY_IDS.map((id) => [id, 0])) as CategoryMap<number>;
}

function fingerprint(parts: Array<string | number>): string {
  return parts.join("|");
}

function allocationCheck(
  row: AllocationRow,
  screenId: ScreenId,
  idSuffix: string,
  title: string,
  detail: string,
): ValidationCheck {
  const id = `allocation:${row.id}:${idSuffix}`;
  return {
    id,
    severity: "error",
    area: "配賦",
    screenId,
    rowId: row.id,
    title,
    detail,
    fingerprint: fingerprint([id, detail]),
  };
}

/**
 * Integer-yen proportional allocation using the largest remainder method.
 * Ties are resolved by the stable category order, so repeated calculations are deterministic.
 */
export function allocateLargestRemainder(
  amount: number,
  weights: Array<{ id: CategoryId; weight: number }>,
): CategoryMap<number> {
  const result = emptyMoneyMap();
  const target = roundMoney(amount);
  const denominator = sum(weights.map((entry) => entry.weight));
  if (target === 0 || denominator <= 0) return result;

  const ranked = weights.map((entry, index) => {
    const exact = (target * entry.weight) / denominator;
    const base = Math.floor(exact);
    return { ...entry, index, base, remainder: exact - base };
  });
  let remaining = target - sum(ranked.map((entry) => entry.base));
  ranked.sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const entry of ranked) result[entry.id] = entry.base;
  for (let index = 0; index < ranked.length && remaining > 0; index += 1, remaining -= 1) {
    result[ranked[index].id] += 1;
  }
  return result;
}

export function calculateAllocationRow(
  model: SakeCostModel,
  row: AllocationRow,
  screenId: ScreenId,
): AllocationRowResult {
  const allocations = emptyMoneyMap();
  const checks: ValidationCheck[] = [];
  const eligibleIds = CATEGORY_IDS.filter((id) => model.categories[id].allocationEligible);
  const ineligibleIds = CATEGORY_IDS.filter((id) => !model.categories[id].allocationEligible);
  const total = roundMoney(numeric(row.total));

  if (eligibleIds.length === 0) {
    checks.push(
      allocationCheck(row, screenId, "no-targets", `${row.label}の共通費配賦対象がありません`, "マスター設定で1酒種以上を共通費配賦対象にしてください。"),
    );
  }
  if (total < 0) {
    checks.push(allocationCheck(row, screenId, "negative-total", `${row.label}の総額がマイナスです`, "配賦総額は0円以上で入力してください。"));
  }

  const inactiveDirect = ineligibleIds.filter((id) => numeric(row.direct[id]) !== 0);
  if (inactiveDirect.length > 0) {
    checks.push(
      allocationCheck(
        row,
        screenId,
        "inactive-direct",
        `${row.label}の対象外酒種に直課額があります`,
        `${inactiveDirect.map((id) => model.categories[id].label).join("、")}の直課額を0円にしてください。`,
      ),
    );
  }

  if (row.method === "manual") {
    const inactiveManual = ineligibleIds.filter((id) => numeric(row.manual[id]) !== 0);
    if (inactiveManual.length > 0) {
      checks.push(
        allocationCheck(
          row,
          screenId,
          "inactive-manual",
          `${row.label}の対象外酒種に個別入力額があります`,
          `${inactiveManual.map((id) => model.categories[id].label).join("、")}の個別入力額を0円にしてください。`,
        ),
      );
    }
    for (const id of eligibleIds) allocations[id] = roundMoney(numeric(row.manual[id]));
    const manualTotal = sum(eligibleIds.map((id) => allocations[id]));
    const difference = roundMoney(total - manualTotal);
    if (!isMoneyEqual(manualTotal, total)) {
      checks.push(
        allocationCheck(
          row,
          screenId,
          "manual-difference",
          `${row.label}の個別入力額が一致しません`,
          `配賦差額は${difference.toLocaleString("ja-JP")}円です。個別入力額合計を総額と完全に一致させてください。`,
        ),
      );
    }
    return { allocations, valid: checks.length === 0, difference, checks };
  }

  const directTotal = roundMoney(sum(eligibleIds.map((id) => numeric(row.direct[id]))));
  const distributable = roundMoney(total - directTotal);
  if (directTotal > total) {
    checks.push(
      allocationCheck(row, screenId, "direct-over-total", `${row.label}の直課額が総額を超えています`, `総額との差額は${(directTotal - total).toLocaleString("ja-JP")}円です。`),
    );
  }

  const weights = eligibleIds.map((id) => ({
    id,
    weight:
      row.method === "custom"
        ? numeric(row.customWeights[id])
        : numeric(model.allocationDrivers[row.method === "manufacturing-volume" ? "manufacturing" : "packaging"][id]),
  }));
  const denominator = sum(weights.map((entry) => entry.weight));

  if (row.method === "custom") {
    const inactiveWeights = ineligibleIds.filter((id) => numeric(row.customWeights[id]) !== 0);
    if (inactiveWeights.length > 0) {
      checks.push(
        allocationCheck(
          row,
          screenId,
          "inactive-custom",
          `${row.label}の対象外酒種に任意比率があります`,
          `${inactiveWeights.map((id) => model.categories[id].label).join("、")}の任意比率を0にしてください。`,
        ),
      );
    }
  }

  if (distributable > 0 && denominator <= 0) {
    checks.push(
      allocationCheck(
        row,
        screenId,
        row.method === "custom" ? "zero-custom-ratio" : "zero-driver",
        `${row.label}の配賦基準合計が0です`,
        row.method === "custom" ? "配賦対象酒種の任意比率を入力してください。" : "配賦対象酒種の数量を入力してください。",
      ),
    );
  }

  if (checks.length === 0) {
    const shared = allocateLargestRemainder(distributable, weights);
    for (const id of eligibleIds) allocations[id] = roundMoney(numeric(row.direct[id]) + shared[id]);
  } else {
    // Invalid states never push a residual into a particular category.
    for (const id of eligibleIds) allocations[id] = roundMoney(numeric(row.direct[id]));
  }

  const difference = roundMoney(total - sum(CATEGORY_IDS.map((id) => allocations[id])));
  if (checks.length === 0 && difference !== 0) {
    checks.push(allocationCheck(row, screenId, "invariant", `${row.label}の配賦額が総額と一致しません`, `内部配賦差額：${difference.toLocaleString("ja-JP")}円`));
  }
  return { allocations, valid: checks.length === 0, difference, checks };
}
