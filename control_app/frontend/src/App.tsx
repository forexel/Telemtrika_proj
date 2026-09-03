import React, { useState, useEffect } from "react";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import LoginScreen from "./screens/LoginScreen";
import VehiclesScreen from "./screens/VehiclesScreen";
import EmployeesScreen from "./screens/EmployeesScreen";
import AnalyticsScreen from "./screens/AnalyticsScreen";
import SettingsScreen from "./screens/SettingsScreen";
import { api } from "./api";

type Screen = "vehicles" | "employees" | "analytics" | "settings";
type AnalyticsTarget = { mode: "vehicle" | "person"; value: string } | null;
type RouteState = { screen: Screen; target: AnalyticsTarget };

const screenMeta: Record<Screen, { subtitle: string; title: string }> = {
  vehicles: { subtitle: "Автомобили", title: "Фактическое использование техники" },
  employees: { subtitle: "Сотрудники", title: "Эффективность сотрудников" },
  analytics: { subtitle: "Аналитика", title: "Подробный анализ рабочего дня" },
  settings: { subtitle: "Настройки", title: "Настройки системы" },
};

const appRoot = window.location.pathname.startsWith("/telemetrika") ? "/telemetrika" : "";
function parseRoute(): RouteState {
  const relative = window.location.pathname.slice(appRoot.length).replace(/^\/+|\/+$/g, "");
  const parts = relative.split("/").filter(Boolean);
  if (parts[0] === "vehicles" && parts[1]) return { screen: "analytics", target: { mode: "vehicle", value: decodeURIComponent(parts.slice(1).join("/")) } };
  if (parts[0] === "employees" && parts[1]) return { screen: "analytics", target: { mode: "person", value: decodeURIComponent(parts.slice(1).join("/")) } };
  if (["vehicles", "employees", "analytics", "settings"].includes(parts[0])) return { screen: parts[0] as Screen, target: null };
  return { screen: "vehicles", target: null };
}
function routePath(screen: Screen, target: AnalyticsTarget = null) {
  if (target?.mode === "vehicle") return `${appRoot}/vehicles/${encodeURIComponent(target.value)}`;
  if (target?.mode === "person") return `${appRoot}/employees/${encodeURIComponent(target.value)}`;
  return `${appRoot}/${screen}`;
}

export default function App() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [loginName, setLoginName] = useState("");
  const [route, setRoute] = useState<RouteState>(parseRoute);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [lastSync, setLastSync] = useState<any>(null);
  const [syncError, setSyncError] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    api<{ authenticated: boolean; login?: string }>("auth/session").then(session => {
      setLoggedIn(session.authenticated); setLoginName(session.login || "");
    }).catch(() => setLoggedIn(false));
  }, []);

  useEffect(() => {
    const onPopState = () => setRoute(parseRoute());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!loggedIn) return;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const data = await api<any>("sync/progress");
        const progress = data.running && data.vehicle_total ? Math.round((((data.chunk || 1) - 1) + data.vehicle_index / data.vehicle_total) / Math.max(1, data.chunks || 1) * 100) : data.phase === "done" ? 100 : 0;
        setSyncing(Boolean(data.running)); setSyncProgress(progress); setLastSync(data.last || null);
        if (data.error) setSyncError(String(data.error)); else if (!data.running) setSyncError("");
        if (data.running) timer = window.setTimeout(poll, 2500);
      } catch { setSyncing(false); }
    };
    poll(); return () => { if (timer) clearTimeout(timer); };
  }, [loggedIn, refreshToken]);

  const navigate = (screen: Screen, target: AnalyticsTarget = null) => {
    const next = { screen, target };
    window.history.pushState(next, "", routePath(screen, target));
    setRoute(next);
  };
  const login = async (login: string, password: string) => {
    await api("auth/login", { method: "POST", body: JSON.stringify({ login, password }) });
    setLoginName(login); setLoggedIn(true);
  };
  const logout = async () => { await api("auth/logout", { method: "POST" }).catch(() => {}); setLoggedIn(false); };
  const startSync = async () => {
    const to = new Date(Date.now() + 3 * 3600e3), from = new Date(to); from.setUTCDate(from.getUTCDate() - 6);
    setSyncError(""); setSyncing(true); setSyncProgress(0);
    try {
      await api("sync/all", { method: "POST", body: JSON.stringify({ date_from: from.toISOString().slice(0, 10), date_to: to.toISOString().slice(0, 10) }) });
      setRefreshToken(value => value + 1);
    } catch (error) {
      setSyncing(false); setSyncError(error instanceof Error ? error.message : "Не удалось запустить синхронизацию");
    }
  };

  if (loggedIn === null) return <div className="h-screen grid place-items-center bg-[#F3F4F6] text-[#6B7280]">Загрузка системы…</div>;
  if (!loggedIn) return <LoginScreen onLogin={login} />;

  const meta = screenMeta[route.screen];
  return (
    <div className="flex h-screen overflow-hidden bg-[#F3F4F6]">
      <Sidebar current={route.screen} onNavigate={screen => navigate(screen)} collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(v => !v)} onLogout={logout} login={loginName} />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar section={meta.title} subtitle={meta.subtitle} syncing={syncing} syncProgress={syncProgress} lastSync={lastSync} syncError={syncError} onSync={startSync} onRefresh={() => setRefreshToken(v => v + 1)} />
        <main className="flex-1 overflow-hidden flex flex-col min-h-0">
          {route.screen === "vehicles" && <VehiclesScreen refreshToken={refreshToken} onViewAnalytics={vehicleId => navigate("analytics", { mode: "vehicle", value: vehicleId })} />}
          {route.screen === "employees" && <EmployeesScreen refreshToken={refreshToken} onViewAnalytics={employee => navigate("analytics", { mode: "person", value: employee })} />}
          {route.screen === "analytics" && <AnalyticsScreen refreshToken={refreshToken} target={route.target} onBack={route.target ? () => navigate(route.target?.mode === "vehicle" ? "vehicles" : "employees") : undefined} />}
          {route.screen === "settings" && <SettingsScreen onSyncStateChange={() => setRefreshToken(v => v + 1)} />}
        </main>
      </div>
    </div>
  );
}
