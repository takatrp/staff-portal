import {
  ALCOHOL_CATEGORY_IDS,
  CATEGORY_IDS,
  type AlcoholCategoryId,
  type AllocationMethod,
  type AllocationRow,
  type ByproductRow,
  type CategoryId,
  type CategoryMap,
  type FoodProductRow,
  type MaterialEntry,
  type MaterialRow,
  type ProductRollforward,
  type SakeCostModel,
} from "../types";

export const STORAGE_KEY = "sake-cost-accounting-public-demo-v2";

export function categoryMap<T>(factory: (id: CategoryId) => T): CategoryMap<T> {
  return Object.fromEntries(CATEGORY_IDS.map((id) => [id, factory(id)])) as CategoryMap<T>;
}

function amounts(values: Partial<CategoryMap<number>> = {}): CategoryMap<number | null> {
  return categoryMap((id) => values[id] ?? 0);
}

function materialEntries(occurred: Partial<CategoryMap<number>> = {}): CategoryMap<MaterialEntry> {
  return categoryMap((id) => ({ opening: 0, occurred: occurred[id] ?? 0, closing: 0, transfer: 0 }));
}

function materialRow(id: string, label: string, occurred: Partial<CategoryMap<number>> = {}): MaterialRow {
  return { id, label, standard: true, entries: materialEntries(occurred) };
}

function allocationRow(id: string, label: string, total: number, method: AllocationMethod): AllocationRow {
  return {
    id,
    label,
    standard: true,
    total,
    method,
    direct: amounts(),
    manual: amounts(),
    customWeights: amounts(),
  };
}

function productRollforward(categoryId: AlcoholCategoryId, productionQty: number, packagingQty: number): ProductRollforward {
  const position = ALCOHOL_CATEGORY_IDS.indexOf(categoryId) + 1;
  return {
    raw: {
      openingQty: 10 * position,
      openingAmount: 20_000 * position,
      purchaseQty: 0,
      purchaseAmount: 0,
      closingQty: 10 * position + productionQty - packagingQty,
      closingAmount: 10_000 * position,
      transferQty: 0,
      transferAmount: 0,
      lossQty: 0,
      lossAmount: 0,
    },
    middle: {
      openingQty: 5 * position,
      openingAmount: 10_000 * position,
      closingQty: 5 * position,
      closingAmount: 8_000 * position,
    },
    finished: {
      openingQty: 10 * position,
      openingAmount: 25_000 * position,
      closingQty: Math.max(5, Math.round(packagingQty * 0.2)),
      closingAmount: 10_000 * position,
      valuationLossQty: categoryId === "sake" ? 2 : 0,
      valuationLossAmount: categoryId === "sake" ? 5_000 : 0,
    },
  };
}

const normalProduction = { sake: 100, shochu: 60, liqueur: 30, spirits: 10, contract: 0, whisky: 20, amazake: 15 } satisfies CategoryMap<number>;
const normalPackaging = { sake: 90, shochu: 55, liqueur: 28, spirits: 9, contract: 0, whisky: 18, amazake: 15 } satisfies CategoryMap<number>;

