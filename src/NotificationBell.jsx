import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import "./NotificationBell.css";

function dedupeNotifications(list) {
  const seen = new Set();
  return list.filter((item) => {
    const key = `${item.user_id}|${item.actor_id || ""}|${item.type}|${item.body || ""}|${item.created_at || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function formatNotificationTime(value) {
  const date = new Date(value);
  const diff = Math.max(0, Date.now() - date.getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "только что";
  if (minutes < 60) return minutes + " мин назад";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + " ч назад";
  const days = Math.floor(hours / 24);
  if (days < 7) return days + " дн назад";
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

function NotificationBell({ user, onMatches }) {
  const [notifications, setNotifications] = useState([]);
  const [actors, setActors] = useState({});
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function loadNotifications() {
    if (!user?.id) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) {
      console.error("Ошибка загрузки уведомлений:", error);
      setLoading(false);
      return;
    }

    const list = dedupeNotifications(data || []);
    setNotifications(list);

    const actorIds = [...new Set(list.map((item) => item.actor_id).filter(Boolean))];
    if (actorIds.length) {
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id,name,avatar_url")
        .in("id", actorIds);

      if (!profilesError) {
        const nextActors = {};
        for (const profile of profiles || []) nextActors[profile.id] = profile;
        setActors(nextActors);
      }
    }

    setLoading(false);
  }

  useEffect(() => {
    loadNotifications();

    if (!user?.id) return undefined;

    const channel = supabase
      .channel("notifications-" + user.id)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: "user_id=eq." + user.id,
        },
        async (payload) => {
          const notification = payload.new;
          let actor = null;

          if (notification.actor_id) {
            const { data } = await supabase
              .from("profiles")
              .select("id,name,avatar_url")
              .eq("id", notification.actor_id)
              .maybeSingle();
            actor = data;
          }

          if (actor) {
            setActors((current) => ({ ...current, [actor.id]: actor }));
          }
          setNotifications((current) => dedupeNotifications([notification, ...current]).slice(0, 30));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.is_read).length,
    [notifications]
  );


  async function respondToLike(item, liked) {
    if (!item?.actor_id || !user?.id) return;
    if (liked) {
      const { error } = await supabase.from("likes").insert({ user_id: user.id, liked_user_id: item.actor_id });
      if (error && error.code !== "23505") { console.error("Не удалось поставить лайк:", error); return; }
      const { data: matchId, error: matchError } = await supabase.rpc("create_match_if_mutual", { target_user_id: item.actor_id });
      if (matchError) console.error("Ошибка создания мэтча:", matchError);
      if (matchId) alert("💕 У вас взаимная симпатия!");
    } else {
      const { error } = await supabase.from("profile_passes").upsert(
        { user_id: user.id, passed_user_id: item.actor_id },
        { onConflict: "user_id,passed_user_id", ignoreDuplicates: true }
      );
      if (error) { console.error("Не удалось скрыть анкету:", error); alert("Не удалось отклонить анкету. Возможно, не выполнена SQL-миграция."); return; }
    }
    await removeNotification(item.id);
  }

  async function markRead(id) {
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", id)
      .eq("user_id", user.id);

    if (!error) {
      setNotifications((current) => current.map((item) => item.id === id ? { ...item, is_read: true } : item));
    }
  }

  async function removeNotification(id) {
    const { error } = await supabase
      .from("notifications")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (!error) {
      setNotifications((current) => current.filter((item) => item.id !== id));
    }
  }

  async function markAllRead() {
    if (!unreadCount) return;

    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", user.id)
      .eq("is_read", false);

    if (!error) {
      setNotifications((current) => current.map((item) => ({ ...item, is_read: true })));
    }
  }

  return (
    <div className="notification-bell">
      <button
        className={"notification-bell-button " + (open ? "open" : "")}
        onClick={() => setOpen((value) => !value)}
        aria-label={"Уведомления" + (unreadCount ? ": " + unreadCount + " новых" : "")}
        title="Уведомления"
      >
        <svg className="notification-bell-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" /></svg>
        {unreadCount > 0 && <span className="notification-badge">{unreadCount > 99 ? "99+" : unreadCount}</span>}
      </button>

      {open && (
        <>
          <button className="notification-overlay" aria-label="Закрыть уведомления" onClick={() => setOpen(false)} />
          <section className="notification-panel">
            <div className="notification-panel-header">
              <div>
                <span className="notification-panel-kicker">ТОК</span>
                <h2>Уведомления</h2>
              </div>
              <button className="notification-read-all" onClick={markAllRead} disabled={!unreadCount}>
                Прочитать всё
              </button>
            </div>

            <div className="notification-list">
              {loading && !notifications.length ? (
                <div className="notification-state"><span className="notification-mini-spinner" />Загружаем...</div>
              ) : notifications.length === 0 ? (
                <div className="notification-empty">
                  <div className="notification-empty-icon">♡</div>
                  <strong>Пока тихо</strong>
                  <p>Здесь появятся лайки и новые сообщения.</p>
                </div>
              ) : (
                notifications.map((item) => {
                  const actor = actors[item.actor_id];
                  return (
                    <div key={item.id} className={"notification-item-wrap " + (item.is_read ? "" : "unread")}>
                      <button className={"notification-item " + (item.is_read ? "" : "unread")}
                        onClick={() => { if (item.type === "message") { markRead(item.id); setOpen(false); onMatches?.(); } else markRead(item.id); }}>
                        <div className="notification-avatar">
                          {actor?.avatar_url ? <img src={actor.avatar_url} alt="" /> : <span>👤</span>}
                        </div>
                        <div className="notification-item-content">
                          <div className="notification-item-top"><strong>{actor?.name || "Пользователь"}</strong>{!item.is_read && <span className="notification-unread-dot" />}</div>
                          <p>{item.body || (item.type === "like" ? "Поставил(а) вам лайк" : "Отправил(а) вам сообщение")}</p>
                          <time>{formatNotificationTime(item.created_at)}</time>
                        </div>
                      </button>
                      {item.type === "like" && item.actor_id && <div className="notification-like-actions">
                        <button className="notification-like-yes" onClick={() => respondToLike(item, true)}>♥ Лайк</button>
                        <button className="notification-like-no" onClick={() => respondToLike(item, false)}>✕ Не интересно</button>
                      </div>}
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export default NotificationBell;
