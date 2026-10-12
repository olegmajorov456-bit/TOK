import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabaseClient";
import "./Matches.css";

function Matches({ user, onHome, onOpenChat, theme = "light" }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [chatPreview, setChatPreview] = useState({});
  const reloadRef = useRef(false);
  const mountedRef = useRef(true);

  const loadMatches = useCallback(async (showLoading = false) => {
    if (!user?.id) return;
    if (reloadRef.current) return;
    reloadRef.current = true;
    if (showLoading) setLoading(true);
    try {
      const { data, error } = await supabase
        .from("matches")
        .select("*")
        .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
        .order("created_at", { ascending: false });

      if (error) throw error;
      const matchList = data || [];
      if (!matchList.length) {
        if (mountedRef.current) {
          setMatches([]);
          setChatPreview({});
        }
        return;
      }

      const otherUserIds = matchList.map((match) =>
        match.user1_id === user.id ? match.user2_id : match.user1_id
      );
      const [{ data: profiles, error: profilesError }, { data: conversations, error: conversationsError }] = await Promise.all([
        supabase.from("profiles").select("id,name,avatar_url,age,faculty,course").in("id", otherUserIds),
        supabase.from("conversations").select("id,match_id").in("match_id", matchList.map((match) => match.id)),
      ]);
      if (profilesError) throw profilesError;
      if (conversationsError) throw conversationsError;

      const conversationList = conversations || [];
      const conversationIds = conversationList.map((item) => item.id);
      let recentMessages = [];
      if (conversationIds.length) {
        const { data: messages, error: messagesError } = await supabase
          .from("messages")
          .select("conversation_id,body,image_url,created_at,sender_id")
          .in("conversation_id", conversationIds)
          .order("created_at", { ascending: false });
        if (messagesError) throw messagesError;
        recentMessages = messages || [];
      }

      const previewByConversation = {};
      for (const message of recentMessages) {
        if (!previewByConversation[message.conversation_id]) {
          previewByConversation[message.conversation_id] = message;
        }
      }
      const conversationByMatch = {};
      for (const conversation of conversationList) {
        conversationByMatch[conversation.match_id] = conversation;
      }

      const nextPreviews = {};
      const result = matchList.map((match) => {
        const otherUserId = match.user1_id === user.id ? match.user2_id : match.user1_id;
        const profile = (profiles || []).find((item) => item.id === otherUserId);
        const conversation = conversationByMatch[match.id];
        const preview = conversation ? previewByConversation[conversation.id] : null;
        if (preview) nextPreviews[match.id] = preview;
        return {
          ...match,
          profile,
          _lastActivityAt: preview?.created_at || match.created_at || "",
        };
      }).filter((match) => match.profile)
        .sort((a, b) => Date.parse(b._lastActivityAt || 0) - Date.parse(a._lastActivityAt || 0));

      if (mountedRef.current) {
        setMatches(result);
        setChatPreview(nextPreviews);
      }
    } catch (error) {
      console.error("Ошибка загрузки чатов:", error);
    } finally {
      reloadRef.current = false;
      if (mountedRef.current) setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    mountedRef.current = true;
    loadMatches(true);

    if (!user?.id) return () => { mountedRef.current = false; };

    const channel = supabase.channel("matches-list-" + user.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "matches" }, (payload) => {
        const row = payload.new;
        if (row?.user1_id === user.id || row?.user2_id === user.id) loadMatches(false);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => {
        // New messages reorder conversations so the most recently active chat stays on top.
        loadMatches(false);
      })
      .subscribe();

    const onFocus = () => loadMatches(false);
    window.addEventListener("focus", onFocus);
    const onVisible = () => { if (document.visibilityState === "visible") loadMatches(false); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      mountedRef.current = false;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [user?.id, loadMatches]);

  if (loading) {
    return <div className={`matches-page tok-theme-${theme}`}><div className="matches-loading"><div className="matches-spinner" /><p>Загружаем чаты...</p></div></div>;
  }

  return (
    <div className={`matches-page tok-theme-${theme}`}>
      <main className="matches-container">
        <div className="matches-heading">
          <div>
            <span className="matches-kicker">ОБЩАЯ СИМПАТИЯ</span>
            <h1>Чаты <span className="matches-title-heart">♡</span></h1>
            <p>Последние сообщения — сверху.</p>
          </div>
        </div>
        {matches.length === 0 ? (
          <div className="matches-empty">
            <div className="matches-empty-icon">💕</div>
            <h2>Пока нет мэтчей</h2>
            <p>Лайкай понравившихся людей в разделе знакомств. Если симпатия взаимна — человек появится здесь.</p>
            <button onClick={onHome} className="matches-home-button">Перейти домой</button>
          </div>
        ) : (
          <div className="matches-list">
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
