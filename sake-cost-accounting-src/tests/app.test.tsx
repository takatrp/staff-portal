import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import App from "../src/App";

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
});
