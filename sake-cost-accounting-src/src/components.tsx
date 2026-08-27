import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { formatMoney, formatQuantity, normalizeNumericText, parseNumericText, roundMoney, roundQuantity } from "./logic/number";
import type { ScreenId } from "./types";

export type NumberInputProps = {
  value: number | null;
  onChange: (value: number | null) => void;
  onCommit?: (before: number | null, after: number | null) => void;
  disabled?: boolean;
  allowNegative?: boolean;
  kind?: "money" | "quantity" | "ratio";
  suffix?: string;
  ariaLabel: string;
  row?: number;
  col?: number;
};

function plainFormat(value: number | null, kind: NonNullable<NumberInputProps["kind"]>): string {
  if (value === null) return "";
  const normalized = kind === "money" ? roundMoney(value) : roundQuantity(value);
  return normalized.toLocaleString("ja-JP", { maximumFractionDigits: kind === "money" ? 0 : 3 });
}

function formatDraftText(value: string): string {
  const normalized = value
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/．/g, ".")
    .replace(/－/g, "-")
    .replace(/[，,\s]/g, "");
  const match = normalized.match(/^(-?)(\d*)(\.?)(\d*)$/);
  if (!match) return normalized;
  const [, sign, integer, dot, fraction] = match;
  const groupedInteger = integer ? Number(integer).toLocaleString("ja-JP", { maximumFractionDigits: 0 }) : (fraction ? "0" : "");
  return `${sign}${groupedInteger}${dot}${fraction}`;
}

function draftError(text: string, kind: NonNullable<NumberInputProps["kind"]>, allowNegative: boolean, final: boolean): string {
  const normalized = normalizeNumericText(text);
  if (!allowNegative && normalized.startsWith("-")) return "0以上で入力してください。";
  if (kind === "money" && normalized.includes(".")) return "金額は整数円で入力してください。";
  if (!final && ["", ".", "-", "-."].includes(normalized)) return "";
  return parseNumericText(text) === "invalid" ? "数値として入力してください。" : "";
}

export function NumberInput({
  value,
  onChange,
  onCommit,
  disabled = false,
  allowNegative = false,
  kind = "money",
  suffix,
  ariaLabel,
  row,
  col,
}: NumberInputProps) {
  const errorId = useId();
  const [text, setText] = useState(() => plainFormat(value, kind));
  const [error, setError] = useState("");
  const startValue = useRef<number | null>(value);
  const focused = useRef(false);
  const dirty = useRef(false);
  const latestValue = useRef<number | null>(value);

  useEffect(() => {
    const changedExternally = latestValue.current !== value;
    latestValue.current = value;
    if (!focused.current || changedExternally) {
      setText(plainFormat(value, kind));
      setError("");
      dirty.current = false;
      startValue.current = value;
    }
  }, [kind, value]);

  const change = (nextText: string) => {
    const formatted = formatDraftText(nextText);
    dirty.current = true;
    setText(formatted);
    setError(draftError(formatted, kind, allowNegative, false));
  };

  const commitDraft = (): boolean => {
    if (!dirty.current) return true;
    const nextError = draftError(text, kind, allowNegative, true);
    if (nextError) {
      setError(nextError);
      return false;
    }
    const parsed = parseNumericText(text);
    if (parsed === "invalid") {
      setError("数値として入力してください。");
      return false;
    }
    const normalized = parsed === null ? null : kind === "money" ? roundMoney(parsed) : roundQuantity(parsed);
    setError("");
    setText(plainFormat(normalized, kind));
    dirty.current = false;
    latestValue.current = normalized;
    onChange(normalized);
    if (onCommit && startValue.current !== normalized) onCommit(startValue.current, normalized);
    startValue.current = normalized;
    return true;
  };

  return (
    <span className={`number-input-wrap${error ? " has-error" : ""}`}>
      <span className="number-input-control">
        <input
          type="text"
          inputMode={kind === "money" ? "numeric" : "decimal"}
          value={text}
          onChange={(event) => change(event.target.value)}
          onFocus={() => {
            focused.current = true;
            startValue.current = value;
          }}
          onBlur={() => {
            focused.current = false;
            commitDraft();
          }}
          onKeyDown={(event) => {
            const gridTarget = getGridNavigationTarget(event);
            const shouldCommit = event.key === "Enter" || Boolean(gridTarget);
            if (shouldCommit && !commitDraft()) {
              event.preventDefault();
              return;
            }
            if (gridTarget) moveGridFocus(event, gridTarget);
          }}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          data-grid-input="true"
          data-grid-row={row}
          data-grid-col={col}
        />
        {suffix && <span className="input-suffix">{suffix}</span>}
      </span>
      {error && <small id={errorId} className="field-error">{error}</small>}
    </span>
  );
}

