import { useRef, useState, type ChangeEvent } from "react";
import { createErrorDemoModel, createNormalDemoModel } from "../data/defaults";
import { buildSummaryCsv } from "../logic/export";
import { parseAndMigrateJson } from "../logic/migration";
import { previewCsv, type CsvPreview } from "../logic/csv";
import { Money, PanelTitle } from "../components";
import type { CommonScreenProps } from "../ui-types";
import type { SakeCostModel } from "../types";

function safeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, "-").trim() || "sake-cost";
}

function downloadText(fileName: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function DataScreen({ model, calc, locked, updateModel, openDialog, showToast }: CommonScreenProps) {
  const [csvPreview, setCsvPreview] = useState<CsvPreview | null>(null);
  const csvInput = useRef<HTMLInputElement>(null);
  const jsonInput = useRef<HTMLInputElement>(null);

  const chooseCsv = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const preview = await previewCsv(file);
      setCsvPreview(preview);
      updateModel(() => {}, "CSV読込プレビュー", file.name, `${preview.encoding}・${preview.rowCount}行・${preview.columnCount}列`);
      showToast("CSVの先頭5行をプレビューしました。", "success");
    } catch {
      showToast("CSVを読み取れませんでした。", "error");
    }
    event.target.value = "";
  };

  const restoreJson = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (locked) {
      showToast("確定済みデータは復元できません。先に確定を解除してください。", "error");
      return;
    }
    let restored: SakeCostModel;
    try {
      restored = parseAndMigrateJson(await file.text());
    } catch (error) {
      showToast(error instanceof Error ? error.message : "JSONを読み込めませんでした。", "error");
      return;
    }
    openDialog({
      title: "バックアップを復元しますか？",
      detail: "現在の入力内容は選択したJSONへ置き換わります。読込失敗時は現在データを変更しません。",
      confirmLabel: "復元する",
      onConfirm: () => updateModel((draft) => { Object.assign(draft, restored); }, "JSONバックアップを復元", file.name, `schemaVersion ${restored.schemaVersion}`),
    });
  };

  const loadDemo = (kind: "normal" | "error") => {
    if (locked) {
      showToast("確定済みデータは上書きできません。先に確定を解除してください。", "error");
      return;
    }
    openDialog({
      title: kind === "normal" ? "正常デモデータを読み込みますか？" : "エラー確認用データを読み込みますか？",
      detail: "現在の入力内容は失われます。必要な場合は先にJSONバックアップを保存してください。",
      confirmLabel: "読み込む",
      danger: kind === "error",
      onConfirm: () => updateModel((draft) => { Object.assign(draft, kind === "normal" ? createNormalDemoModel() : createErrorDemoModel()); }, kind === "normal" ? "正常デモデータを読込" : "エラー確認用データを読込", "全体", "公開用の架空データ"),
    });
  };

  return (
    <div className="screen-stack">
      <section className="panel">
        <PanelTitle eyebrow="CSV IMPORT" title="CSV取込" description="UTF-8またはShift-JISのCSVを読み取り、ヘッダー・件数・先頭5行を確認します。正式な項目マッピングは実物CSV確認後に実装します。" />
        <div className="upload-card"><div><strong>取込準備版</strong><p>ファイル内容はブラウザ内でのみプレビューします。</p></div><input ref={csvInput} type="file" accept=".csv,text/csv" onChange={chooseCsv} hidden /><button type="button" className="primary-button" onClick={() => csvInput.current?.click()}>CSVを選択</button></div>
        {csvPreview && <div className="csv-preview"><div className="preview-meta"><strong>{csvPreview.fileName}</strong><span>{csvPreview.encoding}</span><span>{csvPreview.rowCount}行</span><span>{csvPreview.columnCount}列</span><button type="button" className="text-button" onClick={() => setCsvPreview(null)}>選択解除</button></div><div className="table-scroll"><table className="data-table"><thead><tr>{csvPreview.headers.map((header, index) => <th key={`${header}-${index}`}>{header || `列${index + 1}`}</th>)}</tr></thead><tbody>{csvPreview.rows.map((row, rowIndex) => <tr key={rowIndex}>{Array.from({ length: csvPreview.columnCount }, (_, colIndex) => <td key={colIndex}>{row[colIndex] ?? ""}</td>)}</tr>)}</tbody></table></div></div>}
        <div className="import-steps"><span>1 CSVを選択 <small>利用可能</small></span><span>2 内容をプレビュー <small>利用可能</small></span><span>3 項目を割り当て <small>実物CSV確認後</small></span><span>4 原価データへ反映 <small>未実装</small></span></div>
        <button type="button" className="secondary-button" disabled>原価データへ反映</button>
      </section>

      <section className="panel">
        <PanelTitle eyebrow="BACKUP & EXPORT" title="バックアップ・出力" description="入力はこのブラウザに自動保存されます。端末故障やブラウザ初期化に備えてJSONも保存してください。" />
        <div className="export-grid">
          <article><h3>JSONバックアップ</h3><p>全入力・設定・確認記録・確定スナップショットを保存します。</p><button className="primary-button" type="button" onClick={() => { downloadText(`${safeFileName(model.meta.periodLabel)}-backup-v3.json`, JSON.stringify(model, null, 2), "application/json;charset=utf-8"); showToast("JSONバックアップを保存しました。", "success"); }}>JSONを保存</button></article>
          <article><h3>JSONから復元</h3><p>v1/v2はv3へ自動移行します。確定済みの場合は先に確定解除が必要です。</p><input ref={jsonInput} type="file" accept=".json,application/json" onChange={restoreJson} disabled={locked} hidden /><button className="secondary-button" type="button" onClick={() => jsonInput.current?.click()} disabled={locked}>JSONを選択</button></article>
          <article><h3>集計CSV</h3><p>酒種別原価、棚卸内訳・小計・合計、確定情報を出力します。</p><button className="secondary-button" type="button" onClick={() => { downloadText(`${safeFileName(model.meta.periodLabel)}-summary.csv`, buildSummaryCsv(model, calc), "text/csv;charset=utf-8"); showToast("集計CSVを保存しました。", "success"); }}>集計CSVを保存</button></article>
        </div>
        <div className="scope-warning"><strong>現在は1端末・1利用者向けの実証版です</strong><p>複数人同時利用、認証・権限、データベース、サーバーバックアップ、改ざん防止は未実装です。</p></div>
      </section>

      <section className="panel">
        <PanelTitle title="デモデータ" description="どちらも架空データです。通常の基準値に戻す操作は正常デモデータを読み込みます。" />
        <div className="button-row"><button type="button" className="secondary-button" onClick={() => loadDemo("normal")} disabled={locked}>正常デモデータを読み込む</button><button type="button" className="secondary-button" onClick={() => loadDemo("error")} disabled={locked}>エラー確認用データを読み込む</button><button type="button" className="danger-button" onClick={() => loadDemo("normal")} disabled={locked}>基準値に戻す</button></div>
      </section>

      <section className="panel">
        <PanelTitle title="確定スナップショット" description="確定時点の入力と主要結果です。UIから編集・削除できません。最大10件を保持します。" />
        {model.finalizationSnapshots.length === 0 ? <div className="empty-state">確定記録はありません。</div> : <div className="snapshot-list">{model.finalizationSnapshots.map((snapshot) => <article key={snapshot.id}><div><strong>{new Date(snapshot.finalizedAt).toLocaleString("ja-JP")}</strong><span>{snapshot.finalizedBy}</span><code>{snapshot.id}</code><small>{snapshot.inputHash}</small></div><dl><div><dt>当期製造原価</dt><dd><Money value={snapshot.summary.manufacturingCostTotal} /></dd></div><div><dt>製品費用</dt><dd><Money value={snapshot.summary.packagingCostTotal} /></dd></div><div><dt>期末棚卸資産</dt><dd><Money value={snapshot.summary.endingInventoryTotal} /></dd></div><div><dt>売上原価</dt><dd><Money value={snapshot.summary.costOfSalesTotal} /></dd></div></dl></article>)}</div>}
      </section>

      <section className="panel">
        <PanelTitle title="操作履歴" description={`直近${model.auditLog.length}/200件。入力確定、マスター変更、行操作、復元、確定等を記録します。`} />
        <div className="audit-list">{model.auditLog.map((entry) => <article key={entry.id}><time>{new Date(entry.at).toLocaleString("ja-JP")}</time><strong>{entry.action}</strong><span>{entry.actor}・{entry.target}</span>{entry.before !== undefined && <p>{entry.before} → {entry.after}</p>}{entry.detail && <p>{entry.detail}</p>}</article>)}</div>
      </section>
    </div>
  );
}
