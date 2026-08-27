import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { NumberInput } from "../src/components";

function ControlledInput({ kind = "quantity", allowNegative = false, onCommit }: {
  kind?: "money" | "quantity" | "ratio";
  allowNegative?: boolean;
  onCommit?: (before: number | null, after: number | null) => void;
}) {
  const [value, setValue] = useState<number | null>(7);
  return <><NumberInput value={value} onChange={setValue} onCommit={onCommit} kind={kind} allowNegative={allowNegative} ariaLabel="検証入力" /><output aria-label="モデル値">{String(value)}</output></>;
}

describe("NumberInput", () => {
  it.each([
    ["10.25", "10.25", "10.25"],
    ["1234.5", "1,234.5", "1234.5"],
    ["0.125", "0.125", "0.125"],
    [".5", "0.5", "0.5"],
    ["１０．２５", "10.25", "10.25"],
  ])("%sを1文字ずつ入力して小数第3位まで確定する", async (typed, display, modelValue) => {
    const user = userEvent.setup();
    render(<ControlledInput />);
    const input = screen.getByRole("textbox", { name: "検証入力" });
    await user.clear(input);
    await user.type(input, typed);
    expect(input).toHaveValue(display);
    expect(screen.getByLabelText("モデル値")).toHaveTextContent("7");
    await user.tab();
    expect(input).toHaveValue(display);
    expect(screen.getByLabelText("モデル値")).toHaveTextContent(modelValue);
  });

  it("金額欄の小数を拒否してモデルを変更しない", async () => {
    const user = userEvent.setup();
    render(<ControlledInput kind="money" />);
    const input = screen.getByRole("textbox", { name: "検証入力" });
    await user.clear(input);
    await user.type(input, "10.5");
    await user.tab();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("金額は整数円で入力してください。")).toBeVisible();
    expect(screen.getByLabelText("モデル値")).toHaveTextContent("7");
  });

  it("負数不可欄を拒否し、負数許可の数量欄では-1.25を確定する", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ControlledInput />);
    let input = screen.getByRole("textbox", { name: "検証入力" });
    await user.clear(input);
    await user.type(input, "-1");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("モデル値")).toHaveTextContent("7");
    unmount();

    render(<ControlledInput allowNegative />);
    input = screen.getByRole("textbox", { name: "検証入力" });
    await user.clear(input);
    await user.type(input, "-1.25");
    await user.tab();
    expect(screen.getByLabelText("モデル値")).toHaveTextContent("-1.25");
  });

  it("EnterでonChange後にonCommitし、次行同列へ移動する", async () => {
    const calls: string[] = [];
    const onCommit = vi.fn(() => calls.push("commit"));
    function Grid() {
      const [first, setFirst] = useState<number | null>(0);
      const [second, setSecond] = useState<number | null>(0);
      return <table><tbody><tr><td><NumberInput value={first} onChange={(value) => { calls.push("change"); setFirst(value); }} onCommit={onCommit} kind="quantity" ariaLabel="1行目" row={0} col={0} /></td></tr><tr><td><NumberInput value={second} onChange={setSecond} kind="quantity" ariaLabel="2行目" row={1} col={0} /></td></tr></tbody></table>;
    }
    const user = userEvent.setup();
    render(<Grid />);
    const first = screen.getByRole("textbox", { name: "1行目" });
    await user.clear(first);
    await user.type(first, "10.25");
    await user.keyboard("{Enter}");
    expect(calls).toEqual(["change", "commit"]);
    expect(screen.getByRole("textbox", { name: "2行目" })).toHaveFocus();
    expect(first).toHaveValue("10.25");
  });
});
