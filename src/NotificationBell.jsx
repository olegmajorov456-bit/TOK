import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import "./NotificationBell.css";

function dedupeNotifications(list) {
  const seen = new Set();
  return list.filter((item) => {
    const key = item.id ? String(item.id) : `${item.user_id}|${item.actor_id || ""}|${item.type}|${item.body || ""}|${item.created_at || ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
      ? "message|" + item.user_id + "|" + item.actor_id + "|" + bodyKey + "|" + Math.floor(timestamp / 30000)
      : "id|" + item.id;
    const existing = byKey.get(key);
    if (existing) {
      if (item.id && !existing._notificationIds.includes(item.id)) existing._notificationIds.push(item.id);
      existing._eventCount += 1;
      existing.is_read = existing.is_read && Boolean(item.is_read);
      continue;
    }
    const group = { ...item, _notificationIds: item.id ? [item.id] : [], _eventCount: 1 };
    byKey.set(key, group);
    groups.push(group);
  }
  return groups;
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

function NotificationBell({ user, onMatches, onAllNotifications }) {
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

          // Android WebView exposes a native bridge so incoming Supabase realtime
          // events can create a system notification while TOK is open.
          const title = actor?.name
            ? (notification.type === "message" ? "Новое сообщение от " : "Новая симпатия от ") + actor.name
            : (notification.type === "message" ? "Новое сообщение в ТОК" : "Новое уведомление в ТОК");
          const body = notification.body || (notification.type === "like" ? "Кто-то поставил тебе лайк 💗" : "Тебе написали сообщение");
          try {
            if (window.TOKNative?.showNotification) {
              window.TOKNative.showNotification(title, body);
            } else if ("Notification" in window && Notification.permission === "granted" && document.visibilityState !== "visible") {
              new Notification(title, { body, icon: "/tok-logo.png", tag: "tok-" + notification.id });
            }
          } catch (notificationError) {
            console.debug("Системное уведомление недоступно:", notificationError);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const groupedNotifications = useMemo(() => groupNotifications(notifications), [notifications]);
  const unreadCount = useMemo(
    () => groupedNotifications.filter((item) => !item.is_read).length,
    [groupedNotifications]
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
    await removeNotification(item);
  }

  async function markRead(item) {
    const ids = item?._notificationIds?.length ? item._notificationIds : [item?.id].filter(Boolean);
    if (!ids.length) return;
    const { error } = await supabase.from("notifications").update({ is_read: true }).in("id", ids).eq("user_id", user.id);
    if (!error) {
      setNotifications((current) => current.map((row) => ids.includes(row.id) ? { ...row, is_read: true } : row));
    }
  }

  async function removeNotification(item) {
    const ids = item?._notificationIds?.length ? item._notificationIds : [item?.id].filter(Boolean);
    if (!ids.length) return;
    const { error } = await supabase.from("notifications").delete().in("id", ids).eq("user_id", user.id);
    if (!error) setNotifications((current) => current.filter((row) => !ids.includes(row.id)));
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
                groupedNotifications.map((item) => {
                  const actor = actors[item.actor_id];
                  return (
                    <div key={item.id} className={"notification-item-wrap " + (item.is_read ? "" : "unread")}>
                      <button className={"notification-item " + (item.is_read ? "" : "unread")}
                        onClick={() => { if (item.type === "message") { markRead(item); setOpen(false); onMatches?.(); } else markRead(item); }}>
                        <div className="notification-avatar">
                          {actor?.avatar_url ? <img src={actor.avatar_url} alt="" /> : <span>👤</span>}
                        </div>
                        <div className="notification-item-content">
                          <div className="notification-item-top"><strong>{actor?.name || "Пользователь"}</strong>{item._eventCount > 1 && <span className="notification-group-count">×{item._eventCount}</span>}{!item.is_read && <span className="notification-unread-dot" />}</div>
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
            <div className="notification-panel-footer">
              <button type="button" onClick={() => { setOpen(false); onAllNotifications?.(); }}>Открыть центр уведомлений <span>↗</span></button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export default NotificationBell;
