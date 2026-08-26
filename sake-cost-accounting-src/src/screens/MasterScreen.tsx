import { CATEGORY_IDS } from "../types";
import { PanelTitle, TextCommitInput } from "../components";
import type { CommonScreenProps } from "../ui-types";

export function MasterScreen({ model, locked, updateModel, recordAudit }: CommonScreenProps) {
  const metaField = (key: "companyName" | "periodLabel" | "startDate" | "endDate" | "sourceNote" | "operatorName", label: string, type = "text") => (
    <label className={`stacked-field ${key === "sourceNote" ? "wide" : ""}`} key={key}>
      <span>{label}</span>
      <input
        type={type}
        value={model.meta[key]}
        onChange={(event) => updateModel((draft) => { draft.meta[key] = event.target.value; })}
        onFocus={(event) => { event.currentTarget.dataset.before = event.currentTarget.value; }}
        onBlur={(event) => recordAudit(`マスター ${label}`, event.currentTarget.dataset.before ?? "", event.currentTarget.value, "基本情報を変更")}
        disabled={locked}
      />
    </label>
  );

  return (
    <div className="screen-stack">
      <section className="panel">
        <PanelTitle eyebrow="MASTER" title="会社・計算期間" description="帳票・バックアップ・確定記録に使用する基本情報です。" />
        <div className="simple-form-grid master-grid">
          {metaField("companyName", "会社名")}
          {metaField("periodLabel", "期間表示")}
          {metaField("startDate", "開始日", "date")}
          {metaField("endDate", "終了日", "date")}
          {metaField("operatorName", "作業担当者・確定担当者名")}
          {metaField("sourceNote", "元資料・備考")}
        </div>
      </section>

      <section className="panel">
        <PanelTitle title="酒種マスター" description="共通費配賦対象から外しても、過年度在庫・製品原価・売上原価のデータは保持され、各画面に表示されます。" />
        <div className="table-scroll"><table className="data-table input-table"><thead><tr><th>酒種ID</th><th>表示名</th><th>共通費配賦対象</th></tr></thead><tbody>
          {CATEGORY_IDS.map((id) => <tr key={id}><th>{id}</th><td><TextCommitInput value={model.categories[id].label} onChange={(value) => updateModel((draft) => { draft.categories[id].label = value; })} onCommit={(before, after) => recordAudit(`酒種 ${id} 表示名`, before, after, "酒種表示名を変更")} disabled={locked} ariaLabel={`${id} 表示名`} /></td><td><label className="toggle-control"><input type="checkbox" checked={model.categories[id].allocationEligible} onChange={(event) => updateModel((draft) => { draft.categories[id].allocationEligible = event.target.checked; }, "共通費配賦対象を変更", model.categories[id].label, event.target.checked ? "対象" : "対象外")} disabled={locked} /><span aria-hidden="true" /><strong>{model.categories[id].allocationEligible ? "対象" : "対象外"}</strong></label></td></tr>)}
        </tbody></table></div>
        <p className="formula-note">基準アルコール度数は旧スキーマに後方互換用として保持しますが、元Excelに可変マスターを参照する換算式がないため画面から非表示としています。Excelの数量は酒種別の固定度数換算済み数量として入力されています。</p>
      </section>
    </div>
  );
}
