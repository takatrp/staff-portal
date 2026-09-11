import { useState } from "react";
import { ConfirmDialog, type DialogState } from "../components";
import { downloadText, recoveryFileName } from "../logic/download";
import type { RecoveryRequiredState } from "../logic/initial-load";

export function RecoveryScreen({ state, onInitialize }: {
  state: RecoveryRequiredState;
  onInitialize: (allowWithoutBackup: boolean) => void;
}) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const confirmInitialization = (allowWithoutBackup: boolean) => {
    setDialog({
      title: allowWithoutBackup ? "退避せずに初期化しますか？" : "正常デモで初期化しますか？",
      detail: allowWithoutBackup
        ? "別キーへの退避に失敗しています。先に復旧用データをファイル保存してください。続行すると現在の保存データを正常デモへ置き換えます。"
        : "現在の保存データを正常デモへ置き換えます。必要な場合は先に復旧用データを保存してください。",
      confirmLabel: allowWithoutBackup ? "退避せず初期化する" : "初期化する",
      danger: true,
      onConfirm: () => onInitialize(allowWithoutBackup),
    });
  };

  return (
    <div className="recovery-page">
      <main className="recovery-card">
        <span className="brand-icon" aria-hidden="true">◩</span>
        <span className="eyebrow">DATA RECOVERY</span>
        <h1>保存データを自動復元できませんでした</h1>
        <p className="recovery-lead"><strong>元データはまだ削除・上書きされていません。</strong><br />通常画面の自動保存も停止しています。</p>
        <div className="demo-warning" role="note"><strong>社内検討用デモ（架空データ）</strong><span>公開URLのため、実際の顧客データは入力しないでください。</span></div>
        <dl className="recovery-details">
          <div><dt>エラー概要</dt><dd>{state.errorMessage}</dd></div>
          <div><dt>保存元キー</dt><dd><code>{state.sourceKey}</code></dd></div>
          <div><dt>元データの長さ</dt><dd>{state.rawData.length.toLocaleString("ja-JP")}文字</dd></div>
          {state.recoveryKey && <div><dt>退避済みキー</dt><dd><code>{state.recoveryKey}</code></dd></div>}
        </dl>
        {state.operationError && <p className="recovery-error" role="alert">{state.operationError}</p>}
        <div className="recovery-actions">
          <button className="primary-button" type="button" onClick={() => downloadText(recoveryFileName(), state.rawData, "text/plain;charset=utf-8")}>復旧用データを保存</button>
          <button className="secondary-button" type="button" onClick={() => confirmInitialization(false)}>正常デモで初期化</button>
          {state.backupFailed && <button className="danger-button" type="button" onClick={() => confirmInitialization(true)}>退避せずに初期化を続ける</button>}
        </div>
        <p className="recovery-caution">初期化は元データを置き換える操作です。必ず確認ダイアログを経由し、利用者が明示した場合にだけ実行します。</p>
      </main>
      <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}
