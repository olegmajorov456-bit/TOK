import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabaseClient";
import "./Support.css";

const FAQ = [
  ["Как работает мэтч?", "Ставь лайки анкетам. Если симпатия взаимна, у вас появляется мэтч и можно начать общение."],
  ["Как скрыть свою анкету?", "Открой профиль и нажми «Скрыть анкету». Её можно вернуть в любой момент."],
  ["Как пожаловаться на анкету?", "В карточке анкеты нажми значок флажка и опиши причину. Жалобу увидит команда ТОК."],
  ["Что такое случайный чат?", "Анонимный разговор с другим студентом ИГЭУ. Имена в нём скрыты."],
];

function Support({ user, onBack }) {
  const theme = localStorage.getItem("tok-theme") || "light";
  const [conversation, setConversation] = useState(null);
  const [view, setView] = useState("menu");
  const [faqOpen, setFaqOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);
  const channelRef = useRef(null);
  const runIdRef = useRef(0);

  // Support uses the same keyboard-aware viewport behaviour as the main chat.
  useEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    const initialHeight = Math.max(window.innerHeight || 0, root.clientHeight || 0);
    const editableSelector = 'input:not([type="file"]),textarea,select,[contenteditable="true"]';

    function syncKeyboardViewport() {
      const currentViewport = window.visualViewport;
      const layoutHeight = window.innerHeight || root.clientHeight || initialHeight;
      const visibleHeight = currentViewport?.height || layoutHeight;
      const offsetTop = currentViewport?.offsetTop || 0;
      const overlap = Math.max(0, layoutHeight - visibleHeight - offsetTop);
      const layoutLoss = Math.max(0, initialHeight - layoutHeight);
      const visualLoss = Math.max(0, initialHeight - visibleHeight);
      const active = document.activeElement;
      const editableFocused = !!(active?.matches && active.matches(editableSelector));
      const keyboardOpen = editableFocused && (overlap > 100 || layoutLoss > 120 || visualLoss > 120);

      root.classList.toggle("tok-keyboard-open", keyboardOpen);
      root.style.setProperty("--tok-keyboard-overlap", keyboardOpen ? overlap + "px" : "0px");
      root.style.setProperty("--tok-visual-viewport-height", (visibleHeight || layoutHeight) + "px");
    }

    function onFocusIn(event) {
      if (event.target?.matches?.(editableSelector)) {
        syncKeyboardViewport();
        window.setTimeout(syncKeyboardViewport, 80);
        window.setTimeout(syncKeyboardViewport, 240);
        window.setTimeout(syncKeyboardViewport, 500);
      }
    }
    function onFocusOut() {
      window.setTimeout(syncKeyboardViewport, 120);
      window.setTimeout(syncKeyboardViewport, 300);
    }

    viewport?.addEventListener("resize", syncKeyboardViewport);
    viewport?.addEventListener("scroll", syncKeyboardViewport);
    window.addEventListener("resize", syncKeyboardViewport);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    syncKeyboardViewport();

    return () => {
      viewport?.removeEventListener("resize", syncKeyboardViewport);
      viewport?.removeEventListener("scroll", syncKeyboardViewport);
      window.removeEventListener("resize", syncKeyboardViewport);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      root.classList.remove("tok-keyboard-open");
      root.style.removeProperty("--tok-keyboard-overlap");
      root.style.removeProperty("--tok-visual-viewport-height");
    };
  }, []);

  useEffect(() => {
    const runId = ++runIdRef.current;
    let alive = true;

    async function init() {
      setLoading(true);

      const { data: existingConversation, error: existingError } = await supabase
        .from("support_conversations")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!alive || runId !== runIdRef.current) return;

      if (existingError) {
        console.error("Ошибка загрузки обращения:", existingError);
        setLoading(false);
        return;
      }

      let currentConversation = existingConversation;

      if (!currentConversation) {
        const { data: createdConversation, error: createError } = await supabase
          .from("support_conversations")
          .insert({ user_id: user.id })
          .select()
          .single();

        if (!alive || runId !== runIdRef.current) return;

        if (createError) {
          if (createError.code === "23505") {
            const { data: retryConversation, error: retryError } = await supabase
              .from("support_conversations")
              .select("*")
              .eq("user_id", user.id)
              .single();

            if (!alive || runId !== runIdRef.current) return;
            if (retryError) {
              console.error("Ошибка поиска обращения:", retryError);
              setLoading(false);
              return;
            }
            currentConversation = retryConversation;
          } else {
            console.error("Ошибка создания обращения:", createError);
            setLoading(false);
            return;
          }
        } else {
          currentConversation = createdConversation;
        }
      }

      if (!currentConversation) {
        setLoading(false);
        return;
      }

      setConversation(currentConversation);

      const { data: loadedMessages, error: messagesError } = await supabase
        .from("support_messages")
        .select("*")
        .eq("conversation_id", currentConversation.id)
        .order("created_at", { ascending: true });

      if (!alive || runId !== runIdRef.current) return;

      if (messagesError) {
        console.error("Ошибка загрузки сообщений поддержки:", messagesError);
        setLoading(false);
        return;
      }

      setMessages(loadedMessages || []);

      if (channelRef.current) {
        await supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }

      if (!alive || runId !== runIdRef.current) return;

      const channel = supabase
        .channel(`support-user-${user.id}-${currentConversation.id}-${runId}`)
        .on("postgres_changes", {
          event: "INSERT",
          schema: "public",
          table: "support_messages",
          filter: `conversation_id=eq.${currentConversation.id}`,
        }, (payload) => {
          if (!alive || runId !== runIdRef.current) return;
          setMessages((current) => current.some((item) => item.id === payload.new.id) ? current : [...current, payload.new]);
        });

      channelRef.current = channel;
      await channel.subscribe();

      if (alive && runId === runIdRef.current) setLoading(false);
    }

    init();

    return () => {
      alive = false;
      runIdRef.current += 1;
      if (channelRef.current) {
        const channelToRemove = channelRef.current;
        channelRef.current = null;
        supabase.removeChannel(channelToRemove);
      }
    };
  }, [user.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(event) {
    event.preventDefault();
    const body = text.trim();
    if (!body || !conversation || sending) return;

    setSending(true);
    const { data, error } = await supabase
      .from("support_messages")
      .insert({ conversation_id: conversation.id, sender_id: user.id, body })
      .select()
      .single();

    if (error) {
      console.error("Ошибка отправки сообщения поддержки:", error);
      alert("Не удалось отправить сообщение. Попробуйте ещё раз.");
      setSending(false);
      return;
    }

    setMessages((current) => current.some((item) => item.id === data.id) ? current : [...current, data]);
    setText("");
    setSending(false);
  }

  if (loading) return <div className={`support-page tok-theme-${theme}`}><div className="support-loading"><p>Открываем поддержку...</p></div></div>;

  const prefixes = { problem: "Проблема: ", idea: "Идея: " };
  function openThread(kind) {
    if (kind && prefixes[kind] && !text) setText(prefixes[kind]);
    setView("thread");
  }

  if (view === "menu" && messages.length === 0) {
    return (
      <div className={`support-page tok-theme-${theme}`}>
        <main className="support-menu">
          <section className="support-hello">
            <h1>Здравствуйте! 👋</h1>
            <p>Здесь вы можете получить помощь по любым вопросам, связанным с работой приложения.</p>
            <button type="button" className="support-menu-button" onClick={() => setFaqOpen(!faqOpen)} aria-expanded={faqOpen}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="m10 8.5 5 3.5-5 3.5Z" /></svg>Частые вопросы</button>
            {faqOpen && <div className="support-faq">{FAQ.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div>}
            <button type="button" className="support-menu-button" onClick={() => openThread()}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4A8 8 0 1 1 20 12Z" /></svg>Написать в поддержку</button>
            <button type="button" className="support-menu-button" onClick={() => openThread("problem")}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4 3 20h18Z" /><path d="M12 10v4M12 17h.01" /></svg>Сообщить о проблеме</button>
            <button type="button" className="support-menu-button" onClick={() => openThread("idea")}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z" /></svg>Предложить идею</button>
          </section>
          <p className="support-status"><span className="support-status-dot" />Обычно отвечаем в течение 24 часов</p>
        </main>
      </div>
    );
  }

  return (
    <div className={`support-page tok-theme-${theme}`}>
      <header className="support-header">
        <button className="support-back" onClick={() => (messages.length === 0 ? setView("menu") : onBack())} aria-label="Назад"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg></button>
        <div><strong>Поддержка ТОК</strong><span>Мы рядом, если что-то не работает</span></div>
      </header>

      <main className="support-messages">
        {messages.length === 0 ? (
          <div className="support-welcome"><div className="support-welcome-icon">💬</div><h2>Чем можем помочь?</h2><p>Напиши нам о проблеме или задай вопрос. Сообщение увидит команда поддержки ТОК.</p></div>
        ) : messages.map((message) => {
          const isMine = message.sender_id === user.id;
          return <div key={message.id} className={`support-message ${isMine ? "mine" : "admin"}`}><div>{message.body}</div><small>{new Date(message.created_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</small></div>;
        })}
        <div ref={messagesEndRef} />
      </main>

      <form className="support-input" onSubmit={sendMessage}>
        <input type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Написать сообщение..." maxLength={1000} disabled={sending} />
        <button type="submit" disabled={sending || !text.trim()}>➤</button>
      </form>
    </div>
  );
}

export default Support;