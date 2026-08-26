import { useState, type ClipboardEvent } from "react";
import { CATEGORY_IDS, type CategoryId, type MaterialRow } from "../types";
import { Money, NumberInput, PanelTitle, StepNavigation, TextCommitInput } from "../components";
import { categoryMap } from "../data/defaults";
import { parseNumericText, roundMoney } from "../logic/number";
import type { CommonScreenProps } from "../ui-types";

const fields = ["opening", "occurred", "closing", "transfer"] as const;

export function MaterialsScreen(props: CommonScreenProps) {
  const { model, calc, locked, updateModel, recordAudit, openDialog, showToast, navigate } = props;
  const [group, setGroup] = useState<"manufacturing" | "packaging">("manufacturing");
  const [categoryId, setCategoryId] = useState<CategoryId>("sake");
  const rows = model.materials[group];

  const addRow = () => {
    openDialog({
      title: `${group === "manufacturing" ? "製造原材料" : "包装材料"}の行を追加`,
      detail: "追加する費目名を入力してください。行には一意IDが付与されます。",
      inputLabel: "費目名",
      confirmLabel: "追加する",
      onConfirm: (label) => updateModel((draft) => {
        draft.materials[group].push({
          id: `custom-${group}-${Date.now()}`,
          label: label || "追加項目",
          standard: false,
          entries: categoryMap(() => ({ opening: 0, occurred: 0, closing: 0, transfer: 0 })),
        });
      }, "費目を追加", group, label),
    });
  };

  const deleteRow = (row: MaterialRow) => {
    openDialog({
      title: `${row.label}を削除しますか？`,
      detail: "この行の全酒種・全金額が削除され、元に戻せません。JSONバックアップの保存を推奨します。",
      confirmLabel: "削除する",
      danger: true,
      onConfirm: () => updateModel((draft) => {
        draft.materials[group] = draft.materials[group].filter((candidate) => candidate.id !== row.id);
      }, "費目を削除", row.label, "関連する入力データを含めて削除"),
    });
  };

  const handlePaste = (event: ClipboardEvent<HTMLTableElement>) => {
    const target = event.target as HTMLInputElement;
    if (locked || target.dataset.gridInput !== "true") return;
    const startRow = Number(target.dataset.gridRow);
    const startCol = Number(target.dataset.gridCol);
    const matrix = event.clipboardData.getData("text").replace(/\r/g, "").split("\n").filter(Boolean).map((line) => line.split("\t"));
    if (matrix.length === 0 || (matrix.length === 1 && matrix[0].length === 1)) return;
    event.preventDefault();
    const changes: Array<{ rowIndex: number; field: (typeof fields)[number]; value: number | null }> = [];
    let skipped = 0;
    matrix.forEach((line, rowOffset) => line.forEach((cell, colOffset) => {
        const rowIndex = startRow + rowOffset;
        const row = rows[rowIndex];
        const field = fields[startCol + colOffset];
        const parsed = parseNumericText(cell);
        if (!row || !field || parsed === "invalid" || (field !== "transfer" && parsed !== null && parsed < 0) || (parsed !== null && !Number.isInteger(parsed))) {
          skipped += 1;
          return;
        }
        changes.push({ rowIndex, field, value: parsed === null ? null : roundMoney(parsed) });
      }));
    updateModel((draft) => {
      for (const change of changes) draft.materials[group][change.rowIndex].entries[categoryId][change.field] = change.value;
    }, "複数セルを貼付け", `${model.categories[categoryId].label} ${group}`, `反映${changes.length}件・未反映${skipped}件`);
    const applied = changes.length;
    showToast(`貼付け：${applied}件を反映、${skipped}件は未反映です。`, skipped ? "info" : "success");
  };

  return (
    <div className="screen-stack">
      <section className="panel">
        <PanelTitle eyebrow="MATERIALS" title="原材料費" description="期首・当期・期末・振替から、酒種別の当期使用額を計算します。" action={<button type="button" className="secondary-button" onClick={addRow} disabled={locked}>＋ 行を追加</button>} />
        <div className="segmented-control">
          <button type="button" className={group === "manufacturing" ? "active" : ""} onClick={() => setGroup("manufacturing")}>製造原材料</button>
          <button type="button" className={group === "packaging" ? "active" : ""} onClick={() => setGroup("packaging")}>包装材料</button>
        </div>
        <div className="category-tabs" role="tablist" aria-label="酒種">
          {CATEGORY_IDS.map((id) => <button role="tab" aria-selected={categoryId === id} className={categoryId === id ? "active" : ""} type="button" key={id} onClick={() => setCategoryId(id)}>{model.categories[id].label}</button>)}
        </div>
      </section>
      <section className="panel">
        <div className="table-scroll">
          <table className="data-table input-table" onPaste={handlePaste}>
            <thead><tr><th>費目</th><th>期首棚卸高</th><th>当期発生高</th><th>期末棚卸高</th><th>振替・調整</th><th>当期使用額</th><th>操作</th></tr></thead>
            <tbody>
              {rows.map((row, rowIndex) => {
                const entry = row.entries[categoryId];
                const used = roundMoney((entry.opening ?? 0) + (entry.occurred ?? 0) - (entry.closing ?? 0) + (entry.transfer ?? 0));
                return (
                  <tr key={row.id} id={`row-${row.id}`}>
                    <th><TextCommitInput value={row.label} onChange={(value) => updateModel((draft) => { draft.materials[group][rowIndex].label = value; })} onCommit={(before, after) => recordAudit(`${group}:${row.id}:label`, before, after, "費目名を変更")} disabled={locked} ariaLabel={`${row.label} 費目名`} /></th>
                    {fields.map((field, colIndex) => (
                      <td className="input-cell" key={field}>
                        <NumberInput value={entry[field]} onChange={(value) => updateModel((draft) => { draft.materials[group][rowIndex].entries[categoryId][field] = value; })} onCommit={(before, after) => recordAudit(`${row.label} ${field}`, before, after)} disabled={locked} allowNegative={field === "transfer"} kind="money" suffix="円" ariaLabel={`${row.label} ${field}`} row={rowIndex} col={colIndex} />
                      </td>
                    ))}
                    <td className="result-cell"><Money value={used} /></td>
                    <td><button className="icon-danger" type="button" onClick={() => deleteRow(row)} disabled={locked} aria-label={`${row.label}を削除`}>削除</button></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr><th>{model.categories[categoryId].label} 合計</th><td colSpan={4} /><td><Money value={calc.materials[group][categoryId]} /></td><td /></tr></tfoot>
          </table>
        </div>
        <p className="formula-note">当期使用額 ＝ 期首棚卸高 ＋ 当期発生高 － 期末棚卸高 ＋ 振替・調整</p>
      </section>
      <StepNavigation next={{ id: "manufacturing-allocation", label: "製造費用按分" }} navigate={navigate} />
    </div>
  );
}
