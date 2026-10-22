"use client";
import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { getTheme, setTheme, subscribeTheme } from "@/lib/theme";

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const theme = useSyncExternalStore(subscribeTheme, getTheme, () => "light");
  const dark = theme === "dark", label = dark ? "Ativar modo claro" : "Ativar modo escuro";
  return <button type="button" aria-label={label} aria-pressed={dark} title={label} onClick={() => setTheme(dark ? "light" : "dark")} className="flex h-8 w-full shrink-0 items-center justify-center gap-2 rounded-lg border border-avvi-line bg-white px-2 text-[11px] font-semibold text-slate-600 hover:bg-avvi-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-avvi-blue">
    {dark ? <Sun size={16} aria-hidden="true" /> : <Moon size={16} aria-hidden="true" />}{!compact && <span>{dark ? "Modo claro" : "Modo escuro"}</span>}
  </button>;
}
