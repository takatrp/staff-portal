import { useEffect, useState } from "react";
import { ALCOHOL_CATEGORY_IDS, type AlcoholCategoryId, type FinishedRollforward, type MiddleRollforward, type RawRollforward } from "../types";
import { Money, NumberInput, PanelTitle, Quantity, StepNavigation } from "../components";
import type { CommonScreenProps } from "../ui-types";

type EditableRowProps = {
  label: string;
  qty?: number | null;
  amount?: number | null;
  onQty?: (value: number | null) => void;
  onAmount?: (value: number | null) => void;
  onQtyCommit?: (before: number | null, after: number | null) => void;
  onAmountCommit?: (before: number | null, after: number | null) => void;
  locked: boolean;
  allowNegative?: boolean;
  row: number;
};

function EditableRow({ label, qty, amount, onQty, onAmount, onQtyCommit, onAmountCommit, locked, allowNegative, row }: EditableRowProps) {
  return (
    <tr>
      <th>{label}</th>
      <td>{onQty ? <NumberInput value={qty ?? null} onChange={onQty} onCommit={onQtyCommit} disabled={locked} allowNegative={allowNegative} kind="quantity" suffix="L" ariaLabel={`${label} 数量`} row={row} col={0} /> : "—"}</td>
      <td>{onAmount ? <NumberInput value={amount ?? null} onChange={onAmount} onCommit={onAmountCommit} disabled={locked} allowNegative={allowNegative} kind="money" suffix="円" ariaLabel={`${label} 金額`} row={row} col={1} /> : "—"}</td>
    </tr>
  );
}

function DerivedRow({ label, qty, amount, emphasis }: { label: string; qty?: number; amount: number; emphasis?: boolean }) {
  return <tr className={emphasis ? "emphasis-row" : "derived-row"}><th>{label}</th><td>{qty === undefined ? "—" : <Quantity value={qty} />}</td><td><Money value={amount} /></td></tr>;
}

