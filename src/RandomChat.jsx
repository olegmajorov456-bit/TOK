import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabaseClient";
import BottomNav from "./BottomNav";
import "./RandomChat.css";

function formatTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function RandomChat({ user, theme = "light", onHome, onDiscovery, onMatches, onProfile }) {
  const [searching, setSearching] = useState(false);
  const [room, setRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const searchTokenRef = useRef(0);
  const channelRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    const root = document.documentElement;
    const initialHeight = Math.max(window.innerHeight || 0, root.clientHeight || 0);
    const editableSelector = 'input:not([type="file"]),textarea,select,[contenteditable="true"]';
    function syncViewport() {
      const viewport = window.visualViewport;
      const layoutHeight = window.innerHeight || root.clientHeight || initialHeight;
      const visibleHeight = viewport?.height || layoutHeight;
      const offsetTop = viewport?.offsetTop || 0;
      const overlap = Math.max(0, layoutHeight - visibleHeight - offsetTop);
      const active = document.activeElement;
      const focused = !!(active?.matches && active.matches(editableSelector));
      const open = focused && (overlap > 100 || initialHeight - layoutHeight > 120 || initialHeight - visibleHeight > 120);
      root.classList.toggle("tok-keyboard-open", open);
      root.style.setProperty("--tok-keyboard-overlap", open ? overlap + "px" : "0px");
      root.style.setProperty("--tok-visual-viewport-height", (visibleHeight || layoutHeight) + "px");
    }
    const onFocus = (event) => {
      if (event.target?.matches?.(editableSelector)) {
        syncViewport();
        window.setTimeout(syncViewport, 100);
        window.setTimeout(syncViewport, 280);
      }
    };
    const onBlur = () => window.setTimeout(syncViewport, 120);
    window.addEventListener("resize", syncViewport);
    window.visualViewport?.addEventListener("resize", syncViewport);
    window.visualViewport?.addEventListener("scroll", syncViewport);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", onBlur);
    syncViewport();
    return () => {
      window.removeEventListener("resize", syncViewport);
      window.visualViewport?.removeEventListener("resize", syncViewport);
      window.visualViewport?.removeEventListener("scroll", syncViewport);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", onBlur);
      root.classList.remove("tok-keyboard-open");
      root.style.setProperty("--tok-keyboard-overlap", "0px");
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => () => {
    searchTokenRef.current += 1;
    if (channelRef.current) supabase.removeChannel(channelRef.current);
  }, []);

  async function joinRoom(roomId) {
    const { data: roomData, error: roomError } = await supabase
      .from("random_chat_rooms")
      .select("id,status,created_at")
      .eq("id", roomId)
      .single();
    if (roomError || !roomData) {
      setError("Нашли собеседника, но не удалось открыть чат. Попробуй ещё раз.");
      setSearching(false);
      return;
    }
    const { data: rows, error: messagesError } = await supabase
      .from("random_chat_messages")
      .select("id,room_id,sender_id,body,created_at")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true })
      .limit(300);
    if (messagesError) {
      setError("Не удалось загрузить сообщения. Проверь SQL-миграцию.");
      setSearching(false);
      return;
    }
    setRoom(roomData);
    setMessages(rows || []);
    setSearching(false);
    setNotice("Собеседник найден. Общайтесь уважительно — любой участник может завершить чат.");
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    channelRef.current = supabase
      .channel("random-room-" + roomId)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "random_chat_messages", filter: "room_id=eq." + roomId }, (payload) => {
        setMessages((current) => current.some((item) => item.id === payload.new.id) ? current : [...current, payload.new]);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "random_chat_rooms", filter: "id=eq." + roomId }, (payload) => {
        if (payload.new.status === "ended") {
          setRoom((current) => current ? { ...current, status: "ended" } : current);
          setNotice("Собеседник завершил разговор. Можно найти нового человека.");
        }
      })
      .subscribe();
  }

  async function startSearch() {
    if (searching) return;
    if (room?.status === "active") {
      setError("Сначала заверши текущий разговор.");
      return;
    }
    setError("");
    setNotice("");
    setMessages([]);
    setRoom(null);
    setSearching(true);
    const token = ++searchTokenRef.current;
    let attempts = 0;
    while (searchTokenRef.current === token && attempts < 75) {
      const { data: roomId, error: matchError } = await supabase.rpc("find_random_chat_partner");
      if (searchTokenRef.current !== token) return;
      if (matchError) {
        console.error("Ошибка поиска случайного собеседника:", matchError);
        setError("Случайный чат не подключён. Выполни SQL-миграцию из supabase/migrations/20261011_social_features.sql в Supabase SQL Editor.");
        setSearching(false);
        return;
      }
      if (roomId) {
        await joinRoom(roomId);
        return;
      }
      attempts += 1;
      await new Promise((resolve) => window.setTimeout(resolve, 2200));
    }
    if (searchTokenRef.current === token) {
      await supabase.from("random_chat_queue").delete().eq("user_id", user.id);
      setSearching(false);
      setNotice("Пока никого не нашли. Попробуй ещё раз чуть позже.");
    }
  }

  async function cancelSearch() {
    searchTokenRef.current += 1;
    await supabase.from("random_chat_queue").delete().eq("user_id", user.id);
    setSearching(false);
    setNotice("Поиск отменён.");
  }

  async function finishRoom() {
    searchTokenRef.current += 1;
    if (room?.id && room.status === "active") {
      const { error: leaveError } = await supabase.rpc("leave_random_chat", { target_room_id: room.id });
      if (leaveError) console.error("Не удалось завершить случайный чат:", leaveError);
    }
    await supabase.from("random_chat_queue").delete().eq("user_id", user.id);
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    setSearching(false);
    setRoom(null);
    setMessages([]);
    setDraft("");
  }

  async function navigateTo(callback) {
    await finishRoom();
    callback?.();
  }

  async function sendMessage(event) {
    event.preventDefault();
    const cleanBody = draft.trim();
    if (!cleanBody || !room?.id || room.status !== "active" || sending) return;
    setSending(true);
    const { data, error: insertError } = await supabase
      .from("random_chat_messages")
      .insert({ room_id: room.id, sender_id: user.id, body: cleanBody })
      .select("id,room_id,sender_id,body,created_at")
      .single();
    if (insertError) {
      console.error("Не удалось отправить сообщение:", insertError);
      setError("Сообщение не отправлено. Проверь соединение и попробуй ещё раз.");
    } else {
      setMessages((current) => current.some((item) => item.id === data.id) ? current : [...current, data]);
      setDraft("");
    }
    setSending(false);
  }

  const activeRoom = room?.status === "active";

  return (
    <div className={"random-chat-page tok-theme-" + theme}>
      <header className="random-chat-header">
        <button type="button" className="random-chat-back" onClick={() => navigateTo(onHome)} aria-label="Назад">←</button>
        <div className="random-chat-heading-icon">🎲</div>
        <div className="random-chat-heading-copy"><strong>Случайный собеседник</strong><span>{activeRoom ? "Анонимный чат · онлайн" : searching ? "Ищем человека…" : "Познакомься без анкеты"}</span></div>
        {activeRoom && <button type="button" className="random-chat-end" onClick={finishRoom}>Завершить</button>}
      </header>

      {error && <div className="random-chat-alert error" role="alert">{error}<button type="button" onClick={() => setError("")}>×</button></div>}
      {notice && <div className="random-chat-alert" role="status">{notice}<button type="button" onClick={() => setNotice("")}>×</button></div>}

      <main className="random-chat-messages">
        {!room && !searching ? <section className="random-chat-welcome"><div className="random-chat-welcome-emoji">🎲</div><h1>Никогда не знаешь, с кем познакомишься</h1><p>Найди случайного студента ИГЭУ для лёгкого разговора. Вы начинаете анонимно: без фотографий, имён и ссылок на профиль.</p><div className="random-chat-rules"><span>🔒 Анонимно</span><span>🤝 По взаимному желанию</span><span>🚫 Можно завершить в любой момент</span></div><button type="button" onClick={startSearch}>Найти собеседника <span>→</span></button></section> : null}
        {searching && <section className="random-chat-searching"><span className="random-chat-search-spinner" /><h2>Ищем собеседника</h2><p>Подбираем человека, который тоже хочет пообщаться.</p><button type="button" onClick={cancelSearch}>Отменить поиск</button></section>}
        {room && <div className="random-chat-system-note">Вы общаетесь анонимно. Не отправляй личные данные незнакомым людям.</div>}
        {messages.map((item) => <article key={item.id} className={"random-message " + (item.sender_id === user.id ? "mine" : "theirs")}><p>{item.body}</p><time>{formatTime(item.created_at)}</time></article>)}
        {room?.status === "ended" && <section className="random-chat-ended"><div>👋</div><strong>Разговор завершён</strong><p>Спасибо за общение. Можно сразу начать новый чат.</p><button type="button" onClick={startSearch}>Найти другого собеседника</button></section>}
        <div ref={messagesEndRef} />
      </main>

      {activeRoom && <form className="random-chat-composer" onSubmit={sendMessage}><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Напиши сообщение…" maxLength={1000} aria-label="Сообщение" /><button type="submit" disabled={!draft.trim() || sending}>{sending ? "…" : "➤"}</button></form>}

      <BottomNav activePage="home" onHome={() => navigateTo(onHome)} onDiscovery={() => navigateTo(onDiscovery)} onMatches={() => navigateTo(onMatches)} onProfile={() => navigateTo(onProfile)} />
    </div>
  );
}

export default RandomChat;
