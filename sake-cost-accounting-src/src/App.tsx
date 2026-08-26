import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ConfirmDialog, type DialogState } from "./components";
import { createNormalDemoModel, STORAGE_KEY } from "./data/defaults";
import { calculateModel } from "./logic/calculation";
import { migrateModel } from "./logic/migration";
import type { AuditEntry, SakeCostModel, ScreenId } from "./types";
import type { CommonScreenProps, ToastKind } from "./ui-types";
import { HomeScreen } from "./screens/HomeScreen";
import { MaterialsScreen } from "./screens/MaterialsScreen";
import { AllocationScreen } from "./screens/AllocationScreen";
import { ProductsScreen } from "./screens/ProductsScreen";
import { SpecialScreen } from "./screens/SpecialScreen";
import { InventoryScreen } from "./screens/InventoryScreen";
import { MasterScreen } from "./screens/MasterScreen";
import { DataScreen } from "./screens/DataScreen";
import "./styles.css";

const navigation: Array<{ id: ScreenId; label: string; icon: string }> = [
  { id: "home", label: "ホーム", icon: "⌂" },
  { id: "materials", label: "原材料費", icon: "▤" },
  { id: "manufacturing-allocation", label: "製造費用按分", icon: "◔" },
  { id: "packaging-allocation", label: "製品費用按分", icon: "◇" },
  { id: "products", label: "製品原価", icon: "⌁" },
  { id: "special", label: "甘酒・副産物等", icon: "▱" },
  { id: "inventory", label: "棚卸・売上原価", icon: "▦" },
  { id: "master", label: "マスター設定", icon: "⚙" },
  { id: "data", label: "保存・出力", icon: "▣" },
];

function initialModel(): SakeCostModel {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored ? migrateModel(JSON.parse(stored)) : createNormalDemoModel();
  } catch {
    return createNormalDemoModel();
  }
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "空欄";
  if (typeof value === "number") return value.toLocaleString("ja-JP");
  if (typeof value === "boolean") return value ? "有効" : "無効";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export default function App() {
  const [model, setModel] = useState<SakeCostModel>(initialModel);
  const [screenId, setScreenId] = useState<ScreenId>("home");
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [toast, setToast] = useState<{ message: string; kind: ToastKind } | null>(null);
  const calc = useMemo(() => calculateModel(model), [model]);
  const locked = model.meta.status === "finalized";

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(model));
    } catch {
      window.setTimeout(() => setToast({ message: "このブラウザへの自動保存に失敗しました。JSONバックアップを保存してください。", kind: "error" }), 0);
    }
  }, [model]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const showToast = useCallback((message: string, kind: ToastKind = "success") => setToast({ message, kind }), []);
  const navigate = useCallback((next: ScreenId) => {
    setScreenId(next);
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  const updateModel = useCallback((mutator: (draft: SakeCostModel) => void, action?: string, target = "全体", detail = "", options: { allowWhenLocked?: boolean } = {}) => {
    setModel((current) => {
      if (current.meta.status === "finalized" && !options.allowWhenLocked) {
        window.setTimeout(() => setToast({ message: "確定済みデータは変更できません。先に確定を解除してください。", kind: "error" }), 0);
        return current;
      }
      const draft = structuredClone(current);
      mutator(draft);
      const at = new Date().toISOString();
      draft.meta.updatedAt = at;
      if (action) {
        const entry: AuditEntry = {
          id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          at,
          actor: draft.meta.operatorName.trim() || "未設定",
          target,
          action,
          detail,
        };
        draft.auditLog = [entry, ...(draft.auditLog ?? [])].slice(0, 200);
      }
      return draft;
    });
  }, []);

  const recordAudit = useCallback((target: string, before: unknown, after: unknown, action = "入力値を確定") => {
    if (displayValue(before) === displayValue(after)) return;
    setModel((current) => {
      if (current.meta.status === "finalized") return current;
      const draft = structuredClone(current);
      const at = new Date().toISOString();
      draft.meta.updatedAt = at;
      draft.auditLog = [{
        id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        at,
        actor: draft.meta.operatorName.trim() || "未設定",
        target,
        before: displayValue(before),
        after: displayValue(after),
        action,
      }, ...draft.auditLog].slice(0, 200);
      return draft;
    });
  }, []);

  const common: CommonScreenProps = {
    model,
    calc,
    locked,
    navigate,
    updateModel,
    recordAudit,
    openDialog: setDialog,
    showToast,
  };

  const screens: Record<ScreenId, ReactNode> = {
    home: <HomeScreen {...common} />,
    materials: <MaterialsScreen {...common} />,
    "manufacturing-allocation": <AllocationScreen type="manufacturing" {...common} />,
    "packaging-allocation": <AllocationScreen type="packaging" {...common} />,
    products: <ProductsScreen {...common} />,
    special: <SpecialScreen {...common} />,
    inventory: <InventoryScreen {...common} />,
    master: <MasterScreen {...common} />,
    data: <DataScreen {...common} />,
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" type="button" onClick={() => navigate("home")}><span className="brand-icon">◩</span><span><strong>酒造原価</strong><small>管理システム</small></span></button>
        <nav aria-label="メインメニュー">{navigation.map((item) => <button type="button" className={screenId === item.id ? "active" : ""} aria-current={screenId === item.id ? "page" : undefined} key={item.id} onClick={() => navigate(item.id)}><span aria-hidden="true">{item.icon}</span>{item.label}</button>)}</nav>
        <div className="sidebar-meta"><span>▢ {model.meta.periodLabel}</span><small>最終更新 {new Date(model.meta.updatedAt).toLocaleString("ja-JP")}</small></div>
      </aside>

      <div className="app-content">
        <header className="topbar">
          <div><small>{model.meta.companyName}</small><h1>{navigation.find((item) => item.id === screenId)?.label}</h1></div>
          <div className="topbar-actions"><button type="button" className={`issue-badge ${calc.criticalCount ? "has-errors" : "clear"}`} onClick={() => navigate("inventory")}>{calc.criticalCount ? `▲ 要修正 ${calc.criticalCount}` : "✓ エラー 0"}</button><span className={`status-badge ${locked ? "finalized" : "draft"}`}>{locked ? "✓ 確定済み" : "✎ 編集中"}</span><button type="button" className="icon-button" onClick={() => navigate("data")} aria-label="保存・出力">↥</button></div>
        </header>
        <main>
          <div className="demo-warning" role="note"><strong>社内検討用デモ（架空データ）</strong><span>公開URLのため、実際の顧客データは入力しないでください。</span></div>
          {screens[screenId]}
        </main>
      </div>
      <div className="toast-region" aria-live="polite" aria-atomic="true">{toast && <div className={`toast ${toast.kind}`} role={toast.kind === "error" ? "alert" : "status"}>{toast.message}</div>}</div>
      <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}
