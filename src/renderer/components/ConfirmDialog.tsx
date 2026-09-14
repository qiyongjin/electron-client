import { useEffect, useId, useRef, type ReactNode } from "react";

/** Client-rendered confirmation: keyboard focus and Escape stay inside the modal. */
export function ConfirmDialog({ title, children, confirmLabel, cancelLabel = "取消", pending = false,
  danger = false, onConfirm, onCancel }: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  pending?: boolean;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const contentId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return <dialog ref={ref} className="client-confirm-dialog" aria-labelledby={titleId} aria-describedby={contentId}
    onCancel={(event) => { event.preventDefault(); if (!pending) onCancel(); }}>
    <h2 id={titleId}>{title}</h2>
    <div id={contentId} className="client-confirm-content">{children}</div>
    <div className="client-confirm-actions">
      <button type="button" className="upload-secondary" autoFocus disabled={pending} onClick={onCancel}>{cancelLabel}</button>
      <button type="button" className={`upload-primary ${danger ? "client-confirm-danger" : ""}`} disabled={pending}
        onClick={onConfirm}>{pending ? "正在处理…" : confirmLabel}</button>
    </div>
  </dialog>;
}
