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
});
