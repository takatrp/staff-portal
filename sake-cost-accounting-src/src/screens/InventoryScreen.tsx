import { Money, NumberInput, PanelTitle, StepNavigation } from "../components";
import { sanitizeForSnapshot, stableInputHash } from "../logic/migration";
import type { CommonScreenProps } from "../ui-types";
import type { ValidationCheck } from "../types";

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function InventoryScreen({ model, calc, locked, updateModel, recordAudit, openDialog, navigate, showToast }: CommonScreenProps) {
  const warnings = calc.checks.filter((item) => item.severity === "warning");
  const humanReady = model.review.items.every((item) => item.done && item.note.trim());
  const warningsReady = warnings.every((item) => {
    const acknowledgement = model.warningAcknowledgements[item.fingerprint];
    return acknowledgement?.confirmed && acknowledgement.note.trim();
  });
  const canFinalize = calc.criticalCount === 0 && humanReady && warningsReady && Boolean(model.meta.operatorName.trim());

  const inventoryRows = [
    ["製造原材料期末棚卸", calc.inventory.manufacturingMaterials], ["包装材料期末棚卸", calc.inventory.packagingMaterials], ["原酒期末棚卸", calc.inventory.raw], ["詰口酒期末棚卸", calc.inventory.middle], ["詰口製品期末棚卸", calc.inventory.finished], ["甘酒期末棚卸", calc.inventory.amazake], ["副産物期末棚卸", calc.inventory.byproducts], ["食品材料期末棚卸", calc.inventory.foodMaterials], ["食品製品期末棚卸", calc.inventory.foodProducts], ["商品期末棚卸", calc.inventory.merchandise],
  ] as const;
  const cogsRows = [
    ["商品", calc.merchandiseCogs], ["自製酒類", calc.alcoholCogs], ["甘酒", calc.amazake.cogs], ["副産物", calc.byproducts.cogsTotal], ["食品", calc.food.cogsTotal],
  ] as const;

  const jumpToCheck = (item: ValidationCheck) => {
    navigate(item.screenId);
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("sake-cost-focus", { detail: item }));
      const element = document.getElementById(item.rowId ? `row-${item.rowId}` : item.categoryId ? `product-${item.categoryId}` : "");
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        element.classList.add("temporary-highlight");
        window.setTimeout(() => element.classList.remove("temporary-highlight"), 2200);
      }
    }, 80);
  };

  const finalize = () => openDialog({
    title: "年度原価を確定しますか？",
    detail: "確定時点の入力と主要計算結果を読み取り専用スナップショットとして保存し、入力欄をロックします。",
    confirmLabel: "確定する",
    onConfirm: () => updateModel((draft) => {
      const finalizedAt = new Date().toISOString();
      const finalizationId = uid("final");
      draft.meta.status = "finalized";
      draft.meta.finalizedAt = finalizedAt;
      draft.meta.finalizedBy = draft.meta.operatorName.trim();
      draft.meta.finalizationId = finalizationId;
      const inputData = sanitizeForSnapshot(draft);
      draft.finalizationSnapshots = [{
        id: finalizationId,
        finalizedAt,
        finalizedBy: draft.meta.operatorName.trim(),
        inputHash: stableInputHash(inputData),
        inputData,
        summary: {
          manufacturingCostTotal: Object.values(calc.manufacturingCost).reduce((a, b) => a + b, 0),
          packagingCostTotal: Object.values(calc.packagingCost).reduce((a, b) => a + b, 0),
          endingInventoryTotal: calc.inventory.total,
          costOfSalesTotal: calc.totalCogs,
        },
      }, ...draft.finalizationSnapshots].slice(0, 10);
    }, "年度原価を確定", model.meta.periodLabel, model.meta.operatorName.trim()),
  });

  const unfinalize = () => openDialog({
    title: "確定を解除しますか？",
    detail: "入力を再開します。過去の確定スナップショットは削除せず、保存・出力画面から確認できます。",
    confirmLabel: "編集を再開",
    danger: true,
    onConfirm: () => updateModel((draft) => {
      draft.meta.status = "draft";
      draft.meta.finalizedAt = null;
      draft.meta.finalizedBy = null;
      draft.meta.finalizationId = null;
    }, "確定を解除", model.meta.periodLabel, "確定スナップショットは保持", { allowWhenLocked: true }),
  });

  return (
    <div className="screen-stack">
      <div className="inventory-summary-grid">
        <section className="panel">
          <PanelTitle eyebrow="INVENTORY" title="期末棚卸資産" />
          <dl className="summary-list">{inventoryRows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd><Money value={value} /></dd></div>)}<div className="subtotal"><dt>自製酒等期末棚卸高</dt><dd><Money value={calc.inventory.selfManufactured} /></dd></div><div className="total"><dt>期末棚卸資産合計</dt><dd><Money value={calc.inventory.total} /></dd></div></dl>
        </section>
        <section className="panel">
          <PanelTitle eyebrow="COST OF SALES" title="売上原価" />
          <dl className="summary-list">{cogsRows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd><Money value={value} /></dd></div>)}<div className="total"><dt>売上原価合計</dt><dd><Money value={calc.totalCogs} /></dd></div></dl>
        </section>
      </div>

      <section className="panel">
        <PanelTitle title="商品売上原価" description="仕入商品の期首・仕入・調整・期末残高を入力します。" />
        <div className="simple-form-grid">
          {([
            ["openingInventory", "期首商品棚卸", false], ["openingAdjustment", "期首調整", true], ["purchases", "当期仕入", false], ["liquorTax", "酒税込仕入", false], ["taxFreeTransferOut", "未納税移出等", false], ["purchaseDiscount", "仕入値引", false], ["otherTransfer", "他勘定振替", false], ["closingInventory", "期末商品棚卸", false],
          ] as const).map(([key, label, allowNegative]) => <label className="stacked-field" key={key}><span>{label}</span><NumberInput value={model.merchandise[key]} onChange={(value) => updateModel((draft) => { draft.merchandise[key] = value; })} onCommit={(before, after) => recordAudit(`商品 ${label}`, before, after)} disabled={locked} allowNegative={allowNegative} kind="money" suffix="円" ariaLabel={`商品 ${label}`} /></label>)}
        </div>
        <div className="result-strip"><div><span>商品売上原価</span><strong><Money value={calc.merchandiseCogs} /></strong></div></div>
      </section>

      <section className="panel">
        <PanelTitle title="自動検算" description="計算エラーは修正必須、システム警告は理由・対応内容を残して確認します。" />
        {calc.checks.length === 0 ? <div className="empty-state"><strong>✓ 検算項目に問題はありません</strong></div> : <div className="validation-list">{calc.checks.map((item) => {
          const acknowledgement = model.warningAcknowledgements[item.fingerprint] ?? { confirmed: false, note: "" };
          return <article key={item.id} className={`validation-item ${item.severity}`}>
            <button type="button" className="validation-link" onClick={() => jumpToCheck(item)}><span>{item.severity === "error" ? "エラー" : "警告"}・{item.area}</span><strong>{item.title}</strong><p>{item.detail}</p><small>該当箇所へ移動 →</small></button>
            {item.severity === "warning" && <div className="acknowledgement"><label><input type="checkbox" checked={acknowledgement.confirmed} onChange={(event) => updateModel((draft) => { draft.warningAcknowledgements[item.fingerprint] = { ...(draft.warningAcknowledgements[item.fingerprint] ?? { note: "" }), confirmed: event.target.checked, confirmedAt: event.target.checked ? new Date().toISOString() : undefined }; }, "システム警告の確認を変更", item.title, event.target.checked ? "確認済み" : "未確認")} disabled={locked} /> 確認済み</label><textarea value={acknowledgement.note} onChange={(event) => updateModel((draft) => { draft.warningAcknowledgements[item.fingerprint] = { ...(draft.warningAcknowledgements[item.fingerprint] ?? { confirmed: false }), note: event.target.value }; })} onBlur={() => recordAudit(`${item.title} 確認理由`, "", acknowledgement.note, "警告確認理由を入力")} placeholder="確認理由・対応内容（必須）" disabled={locked} /></div>}
          </article>;
        })}</div>}
      </section>

      <section className="panel">
        <PanelTitle title="人による確認" description="Excelで判断が必要だった項目を、確認記録として残します。チェックとメモの両方が必須です。" />
        <div className="review-list">{model.review.items.map((item, index) => <article key={item.id}><label><input type="checkbox" checked={item.done} onChange={(event) => updateModel((draft) => { draft.review.items[index].done = event.target.checked; }, "人による確認を変更", item.title, event.target.checked ? "確認済み" : "未確認")} disabled={locked} /><strong>{item.title}</strong></label><p>{item.detail}</p><textarea value={item.note} onChange={(event) => updateModel((draft) => { draft.review.items[index].note = event.target.value; })} onBlur={() => recordAudit(`${item.title} 確認メモ`, "", item.note, "確認メモを入力")} placeholder="確認結果・根拠・対応内容（必須）" disabled={locked} /></article>)}</div>
      </section>

      <section className={`finalize-panel ${locked ? "finalized" : ""}`}>
        <div><span className="finalize-icon">{locked ? "✓" : "▣"}</span></div>
        <div className="finalize-copy">
          <h2>{locked ? "年度原価は確定済みです" : "すべて確認して年度原価を確定"}</h2>
          {locked ? <p>確定日時：{model.meta.finalizedAt ? new Date(model.meta.finalizedAt).toLocaleString("ja-JP") : "—"}<br />確定担当者：{model.meta.finalizedBy}<br />確定ID：{model.meta.finalizationId}</p> : <ul><li className={calc.criticalCount === 0 ? "done" : ""}>計算エラー 0件（現在 {calc.criticalCount}件）</li><li className={humanReady ? "done" : ""}>人による確認とメモ</li><li className={warningsReady ? "done" : ""}>システム警告の確認と理由</li><li className={model.meta.operatorName.trim() ? "done" : ""}>確定担当者名</li></ul>}
        </div>
        {locked ? <button className="secondary-button" type="button" onClick={unfinalize}>確定を解除</button> : <button className="primary-button" type="button" disabled={!canFinalize} onClick={finalize}>年度原価を確定</button>}
      </section>
      {!canFinalize && !locked && <button className="text-button center" type="button" onClick={() => { navigate("master"); showToast("確定担当者名はマスター設定で入力できます。", "info"); }}>確定担当者名を設定する →</button>}
      <StepNavigation previous={{ id: "special", label: "甘酒・副産物等" }} next={{ id: "data", label: "保存・出力" }} navigate={navigate} />
    </div>
  );
}
