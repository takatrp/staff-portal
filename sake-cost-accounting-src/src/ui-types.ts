import type { DialogState } from "./components";
import type { CalculationResult, SakeCostModel, ScreenId } from "./types";

export type ToastKind = "success" | "error" | "info";

export type CommonScreenProps = {
  model: SakeCostModel;
  calc: CalculationResult;
  locked: boolean;
  navigate: (screenId: ScreenId) => void;
  updateModel: (mutator: (draft: SakeCostModel) => void, action?: string, target?: string, detail?: string) => void;
  recordAudit: (target: string, before: unknown, after: unknown, action?: string) => void;
  openDialog: (dialog: DialogState) => void;
  showToast: (message: string, kind?: ToastKind) => void;
};
