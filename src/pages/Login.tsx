import { useState } from "react";
import {
  ArrowRight,
  Building2,
  CheckCheck,
  ClipboardList,
  HardHat,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { backend } from "../api";
import { demoProfiles } from "../demo";
import { roleName, initials } from "../utils/format";
import { Brand } from "../components/ui";

export function Login({
  onLogin,
  busy,
  error,
}: {
  onLogin: (email: string, password: string) => Promise<boolean>;
  busy: boolean;
  error: string;
}) {
  // В рабочем режиме вход выполняется по выданным администратором данным
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return (
    <div className="login-shell">
      <section className="login-story">
        <Brand />
        <div>
          <span className="eyebrow">ОТ ПЛАНА — К РЕЗУЛЬТАТУ</span>
          <h1>
            Каждый объект.
            <br />
            Каждая задача.
            <br />
            <em>Под контролем.</em>
          </h1>
          <p>
            Назначайте работы, следите за выполнением и принимайте результат в
            одном пространстве.
          </p>
        </div>
        <div className="login-steps">
          <span>
            <Building2 />
            Объекты
          </span>
          <i />
          <span>
            <ClipboardList />
            Задачи
          </span>
          <i />
          <span>
            <CheckCheck />
            Результат
          </span>
        </div>
        <small>СТРОЙКА / РАБОЧЕЕ ПРОСТРАНСТВО</small>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <span className="login-icon">
            <HardHat size={28} />
          </span>
          <h2>
            {backend?.mode === "demo"
              ? "Посмотрите, как всё устроено"
              : "С возвращением"}
          </h2>
          <p>
            {backend?.mode === "demo"
              ? "Выберите роль и попробуйте полный цикл задачи."
              : "Войдите в рабочее пространство вашей команды."}
          </p>
          {error && (
            <div className="alert" role="alert">
              {error}
            </div>
          )}
          {backend?.mode === "demo" ? (
            <>
              <div className="demo-login-label">
                ДЕМО · БЕЗ ПОДКЛЮЧЕНИЯ К БАЗЕ
              </div>
              <div className="demo-accounts">
                {demoProfiles.map((p) => (
                  <button
                    key={p.id}
                    disabled={busy}
                    onClick={() => void onLogin(p.id, "")}
                  >
                    <span className="avatar">{initials(p.display_name)}</span>
                    <span>
                      <strong>{p.display_name}</strong>
                      <small>{roleName(p)}</small>
                    </span>
                    <ArrowRight size={18} />
                  </button>
                ))}
              </div>
              <p className="login-footnote">
                Изменения останутся в этом браузере. Этот режим предназначен
                только для знакомства с интерфейсом.
              </p>
            </>
          ) : (
            <>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void onLogin(email.trim(), password);
                }}
              >
                <label>
                  Email
                  <input
                    type="email"
                    required
                    autoComplete="username"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.ru"
                  />
                </label>
                <label>
                  Пароль
                  <input
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Введите пароль"
                  />
                </label>
                <button className="primary login-submit" disabled={busy}>
                  {busy ? (
                    <Loader2 className="spin" size={18} />
                  ) : (
                    <>
                      Войти
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>
              </form>
              <p className="login-footnote">
                <ShieldCheck size={16} />
                Учётные записи выдаёт администратор.
                <br />
                Самостоятельная регистрация закрыта.
              </p>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