export function TextCommitInput({ value, onChange, onCommit, disabled, ariaLabel, className }: {
  value: string;
  onChange: (value: string) => void;
  onCommit?: (before: string, after: string) => void;
  disabled?: boolean;
  ariaLabel: string;
  className?: string;
}) {
  const startValue = useRef(value);
  return (
    <input
      className={className}
      type="text"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onFocus={() => { startValue.current = value; }}
      onBlur={() => {
        if (onCommit && startValue.current !== value) onCommit(startValue.current, value);
      }}
      disabled={disabled}
      aria-label={ariaLabel}
    />
  );
}

function getGridNavigationTarget(event: KeyboardEvent<HTMLInputElement>): HTMLInputElement | null {
  const input = event.currentTarget;
  const table = input.closest("table");
  if (!table) return null;
  const row = Number(input.dataset.gridRow);
  const col = Number(input.dataset.gridCol);
  if (!Number.isFinite(row) || !Number.isFinite(col)) return null;
  let nextRow = row;
  let nextCol = col;
  if (event.key === "Enter") nextRow += event.shiftKey ? -1 : 1;
  else if (event.key === "ArrowDown") nextRow += 1;
  else if (event.key === "ArrowUp") nextRow -= 1;
  else if (event.key === "ArrowRight") nextCol += 1;
  else if (event.key === "ArrowLeft") nextCol -= 1;
  else return null;
  return table.querySelector<HTMLInputElement>(`[data-grid-input="true"][data-grid-row="${nextRow}"][data-grid-col="${nextCol}"]:not(:disabled)`);
}

function moveGridFocus(event: KeyboardEvent<HTMLInputElement>, target: HTMLInputElement) {
  event.preventDefault();
  target.focus();
  target.select();
}

export function Money({ value }: { value: number }) {
  return <span className="money">{formatMoney(value)}</span>;
}

export function Quantity({ value, suffix = "L" }: { value: number; suffix?: string }) {
  return <span>{formatQuantity(value)}{suffix}</span>;
}

export function PanelTitle({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="panel-title">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}

export type DialogState = {
  title: string;
  detail: string;
  confirmLabel: string;
  danger?: boolean;
  inputLabel?: string;
  inputValue?: string;
  onConfirm: (inputValue?: string) => void;
};

export function ConfirmDialog({ dialog, onClose }: { dialog: DialogState | null; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [inputValue, setInputValue] = useState("");

  useEffect(() => {
    if (!dialog) return;
    previousFocus.current = document.activeElement as HTMLElement | null;
    const timer = window.setTimeout(() => {
      setInputValue(dialog.inputValue ?? "");
      panel.current?.querySelector<HTMLElement>("input, button")?.focus();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      previousFocus.current?.focus();
    };
  }, [dialog]);

  if (!dialog) return null;
  const close = () => onClose();
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <div
        className="dialog-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        ref={panel}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            close();
          }
          if (event.key === "Tab") {
            const focusables = [...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])') ?? [])];
            if (focusables.length === 0) return;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <h2 id="dialog-title">{dialog.title}</h2>
        <p>{dialog.detail}</p>
        {dialog.inputLabel && (
          <label className="stacked-field">
            <span>{dialog.inputLabel}</span>
            <input value={inputValue} onChange={(event) => setInputValue(event.target.value)} />
          </label>
        )}
        <div className="dialog-actions">
          <button className="secondary-button" type="button" onClick={close}>キャンセル</button>
          <button
            className={dialog.danger ? "danger-button" : "primary-button"}
            type="button"
            disabled={Boolean(dialog.inputLabel && !inputValue.trim())}
            onClick={() => {
              dialog.onConfirm(inputValue.trim());
              close();
            }}
          >
            {dialog.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function StepNavigation({ previous, next, navigate }: { previous?: { id: ScreenId; label: string }; next?: { id: ScreenId; label: string }; navigate: (screen: ScreenId) => void }) {
  return (
    <nav className="step-navigation" aria-label="工程移動">
      {previous ? <button type="button" className="secondary-button" onClick={() => navigate(previous.id)}>← 前へ：{previous.label}</button> : <span />}
      {next && <button type="button" className="primary-button" onClick={() => navigate(next.id)}>次へ：{next.label} →</button>}
    </nav>
  );
}
