import { createNormalDemoModel, STORAGE_KEY } from "../data/defaults";
import type { AuditEntry, SakeCostModel } from "../types";
import { migrateModel } from "./migration";

export type ReadyInitialLoadState = {
  status: "ready";
  model: SakeCostModel;
};

export type RecoveryRequiredState = {
  status: "recovery-required";
  rawData: string;
  errorMessage: string;
  sourceKey: string;
  recoveryKey?: string;
  operationError?: string;
  backupFailed?: boolean;
};

export type StorageUnavailableState = {
  status: "storage-unavailable";
  errorMessage: string;
};

export type InitialLoadState = ReadyInitialLoadState | RecoveryRequiredState | StorageUnavailableState;

type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "setItem">;

export function loadInitialState(storage: StorageReader, now = new Date().toISOString()): InitialLoadState {
  let rawData: string | null;
  try {
    rawData = storage.getItem(STORAGE_KEY);
  } catch {
    return {
      status: "storage-unavailable",
      errorMessage: "ブラウザの保存領域を読み取れませんでした。このセッションでは自動保存を行いません。",
    };
  }

  if (rawData === null) return { status: "ready", model: createNormalDemoModel(now) };

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawData);
  } catch {
    return {
      status: "recovery-required",
      rawData,
      errorMessage: "保存データのJSON形式が不正です。",
      sourceKey: STORAGE_KEY,
    };
  }

  try {
    return { status: "ready", model: migrateModel(parsed, now) };
  } catch (error) {
    return {
      status: "recovery-required",
      rawData,
      errorMessage: error instanceof Error ? error.message : "保存データの構造を確認できませんでした。",
      sourceKey: STORAGE_KEY,
    };
  }
}

export function createRecoveryStorageKey(now = new Date().toISOString()): string {
  return `sake-cost-accounting-recovery-${now.replace(/[-:.]/g, "")}`;
}

function recoveryDemo(now: string, recoveryKey?: string): SakeCostModel {
  const model = createNormalDemoModel(now);
  const entry: AuditEntry = {
    id: `audit-recovery-${now.replace(/[-:.]/g, "")}`,
    at: now,
    actor: "未設定",
    target: "データ全体",
    action: "復旧画面から正常デモで初期化",
    detail: recoveryKey
      ? `元データを ${recoveryKey} へ退避してから初期化`
      : "退避できなかったことを確認したうえで初期化",
  };
  model.auditLog = [entry, ...model.auditLog].slice(0, 200);
  return model;
}

export function initializeFromRecovery(
  state: RecoveryRequiredState,
  storage: StorageWriter,
  allowWithoutBackup = false,
  now = new Date().toISOString(),
): ReadyInitialLoadState | RecoveryRequiredState {
  let recoveryKey: string | undefined;
  if (!allowWithoutBackup) {
    recoveryKey = createRecoveryStorageKey(now);
    try {
      storage.setItem(recoveryKey, state.rawData);
    } catch {
      return {
        ...state,
        backupFailed: true,
        operationError: "元データを別キーへ退避できませんでした。元の保存データは変更していません。必要なら復旧用ファイルを保存し、退避せず続行するか判断してください。",
      };
    }
  }

  const model = recoveryDemo(now, recoveryKey);
  try {
    storage.setItem(state.sourceKey, JSON.stringify(model));
  } catch {
    return {
      ...state,
      recoveryKey,
      backupFailed: false,
      operationError: "正常デモへ置き換えられませんでした。元の保存データは変更していません。ブラウザの保存容量・設定を確認してください。",
    };
  }

  return { status: "ready", model };
}
