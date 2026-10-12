"use client";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
export function ClinicalDialog({ title, onClose, children, footer, contentKey }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; contentKey?: string | number }) {
 const ref = useRef<HTMLElement>(null); const close = useRef(onClose);
 useEffect(() => {close.current = onClose;}, [onClose]);
 useEffect(() => {
  const prior = document.activeElement as HTMLElement | null;
  ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
  function key(event: KeyboardEvent) {
   if ([...document.querySelectorAll('[role="dialog"]')].at(-1) !== ref.current) return;
   if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); close.current(); }
   if (event.key === "Tab") { const items = [...(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') ?? [])].filter(item => item.getClientRects().length); const first = items[0], last = items.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }
  }
  document.addEventListener("keydown", key, true);
  return () => { document.removeEventListener("keydown", key, true); prior?.focus(); };
 }, []);
 return createPortal(<div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/45 p-2 sm:p-4"><section ref={ref} role="dialog" aria-modal="true" aria-label={title} className="flex max-h-[96dvh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"><header className="flex shrink-0 items-center justify-between gap-3 border-b border-avvi-line px-5 py-4"><h2 className="text-lg font-bold text-avvi-ink">{title}</h2><button type="button" aria-label={`Fechar ${title}`} onClick={onClose} className="rounded-full bg-avvi-blue p-1.5 text-white"><X size={17}/></button></header><div key={contentKey} className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">{children}</div>{footer && <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-avvi-line p-3">{footer}</footer>}</section></div>, document.body);
}
