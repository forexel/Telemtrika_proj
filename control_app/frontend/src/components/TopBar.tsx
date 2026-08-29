import React from "react";
import { Button, ProgressBar } from "./ui";

interface TopBarProps {
  section: string;
  subtitle?: string;
  syncing: boolean;
  syncProgress: number;
  onSync: () => void;
  onRefresh: () => void;
}

export default function TopBar({ section, subtitle, syncing, syncProgress, onSync, onRefresh }: TopBarProps) {
  return (
    <header className="h-14 bg-white border-b border-[#E5E7EB] flex items-center px-6 gap-4 shrink-0">
      {/* Title area */}
      <div className="flex-1 min-w-0">
        {subtitle && <div className="text-xs text-[#6B7280] leading-none mb-0.5">{subtitle}</div>}
        <div className="text-base font-semibold text-[#243746] leading-tight truncate">{section}</div>
      </div>

      {/* Sync status */}
      <div className="flex items-center gap-3">
        {syncing ? (
          <div className="flex flex-col gap-1 min-w-40">
            <div className="text-xs text-[#6B7280]">Синхронизация: {syncProgress}%</div>
            <ProgressBar value={syncProgress} />
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#2E7D32] inline-block" />
            <span className="text-xs text-[#6B7280]">Данные актуальны · обновлено сегодня в 02:15</span>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={onSync}
            disabled={syncing}
            icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M4 4v6h6M20 20v-6h-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L4 4M3.51 15a9 9 0 0 0 14.85 3.36L20 20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            }
          >
            Синхронизировать
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            icon={
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M1 4v6h6M23 20v-6h-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10M22.99 14l-4.64 4.36A9 9 0 0 1 3.51 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            }
          >
            Обновить
          </Button>
        </div>
      </div>
    </header>
  );
}
