import { useCallback, useEffect, useRef, useState } from "react";
import ChatTabs from "./ChatTabs";
import { supabase } from "./supabaseClient";
import "./Matches.css";

function Matches({ user, onHome, onOpenChat, onRooms, theme = "light" }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [chatPreview, setChatPreview] = useState({});
  const [loadError, setLoadError] = useState("");
  const requestInFlightRef = useRef(false);
  const refreshQueuedRef = useRef(false);
  const queuedShowLoadingRef = useRef(false);
  const mountedRef = useRef(false);

  const loadMatches = useCallback(async function loadMatchesImpl(showLoading = false) {
    if (!user?.id) {
      if (mountedRef.current) {
        setMatches([]);
        setChatPreview({});
        setLoading(false);
      }
      return;
    }

    // Do not drop realtime refreshes that arrive while a previous query is running.
    if (requestInFlightRef.current) {
      refreshQueuedRef.current = true;
      queuedShowLoadingRef.current = queuedShowLoadingRef.current || showLoading;
      return;
    }

    requestInFlightRef.current = true;
    if (showLoading && mountedRef.current) setLoading(true);

    try {
      const { data: matchRows, error: matchError } = await supabase
        .from("matches")
        .select("*")
        .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
        .order("created_at", { ascending: false });

      if (matchError) throw matchError;
      const matchList = matchRows || [];
      if (mountedRef.current) setLoadError("");

      if (!matchList.length) {
        if (mountedRef.current) {
          setMatches([]);
          setChatPreview({});
        }
        return;
      }

      const otherUserIds = [...new Set(matchList.map((match) =>
        match.user1_id === user.id ? match.user2_id : match.user1_id
      ).filter(Boolean))];

      // Select all columns: older database schemas may not contain optional
      // profile fields such as age/faculty/course. A missing column must never
      // make the whole matches list disappear.
      const { data: profileRows, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .in("id", otherUserIds);

      if (profilesError) console.warn("Не удалось загрузить часть профилей мэтчей:", profilesError);

      // Chat previews are enhancement-only. A missing conversation/message policy
      // must not hide the match cards themselves.
      let conversationRows = [];
      let messageRows = [];
      const matchIds = matchList.map((match) => match.id).filter((id) => id != null);
      if (matchIds.length) {
        const { data, error } = await supabase
          .from("conversations")
          .select("id,match_id")
          .in("match_id", matchIds);
        if (error) console.warn("Не удалось загрузить список переписок:", error);
        else conversationRows = data || [];
      }

      const conversationIds = conversationRows.map((item) => item.id).filter(Boolean);
      if (conversationIds.length) {
        const { data, error } = await supabase
          .from("messages")
          .select("conversation_id,body,image_url,created_at,sender_id")
          .in("conversation_id", conversationIds)
          .order("created_at", { ascending: false })
          .limit(Math.max(100, conversationIds.length * 30));
        if (error) console.warn("Не удалось загрузить превью сообщений:", error);
        else messageRows = data || [];
      }

      const profilesById = new Map((profileRows || []).map((profile) => [profile.id, profile]));
      const lastMessageByConversation = new Map();
      for (const message of messageRows) {
        if (!lastMessageByConversation.has(message.conversation_id)) {
          lastMessageByConversation.set(message.conversation_id, message);
        }
      }

      const conversationByMatch = new Map();
      for (const conversation of conversationRows) {
        if (conversation.match_id != null) conversationByMatch.set(conversation.match_id, conversation);
      }

      const nextPreviews = {};
      const result = matchList.map((match) => {
        const otherUserId = match.user1_id === user.id ? match.user2_id : match.user1_id;
        // Keep a match visible even if profile RLS/data temporarily fails.
        const profile = profilesById.get(otherUserId) || {
          id: otherUserId,
          name: "Пользователь",
          avatar_url: null,
        };
        const conversation = conversationByMatch.get(match.id);
        const preview = conversation ? lastMessageByConversation.get(conversation.id) : null;
        if (preview) nextPreviews[match.id] = preview;
        return {
          ...match,
          profile,
          _lastActivityAt: preview?.created_at || match.created_at || "",
        };
      }).sort((a, b) => {
        const aTime = Date.parse(a._lastActivityAt) || 0;
        const bTime = Date.parse(b._lastActivityAt) || 0;
        return bTime - aTime;
      });

      if (mountedRef.current) {
        setMatches(result);
        setChatPreview(nextPreviews);
      }
    } catch (error) {
      // Leave the current list on screen during transient errors instead of
      // replacing it with an empty list.
      console.error("Ошибка загрузки мэтчей:", error);
      if (mountedRef.current) setLoadError("Не удалось обновить чаты. Проверь соединение и попробуй ещё раз.");
    } finally {
      requestInFlightRef.current = false;
      if (mountedRef.current) setLoading(false);
      if (refreshQueuedRef.current) {
        const nextShowLoading = queuedShowLoadingRef.current;
        refreshQueuedRef.current = false;
        queuedShowLoadingRef.current = false;
        Promise.resolve().then(() => loadMatchesImpl(nextShowLoading));
      }
    }
  }, [user?.id]);

  useEffect(() => {
    mountedRef.current = true;
    loadMatches(true);

    if (!user?.id) {
      return () => { mountedRef.current = false; };
    }

    const channel = supabase
      .channel("matches-list-" + user.id)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "matches",
      }, (payload) => {
        const row = payload.new || payload.old;
        if (!row || row.user1_id === user.id || row.user2_id === user.id) loadMatches(false);
      })
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "messages",
      }, () => loadMatches(false))
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("Realtime списка чатов временно недоступен:", status);
        }
      });

    const onFocus = () => loadMatches(false);
    const onVisible = () => {
      if (document.visibilityState === "visible") loadMatches(false);
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    // A low-frequency fallback keeps chat order correct if a realtime connection drops.
    const refreshInterval = window.setInterval(() => {
      if (document.visibilityState === "visible") loadMatches(false);
    }, 45000);

    return () => {
      mountedRef.current = false;
      window.clearInterval(refreshInterval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [user?.id, loadMatches]);

  if (loading && matches.length === 0) {
    return (
      <div className={`matches-page tok-theme-${theme}`}>
        <div className="matches-loading">
          <div className="matches-spinner" />
          <p>Загружаем чаты...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`matches-page tok-theme-${theme}`}>
      <main className="matches-container">
        <div className="matches-heading">
          <ChatTabs active="personal" onPersonal={() => {}} onRooms={onRooms} />
          <button type="button" className={"matches-refresh" + (loading ? " is-loading" : "")} onClick={() => loadMatches(true)} disabled={loading} aria-label="Обновить чаты" title="Обновить чаты">↻</button>
        </div>

        {matches.length === 0 ? (
          <div className="matches-empty">
            <div className="matches-empty-icon">{loadError ? "↻" : "💕"}</div>
            <h2>{loadError ? "Чаты пока не загрузились" : "Пока нет мэтчей"}</h2>
            <p>{loadError || "Лайкай понравившихся людей в разделе знакомств. Если симпатия взаимна — человек появится здесь."}</p>
            {loadError ? (
              <button onClick={() => loadMatches(true)} className="matches-home-button">Попробовать ещё раз</button>
            ) : (
              <button onClick={onHome} className="matches-home-button">Перейти домой</button>
            )}
          </div>
        ) : (
          <div className="matches-list" aria-label="Чаты по последней активности">
            {matches.map((match) => {
              const profile = match.profile;
              const preview = chatPreview[match.id];
              const previewText = preview?.body || (preview?.image_url ? "📷 Фото" : "Начать общение");
              return (
                <button key={match.id} className="match-card" onClick={() => onOpenChat({ match, profile })}>
                  <div className="match-avatar">
                    {profile.avatar_url ? <img src={profile.avatar_url} alt={profile.name || "Профиль"} /> : <span>👤</span>}
                  </div>
                  <div className="match-info">
                    <div className="match-name-row"><strong>{profile.name || "Пользователь"}</strong></div>
                    <span>{previewText}</span>
                  </div>
                  <div className="match-chat-icon">›</div>
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

export default Matches;