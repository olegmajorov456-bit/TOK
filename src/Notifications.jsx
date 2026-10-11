import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import "./Notifications.css";

const FILTERS = [
  ["all", "Все"],
  ["unread", "Непрочитанные"],
  ["like", "Лайки"],
  ["match", "Мэтчи"],
  ["message", "Сообщения"],
  ["confession", "Признания"],
  ["achievement", "Достижения"],
];

function Icon({ type, size = 21 }) {
  const paths = {
    heart: "M12 20.5S4 15.9 4 9.8A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 8 2.8c0 6.1-8 10.7-8 10.7Z",
    message: "M4 5.8A2.8 2.8 0 0 1 6.8 3h10.4A2.8 2.8 0 0 1 20 5.8v6.4a2.8 2.8 0 0 1-2.8 2.8H10l-4.8 3.3.9-3.3h-.3A2.8 2.8 0 0 1 3 12.2V5.8Z",
    bell: "M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4",
    match: "M12 20.5S4 15.9 4 9.8A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 8 2.8c0 6.1-8 10.7-8 10.7Z",
    confession: "M12 3v18M5 9h14M7 5h10M7 19h10",
    achievement: "m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.4l6.1-.9L12 3Z",
  };
  const key = type === "message" ? "message" : type === "match" ? "match" : type === "confession" ? "confession" : type === "achievement" ? "achievement" : type === "like" ? "heart" : "bell";
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[key]} /></svg>;
}

function groupNotifications(list) {
  const sorted = [...(list || [])].sort((a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0));
  const groups = [];
  const byKey = new Map();
  for (const item of sorted) {
    const timestamp = Date.parse(item.created_at || "");
    const canGroup = item.type === "message" && Boolean(item.actor_id) && Number.isFinite(timestamp);
    const bodyKey = String(item.body || "").trim().toLocaleLowerCase("ru-RU");
    const key = canGroup
      ? "message|" + item.user_id + "|" + item.actor_id + "|" + bodyKey + "|" + Math.floor(timestamp / 60000)
      : "id|" + item.id;
    const existing = byKey.get(key);
    if (existing) {
      if (item.id && !existing.notificationIds.includes(item.id)) existing.notificationIds.push(item.id);
      existing.eventCount += 1;
      existing.is_read = existing.is_read && Boolean(item.is_read);
      continue;
    }
    const group = { ...item, notificationIds: item.id ? [item.id] : [], eventCount: 1 };
    byKey.set(key, group);
    groups.push(group);
  }
  return groups;
}

function labelFor(item) {
  if (item.type === "message") return "Новое сообщение";
  if (item.type === "match") return "Взаимная симпатия";
  if (item.type === "confession") return "Активность в признаниях";
  if (item.type === "achievement") return "Новое достижение";
  if (item.type === "like") return "Новая симпатия";
  return "Уведомление ТОК";
}

function Notifications({ user, theme = "light", onHome }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      const { data, error: loadError } = await supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100);
      if (!active) return;
      if (loadError) {
        console.error("Ошибка загрузки уведомлений:", loadError);
        setError("Не удалось загрузить уведомления. Проверь подключение и попробуй ещё раз.");
      } else {
        setItems(data || []);
        setError("");
      }
      setLoading(false);
    }
    load();
    const channel = supabase.channel("notification-centre-" + user.id).on("postgres_changes", {
      event: "INSERT", schema: "public", table: "notifications", filter: "user_id=eq." + user.id,
    }, (payload) => {
      if (!active) return;
      setItems((current) => current.some((item) => item.id === payload.new.id) ? current : [payload.new, ...current].slice(0, 100));
    }).subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [user.id]);

  async function markRead(item) {
    const ids = item.notificationIds?.length ? item.notificationIds : [item.id];
    const { error: updateError } = await supabase.from("notifications").update({ is_read: true }).in("id", ids).eq("user_id", user.id);
    if (updateError) {
      setError("Не удалось отметить уведомление прочитанным.");
      return;
    }
    setItems((current) => current.map((row) => ids.includes(row.id) ? { ...row, is_read: true } : row));
  }

  async function markAllRead() {
    const { error: updateError } = await supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
    if (updateError) {
      setError("Не удалось отметить все уведомления.");
      return;
    }
    setItems((current) => current.map((item) => ({ ...item, is_read: true })));
  }

  const groupedItems = useMemo(() => groupNotifications(items), [items]);
  const unread = useMemo(() => groupedItems.filter((item) => !item.is_read).length, [groupedItems]);
  const filtered = useMemo(() => groupedItems.filter((item) => {
    if (filter === "unread") return !item.is_read;
    return filter === "all" || item.type === filter;
  }), [groupedItems, filter]);

  return (
    <div className={"notifications-page tok-theme-" + theme}>
      <main className="notifications-container">
        <header className="notifications-heading">
          <div><span className="notifications-kicker">ВСЁ В ОДНОМ МЕСТЕ</span><h1>Уведомления</h1><p>Лайки, мэтчи и другие события в твоём аккаунте.</p></div>
          <div className="notifications-heading-actions">
            <button type="button" className="notifications-back" onClick={onHome}>← На главную</button>
            {unread > 0 && <button type="button" className="notifications-read-all" onClick={markAllRead}>Прочитать все ({unread})</button>}
          </div>
        </header>
        <div className="notifications-filters">
          {FILTERS.map(([value, label]) => <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{label}</button>)}
        </div>
        {error && <div className="notifications-error" role="alert">{error}<button type="button" onClick={() => setError("")}>×</button></div>}
        {loading ? <div className="notifications-loading"><div className="notifications-spinner" /></div> : filtered.length === 0 ? (
          <section className="notifications-empty"><div className="notifications-empty-icon"><Icon type="bell" size={29} /></div><h2>{filter === "unread" ? "Всё прочитано" : "Пока тихо"}</h2><p>{filter === "unread" ? "Непрочитанных уведомлений больше нет." : "Новые события появятся здесь автоматически."}</p></section>
        ) : (
          <section className="notifications-list">
            {filtered.map((item) => <button type="button" key={item.id} className={"notification-page-item " + (item.is_read ? "" : "unread")} onClick={() => !item.is_read && markRead(item)}>
              <span className={"notification-page-icon " + item.type}><Icon type={item.type} size={19} /></span>
              <span className="notification-page-copy"><strong>{labelFor(item)}{item.eventCount > 1 ? " · " + item.eventCount + " событий" : ""}</strong><span>{item.body || (item.type === "message" ? "Вам отправили сообщение." : item.type === "like" ? "Кто-то поставил вам лайк." : "Есть новости в ТОК.")}</span><small>{new Date(item.created_at).toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</small></span>
              {!item.is_read && <i className="notification-unread-dot" />}
            </button>)}
          </section>
        )}
      </main>
    </div>
  );
}

export default Notifications;
