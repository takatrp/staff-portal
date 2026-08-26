export const CATEGORY_IDS = ["sake", "shochu", "liqueur", "spirits", "contract", "whisky", "amazake"] as const;
export const ALCOHOL_CATEGORY_IDS = ["sake", "shochu", "liqueur", "spirits", "contract", "whisky"] as const;
export const POOL_IDS = ["manufacturingLabor", "manufacturingExpenses", "packagingLabor", "packagingExpenses"] as const;

export type CategoryId = (typeof CATEGORY_IDS)[number];
export type AlcoholCategoryId = (typeof ALCOHOL_CATEGORY_IDS)[number];
export type PoolId = (typeof POOL_IDS)[number];
export type ScreenId =
  | "home"
  | "materials"
  | "manufacturing-allocation"
  | "packaging-allocation"
  | "products"
  | "special"
  | "inventory"
  | "master"
  | "data";

export type CategoryMap<T> = Record<CategoryId, T>;

export type CategoryDefinition = {
  label: string;
  short: string;
  allocationEligible: boolean;
  workflow: "alcohol" | "amazake";
  /** Excel側に酒種別換算率はあるが、一律の基準度数マスターを参照する式は確認できないため未使用。 */
  deprecatedAlcoholBasis?: number | null;
};

export type MaterialEntry = {
  opening: number | null;
  occurred: number | null;
  closing: number | null;
  transfer: number | null;
};

export type MaterialRow = {
  id: string;
  label: string;
  standard: boolean;
  entries: CategoryMap<MaterialEntry>;
};

export type AllocationMethod = "manufacturing-volume" | "packaging-volume" | "custom" | "manual";

export type AllocationRow = {
  id: string;
  label: string;
  standard: boolean;
  total: number | null;
  method: AllocationMethod;
  direct: CategoryMap<number | null>;
  manual: CategoryMap<number | null>;
  customWeights: CategoryMap<number | null>;
};

export type RawRollforward = {
  openingQty: number | null;
  openingAmount: number | null;
  purchaseQty: number | null;
  purchaseAmount: number | null;
  closingQty: number | null;
  closingAmount: number | null;
  transferQty: number | null;
  transferAmount: number | null;
  lossQty: number | null;
  lossAmount: number | null;
};

export type MiddleRollforward = {
  openingQty: number | null;
  openingAmount: number | null;
  closingQty: number | null;
  closingAmount: number | null;
};

export type FinishedRollforward = MiddleRollforward & {
  valuationLossQty: number | null;
  valuationLossAmount: number | null;
};

export type ProductRollforward = {
  raw: RawRollforward;
  middle: MiddleRollforward;
  finished: FinishedRollforward;
};

export type ByproductRow = {
  id: string;
  label: string;
  standard: boolean;
  creditCategory: AlcoholCategoryId;
  producedQty: number | null;
  valuationUnit: number | null;
  openingAmount: number | null;
  purchaseAmount: number | null;
  closingQty: number | null;
  closingUnit: number | null;
};

export type FoodProductRow = {
  id: string;
  label: string;
  standard: boolean;
  openingAmount: number | null;
  producedAmount: number | null;
  closingAmount: number | null;
};

export type ReviewItem = {
  id: string;
  title: string;
  detail: string;
  done: boolean;
  note: string;
};

export type WarningAcknowledgement = {
  confirmed: boolean;
  note: string;
  confirmedAt?: string;
};

export type AuditEntry = {
  id: string;
  at: string;
  actor: string;
  target: string;
  before?: string;
  after?: string;
  action: string;
  detail?: string;
};

export type SnapshotInput = Omit<SakeCostModel, "finalizationSnapshots">;

export type FinalizationSnapshot = {
  id: string;
  finalizedAt: string;
  finalizedBy: string;
  inputHash?: string;
  inputData: SnapshotInput;
  summary: {
    manufacturingCostTotal: number;
    packagingCostTotal: number;
    endingInventoryTotal: number;
    costOfSalesTotal: number;
  };
};

export type SakeCostModel = {
  schemaVersion: 2;
  meta: {
    companyName: string;
    periodLabel: string;
    startDate: string;
    endDate: string;
    status: "draft" | "finalized";
    finalizedAt: string | null;
    finalizedBy: string | null;
    finalizationId: string | null;
    updatedAt: string;
    sourceNote: string;
    operatorName: string;
  };
  categories: CategoryMap<CategoryDefinition>;
  allocationDrivers: {
    manufacturing: CategoryMap<number | null>;
    packaging: CategoryMap<number | null>;
  };
  materials: {
    manufacturing: MaterialRow[];
    packaging: MaterialRow[];
  };
  pools: Record<PoolId, AllocationRow[]>;
  productRollforwards: Record<AlcoholCategoryId, ProductRollforward>;
  byproducts: ByproductRow[];
  amazake: {
    openingQty: number | null;
    openingAmount: number | null;
    productionQty: number | null;
    closingQty: number | null;
    closingAmount: number | null;
  };
  food: {
    materialOpening: number | null;
    materialPurchases: number | null;
    materialClosing: number | null;
    wages: number | null;
    welfare: number | null;
    outsourcing: number | null;
    products: FoodProductRow[];
  };
  merchandise: {
    openingInventory: number | null;
    openingAdjustment: number | null;
    purchases: number | null;
    liquorTax: number | null;
    taxFreeTransferOut: number | null;
    purchaseDiscount: number | null;
    otherTransfer: number | null;
    closingInventory: number | null;
  };
  miscIncome: {
    packaging: CategoryMap<number | null>;
  };
  review: { items: ReviewItem[] };
  warningAcknowledgements: Record<string, WarningAcknowledgement>;
  finalizationSnapshots: FinalizationSnapshot[];
  auditLog: AuditEntry[];
};

export type ValidationCheck = {
  id: string;
  severity: "error" | "warning";
  area: string;
  screenId: ScreenId;
  categoryId?: CategoryId;
  rowId?: string;
  title: string;
  detail: string;
  fingerprint: string;
};

export type AllocationRowResult = {
  allocations: CategoryMap<number>;
  valid: boolean;
  difference: number;
  checks: ValidationCheck[];
};

export type ProductCostResult = {
  raw: { outputQty: number; outputAmount: number; unitCost: number };
  middle: { outputQty: number; outputAmount: number; unitCost: number };
  finished: { cogsQty: number; cogsAmount: number; unitCost: number };
};

export type CalculationResult = {
  materials: {
    manufacturing: CategoryMap<number>;
    packaging: CategoryMap<number>;
  };
  materialEnding: { manufacturing: number; packaging: number };
  pools: Record<PoolId, { rows: Record<string, AllocationRowResult>; totals: CategoryMap<number>; total: number }>;
  manufacturingCost: CategoryMap<number>;
  packagingCost: CategoryMap<number>;
  productCosts: Record<AlcoholCategoryId, ProductCostResult>;
  byproducts: { credits: Record<AlcoholCategoryId, number>; endingInventory: number; cogsTotal: number };
  amazake: { currentCost: number; unitCost: number; cogs: number };
  food: { currentCost: number; producedTotal: number; allocationDifference: number; endingProducts: number; cogsTotal: number };
  merchandiseCogs: number;
  inventory: {
    manufacturingMaterials: number;
    packagingMaterials: number;
    raw: number;
    middle: number;
    finished: number;
    amazake: number;
    byproducts: number;
    foodMaterials: number;
    foodProducts: number;
    merchandise: number;
    selfManufactured: number;
    total: number;
  };
  alcoholCogs: number;
  totalCogs: number;
  checks: ValidationCheck[];
  criticalCount: number;
  warningCount: number;
};