export function createNormalDemoModel(now = new Date().toISOString()): SakeCostModel {
  const byproducts: ByproductRow[] = [
    { id: "sake-lees", label: "清酒粕", standard: true, creditCategory: "sake", producedQty: 100, valuationUnit: 500, openingAmount: 10_000, purchaseAmount: 5_000, internalIssueAmount: 0, closingQty: 20, closingUnit: 500, includeInFinancialTotals: true },
    { id: "rice-koji", label: "米麹", standard: true, creditCategory: "sake", producedQty: 0, valuationUnit: 400, openingAmount: 0, purchaseAmount: 0, internalIssueAmount: 0, closingQty: 0, closingUnit: 400, includeInFinancialTotals: false },
    { id: "rice-bran", label: "米糠類", standard: true, creditCategory: "shochu", producedQty: 15, valuationUnit: 200, openingAmount: 0, purchaseAmount: 0, internalIssueAmount: 0, closingQty: 5, closingUnit: 200, includeInFinancialTotals: true },
    { id: "plum", label: "梅", standard: true, creditCategory: "liqueur", producedQty: 5, valuationUnit: 1_000, openingAmount: 0, purchaseAmount: 0, internalIssueAmount: 0, closingQty: 1, closingUnit: 1_000, includeInFinancialTotals: true },
  ];
  const foodProducts: FoodProductRow[] = [
    { id: "pickles", label: "漬物", standard: true, openingAmount: 100_000, producedAmount: 600_000, closingAmount: 150_000 },
    { id: "salt-koji", label: "塩糀", standard: true, openingAmount: 50_000, producedAmount: 400_000, closingAmount: 80_000 },
  ];

  return {
    schemaVersion: 3,
    meta: {
      companyName: "サンプル酒造株式会社",
      periodLabel: "デモ年度",
      startDate: "2025-07-01",
      endDate: "2026-06-30",
      status: "draft",
      finalizedAt: null,
      finalizedBy: null,
      finalizationId: null,
      updatedAt: now,
      sourceNote: "社内検討用の架空データ",
      operatorName: "",
    },
    categories: {
      sake: { label: "清酒", short: "清酒", allocationEligible: true, workflow: "alcohol", deprecatedAlcoholBasis: 16 },
      shochu: { label: "本格焼酎", short: "焼酎", allocationEligible: true, workflow: "alcohol", deprecatedAlcoholBasis: 25 },
      liqueur: { label: "リキュール", short: "リキュール", allocationEligible: true, workflow: "alcohol", deprecatedAlcoholBasis: 6 },
      spirits: { label: "スピリッツ", short: "スピリッツ", allocationEligible: true, workflow: "alcohol", deprecatedAlcoholBasis: 47 },
      contract: { label: "受託酒", short: "受託酒", allocationEligible: false, workflow: "alcohol", deprecatedAlcoholBasis: null },
      whisky: { label: "ウイスキー", short: "ウイスキー", allocationEligible: true, workflow: "alcohol", deprecatedAlcoholBasis: 43 },
      amazake: { label: "甘酒", short: "甘酒", allocationEligible: true, workflow: "amazake", deprecatedAlcoholBasis: null },
    },
    allocationDrivers: {
      manufacturing: { ...normalProduction },
      packaging: { ...normalPackaging },
    },
    materials: {
      manufacturing: [
        materialRow("raw-rice", "原料米", { sake: 600_000, shochu: 300_000, liqueur: 100_000, spirits: 50_000, whisky: 150_000, amazake: 100_000 }),
        materialRow("bran-lees", "原料米・米糠・酒粕", { sake: 30_000, shochu: 20_000, liqueur: 15_000, spirits: 5_000, whisky: 10_000 }),
        materialRow("raw-alcohol", "原料アルコール", { liqueur: 80_000, spirits: 40_000 }),
        materialRow("sub-material", "副原料", { sake: 20_000, shochu: 10_000, liqueur: 60_000, whisky: 15_000, amazake: 20_000 }),
        materialRow("freight", "運賃", { sake: 10_000, shochu: 5_000, liqueur: 3_000, spirits: 2_000, whisky: 5_000, amazake: 2_000 }),
        materialRow("tax-free-in", "未納税移入酒", { sake: 40_000, shochu: 20_000 }),
      ],
      packaging: [
        materialRow("empty-bottle", "空瓶", { sake: 120_000, shochu: 60_000, liqueur: 40_000, spirits: 10_000, whisky: 30_000, amazake: 20_000 }),
        materialRow("cap", "王冠", { sake: 30_000, shochu: 15_000, liqueur: 10_000, spirits: 3_000, whisky: 8_000, amazake: 5_000 }),
        materialRow("label-package", "レッテル・包装品", { sake: 50_000, shochu: 25_000, liqueur: 15_000, spirits: 5_000, whisky: 12_000, amazake: 8_000 }),
        materialRow("packing", "荷造費", { sake: 10_000, shochu: 5_000, liqueur: 3_000, spirits: 1_000, whisky: 2_000, amazake: 1_000 }),
      ],
    },
    pools: {
      manufacturingLabor: [
        allocationRow("mfg-wages", "賃金", 700_000, "manufacturing-volume"),
        allocationRow("mfg-bonus", "賞与金", 100_000, "manufacturing-volume"),
        allocationRow("mfg-officer", "役員報酬", 0, "manufacturing-volume"),
        allocationRow("mfg-welfare", "福利厚生費", 150_000, "manufacturing-volume"),
        allocationRow("mfg-retirement", "退職積立掛金", 0, "manufacturing-volume"),
      ],
      manufacturingExpenses: [
        "修繕費", "旅費交通費", "工場備品費", "作業用品費", "事務用消耗品費", "通信費", "電気料", "用水費", "リース料", "保険料", "租税公課", "燃料費", "減価償却費", "雑費",
      ].map((label, index) => allocationRow(`mfg-exp-${index + 1}`, label, [100_000, 0, 50_000, 40_000, 10_000, 20_000, 120_000, 30_000, 0, 40_000, 30_000, 60_000, 180_000, 10_000][index], "manufacturing-volume")),
      packagingLabor: [
        allocationRow("pkg-wages", "賃金", 400_000, "packaging-volume"),
        allocationRow("pkg-bonus", "賞与金", 80_000, "packaging-volume"),
        allocationRow("pkg-meals", "現物賄費", 0, "packaging-volume"),
        allocationRow("pkg-welfare", "福利厚生費", 100_000, "packaging-volume"),
        allocationRow("pkg-retirement", "退職積立掛金", 0, "packaging-volume"),
      ],
      packagingExpenses: [
        "外注費", "修繕費", "瓶詰用品費", "光熱電力費", "用水費", "保険料", "租税公課", "工場備品費", "作業用品費", "燃料費", "賃借料", "減価償却費", "雑費",
      ].map((label, index) => allocationRow(`pkg-exp-${index + 1}`, label, [40_000, 20_000, 30_000, 100_000, 20_000, 15_000, 15_000, 20_000, 25_000, 40_000, 50_000, 100_000, 5_000][index], "packaging-volume")),
    },
    productRollforwards: Object.fromEntries(
      ALCOHOL_CATEGORY_IDS.map((id) => [id, productRollforward(id, normalProduction[id], normalPackaging[id])]),
    ) as Record<AlcoholCategoryId, ProductRollforward>,
    byproducts,
    amazake: { openingQty: 10, openingAmount: 20_000, productionQty: 15, closingQty: 5, closingAmount: 30_000 },
    food: {
      materialOpening: 100_000,
      materialPurchases: 900_000,
      materialClosing: 200_000,
      wages: 100_000,
      welfare: 50_000,
      outsourcing: 50_000,
      products: foodProducts,
    },
    merchandise: {
      openingInventory: 500_000,
      openingAdjustment: 0,
      purchases: 1_500_000,
      liquorTax: 100_000,
      taxFreeTransferOut: 50_000,
      purchaseDiscount: 10_000,
      otherTransfer: 40_000,
      closingInventory: 400_000,
    },
    miscIncome: { packaging: amounts() },
    review: {
      items: [
        { id: "old-stock", title: "年度別在庫単価の確認", detail: "過年度在庫が年度別単価で評価されているか確認します。", done: false, note: "" },
        { id: "quantity-tie", title: "造り数量と棚卸数量の照合", detail: "製造数量・詰口数量・期末実地数量の差異理由を確認します。", done: false, note: "" },
        { id: "byproduct-credit", title: "副産物控除の確認", detail: "副産物評価額と控除先酒種を確認します。", done: false, note: "" },
      ],
    },
    warningAcknowledgements: {},
    finalizationSnapshots: [],
    auditLog: [
      { id: "demo-initial", at: now, actor: "未設定", target: "全体", action: "正常デモデータを登録", detail: "公開用の架空データ" },
    ],
  };
}

