import { Money } from "../components";
import type { CommonScreenProps } from "../ui-types";
import type { ScreenId } from "../types";

const workflow: Array<{ id: ScreenId; step: number; title: string; detail: string }> = [
  { id: "materials", step: 1, title: "原材料費", detail: "期首・当期・期末残高を入力" },
  { id: "manufacturing-allocation", step: 2, title: "製造費用按分", detail: "数量基準と直課額を確認" },
  { id: "packaging-allocation", step: 3, title: "製品費用按分", detail: "詰口数量で包装費用を配賦" },
  { id: "products", step: 4, title: "製品原価", detail: "原酒から製品までを繰越計算" },
  { id: "special", step: 5, title: "甘酒・副産物・食品", detail: "甘酒・副産物・食品の原価を確認" },
  { id: "inventory", step: 6, title: "棚卸・売上原価", detail: "最終確認して年度を確定" },
];

export function HomeScreen({ model, calc, navigate, persistenceMode }: CommonScreenProps) {
  const reviewed = model.review.items.filter((item) => item.done && item.note.trim()).length;
  const workflowStatus = (screenId: ScreenId) => {
    if (model.meta.status === "finalized") return "完了";
    if (calc.checks.some((item) => item.screenId === screenId && item.severity === "error")) return "要修正";
    if (screenId === "inventory" && reviewed < model.review.items.length) return "確認待ち";
    return "入力あり";
  };
  return (
    <div className="screen-stack">
      <section className="hero-panel">
        <div>
          <span className="eyebrow">{model.meta.periodLabel}</span>
          <h1>酒造原価計算を、入力から確定まで一つに。</h1>
          <p>Excelの9シートを、酒種別の材料費・費用配賦・製品原価・棚卸へつながる一連の流れに整理しています。</p>
        </div>
        <button className="hero-button" type="button" onClick={() => navigate("materials")}>入力を始める →</button>
      </section>

      <section className="kpi-grid" aria-label="主要金額">
        <article><span>当期製造原価</span><strong><Money value={Object.values(calc.manufacturingCost).reduce((a, b) => a + b, 0)} /></strong><small>副産物控除後</small></article>
        <article><span>製品費用</span><strong><Money value={Object.values(calc.packagingCost).reduce((a, b) => a + b, 0)} /></strong><small>包装材料・労務・経費</small></article>
        <article><span>期末棚卸資産合計</span><strong><Money value={calc.inventory.total} /></strong><small>材料・自製品・商品を含む</small></article>
        <article><span>売上原価</span><strong><Money value={calc.totalCogs} /></strong><small>商品を含む合計</small></article>
      </section>

      <section className="panel">
        <span className="eyebrow">WORKFLOW</span>
        <h2>年度原価計算の進め方</h2>
        <p>左から順に入力すると、後工程の金額が自動計算されます。</p>
        <div className="workflow-grid">
          {workflow.map((item) => (
            <button type="button" key={item.id} onClick={() => navigate(item.id)}>
              <span className="workflow-step">{item.step}</span>
              <span className={`workflow-status status-${workflowStatus(item.id)}`}>{workflowStatus(item.id)}</span>
              <strong>{item.title}</strong>
              <small>{item.detail}</small>
            </button>
          ))}
        </div>
      </section>

      <div className="home-bottom-grid">
        <section className="panel validation-summary">
          <h2>検算状況</h2>
          <strong className={calc.criticalCount ? "text-error" : "text-success"}>
            {calc.criticalCount ? `要修正 ${calc.criticalCount}件` : "計算エラー 0件"}
          </strong>
          <p>システム警告 {calc.warningCount}件・人による確認 {reviewed}/{model.review.items.length}件</p>
          <button className="text-button" type="button" onClick={() => navigate("inventory")}>検算内容を見る →</button>
        </section>
        <section className="autosave-card">
          <h3>{persistenceMode === "persistent" ? "▣ この端末に自動保存" : "⚠ このセッションは自動保存されません"}</h3>
          <p>{persistenceMode === "persistent" ? "入力内容はブラウザに保存されます。作業終了時は「保存・出力」からJSONバックアップを保存してください。" : "ブラウザの保存領域を利用できません。作業終了前に「保存・出力」からJSONバックアップを保存してください。"}</p>
        </section>
      </div>
    </div>
  );
}
