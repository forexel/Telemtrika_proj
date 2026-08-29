import React, { useState, useEffect, useRef } from "react";

// ── Button ────────────────────────────────────────────────────────────────────

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
  loading?: boolean;
  icon?: React.ReactNode;
}

export function Button({ variant = "primary", size = "md", loading, icon, children, className = "", disabled, ...props }: ButtonProps) {
  const base = "inline-flex items-center gap-2 font-medium rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed";
  const sizes = { sm: "h-8 px-3 text-xs", md: "h-10 px-4 text-sm" };
  const variants = {
    primary: "bg-[#2563A6] text-white hover:bg-[#1E4F8C] focus-visible:ring-[#2563A6]",
    secondary: "bg-white text-[#1F2937] border border-[#D1D5DB] hover:bg-[#F9FAFB] focus-visible:ring-[#2563A6]",
    danger: "bg-[#C43D32] text-white hover:bg-[#A33028] focus-visible:ring-[#C43D32]",
    ghost: "bg-transparent text-[#6B7280] hover:bg-[#F3F4F6] focus-visible:ring-[#2563A6]",
  };

  return (
    <button
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

// ── Input ─────────────────────────────────────────────────────────────────────

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  rightIcon?: React.ReactNode;
  onRightIconClick?: () => void;
}

export function Input({ label, error, rightIcon, onRightIconClick, className = "", ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-xs font-medium text-[#374151]">{label}</label>}
      <div className="relative">
        <input
          className={`h-10 w-full rounded-md border px-3 text-sm text-[#1F2937] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#2563A6] focus:border-transparent transition ${
            error ? "border-[#C43D32] bg-[#FDE8E6]" : "border-[#D1D5DB] bg-white"
          } ${rightIcon ? "pr-10" : ""} ${className}`}
          {...props}
        />
        {rightIcon && (
          <button
            type="button"
            onClick={onRightIconClick}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B7280] hover:text-[#1F2937]"
          >
            {rightIcon}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-[#C43D32]">{error}</p>}
    </div>
  );
}

export function SearchInput({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" width="14" height="14" viewBox="0 0 20 20" fill="none">
        <path d="M9 17A8 8 0 1 0 9 1a8 8 0 0 0 0 16Z" stroke="currentColor" strokeWidth="1.5" />
        <path d="m19 19-4.35-4.35" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <input
        className={`h-10 w-full rounded-md border border-[#D1D5DB] bg-white pl-9 pr-3 text-sm text-[#1F2937] placeholder:text-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-[#2563A6] focus:border-transparent transition ${className}`}
        {...props}
      />
    </div>
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
}

export function Select({ label, className = "", children, ...props }: SelectProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-xs font-medium text-[#374151]">{label}</label>}
      <select
        className={`h-10 rounded-md border border-[#D1D5DB] bg-white px-3 text-sm text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#2563A6] focus:border-transparent transition ${className}`}
        {...props}
      >
        {children}
      </select>
    </div>
  );
}

// ── Badge ─────────────────────────────────────────────────────────────────────

type BadgeVariant = "success" | "warning" | "error" | "neutral" | "info";

const badgeStyles: Record<BadgeVariant, string> = {
  success: "bg-[#E8F5E9] text-[#2E7D32]",
  warning: "bg-[#FFF4CC] text-[#B37D00]",
  error: "bg-[#FDE8E6] text-[#C43D32]",
  neutral: "bg-[#EEF0F2] text-[#808B94]",
  info: "bg-[#E8F1FA] text-[#2563A6]",
};

export function Badge({ variant, children }: { variant: BadgeVariant; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium whitespace-nowrap ${badgeStyles[variant]}`}>
      {children}
    </span>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

export function KpiCard({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="bg-white rounded-lg border border-[#E5E7EB] px-4 py-3 flex flex-col gap-0.5">
      <span className="text-xs text-[#6B7280] leading-tight">{label}</span>
      <span className={`text-xl font-semibold ${accent ?? "text-[#1F2937]"}`}>{value}</span>
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

export function Modal({ title, onClose, children, footer }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB]">
          <h2 className="text-base font-semibold text-[#1F2937]">{title}</h2>
          <button onClick={onClose} className="text-[#9CA3AF] hover:text-[#1F2937] transition">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M15 5 5 15M5 5l10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>
        <div className="px-6 py-5 flex flex-col gap-4">{children}</div>
        {footer && <div className="px-6 py-4 border-t border-[#E5E7EB] flex justify-end gap-3">{footer}</div>}
      </div>
    </div>
  );
}

// ── Confirmation dialog ───────────────────────────────────────────────────────

export function ConfirmDialog({ title, message, onConfirm, onCancel, confirmLabel = "Подтвердить", confirmVariant = "danger" }: {
  title: string; message: string; onConfirm: () => void; onCancel: () => void;
  confirmLabel?: string; confirmVariant?: "primary" | "danger";
}) {
  return (
    <Modal title={title} onClose={onCancel} footer={
      <>
        <Button variant="secondary" onClick={onCancel}>Отмена</Button>
        <Button variant={confirmVariant} onClick={onConfirm}>{confirmLabel}</Button>
      </>
    }>
      <p className="text-sm text-[#374151]">{message}</p>
    </Modal>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────

export type ToastType = "success" | "error" | "info";

export function Toast({ message, type, onClose }: { message: string; type: ToastType; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000);
    return () => clearTimeout(t);
  }, [onClose]);

  const styles: Record<ToastType, string> = {
    success: "bg-[#2E7D32] text-white",
    error: "bg-[#C43D32] text-white",
    info: "bg-[#2563A6] text-white",
  };

  return (
    <div className={`fixed bottom-6 right-6 z-[100] flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${styles[type]}`}>
      {message}
      <button onClick={onClose} className="opacity-80 hover:opacity-100">
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none"><path d="M15 5 5 15M5 5l10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      </button>
    </div>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  return (
    <div className="flex flex-col gap-1">
      {label && <div className="flex justify-between text-xs text-[#6B7280]"><span>{label}</span><span>{value}%</span></div>}
      <div className="h-2 bg-[#E5E7EB] rounded-full overflow-hidden">
        <div className="h-full bg-[#2563A6] rounded-full transition-all duration-300" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

// ── Spinner ───────────────────────────────────────────────────────────────────

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="animate-spin">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`bg-[#E5E7EB] rounded animate-pulse ${className}`} />;
}

// ── Empty state ───────────────────────────────────────────────────────────────

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-12 h-12 rounded-full bg-[#F3F4F6] flex items-center justify-center mb-3">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M4 6h16M4 12h10M4 18h7" stroke="#9CA3AF" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
      <p className="text-sm font-medium text-[#374151]">{title}</p>
      {description && <p className="text-xs text-[#6B7280] mt-1 max-w-xs">{description}</p>}
    </div>
  );
}

// ── Checkbox ──────────────────────────────────────────────────────────────────

export function Checkbox({ label, sublabel, checked, onChange }: {
  label: string; sublabel?: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2 cursor-pointer select-none">
      <div className="relative mt-0.5">
        <input type="checkbox" className="sr-only" checked={checked} onChange={e => onChange(e.target.checked)} />
        <div className={`w-4 h-4 rounded border flex items-center justify-center transition ${checked ? "bg-[#2563A6] border-[#2563A6]" : "border-[#D1D5DB] bg-white"}`}>
          {checked && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
        </div>
      </div>
      <div>
        <span className="text-sm text-[#1F2937]">{label}</span>
        {sublabel && <p className="text-xs text-[#6B7280]">{sublabel}</p>}
      </div>
    </label>
  );
}

// ── Date input ────────────────────────────────────────────────────────────────

export function DateInput({ label, className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-xs font-medium text-[#374151]">{label}</label>}
      <input
        type="date"
        className={`h-10 rounded-md border border-[#D1D5DB] bg-white px-3 text-sm text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#2563A6] focus:border-transparent transition ${className}`}
        {...props}
      />
    </div>
  );
}

// ── Status badge helper ───────────────────────────────────────────────────────

export function VehicleStatusBadge({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    confirmed: ["success", "Работа подтверждена"],
    partial: ["warning", "Подтверждено частично"],
    unconfirmed: ["error", "Выезд не подтверждён"],
    "no-schedule": ["info", "Поездка без разнарядки"],
    "no-vehicle": ["warning", "Автомобиль не определён"],
    check: ["warning", "Требует проверки"],
  };
  const [variant, label] = map[status] ?? ["neutral", status];
  return <Badge variant={variant as BadgeVariant}>{label}</Badge>;
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

export function Tooltip({ children, content }: { children: React.ReactNode; content: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={ref}
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none">
          <div className="bg-[#1F2937] text-white text-xs rounded-lg px-3 py-2 shadow-lg whitespace-nowrap">
            {content}
          </div>
        </div>
      )}
    </div>
  );
}
