import { describe, expect, it, vi } from "vitest";
import { createNormalDemoModel, STORAGE_KEY } from "../src/data/defaults";
import { createRecoveryStorageKey, initializeFromRecovery, loadInitialState, type RecoveryRequiredState } from "../src/logic/initial-load";

const now = "2026-08-27T14:30:00.000Z";

function reader(rawData: string | null) {
  return { getItem: vi.fn(() => rawData) };
}

function legacyRaw(version: 1 | 2): string {
  const model = JSON.parse(JSON.stringify(createNormalDemoModel(now))) as Record<string, unknown> & {
    categories: Record<string, Record<string, unknown>>;
    byproducts: Array<Record<string, unknown>>;
  };
  model.schemaVersion = version;
  if (version === 1) {
    model.categories.sake.active = false;
    model.categories.sake.alcoholBasis = 18;
    delete model.categories.sake.allocationEligible;
  } else {
    delete model.byproducts[0].internalIssueAmount;
    delete model.byproducts[0].includeInFinancialTotals;
  }
  return JSON.stringify(model);
}

describe("起動時データ読込", () => {
  it("保存データがない場合は正常デモで開始する", () => {
    const state = loadInitialState(reader(null), now);
    expect(state.status).toBe("ready");
    if (state.status === "ready") {
      expect(state.model.schemaVersion).toBe(3);
      expect(state.model.meta.companyName).toBe("サンプル酒造株式会社");
    }
  });

  it("正常なv3保存データの値を保持する", () => {
    const model = createNormalDemoModel(now);
    model.meta.companyName = "保存済み会社";
    const state = loadInitialState(reader(JSON.stringify(model)), now);
    expect(state.status).toBe("ready");
    if (state.status === "ready") expect(state.model.meta.companyName).toBe("保存済み会社");
  });

  it.each([1, 2] as const)("正常なv%dをv3へ移行して開始する", (version) => {
    const state = loadInitialState(reader(legacyRaw(version)), now);
    expect(state.status).toBe("ready");
    if (state.status === "ready") {
      expect(state.model.schemaVersion).toBe(3);
      if (version === 1) expect(state.model.categories.sake.allocationEligible).toBe(false);
      if (version === 2) expect(state.model.byproducts[0].internalIssueAmount).toBe(0);
    }
  });

  it.each([
    ["JSON構文不正", "{\n  broken json"],
    ["空文字", ""],
    ["未対応schemaVersion", JSON.stringify({ schemaVersion: 99 })],
  ])("%sは元文字列を保持して復旧要にする", (_, rawData) => {
    const state = loadInitialState(reader(rawData), now);
    expect(state.status).toBe("recovery-required");
    if (state.status === "recovery-required") {
      expect(state.rawData).toBe(rawData);
      expect(state.sourceKey).toBe(STORAGE_KEY);
    }
  });

  it("負の配賦基準数量を含むv3は元文字列を保持して復旧要にする", () => {
    const model = createNormalDemoModel(now);
    model.allocationDrivers.manufacturing.sake = -1;
    const rawData = JSON.stringify(model, null, 2);
    const state = loadInitialState(reader(rawData), now);
    expect(state.status).toBe("recovery-required");
    if (state.status === "recovery-required") expect(state.rawData).toBe(rawData);
  });

  it("getItem例外はストレージ利用不可とし、書込み処理を行わない", () => {
    const storage = { getItem: vi.fn(() => { throw new Error("blocked"); }) };
    expect(loadInitialState(storage, now)).toEqual({
      status: "storage-unavailable",
      errorMessage: "ブラウザの保存領域を読み取れませんでした。このセッションでは自動保存を行いません。",
    });
  });
});

describe("復旧画面からの明示初期化", () => {
  const rawData = "{\n  broken json";
  const recoveryState: RecoveryRequiredState = {
    status: "recovery-required",
    rawData,
    errorMessage: "保存データのJSON形式が不正です。",
    sourceKey: STORAGE_KEY,
  };

  it("元文字列を別キーへ退避してから正常デモへ置き換える", () => {
    const values = new Map([[STORAGE_KEY, rawData]]);
    const setItem = vi.fn((key: string, value: string) => values.set(key, value));
    const result = initializeFromRecovery(recoveryState, { setItem }, false, now);
    const recoveryKey = createRecoveryStorageKey(now);
    expect(setItem.mock.calls.map(([key]) => key)).toEqual([recoveryKey, STORAGE_KEY]);
    expect(values.get(recoveryKey)).toBe(rawData);
    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.model.schemaVersion).toBe(3);
      expect(result.model.auditLog[0]).toMatchObject({ action: "復旧画面から正常デモで初期化" });
      expect(result.model.auditLog[0].detail).toContain(recoveryKey);
    }
  });

  it("退避失敗時は元キーへ書かず、二度目の明示操作後だけ初期化する", () => {
    const firstSetItem = vi.fn(() => { throw new Error("quota"); });
    const failed = initializeFromRecovery(recoveryState, { setItem: firstSetItem }, false, now);
    expect(firstSetItem).toHaveBeenCalledTimes(1);
    expect(failed.status).toBe("recovery-required");
    if (failed.status !== "recovery-required") return;
    expect(failed.backupFailed).toBe(true);

    const secondSetItem = vi.fn();
    const continued = initializeFromRecovery(failed, { setItem: secondSetItem }, true, now);
    expect(secondSetItem).toHaveBeenCalledTimes(1);
    expect(secondSetItem).toHaveBeenCalledWith(STORAGE_KEY, expect.any(String));
    expect(continued.status).toBe("ready");
  });

  it("退避後の元キー書込み失敗でも復旧状態と元文字列を保持する", () => {
    const values = new Map([[STORAGE_KEY, rawData]]);
    const setItem = vi.fn((key: string, value: string) => {
      if (key === STORAGE_KEY) throw new Error("quota");
      values.set(key, value);
    });
    const result = initializeFromRecovery(recoveryState, { setItem }, false, now);
    expect(result.status).toBe("recovery-required");
    if (result.status === "recovery-required") {
      expect(result.rawData).toBe(rawData);
      expect(result.recoveryKey).toBe(createRecoveryStorageKey(now));
    }
    expect(values.get(STORAGE_KEY)).toBe(rawData);
  });
});
