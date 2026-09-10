import { useState } from "react";
import { supabase } from "./supabaseClient";
import "./Auth.css";

function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [forgotMode, setForgotMode] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMessage(error.message);
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setMessage(error.message);
      else setMessage("Регистрация прошла успешно! Проверьте почту, если подтверждение включено.");
    }

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

  if (forgotMode) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <img className="auth-logo" src="/tok-logo.png" alt="ТОК" />
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
    <div className="auth-page">
      <div className="auth-card">
        <img className="auth-logo" src="/tok-logo.png" alt="ТОК" />
        <h2>{isLogin ? "Вход" : "Регистрация"}</h2>
        <p className="auth-subtitle">Знакомства внутри ИГЭУ</p>
        <form onSubmit={handleSubmit}>
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input type="password" placeholder="Пароль" value={password} onChange={(e) => setPassword(e.target.value)} minLength="6" required />
          <button type="submit" disabled={loading}>{loading ? "Подождите..." : isLogin ? "Войти" : "Зарегистрироваться"}</button>
        </form>
        {isLogin && <button className="switch-button" onClick={() => { setForgotMode(true); setMessage(""); }}>Забыли пароль?</button>}
        {message && <p className="auth-message">{message}</p>}
        <button className="switch-button" onClick={() => { setIsLogin(!isLogin); setMessage(""); }}>
          {isLogin ? "Нет аккаунта? Зарегистрироваться" : "Уже есть аккаунт? Войти"}
        </button>
      </div>
    </div>
  );
}

export default Auth;