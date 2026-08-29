import React, { useState } from "react";
import { Input, Button, Checkbox } from "../components/ui";

interface LoginScreenProps {
  onLogin: (login: string, password: string) => Promise<void>;
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!login || !password) {
      setError("Введите логин и пароль");
      return;
    }
    setError("");
    setLoading(true);
    try { await onLogin(login, password); }
    catch (error) { setError(error instanceof Error ? error.message : "Не удалось войти"); }
    finally { setLoading(false); }
  };

  const eyeIcon = (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      {showPw ? (
        <>
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M1 1l22 22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </>
      ) : (
        <>
          <path d="M1 12S5 4 12 4s11 8 11 8-4 8-11 8S1 12 1 12Z" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
        </>
      )}
    </svg>
  );

  return (
    <div className="min-h-screen bg-[#F3F4F6] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-[#E5E7EB] px-8 py-10">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-[#243746] flex items-center justify-center text-white font-bold text-xl mb-4">
              КР
            </div>
            <h1 className="text-2xl font-semibold text-[#243746]">Контроль эффективности</h1>
            <p className="text-sm text-[#6B7280] text-center mt-2 leading-snug">
              Разнарядка показывает план, ГЛОНАСС — фактическую работу
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              label="Логин"
              placeholder="Логин"
              value={login}
              onChange={e => setLogin(e.target.value)}
              error={error && !login ? " " : undefined}
              autoComplete="username"
            />
            <Input
              label="Пароль"
              placeholder="••••••••"
              type={showPw ? "text" : "password"}
              value={password}
              onChange={e => setPassword(e.target.value)}
              error={error && !password ? " " : undefined}
              rightIcon={eyeIcon}
              onRightIconClick={() => setShowPw(v => !v)}
              autoComplete="current-password"
            />

            {error && (
              <div className="bg-[#FDE8E6] border border-[#C43D32]/20 rounded-md px-3 py-2 text-sm text-[#C43D32]">
                {error}
              </div>
            )}

            <Checkbox label="Запомнить меня" checked={remember} onChange={setRemember} />

            <Button type="submit" className="w-full justify-center" loading={loading}>
              Войти
            </Button>
          </form>

        </div>
      </div>
    </div>
  );
}
