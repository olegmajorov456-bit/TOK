import { useState } from "react";
import { supabase } from "./supabaseClient";
import "./Auth.css";

function PasswordReset() {
  const [password, setPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");

    if (password.length < 6) {
      setMessage("Пароль должен содержать минимум 6 символов.");
      return;
    }

    if (password !== repeatPassword) {
      setMessage("Пароли не совпадают.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      console.error(error);
      setMessage(error.message);
    } else {
      setSuccess(true);
      setMessage("Пароль успешно изменён!");
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    setLoading(false);
  }

  return (
    <div className={`auth-page tok-auth-${localStorage.getItem("tok-theme") || "light"}`}>
      <div className="auth-card">
        <img className="auth-logo" src="/tok-logo.png" alt="ТОК" />
        <h2>Новый пароль</h2>
        <p className="auth-subtitle">Придумайте новый пароль для аккаунта</p>

        {!success ? (
          <form onSubmit={handleSubmit}>
            <input type="password" placeholder="Новый пароль" value={password} onChange={(e) => setPassword(e.target.value)} minLength="6" required />
            <input type="password" placeholder="Повторите пароль" value={repeatPassword} onChange={(e) => setRepeatPassword(e.target.value)} minLength="6" required />
            <button type="submit" disabled={loading}>{loading ? "Сохраняем..." : "Изменить пароль"}</button>
          </form>
        ) : (
          <button type="button" onClick={() => window.location.href = "/"}>Перейти в ТОК</button>
        )}

        {message && <p className="auth-message">{message}</p>}
      </div>
    </div>
  );
}

export default PasswordReset;