export function createErrorDemoModel(now = new Date().toISOString()): SakeCostModel {
  const model = createNormalDemoModel(now);
  const allocation = model.pools.manufacturingLabor[0];
  allocation.total = 100;
  allocation.method = "manual";
  allocation.manual = amounts({ sake: 90 });
  model.allocationDrivers.packaging.sake = (model.allocationDrivers.packaging.sake ?? 0) + 5;
  model.productRollforwards.sake.finished.closingQty = 500;
  model.productRollforwards.sake.finished.closingAmount = 10_000_000;
  model.food.products[0].producedAmount = 599_900;
  const riceKoji = model.byproducts.find((row) => row.id === "rice-koji");
  if (riceKoji) {
    riceKoji.producedQty = 20;
    riceKoji.closingQty = 5;
  }
  model.auditLog = [{ id: "error-demo", at: now, actor: "未設定", target: "全体", action: "エラー確認用データを登録", detail: "配賦・数量差異・負数・食品差額・財務集計対象外副産物を含む架空データ" }];
  return model;
}

export function getCategoryLabel(model: SakeCostModel, categoryId: CategoryId): string {
  return model.categories[categoryId]?.label || categoryId;
}

export function cloneModel(model: SakeCostModel): SakeCostModel {
  return structuredClone(model);
}
