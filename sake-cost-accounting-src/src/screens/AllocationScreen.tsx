import { useMemo, useState } from "react";
import { CATEGORY_IDS, type AllocationRow, type PoolId } from "../types";
import { Money, NumberInput, PanelTitle, StepNavigation, TextCommitInput } from "../components";
import { categoryMap } from "../data/defaults";
import type { CommonScreenProps } from "../ui-types";

const methodLabels = {
  "manufacturing-volume": "製造数量比",
  "packaging-volume": "詰口数量比",
  custom: "任意比率",
  manual: "個別入力",
};

export function AllocationScreen({ type, ...props }: CommonScreenProps & { type: "manufacturing" | "packaging" }) {
  const { model, calc, locked, updateModel, recordAudit, openDialog, navigate } = props;
  const poolIds: PoolId[] = type === "manufacturing" ? ["manufacturingLabor", "manufacturingExpenses"] : ["packagingLabor", "packagingExpenses"];
  const [selected, setSelected] = useState(`${poolIds[0]}:${model.pools[poolIds[0]][0]?.id ?? ""}`);
  const [selectedPoolId, selectedRowId] = selected.split(":") as [PoolId, string];
  const selectedIndex = model.pools[selectedPoolId]?.findIndex((row) => row.id === selectedRowId) ?? -1;
  const selectedRow = selectedIndex >= 0 ? model.pools[selectedPoolId][selectedIndex] : model.pools[poolIds[0]][0];
  const actualPoolId = selectedIndex >= 0 ? selectedPoolId : poolIds[0];
  const actualIndex = model.pools[actualPoolId].findIndex((row) => row.id === selectedRow?.id);
  const result = selectedRow ? calc.pools[actualPoolId].rows[selectedRow.id] : null;
  const screenTitle = type === "manufacturing" ? "製造費用按分" : "製品費用按分";
  const driverKey = type;

  const groupLabels = useMemo<Record<PoolId, string>>(() => ({
    manufacturingLabor: "製造労務費",
    manufacturingExpenses: "製造経費",
    packagingLabor: "製品労務費",
    packagingExpenses: "製品経費",
  }), []);

  const addRow = (poolId: PoolId) => openDialog({
    title: `${groupLabels[poolId]}の行を追加`,
    detail: "追加する費目名を入力してください。標準行はそのまま維持されます。",
    inputLabel: "費目名",
    confirmLabel: "追加する",
    onConfirm: (label) => updateModel((draft) => {
      const row: AllocationRow = {
        id: `custom-${poolId}-${Date.now()}`,
        label: label || "追加項目",
        standard: false,
        total: 0,
        method: type === "manufacturing" ? "manufacturing-volume" : "packaging-volume",
        direct: categoryMap(() => 0),
        manual: categoryMap(() => 0),
        customWeights: categoryMap(() => 0),
      };
      draft.pools[poolId].push(row);
      setSelected(`${poolId}:${row.id}`);
    }, "費目を追加", groupLabels[poolId], label),
  });

  const deleteRow = (poolId: PoolId, row: AllocationRow) => openDialog({
    title: `${row.label}を削除しますか？`,
    detail: "総額・直課額・個別入力額・任意比率を含む行全体が削除され、元に戻せません。",
    confirmLabel: "削除する",
    danger: true,
    onConfirm: () => updateModel((draft) => {
      draft.pools[poolId] = draft.pools[poolId].filter((candidate) => candidate.id !== row.id);
      const first = draft.pools[poolId][0];
      if (first) setSelected(`${poolId}:${first.id}`);
    }, "費目を削除", row.label, "配賦入力を含めて削除"),
  });

  return (
    <div className="screen-stack">
      <section className="panel">
        <PanelTitle eyebrow="ALLOCATION" title={screenTitle} description={type === "manufacturing" ? "共通の労務費・経費を、共通費配賦対象だけに製造数量等で配賦します。" : "包装工程の材料・労務費・経費を、共通費配賦対象だけに詰口数量等で配賦します。"} />
        <h3 className="subsection-title">配賦基準数量</h3>
        <div className="driver-grid">
          {CATEGORY_IDS.map((id, index) => (
            <label className={`driver-card${model.categories[id].allocationEligible ? "" : " inactive"}`} key={id}>
              <span>{model.categories[id].label}</span>
              {!model.categories[id].allocationEligible && <small>共通費配賦対象外</small>}
              <NumberInput value={model.allocationDrivers[driverKey][id]} onChange={(value) => updateModel((draft) => { draft.allocationDrivers[driverKey][id] = value; })} onCommit={(before, after) => recordAudit(`${model.categories[id].label} ${screenTitle}基準数量`, before, after)} disabled={locked} kind="quantity" suffix="L" ariaLabel={`${model.categories[id].label} 配賦基準数量`} row={0} col={index} />
            </label>
          ))}
        </div>
      </section>

      <div className="allocation-layout">
        <div className="allocation-tables">
          {poolIds.map((poolId) => (
            <section className="panel" key={poolId}>
              <PanelTitle title={groupLabels[poolId]} description="行を選ぶと、配賦方法・直課額・比率を右側で編集できます。" action={<button type="button" className="secondary-button" onClick={() => addRow(poolId)} disabled={locked}>＋ 行を追加</button>} />
              <div className="table-scroll">
                <table className="data-table allocation-table">
                  <thead><tr><th>費目</th><th>総額</th><th>配賦方法</th>{CATEGORY_IDS.map((id) => <th key={id}>{model.categories[id].short || model.categories[id].label}</th>)}<th>操作</th></tr></thead>
                  <tbody>
                    {model.pools[poolId].map((row, rowIndex) => {
                      const rowResult = calc.pools[poolId].rows[row.id];
                      return (
                        <tr key={row.id} className={selected === `${poolId}:${row.id}` ? "selected-row" : ""} onClick={() => setSelected(`${poolId}:${row.id}`)} id={`row-${row.id}`}>
                          <th><TextCommitInput value={row.label} onChange={(value) => updateModel((draft) => { draft.pools[poolId][rowIndex].label = value; })} onCommit={(before, after) => recordAudit(`${poolId}:${row.id}:label`, before, after, "費目名を変更")} disabled={locked} ariaLabel={`${row.label} 費目名`} /></th>
                          <td><Money value={row.total ?? 0} /></td>
                          <td>{methodLabels[row.method]}</td>
                          {CATEGORY_IDS.map((id) => <td key={id} className={!model.categories[id].allocationEligible ? "inactive-cell" : ""}><Money value={rowResult.allocations[id]} /></td>)}
                          <td><button className="icon-danger" type="button" onClick={(event) => { event.stopPropagation(); deleteRow(poolId, row); }} disabled={locked} aria-label={`${row.label}を削除`}>削除</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot><tr><th>合計</th><td><Money value={calc.pools[poolId].total} /></td><td />{CATEGORY_IDS.map((id) => <td key={id}><Money value={calc.pools[poolId].totals[id]} /></td>)}<td /></tr></tfoot>
                </table>
              </div>
            </section>
          ))}
        </div>

        {selectedRow && actualIndex >= 0 && (
          <aside className="panel allocation-editor" aria-label={`${selectedRow.label}の配賦設定`}>
            <PanelTitle eyebrow="SELECTED ITEM" title={`${selectedRow.label}の配賦設定`} description="直課額を先に差し引き、残額を選択した基準で決定論的に配賦します。" />
            <label className="stacked-field"><span>総額</span><NumberInput value={selectedRow.total} onChange={(value) => updateModel((draft) => { draft.pools[actualPoolId][actualIndex].total = value; })} onCommit={(before, after) => recordAudit(`${selectedRow.label} 総額`, before, after)} disabled={locked} kind="money" suffix="円" ariaLabel={`${selectedRow.label} 総額`} /></label>
            <label className="stacked-field"><span>配賦方法</span><select value={selectedRow.method} onChange={(event) => updateModel((draft) => { draft.pools[actualPoolId][actualIndex].method = event.target.value as AllocationRow["method"]; }, "配賦方法を変更", selectedRow.label, `${methodLabels[selectedRow.method]} → ${methodLabels[event.target.value as AllocationRow["method"]]}`)} disabled={locked}>{Object.entries(methodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <div className="table-scroll">
              <table className="data-table compact-table">
                <thead><tr><th>酒種</th>{selectedRow.method !== "manual" && <th>直課額</th>}{selectedRow.method === "manual" && <th>個別入力額</th>}{selectedRow.method === "custom" && <th>任意比率</th>}<th>配賦額</th></tr></thead>
                <tbody>
                  {CATEGORY_IDS.map((id, rowIndex) => (
                    <tr key={id} className={!model.categories[id].allocationEligible ? "inactive-row" : ""}>
                      <th>{model.categories[id].label}{!model.categories[id].allocationEligible && <small>対象外</small>}</th>
                      {selectedRow.method !== "manual" && <td><NumberInput value={selectedRow.direct[id]} onChange={(value) => updateModel((draft) => { draft.pools[actualPoolId][actualIndex].direct[id] = value; })} onCommit={(before, after) => recordAudit(`${selectedRow.label} ${model.categories[id].label} 直課額`, before, after)} disabled={locked} kind="money" ariaLabel={`${model.categories[id].label} 直課額`} row={rowIndex} col={0} /></td>}
                      {selectedRow.method === "manual" && <td><NumberInput value={selectedRow.manual[id]} onChange={(value) => updateModel((draft) => { draft.pools[actualPoolId][actualIndex].manual[id] = value; })} onCommit={(before, after) => recordAudit(`${selectedRow.label} ${model.categories[id].label} 個別入力額`, before, after)} disabled={locked} kind="money" ariaLabel={`${model.categories[id].label} 個別入力額`} row={rowIndex} col={0} /></td>}
                      {selectedRow.method === "custom" && <td><NumberInput value={selectedRow.customWeights[id]} onChange={(value) => updateModel((draft) => { draft.pools[actualPoolId][actualIndex].customWeights[id] = value; })} onCommit={(before, after) => recordAudit(`${selectedRow.label} ${model.categories[id].label} 任意比率`, before, after)} disabled={locked} kind="ratio" ariaLabel={`${model.categories[id].label} 任意比率`} row={rowIndex} col={1} /></td>}
                      <td><Money value={result?.allocations[id] ?? 0} /></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><th>合計</th><td colSpan={selectedRow.method === "custom" ? 2 : 1}><Money value={CATEGORY_IDS.reduce((total, id) => total + (result?.allocations[id] ?? 0), 0)} /></td></tr></tfoot>
              </table>
            </div>
            {result && result.checks.length > 0 && <div className="inline-errors">{result.checks.map((item) => <p key={item.id}>⚠ {item.detail}</p>)}</div>}
          </aside>
        )}
      </div>

      {type === "packaging" && (
        <section className="panel">
          <PanelTitle title="製品費用から控除する雑収入等" description="製品費用 ＝ 包装材料費 ＋ 製品労務費 ＋ 製品経費 － 製品費用から控除する雑収入等" />
          <div className="driver-grid">
            {CATEGORY_IDS.map((id) => <label className="driver-card" key={id}><span>{model.categories[id].label}</span><NumberInput value={model.miscIncome.packaging[id]} onChange={(value) => updateModel((draft) => { draft.miscIncome.packaging[id] = value; })} onCommit={(before, after) => recordAudit(`${model.categories[id].label} 製品費用控除`, before, after)} disabled={locked} kind="money" suffix="円" ariaLabel={`${model.categories[id].label} 製品費用から控除する雑収入等`} /></label>)}
          </div>
        </section>
      )}

      <StepNavigation previous={type === "manufacturing" ? { id: "materials", label: "原材料費" } : { id: "manufacturing-allocation", label: "製造費用按分" }} next={type === "manufacturing" ? { id: "packaging-allocation", label: "製品費用按分" } : { id: "products", label: "製品原価" }} navigate={navigate} />
    </div>
  );
}
