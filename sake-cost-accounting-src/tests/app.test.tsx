import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
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
});
