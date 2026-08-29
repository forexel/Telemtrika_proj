import React from "react";

type Screen = "vehicles" | "employees" | "analytics" | "settings";

interface SidebarProps {
  current: Screen;
  onNavigate: (s: Screen) => void;
  collapsed: boolean;
  onToggle: () => void;
  onLogout: () => void;
  login: string;
}

const navItems: { id: Screen; label: string; icon: React.ReactNode }[] = [
  {
    id: "vehicles",
    label: "Автомобили",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M4 16v-3L6.5 7h11L20 13v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="7.5" cy="16.5" r="1.5" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="16.5" cy="16.5" r="1.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M2 16h20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "employees",
    label: "Сотрудники",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="1.5" />
        <path d="M4 21c0-4 3.582-7 8-7s8 3 8 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "analytics",
    label: "Аналитика",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M4 20V14M9 20V10M14 20V6M19 20V3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "settings",
    label: "Настройки",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
        <path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72 1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
];

export default function Sidebar({ current, onNavigate, collapsed, onToggle, onLogout, login }: SidebarProps) {
  return (
    <aside
      className="h-full flex flex-col bg-[#243746] text-white shrink-0 transition-all duration-200"
      style={{ width: collapsed ? 56 : 220 }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-white/10 overflow-hidden">
        <div className="w-8 h-8 rounded-lg bg-[#2563A6] flex items-center justify-center font-bold text-sm shrink-0">
          КР
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <div className="text-sm font-semibold leading-tight whitespace-nowrap">Контроль работ</div>
            <div className="text-xs text-white/50 whitespace-nowrap">М-Энерго</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 flex flex-col gap-0.5 px-2">
        {navItems.map(item => {
          const active = current === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              title={collapsed ? item.label : undefined}
              className={`flex items-center gap-3 rounded-md px-2 py-2.5 text-sm transition-colors text-left w-full ${
                active ? "bg-[#2563A6] text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              <span className="shrink-0">{item.icon}</span>
              {!collapsed && <span className="whitespace-nowrap overflow-hidden text-ellipsis">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* User */}
      <div className="border-t border-white/10 px-2 py-3">
        {!collapsed && (
          <div className="px-2 mb-2 overflow-hidden">
            <div className="text-xs font-medium text-white whitespace-nowrap">Прораб</div>
            <div className="text-xs text-white/50 whitespace-nowrap">{login}</div>
          </div>
        )}
        <button
          title={collapsed ? "Выйти" : undefined}
          onClick={onLogout}
          className="flex items-center gap-3 w-full rounded-md px-2 py-2 text-xs text-white/60 hover:bg-white/10 hover:text-white transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {!collapsed && <span className="whitespace-nowrap">Выйти</span>}
        </button>
      </div>

      {/* Collapse toggle */}
      <div className="border-t border-white/10 p-2">
        <button
          onClick={onToggle}
          title={collapsed ? "Развернуть" : "Свернуть"}
          className="flex items-center justify-center w-full h-8 rounded-md text-white/50 hover:bg-white/10 hover:text-white transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className={`transition-transform ${collapsed ? "rotate-180" : ""}`}>
            <path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </aside>
  );
}
