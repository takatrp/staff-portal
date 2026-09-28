import type { DialogState } from "./components";
import type { CalculationResult, SakeCostModel, ScreenId } from "./types";

export type ToastKind = "success" | "error" | "info";

export type CommonScreenProps = {
  model: SakeCostModel;
  calc: CalculationResult;
  locked: boolean;
  persistenceMode: "persistent" | "session";
  navigate: (screenId: ScreenId) => void;
  updateModel: (mutator: (draft: SakeCostModel) => void, action?: string, target?: string, detail?: string, options?: { allowWhenLocked?: boolean }) => void;
  recordAudit: (target: string, before: unknown, after: unknown, action?: string) => void;
  openDialog: (dialog: DialogState) => void;
  showToast: (message: string, kind?: ToastKind) => void;
};
