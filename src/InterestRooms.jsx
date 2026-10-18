import { useEffect, useRef, useState } from "react";
import ChatTabs from "./ChatTabs";
import { supabase } from "./supabaseClient";
import "./InterestRooms.css";

function timeLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function InterestRooms({ user, theme = "light", onHome, onPersonal }) {
  const [rooms, setRooms] = useState([]);
  const [joinedIds, setJoinedIds] = useState([]);
  const [activeRoom, setActiveRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [joiningId, setJoiningId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const bottomRef = useRef(null);
  const requestRef = useRef(0);

  async function loadRooms() {
    setLoading(true);
    setError("");
    const [roomResult, membershipResult] = await Promise.all([
      supabase.from("interest_rooms").select("id,slug,name,description,icon").order("name", { ascending: true }),
      supabase.from("interest_room_members").select("room_id").eq("user_id", user.id),
    ]);
    if (roomResult.error || membershipResult.error) {
      console.error("Не удалось загрузить комнаты интересов:", roomResult.error || membershipResult.error);
      setError("Комнаты пока не подключены. Один раз выполни SQL-миграцию supabase/migrations/20261011_social_features.sql в SQL Editor Supabase.");
      setRooms([]);
      setJoinedIds([]);
    } else {
      setRooms(roomResult.data || []);
      setJoinedIds((membershipResult.data || []).map((item) => item.room_id));
    }
    setLoading(false);
  }

  useEffect(() => { loadRooms(); }, [user.id]);

  async function refreshMessages(roomId, requestId) {
    const { data, error: loadError } = await supabase
      .from("interest_room_messages_feed")
      .select("id,room_id,is_mine,body,created_at")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true })
      .limit(250);
    if (requestRef.current !== requestId) return;
    if (loadError) {
      console.error("Не удалось загрузить сообщения комнаты:", loadError);
      setError("Не удалось обновить сообщения. Проверь подключение.");
      return;
    }
    setMessages(data || []);
  }

  useEffect(() => {
    if (!activeRoom) return undefined;
    const requestId = ++requestRef.current;
    setMessages([]);
    setError("");
    refreshMessages(activeRoom.id, requestId);
    const timer = window.setInterval(() => refreshMessages(activeRoom.id, requestId), 2200);
    return () => {
      window.clearInterval(timer);
      requestRef.current += 1;
    };
  }, [activeRoom?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  async function enterRoom(room) {
    setError("");
    setNotice("");
    if (joinedIds.includes(room.id)) {
      setActiveRoom(room);
      return;
    }
    setJoiningId(room.id);
    const { error: joinError } = await supabase.from("interest_room_members").insert({ room_id: room.id, user_id: user.id });
    if (joinError && joinError.code !== "23505") {
      console.error("Не удалось вступить в комнату:", joinError);
      setError("Не удалось вступить в комнату. Попробуй ещё раз.");
      setJoiningId(null);
      return;
    }
    setJoinedIds((current) => current.includes(room.id) ? current : [...current, room.id]);
    setActiveRoom(room);
    setNotice("Ты в комнате «" + room.name + "». Общайся уважительно и не публикуй личные данные.");
    setJoiningId(null);
  }

  async function leaveRoom(room) {
    const { error: leaveError } = await supabase.from("interest_room_members").delete().eq("room_id", room.id).eq("user_id", user.id);
    if (leaveError) {
      setError("Не удалось выйти из комнаты.");
      return;
    }
    setJoinedIds((current) => current.filter((id) => id !== room.id));
    setActiveRoom(null);
    setMessages([]);
    setNotice("Ты вышел из комнаты «" + room.name + "».");
  }

  async function sendMessage(event) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || !activeRoom || sending) return;
    setSending(true);
    setError("");
    const { error: sendError } = await supabase.from("interest_room_messages")
      .insert({ room_id: activeRoom.id, sender_id: user.id, body });
    if (sendError) {
      console.error("Не удалось отправить сообщение в комнату:", sendError);
      setError("Сообщение не отправлено. Проверь соединение и убедись, что ты состоишь в этой комнате.");
    } else {
      setDraft("");
      await refreshMessages(activeRoom.id, requestRef.current);
    }
    setSending(false);
  }

  return (
    <div className={"interest-rooms-page tok-theme-" + theme}>
      <main className="interest-rooms-container">
        {!activeRoom ? <>
          <header className="interest-rooms-heading">
            <ChatTabs active="rooms" onPersonal={onPersonal} onRooms={() => {}} />
            <button type="button" className="interest-rooms-refresh" onClick={loadRooms} disabled={loading}>↻ Обновить</button>
          </header>
          {notice && <div className="interest-rooms-notice" role="status">{notice}<button type="button" onClick={() => setNotice("")}>×</button></div>}
          {error && <div className="interest-rooms-error" role="alert">{error}</div>}
          {loading ? <div className="interest-rooms-loading"><span />Загружаем сообщества…</div> : rooms.length === 0 ? <section className="interest-rooms-empty"><span>💬</span><h2>Комнаты скоро появятся</h2><p>Проверь SQL-миграцию и обнови страницу.</p></section> : <>
            <section className="interest-rooms-hero"><div className="interest-rooms-hero-icon">🤝</div><div><strong>Твой круг по интересам</strong><p>Каждая комната — общий чат студентов. Вступай и участвуй в обсуждениях.</p></div></section>
            <div className="interest-rooms-list">
              {rooms.map((room) => {
                const joined = joinedIds.includes(room.id);
                return <article className="interest-room-card" key={room.id}>
                  <div className={"interest-room-icon " + (joined ? "joined" : "")}>{room.icon || "💬"}</div>
                  <div className="interest-room-copy"><div className="interest-room-title-row"><h2>{room.name}</h2>{joined && <span className="interest-room-member-pill">Ты участник</span>}</div><p>{room.description}</p><small>Групповой чат · {room.slug === "general" ? "для всех" : "по интересам"}</small></div>
                  <button type="button" className={"interest-room-action " + (joined ? "secondary" : "")} onClick={() => enterRoom(room)} disabled={joiningId === room.id}>{joiningId === room.id ? "…" : joined ? "Открыть →" : "Вступить +"}</button>
                </article>;
              })}
            </div>
          </>}
          <p className="interest-rooms-footnote">В групповом чате имя собеседника скрыто — сообщения подписываются как «Студент». Не отправляй пароли, адреса и другие личные данные.</p>
        </> : <>
          <header className="interest-room-chat-header">
            <button type="button" onClick={() => { setActiveRoom(null); setError(""); }} aria-label="Все комнаты">←</button>
            <div className="interest-room-icon active">{activeRoom.icon || "💬"}</div>
            <div className="interest-room-chat-title"><strong>{activeRoom.name}</strong><span>Комната по интересам · общий чат</span></div>
            <button type="button" className="interest-room-leave" onClick={() => leaveRoom(activeRoom)}>Выйти</button>
          </header>
          <div className="interest-room-guideline">Участники общаются под псевдонимами. Будь вежливым и не делись личной информацией.</div>
          {error && <div className="interest-rooms-error" role="alert">{error}</div>}
          <section className="interest-room-messages" aria-label={"Сообщения комнаты " + activeRoom.name}>
            {messages.length === 0 ? <div className="interest-room-empty-chat"><span>💬</span><strong>Начни разговор</strong><p>Здесь пока нет сообщений. Напиши первым!</p></div> : messages.map((item) => <article key={item.id} className={"interest-room-message " + (item.is_mine ? "mine" : "theirs")}><span className="interest-room-sender">{item.is_mine ? "Ты" : "Студент"}</span><p>{item.body}</p><time>{timeLabel(item.created_at)}</time></article>)}
            <div ref={bottomRef} />
          </section>
          <form className="interest-room-composer" onSubmit={sendMessage}><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Напиши сообщение в комнату…" aria-label="Сообщение в комнату" maxLength={1000} /><button type="submit" disabled={!draft.trim() || sending}>{sending ? "…" : "➤"}</button></form>
        </>}
      </main>
    </div>
  );
}

export default InterestRooms;