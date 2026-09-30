import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import "./Notifications.css";

function Icon({ type, size=21 }) {
  const paths = {
    heart: "M12 20.5S4 15.9 4 9.8A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 8 2.8c0 6.1-8 10.7-8 10.7Z",
    message: "M4 5.8A2.8 2.8 0 0 1 6.8 3h10.4A2.8 2.8 0 0 1 20 5.8v6.4a2.8 2.8 0 0 1-2.8 2.8H10l-4.8 3.3.9-3.3h-.3A2.8 2.8 0 0 1 3 12.2V5.8Z",
    bell: "M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4",
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[type]} /></svg>;
}

function Notifications({ user }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50);
    if (!error) setItems(data || []);
    else console.error("Ошибка загрузки уведомлений:", error);
    setLoading(false);
  }

  useEffect(() => { load(); }, [user.id]);

  async function markRead(id) {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id).eq("user_id", user.id);
    setItems((current) => current.map((item) => item.id === id ? { ...item, is_read: true } : item));
  }

  async function markAllRead() {
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
    setItems((current) => current.map((item) => ({ ...item, is_read: true })));
  }

  const filtered = items.filter((item) => filter === "all" || item.type === filter);
  const unread = items.filter((item) => !item.is_read).length;

  return (
    <div className="notifications-page">
      <main className="notifications-container">
        <header className="notifications-heading">
          <div><span className="notifications-kicker">ВСЁ В ОДНОМ МЕСТЕ</span><h1>Уведомления</h1></div>
          {unread > 0 && <button className="notifications-read-all" onClick={markAllRead}>Прочитать все</button>}
        </header>
        <div className="notifications-filters">
          {[["all", "Все"], ["like", "Лайки"], ["message", "Сообщения"]].map(([value, label]) => (
            <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{label}</button>
          ))}
        </div>
        {loading ? <div className="notifications-loading"><div className="notifications-spinner" /></div> : filtered.length === 0 ? (
          <section className="notifications-empty"><div className="notifications-empty-icon"><Icon type="bell" size={29} /></div><h2>Пока тихо</h2><p>Здесь появятся лайки, сообщения и другие события.</p></section>
        ) : (
          <section className="notifications-list">
            {filtered.map((item) => (
              <button key={item.id} className={"notification-page-item " + (item.is_read ? "" : "unread")} onClick={() => !item.is_read && markRead(item.id)}>
                <span className={"notification-page-icon " + item.type}><Icon type={item.type === "message" ? "message" : "heart"} size={19} /></span>
                <span className="notification-page-copy"><strong>{item.type === "message" ? "Новое сообщение" : "Новая симпатия"}</strong><span>{item.body || (item.type === "message" ? "Вам отправили сообщение." : "Кто-то поставил вам лайк.")}</span><small>{new Date(item.created_at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</small></span>
                {!item.is_read && <i className="notification-unread-dot" />}
              </button>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}

export default Notifications;
