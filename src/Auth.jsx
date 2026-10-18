import { useState } from "react";
import Logo from "./Logo";
import { supabase } from "./supabaseClient";
import "./Auth.css";

function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [forgotMode, setForgotMode] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState("");
  const theme = localStorage.getItem("tok-theme") || "light";

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      setMessage("Введите корректный email.");
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setMessage("Пароль должен содержать минимум 6 символов.");
      setLoading(false);
      return;
    }

    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
      if (error) setMessage(error.message);
    } else {
      if (!privacyAccepted) {
        setMessage("Для регистрации необходимо принять Политику конфиденциальности.");
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.auth.signUp({ email: normalizedEmail, password });
      if (error) setMessage(error.message);
      else if (!data.session) setVerificationEmail(normalizedEmail);
      else setMessage("Регистрация прошла успешно!");
    }

    setLoading(false);
  }

  async function handleResendVerification() {
    setLoading(true);
    setMessage("");
    const { error } = await supabase.auth.resend({ type: "signup", email: verificationEmail });
    setMessage(error ? error.message : "Письмо отправлено повторно. Проверь почту.");
    setLoading(false);
  }

  async function handleForgotPassword(event) {
    event.preventDefault();
    if (!email.trim()) {
      setMessage("Введите email, на который зарегистрирован аккаунт.");
      return;
    }

    setLoading(true);
    setMessage("");

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    });

    if (error) {
      console.error(error);
      setMessage(error.message);
    } else {
      setMessage("Письмо для восстановления пароля отправлено. Проверьте почту и перейдите по ссылке.");
    }

    setLoading(false);
  }

  if (verificationEmail) {
    return (
      <div className={"auth-page tok-auth-" + theme}>
        <div className="auth-card auth-verification-card">
          <Logo className="auth-logo" />
          <div className="auth-mail-icon" aria-hidden="true">✉</div>
          <h2>Проверь почту</h2>
          <p className="auth-subtitle">Мы отправили письмо для подтверждения адреса</p>
          <div className="auth-verification-email">{verificationEmail}</div>
          <p className="auth-verification-help">Открой письмо от ТОК и нажми на ссылку подтверждения. Если письма нет, проверь папку «Спам».</p>
          <button className="auth-verification-resend" type="button" disabled={loading} onClick={handleResendVerification}>{loading ? "Отправляем..." : "Отправить письмо ещё раз"}</button>
          {message && <p className="auth-message">{message}</p>}
          <button className="switch-button" type="button" onClick={() => { setVerificationEmail(""); setMessage(""); setIsLogin(true); }}>← Вернуться ко входу</button>
        </div>
      </div>
    );
  }
  if (forgotMode) {
    return (
      <div className={`auth-page tok-auth-${theme}`}>
        <div className="auth-card">
          <Logo className="auth-logo" />
          <h2>Восстановление пароля</h2>
          <p className="auth-subtitle">Введите email своего аккаунта</p>
          <form onSubmit={handleForgotPassword}>
            <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <button type="submit" disabled={loading}>{loading ? "Отправляем..." : "Отправить письмо"}</button>
          </form>
          {message && <p className="auth-message">{message}</p>}
          <button className="switch-button" onClick={() => { setForgotMode(false); setMessage(""); }}>← Вернуться ко входу</button>
        </div>
      </div>
    );
  }

  return (
    <div className={`auth-page tok-auth-${theme}`}>
      <div className="auth-card">
        <Logo className="auth-logo" />
        <h2>{isLogin ? "Вход" : "Регистрация"}</h2>
        <p className="auth-subtitle">Знакомства внутри ИГЭУ</p>
        <form onSubmit={handleSubmit}>
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <div className="auth-password-wrap"><input type={showPassword ? "text" : "password"} placeholder="Пароль" value={password} onChange={(e) => setPassword(e.target.value)} minLength="6" required /><button type="button" className="auth-password-toggle" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}>{showPassword ? "Скрыть" : "Показать"}</button></div>

          {!isLogin && (
            <label className="privacy-check">
              <input
                type="checkbox"
                checked={privacyAccepted}
                onChange={(e) => setPrivacyAccepted(e.target.checked)}
              />
              <span>
                Я принимаю{" "}
                <a href="/privacy" target="_blank" rel="noopener noreferrer">
                  Политику конфиденциальности
                </a>
              </span>
            </label>
          )}

          <button type="submit" disabled={loading}>{loading ? "Подождите..." : isLogin ? "Войти" : "Зарегистрироваться"}</button>
        </form>
        {isLogin && <button className="switch-button" onClick={() => { setForgotMode(true); setMessage(""); }}>Забыли пароль?</button>}
        {message && <p className="auth-message">{message}</p>}
        <button className="switch-button" onClick={() => { setIsLogin(!isLogin); setPrivacyAccepted(false); setMessage(""); }}>
          {isLogin ? "Нет аккаунта? Зарегистрироваться" : "Уже есть аккаунт? Войти"}
        </button>
      </div>
    </div>
  );
}

export default Auth;