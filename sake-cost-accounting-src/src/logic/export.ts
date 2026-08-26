import { CATEGORY_IDS, type CalculationResult, type SakeCostModel } from "../types";

function csvCell(value: string | number | null): string {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

export function buildSummaryCsv(model: SakeCostModel, calc: CalculationResult, exportedAt = new Date().toISOString()): string {
  const rows: Array<[string, string, string | number | null]> = [
    ["基本情報", "会社名", model.meta.companyName],
    ["基本情報", "対象年度", model.meta.periodLabel],
    ["基本情報", "出力日時", exportedAt],
    ["基本情報", "確定状態", model.meta.status === "finalized" ? "確定済み" : "編集中"],
    ["基本情報", "確定日時", model.meta.finalizedAt],
    ["基本情報", "確定担当者", model.meta.finalizedBy],
    ["基本情報", "確定ID", model.meta.finalizationId],
  ];
  for (const id of CATEGORY_IDS) rows.push(["酒種別当期製造原価", model.categories[id].label, calc.manufacturingCost[id]]);
  for (const id of CATEGORY_IDS) rows.push(["酒種別製品費用", model.categories[id].label, calc.packagingCost[id]]);
  rows.push(
    ["期末棚卸", "製造原材料期末棚卸", calc.inventory.manufacturingMaterials],
    ["期末棚卸", "包装材料期末棚卸", calc.inventory.packagingMaterials],
    ["期末棚卸", "原酒期末棚卸", calc.inventory.raw],
    ["期末棚卸", "詰口酒期末棚卸", calc.inventory.middle],
    ["期末棚卸", "詰口製品期末棚卸", calc.inventory.finished],
    ["期末棚卸", "甘酒期末棚卸", calc.inventory.amazake],
    ["期末棚卸", "副産物期末棚卸", calc.inventory.byproducts],
    ["期末棚卸", "食品材料期末棚卸", calc.inventory.foodMaterials],
    ["期末棚卸", "食品製品期末棚卸", calc.inventory.foodProducts],
    ["期末棚卸", "商品期末棚卸", calc.inventory.merchandise],
    ["期末棚卸", "自製酒等期末棚卸高", calc.inventory.selfManufactured],
    ["期末棚卸", "期末棚卸資産合計", calc.inventory.total],
    ["売上原価", "商品売上原価", calc.merchandiseCogs],
    ["売上原価", "自製酒類売上原価", calc.alcoholCogs],
    ["売上原価", "甘酒売上原価", calc.amazake.cogs],
    ["売上原価", "副産物売上原価", calc.byproducts.cogsTotal],
    ["売上原価", "食品売上原価", calc.food.cogsTotal],
    ["売上原価", "売上原価合計", calc.totalCogs],
  );
  return `\uFEFF${[["区分", "項目", "金額・値"], ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
}
