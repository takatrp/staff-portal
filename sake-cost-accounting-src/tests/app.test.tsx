import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { createNormalDemoModel, STORAGE_KEY } from "../src/data/defaults";

describe("主要画面スモーク", () => {
  it("ホームを表示し、棚卸・売上原価へ移動できる", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByText("酒造原価計算を、入力から確定まで一つに。")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "棚卸・売上原価" }));
    expect(screen.getByRole("heading", { name: "棚卸・売上原価", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "年度原価を確定" })).toBeDisabled();
  });

  it("通常デモのエラーバッジは0件を表示する", () => {
    render(<App />);
    expect(screen.getByRole("button", { name: "✓ エラー 0" })).toBeInTheDocument();
  });

  it("ホームに現在の画面順どおり6工程を表示する", () => {
    render(<App />);
    const workflow = screen.getByRole("heading", { name: "年度原価計算の進め方" }).closest("section")!;
    const buttons = within(workflow).getAllByRole("button");
    expect(buttons).toHaveLength(6);
    ["原材料費", "製造費用按分", "製品費用按分", "製品原価", "甘酒・副産物・食品", "棚卸・売上原価"].forEach((title, index) => {
      expect(buttons[index]).toHaveTextContent(String(index + 1));
      expect(buttons[index]).toHaveTextContent(title);
    });
  });

  it("副産物表の合計行を13列にそろえ、品目原価と操作列を分離する", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(screen.getByRole("navigation", { name: "メインメニュー" })).getByRole("button", { name: "甘酒・副産物等" }));
    await user.click(screen.getByRole("button", { name: "副産物" }));
    const table = screen.getByRole("table", { name: "副産物原価" });
    expect(table.querySelectorAll("thead th")).toHaveLength(13);
    const footer = within(table).getByRole("row", { name: /合計/ });
    const logicalColumns = [...footer.children].reduce((total, cell) => total + Number(cell.getAttribute("colspan") ?? 1), 0);
    expect(logicalColumns).toBe(13);
    expect(within(footer).getByRole("cell", { name: "品目原価合計" })).toHaveTextContent("¥61,000");
    expect(within(footer).getByRole("cell", { name: "操作列" })).toBeEmptyDOMElement();
  });

  it("確定済みデータではJSON復元とデモ上書きを無効にする", async () => {
    const finalized = createNormalDemoModel();
    finalized.meta.status = "finalized";
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(finalized));
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(screen.getByRole("navigation", { name: "メインメニュー" })).getByRole("button", { name: "保存・出力" }));
    expect(screen.getByRole("button", { name: "JSONを選択" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "正常デモデータを読み込む" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "エラー確認用データを読み込む" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "基準値に戻す" })).toBeDisabled();
  });

  it("酒種表示名の変更を配賦表の見出しへ反映する", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "マスター設定" }));
    const labelInput = screen.getByRole("textbox", { name: "sake 表示名" });
    await user.clear(labelInput);
    await user.type(labelInput, "新しい清酒名");
    await user.click(screen.getByRole("button", { name: "製造費用按分" }));
    expect(screen.getAllByRole("columnheader", { name: "新しい清酒名" }).length).toBeGreaterThan(0);
  });

  it("壊れた起動データを上書きせず、確認後だけ退避して正常デモへ初期化する", async () => {
    const rawData = "{\n  broken json";
    window.localStorage.setItem(STORAGE_KEY, rawData);
    const nativeSetItem = Storage.prototype.setItem;
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key: string, value: string) {
      return nativeSetItem.call(this, key, value);
    });
    const user = userEvent.setup();
    render(<StrictMode><App /></StrictMode>);

    expect(screen.getByRole("heading", { name: "保存データを自動復元できませんでした" })).toBeInTheDocument();
    expect(screen.getByText("元データはまだ削除・上書きされていません。", { exact: false })).toBeInTheDocument();
    expect(screen.getByText(`${rawData.length}文字`)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(rawData);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(rawData);

    await user.click(screen.getByRole("button", { name: "正常デモで初期化" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(rawData);
    await user.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(rawData);

    await user.click(screen.getByRole("button", { name: "正常デモで初期化" }));
    await user.click(screen.getByRole("button", { name: "初期化する" }));
    expect(await screen.findByText("酒造原価計算を、入力から確定まで一つに。")).toBeInTheDocument();
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!);
    expect(stored.schemaVersion).toBe(3);
    expect(stored.auditLog[0].action).toBe("復旧画面から正常デモで初期化");
    const recoveryKeys = Object.keys(window.localStorage).filter((key) => key.startsWith("sake-cost-accounting-recovery-"));
    expect(recoveryKeys).toHaveLength(1);
    expect(window.localStorage.getItem(recoveryKeys[0])).toBe(rawData);
    expect(setItem.mock.calls.filter(([key]) => key.startsWith("sake-cost-accounting-recovery-"))).toHaveLength(1);
  });

  it("復旧用データ保存ボタンへ元文字列を一切変更せず渡す", async () => {
    const rawData = "{\n  \"broken\": true,\n trailing";
    window.localStorage.setItem(STORAGE_KEY, rawData);
    const originalCreateObjectURL = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
    const originalRevokeObjectURL = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
    const createObjectURL = vi.fn((blob: Blob) => {
      void blob;
      return "blob:recovery-test";
    });
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    try {
      const user = userEvent.setup();
      render(<App />);

      await user.click(screen.getByRole("button", { name: "復旧用データを保存" }));
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      const blob = createObjectURL.mock.calls[0][0] as Blob;
      expect(await blob.text()).toBe(rawData);
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:recovery-test");
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe(rawData);
    } finally {
      if (originalCreateObjectURL) Object.defineProperty(URL, "createObjectURL", originalCreateObjectURL);
      else delete (URL as unknown as { createObjectURL?: unknown }).createObjectURL;
      if (originalRevokeObjectURL) Object.defineProperty(URL, "revokeObjectURL", originalRevokeObjectURL);
      else delete (URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL;
    }
  });

  it("退避失敗時は元キーを維持し、別の確認なしでは初期化しない", async () => {
    const rawData = "{broken";
    window.localStorage.setItem(STORAGE_KEY, rawData);
    const nativeSetItem = Storage.prototype.setItem;
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key: string, value: string) {
      if (key.startsWith("sake-cost-accounting-recovery-")) throw new Error("quota");
      return nativeSetItem.call(this, key, value);
    });
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "正常デモで初期化" }));
    await user.click(screen.getByRole("button", { name: "初期化する" }));
    expect(await screen.findByText("元データを別キーへ退避できませんでした。", { exact: false })).toBeInTheDocument();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(rawData);
    expect(setItem.mock.calls.some(([key]) => key === STORAGE_KEY)).toBe(false);

    await user.click(screen.getByRole("button", { name: "退避せずに初期化を続ける" }));
    await user.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(rawData);
  });

  it("ストレージを読み取れない場合は自動保存しないセッションモードで開く", async () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent("このセッションは自動保存されません");
    expect(screen.getByText("⚠ このセッションは自動保存されません")).toBeInTheDocument();
    expect(getItem).toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });

  it("起動後の自動保存失敗でもセッションモード表示へ切り替える", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    render(<App />);
    await waitFor(() => expect(document.querySelector(".session-warning")).toHaveTextContent("このセッションは自動保存されません"));
    expect(screen.getByText("⚠ このセッションは自動保存されません")).toBeInTheDocument();
  });
});
