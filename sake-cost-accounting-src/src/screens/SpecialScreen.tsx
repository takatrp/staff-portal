import { useEffect, useState } from "react";
import { ALCOHOL_CATEGORY_IDS, type ByproductRow, type FoodProductRow } from "../types";
import { Money, NumberInput, PanelTitle, StepNavigation, TextCommitInput } from "../components";
import { numeric, roundMoney } from "../logic/number";
import type { CommonScreenProps } from "../ui-types";

type SpecialTab = "amazake" | "byproducts" | "food";

export function SpecialScreen({ model, calc, locked, updateModel, recordAudit, openDialog, navigate }: CommonScreenProps) {
  const [tab, setTab] = useState<SpecialTab>("amazake");
  const commit = (label: string) => (before: number | null, after: number | null) => recordAudit(label, before, after);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ rowId?: string }>).detail;
      if (!detail?.rowId) return;
      if (model.byproducts.some((row) => row.id === detail.rowId)) setTab("byproducts");
      else if (model.food.products.some((row) => row.id === detail.rowId)) setTab("food");
      else return;
      window.setTimeout(() => {
        const element = document.getElementById(`row-${detail.rowId}`);
        element?.scrollIntoView({ behavior: "smooth", block: "center" });
        element?.classList.add("temporary-highlight");
        if (element) window.setTimeout(() => element.classList.remove("temporary-highlight"), 2200);
      }, 0);
    };
    window.addEventListener("sake-cost-focus", handler);
    return () => window.removeEventListener("sake-cost-focus", handler);
  }, [model.byproducts, model.food.products]);

  const addByproduct = () => openDialog({
    title: "副産物の行を追加",
    detail: "品目名を入力してください。購入金額・控除先酒種を含めて編集できます。",
    inputLabel: "品目名",
    confirmLabel: "追加する",
    onConfirm: (label) => updateModel((draft) => {
      draft.byproducts.push({ id: `custom-byproduct-${Date.now()}`, label: label || "追加副産物", standard: false, creditCategory: "sake", producedQty: 0, valuationUnit: 0, openingAmount: 0, purchaseAmount: 0, internalIssueAmount: 0, closingQty: 0, closingUnit: 0, includeInFinancialTotals: true });
    }, "副産物を追加", label, "新規行"),
  });
  const addFood = () => openDialog({
    title: "食品製品の行を追加",
    detail: "品目名を入力してください。食品別製造金額は当期食品製造原価と一致させる必要があります。",
    inputLabel: "品目名",
    confirmLabel: "追加する",
    onConfirm: (label) => updateModel((draft) => {
      draft.food.products.push({ id: `custom-food-${Date.now()}`, label: label || "追加食品", standard: false, openingAmount: 0, producedAmount: 0, closingAmount: 0 });
    }, "食品製品を追加", label, "新規行"),
  });
  const deleteByproduct = (row: ByproductRow) => openDialog({ title: `${row.label}を削除しますか？`, detail: "購入・評価・控除先を含むデータが削除され、製造原価と売上原価が変わります。", confirmLabel: "削除する", danger: true, onConfirm: () => updateModel((draft) => { draft.byproducts = draft.byproducts.filter((item) => item.id !== row.id); }, "副産物を削除", row.label, "計算データを含めて削除") });
  const deleteFood = (row: FoodProductRow) => openDialog({ title: `${row.label}を削除しますか？`, detail: "期首・製造・期末金額が削除され、食品原価未配賦差額と売上原価が変わります。", confirmLabel: "削除する", danger: true, onConfirm: () => updateModel((draft) => { draft.food.products = draft.food.products.filter((item) => item.id !== row.id); }, "食品製品を削除", row.label, "計算データを含めて削除") });

  return (
    <div className="screen-stack">
      <section className="panel">
        <PanelTitle eyebrow="SPECIAL FLOWS" title="甘酒・副産物・食品" description="酒類とは異なる原価の流れを、区分ごとに入力します。" />
        <div className="segmented-control">
          <button className={tab === "amazake" ? "active" : ""} type="button" onClick={() => setTab("amazake")}>甘酒</button>
          <button className={tab === "byproducts" ? "active" : ""} type="button" onClick={() => setTab("byproducts")}>副産物</button>
          <button className={tab === "food" ? "active" : ""} type="button" onClick={() => setTab("food")}>食品</button>
        </div>
      </section>

      {tab === "amazake" && (
        <section className="panel">
          <PanelTitle title="甘酒原価" description="甘酒に配賦された製造原価・製品費用を当期原価として計算します。" />
          <div className="simple-form-grid">
            {([
              ["openingQty", "期首数量", "quantity", "本等"], ["openingAmount", "期首金額", "money", "円"], ["productionQty", "当期製造数量", "quantity", "L等"], ["closingQty", "期末数量", "quantity", "本等"], ["closingAmount", "期末金額", "money", "円"],
            ] as const).map(([key, label, kind, suffix]) => <label className="stacked-field" key={key}><span>{label}</span><NumberInput value={model.amazake[key]} onChange={(value) => updateModel((draft) => { draft.amazake[key] = value; })} onCommit={commit(`甘酒 ${label}`)} disabled={locked} kind={kind} suffix={suffix} ariaLabel={`甘酒 ${label}`} /></label>)}
          </div>
          <div className="result-strip three"><div><span>当期製造原価</span><strong><Money value={calc.amazake.currentCost} /></strong></div><div><span>単位原価</span><strong><Money value={calc.amazake.unitCost} /></strong></div><div><span>売上原価</span><strong><Money value={calc.amazake.cogs} /></strong></div></div>
        </section>
      )}

      {tab === "byproducts" && (
        <section className="panel">
          <PanelTitle title="副産物" description="発生評価額は製造原価から控除します。内部払出は品目原価から控除し、財務集計対象外の品目は副産物売上原価・期末棚卸の合計に含めません。" action={<button type="button" className="secondary-button" onClick={addByproduct} disabled={locked}>＋ 行を追加</button>} />
          <div className="table-scroll"><table className="data-table input-table wide-table"><thead><tr><th>品目名</th><th>控除先酒種</th><th>発生数量</th><th>評価単価</th><th>発生評価額</th><th>期首金額</th><th>購入金額</th><th>内部払出</th><th>期末数量</th><th>期末単価</th><th>財務集計</th><th>品目原価</th><th>操作</th></tr></thead><tbody>
            {model.byproducts.map((row, index) => {
              const produced = roundMoney(numeric(row.producedQty) * numeric(row.valuationUnit));
              const ending = roundMoney(numeric(row.closingQty) * numeric(row.closingUnit));
              const cogs = roundMoney(numeric(row.openingAmount) + produced + numeric(row.purchaseAmount) - numeric(row.internalIssueAmount) - ending);
              const excludedNonzero = calc.checks.some((item) => item.id === `byproduct:${row.id}:excluded-nonzero`);
              return <tr key={row.id} id={`row-${row.id}`} className={excludedNonzero ? "byproduct-error-row" : undefined}>
                <th><TextCommitInput value={row.label} onChange={(value) => updateModel((draft) => { draft.byproducts[index].label = value; })} onCommit={(before, after) => recordAudit(`${row.id} 品目名`, before, after, "副産物名を変更")} disabled={locked} ariaLabel={`${row.label} 品目名`} /></th>
                <td><select value={row.creditCategory} onChange={(event) => updateModel((draft) => { draft.byproducts[index].creditCategory = event.target.value as ByproductRow["creditCategory"]; }, "副産物控除先を変更", row.label, `${model.categories[row.creditCategory].label} → ${model.categories[event.target.value as ByproductRow["creditCategory"]].label}`)} disabled={locked}>{ALCOHOL_CATEGORY_IDS.map((id) => <option key={id} value={id}>{model.categories[id].label}</option>)}</select></td>
                <td><NumberInput value={row.producedQty} onChange={(value) => updateModel((draft) => { draft.byproducts[index].producedQty = value; })} onCommit={commit(`${row.label} 発生数量`)} disabled={locked} kind="quantity" ariaLabel={`${row.label} 発生数量`} /></td>
                <td><NumberInput value={row.valuationUnit} onChange={(value) => updateModel((draft) => { draft.byproducts[index].valuationUnit = value; })} onCommit={commit(`${row.label} 評価単価`)} disabled={locked} kind="money" ariaLabel={`${row.label} 評価単価`} /></td>
                <td><Money value={produced} /></td>
                <td><NumberInput value={row.openingAmount} onChange={(value) => updateModel((draft) => { draft.byproducts[index].openingAmount = value; })} onCommit={commit(`${row.label} 期首金額`)} disabled={locked} kind="money" ariaLabel={`${row.label} 期首金額`} /></td>
                <td><NumberInput value={row.purchaseAmount} onChange={(value) => updateModel((draft) => { draft.byproducts[index].purchaseAmount = value; })} onCommit={commit(`${row.label} 購入金額`)} disabled={locked} kind="money" ariaLabel={`${row.label} 購入金額`} /></td>
                <td><NumberInput value={row.internalIssueAmount} onChange={(value) => updateModel((draft) => { draft.byproducts[index].internalIssueAmount = value; })} onCommit={commit(`${row.label} 内部払出`)} disabled={locked} kind="money" ariaLabel={`${row.label} 内部払出`} /></td>
                <td><NumberInput value={row.closingQty} onChange={(value) => updateModel((draft) => { draft.byproducts[index].closingQty = value; })} onCommit={commit(`${row.label} 期末数量`)} disabled={locked} kind="quantity" ariaLabel={`${row.label} 期末数量`} /></td>
                <td><NumberInput value={row.closingUnit} onChange={(value) => updateModel((draft) => { draft.byproducts[index].closingUnit = value; })} onCommit={commit(`${row.label} 期末単価`)} disabled={locked} kind="money" ariaLabel={`${row.label} 期末単価`} /></td>
                <td><input type="checkbox" checked={row.includeInFinancialTotals} onChange={(event) => updateModel((draft) => { draft.byproducts[index].includeInFinancialTotals = event.target.checked; }, "副産物の財務集計区分を変更", row.label, event.target.checked ? "集計対象" : "集計対象外")} disabled={locked} aria-label={`${row.label} 財務集計対象`} /></td>
                <td><Money value={cogs} />{!row.includeInFinancialTotals && <small>（参考）</small>}{excludedNonzero && <span className="byproduct-error-message"><strong>要修正</strong>財務集計対象外の金額が残っているため年度確定できません。財務集計対象に戻すか金額を0円にしてください。内部振替先は未確定です。</span>}</td><td><button className="icon-danger" type="button" onClick={() => deleteByproduct(row)} disabled={locked}>削除</button></td>
              </tr>;
            })}
          </tbody><tfoot><tr><th colSpan={4}>合計</th><td><Money value={Object.values(calc.byproducts.credits).reduce((a, b) => a + b, 0)} /></td><td colSpan={6} /><td /><td><Money value={calc.byproducts.cogsTotal} /></td><td /></tr></tfoot></table></div>
        </section>
      )}

      {tab === "food" && (
        <>
          <section className="panel">
            <PanelTitle title="食品製造原価" description="食品別製造金額は手入力のまま、総製造原価との完全一致を検算します。" />
            <div className="simple-form-grid">
              {([
                ["materialOpening", "材料期首棚卸"], ["materialPurchases", "材料仕入"], ["materialClosing", "材料期末棚卸"], ["wages", "賃金"], ["welfare", "福利厚生費"], ["outsourcing", "外注費"],
              ] as const).map(([key, label]) => <label className="stacked-field" key={key}><span>{label}</span><NumberInput value={model.food[key]} onChange={(value) => updateModel((draft) => { draft.food[key] = value; })} onCommit={commit(`食品 ${label}`)} disabled={locked} kind="money" suffix="円" ariaLabel={`食品 ${label}`} /></label>)}
            </div>
            <div className="reconciliation-grid"><div><span>当期食品製造原価</span><strong><Money value={calc.food.currentCost} /></strong></div><div><span>食品別製造金額合計</span><strong><Money value={calc.food.producedTotal} /></strong></div><div className={calc.food.allocationDifference === 0 ? "success" : "error"}><span>未配賦差額</span><strong><Money value={calc.food.allocationDifference} /></strong></div></div>
          </section>
          <section className="panel">
            <PanelTitle title="食品別製造金額・売上原価" action={<button type="button" className="secondary-button" onClick={addFood} disabled={locked}>＋ 行を追加</button>} />
            <div className="table-scroll"><table className="data-table input-table"><thead><tr><th>品目名</th><th>期首製品</th><th>当期製造金額</th><th>期末製品</th><th>売上原価</th><th>操作</th></tr></thead><tbody>
              {model.food.products.map((row, index) => <tr key={row.id} id={`row-${row.id}`}><th><TextCommitInput value={row.label} onChange={(value) => updateModel((draft) => { draft.food.products[index].label = value; })} onCommit={(before, after) => recordAudit(`${row.id} 品目名`, before, after, "食品名を変更")} disabled={locked} ariaLabel={`${row.label} 品目名`} /></th>{(["openingAmount", "producedAmount", "closingAmount"] as const).map((key) => <td key={key}><NumberInput value={row[key]} onChange={(value) => updateModel((draft) => { draft.food.products[index][key] = value; })} onCommit={commit(`${row.label} ${key}`)} disabled={locked} kind="money" ariaLabel={`${row.label} ${key}`} /></td>)}<td><Money value={roundMoney(numeric(row.openingAmount) + numeric(row.producedAmount) - numeric(row.closingAmount))} /></td><td><button className="icon-danger" type="button" onClick={() => deleteFood(row)} disabled={locked}>削除</button></td></tr>)}
            </tbody><tfoot><tr><th>合計</th><td /><td><Money value={calc.food.producedTotal} /></td><td><Money value={calc.food.endingProducts} /></td><td><Money value={calc.food.cogsTotal} /></td><td /></tr></tfoot></table></div>
          </section>
        </>
      )}
      <StepNavigation previous={{ id: "products", label: "製品原価" }} next={{ id: "inventory", label: "棚卸・売上原価" }} navigate={navigate} />
    </div>
  );
}