export function ProductsScreen({ model, calc, locked, updateModel, recordAudit, navigate }: CommonScreenProps) {
  const [categoryId, setCategoryId] = useState<AlcoholCategoryId>("sake");
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ categoryId?: AlcoholCategoryId }>).detail;
      if (detail?.categoryId && ALCOHOL_CATEGORY_IDS.includes(detail.categoryId)) setCategoryId(detail.categoryId);
    };
    window.addEventListener("sake-cost-focus", handler);
    return () => window.removeEventListener("sake-cost-focus", handler);
  }, []);
  const flow = model.productRollforwards[categoryId];
  const result = calc.productCosts[categoryId];
  const setRaw = (key: keyof RawRollforward, value: number | null) => updateModel((draft) => { draft.productRollforwards[categoryId].raw[key] = value; });
  const setMiddle = (key: keyof MiddleRollforward, value: number | null) => updateModel((draft) => { draft.productRollforwards[categoryId].middle[key] = value; });
  const setFinished = (key: keyof FinishedRollforward, value: number | null) => updateModel((draft) => { draft.productRollforwards[categoryId].finished[key] = value; });
  const commit = (label: string) => (before: number | null, after: number | null) => recordAudit(`${model.categories[categoryId].label} ${label}`, before, after);

  return (
    <div className="screen-stack">
      <section className="panel">
        <PanelTitle eyebrow="PRODUCT COST" title="製品原価" description="製造原価を原酒に投入し、詰口酒・詰口製品へ順に繰り越します。数量は小数第3位、金額は整数円に丸めます。" />
        <div className="category-tabs" role="tablist" aria-label="酒種">
          {ALCOHOL_CATEGORY_IDS.map((id) => <button role="tab" aria-selected={categoryId === id} className={categoryId === id ? "active" : ""} type="button" key={id} onClick={() => setCategoryId(id)}>{model.categories[id].label}{!model.categories[id].allocationEligible && <small> 配賦対象外</small>}</button>)}
        </div>
      </section>

      <div className="product-steps" id={`product-${categoryId}`}>
        <section className="panel product-step">
          <span className="eyebrow">STEP 1</span><h2>原酒</h2>
          <div className="table-scroll"><table className="data-table flow-table"><thead><tr><th>内訳</th><th>数量</th><th>金額</th></tr></thead><tbody>
            <EditableRow row={0} label="期首棚卸" qty={flow.raw.openingQty} amount={flow.raw.openingAmount} onQty={(value) => setRaw("openingQty", value)} onAmount={(value) => setRaw("openingAmount", value)} onQtyCommit={commit("原酒 期首数量")} onAmountCommit={commit("原酒 期首金額")} locked={locked} />
            <DerivedRow label="当期製造" qty={model.allocationDrivers.manufacturing[categoryId] ?? 0} amount={calc.manufacturingCost[categoryId]} />
            <EditableRow row={1} label="購入・移入" qty={flow.raw.purchaseQty} amount={flow.raw.purchaseAmount} onQty={(value) => setRaw("purchaseQty", value)} onAmount={(value) => setRaw("purchaseAmount", value)} onQtyCommit={commit("原酒 購入数量")} onAmountCommit={commit("原酒 購入金額")} locked={locked} />
            <EditableRow row={2} label="期末棚卸" qty={flow.raw.closingQty} amount={flow.raw.closingAmount} onQty={(value) => setRaw("closingQty", value)} onAmount={(value) => setRaw("closingAmount", value)} onQtyCommit={commit("原酒 期末数量")} onAmountCommit={commit("原酒 期末金額")} locked={locked} />
            <EditableRow row={3} label="振替" qty={flow.raw.transferQty} amount={flow.raw.transferAmount} onQty={(value) => setRaw("transferQty", value)} onAmount={(value) => setRaw("transferAmount", value)} onQtyCommit={commit("原酒 振替数量")} onAmountCommit={commit("原酒 振替金額")} locked={locked} allowNegative />
            <EditableRow row={4} label="欠減" qty={flow.raw.lossQty} amount={flow.raw.lossAmount} onQty={(value) => setRaw("lossQty", value)} onAmount={(value) => setRaw("lossAmount", value)} onQtyCommit={commit("原酒 欠減数量")} onAmountCommit={commit("原酒 欠減金額")} locked={locked} />
            <DerivedRow label="詰口酒へ払出" qty={result.raw.outputQty} amount={result.raw.outputAmount} emphasis />
          </tbody></table></div>
          <p className="unit-cost">1kL当たり <Money value={result.raw.unitCost} /></p>
        </section>

        <section className="panel product-step">
          <span className="eyebrow">STEP 2</span><h2>詰口酒</h2>
          <div className="table-scroll"><table className="data-table flow-table"><thead><tr><th>内訳</th><th>数量</th><th>金額</th></tr></thead><tbody>
            <EditableRow row={0} label="期首棚卸" qty={flow.middle.openingQty} amount={flow.middle.openingAmount} onQty={(value) => setMiddle("openingQty", value)} onAmount={(value) => setMiddle("openingAmount", value)} onQtyCommit={commit("詰口酒 期首数量")} onAmountCommit={commit("詰口酒 期首金額")} locked={locked} />
            <DerivedRow label="原酒から受入" qty={result.raw.outputQty} amount={result.raw.outputAmount} />
            <EditableRow row={1} label="期末棚卸" qty={flow.middle.closingQty} amount={flow.middle.closingAmount} onQty={(value) => setMiddle("closingQty", value)} onAmount={(value) => setMiddle("closingAmount", value)} onQtyCommit={commit("詰口酒 期末数量")} onAmountCommit={commit("詰口酒 期末金額")} locked={locked} />
            <DerivedRow label="製品費用" amount={calc.packagingCost[categoryId]} />
            <DerivedRow label="詰口製品へ払出" qty={result.middle.outputQty} amount={result.middle.outputAmount} emphasis />
          </tbody></table></div>
          <p className="unit-cost">1kL当たり <Money value={result.middle.unitCost} /></p>
        </section>

        <section className="panel product-step">
          <span className="eyebrow">STEP 3</span><h2>詰口製品</h2>
          <div className="table-scroll"><table className="data-table flow-table"><thead><tr><th>内訳</th><th>数量</th><th>金額</th></tr></thead><tbody>
            <EditableRow row={0} label="期首棚卸" qty={flow.finished.openingQty} amount={flow.finished.openingAmount} onQty={(value) => setFinished("openingQty", value)} onAmount={(value) => setFinished("openingAmount", value)} onQtyCommit={commit("詰口製品 期首数量")} onAmountCommit={commit("詰口製品 期首金額")} locked={locked} />
            <DerivedRow label="詰口酒から受入" qty={result.middle.outputQty} amount={result.middle.outputAmount} />
            <EditableRow row={1} label="期末棚卸" qty={flow.finished.closingQty} amount={flow.finished.closingAmount} onQty={(value) => setFinished("closingQty", value)} onAmount={(value) => setFinished("closingAmount", value)} onQtyCommit={commit("詰口製品 期末数量")} onAmountCommit={commit("詰口製品 期末金額")} locked={locked} />
            <EditableRow row={2} label="評価損・欠減" qty={flow.finished.valuationLossQty} amount={flow.finished.valuationLossAmount} onQty={(value) => setFinished("valuationLossQty", value)} onAmount={(value) => setFinished("valuationLossAmount", value)} onQtyCommit={commit("詰口製品 評価損・欠減数量")} onAmountCommit={commit("詰口製品 評価損・欠減金額")} locked={locked} />
            <DerivedRow label="売上原価" qty={result.finished.cogsQty} amount={result.finished.cogsAmount} emphasis />
          </tbody></table></div>
          <p className="unit-cost">1kL当たり <Money value={result.finished.unitCost} /></p>
        </section>
      </div>

      <section className={`quantity-check ${calc.checks.some((item) => item.id === `quantity:${categoryId}:packaging-mismatch`) ? "warning" : "success"}`}>
        <strong>詰口数量の照合</strong>
        <p>工程計算 <Quantity value={result.middle.outputQty} /> ／ 配賦基準 <Quantity value={model.allocationDrivers.packaging[categoryId] ?? 0} /> ／ 差異 <Quantity value={result.middle.outputQty - (model.allocationDrivers.packaging[categoryId] ?? 0)} /></p>
      </section>
      <p className="formula-note">売上原価数量 ＝ 期首数量 ＋ 詰口酒からの受入数量 － 期末数量 － 評価損・欠減数量</p>
      <StepNavigation previous={{ id: "packaging-allocation", label: "製品費用按分" }} next={{ id: "special", label: "甘酒・副産物等" }} navigate={navigate} />
    </div>
  );
}
