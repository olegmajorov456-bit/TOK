import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabaseClient";
import "./Chat.css";
import BottomNav from "./BottomNav";

function Chat({ user, match, profile, onBack, onHome, onDiscovery, onMatches, onProfile, onViewProfile, theme = "light" }) {
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState("");
  const [selectedImage, setSelectedImage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const messagesEndRef = useRef(null);
  const channelRef = useRef(null);
  const mountedRef = useRef(true);
  const runIdRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    const runId = ++runIdRef.current;

    async function initChat() {
      setLoading(true);

      const { data: existing, error: existingError } = await supabase
        .from("conversations")
        .select("*")
        .eq("match_id", match.id)
        .maybeSingle();

      if (!mountedRef.current || runId !== runIdRef.current) return;

      if (existingError) {
        console.error("Ошибка поиска чата:", existingError);
        setLoading(false);
        return;
      }

      let currentConversation = existing;

      if (!currentConversation) {
        const { data: created, error: createError } = await supabase
          .from("conversations")
          .insert({ match_id: match.id })
          .select()
          .single();

        if (!mountedRef.current || runId !== runIdRef.current) return;

        if (createError) {
          if (createError.code === "23505") {
            const { data: retryConversation, error: retryError } = await supabase
              .from("conversations")
              .select("*")
              .eq("match_id", match.id)
              .single();

            if (retryError) {
              console.error("Ошибка повторного поиска чата:", retryError);
              setLoading(false);
              return;
            }
            currentConversation = retryConversation;
          } else {
            console.error("Ошибка создания чата:", createError);
            setLoading(false);
            return;
          }
        } else {
          currentConversation = created;
        }
      }

      if (!currentConversation) {
        setLoading(false);
        return;
      }

      setConversation(currentConversation);

      const { data: loadedMessages, error: messagesError } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", currentConversation.id)
        .order("created_at", { ascending: true });

      if (!mountedRef.current || runId !== runIdRef.current) return;

      if (messagesError) {
        console.error("Ошибка загрузки сообщений:", messagesError);
        setLoading(false);
        return;
      }

      setMessages(loadedMessages || []);

      if (channelRef.current) {
        await supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }

      if (!mountedRef.current || runId !== runIdRef.current) return;

      const channel = supabase
        .channel(`chat-${currentConversation.id}-${user.id}`)
        .on("postgres_changes", {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${currentConversation.id}`,
        }, (payload) => {
          if (!mountedRef.current || runId !== runIdRef.current) return;
          setMessages((current) => current.some((item) => item.id === payload.new.id) ? current : [...current, payload.new]);
        });

      channelRef.current = channel;
      await channel.subscribe();

      if (mountedRef.current) setLoading(false);
    }

    initChat();

    return () => {
      runIdRef.current += 1;
      mountedRef.current = false;
      if (channelRef.current) {
        const channelToRemove = channelRef.current;
        channelRef.current = null;
        supabase.removeChannel(channelToRemove);
      }
    };
  }, [match.id, user.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function formatMessageTime(value) {
    if (!value) return "";
    return new Date(value).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  }

  function handleImageChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Можно отправлять только изображения.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      alert("Фото должно быть меньше 8 МБ.");
      return;
    }
    setSelectedImage(file);
  }

  async function sendMessage(event) {
    event.preventDefault();
    const text = messageText.trim();
    if ((!text && !selectedImage) || !conversation || sending || imageUploading) return;

    setSending(true);
    let imageUrl = null;

    try {
      if (selectedImage) {
        setImageUploading(true);
        const extension = selectedImage.name.split(".").pop()?.toLowerCase() || "jpg";
        const filePath = `${user.id}/${conversation.id}/${crypto.randomUUID()}.${extension}`;

        const { error: uploadError } = await supabase.storage
          .from("chat-media")
          .upload(filePath, selectedImage, {
            contentType: selectedImage.type,
            cacheControl: "3600",
            upsert: false,
          });

        if (uploadError) {
          console.error("Ошибка загрузки фото:", uploadError);
          alert("Не удалось загрузить фото.");
          return;
        }

        const { data: publicUrlData } = supabase.storage.from("chat-media").getPublicUrl(filePath);
        imageUrl = publicUrlData.publicUrl;
      }

      const messagePayload = {
        conversation_id: conversation.id,
        sender_id: user.id,
        body: text,
      };
      if (imageUrl) messagePayload.image_url = imageUrl;

      const { data, error } = await supabase
        .from("messages")
        .insert(messagePayload)
        .select()
        .single();

      if (error) {
        console.error("Ошибка отправки сообщения:", error);
        alert("Не удалось отправить сообщение.");
        return;
      }

      setMessages((current) => current.some((item) => item.id === data.id) ? current : [...current, data]);
      setMessageText("");
      setSelectedImage(null);
    } finally {
      setImageUploading(false);
      setSending(false);
    }
  }

  if (loading) {
    return <div className={"chat-page tok-theme-" + theme}><div className="chat-loading"><div className="chat-spinner" /><p>Открываем чат...</p></div></div>;
  }

  return (
    <div className={`chat-page tok-theme-${theme}`}>
      <header className="chat-header">
        <button type="button" className="chat-back" onClick={onBack}>←</button>
        <button type="button" className="chat-user chat-profile-button" onClick={() => onViewProfile?.(profile)} aria-label="Открыть профиль">

          <div className="chat-avatar">
            {profile?.avatar_url ? <img src={profile.avatar_url} alt={profile.name || ""} /> : <span>👤</span>}
          </div>
          <div><strong>{profile?.name || "Пользователь"}</strong><span>Ваш мэтч ❤️</span></div>
        </button>
      </header>

      <main className="chat-messages">
        {messages.length === 0 ? (
          <div className="chat-empty"><div>💕</div><strong>Начните общение</strong><p>Вы понравились друг другу. Напишите первым!</p></div>
        ) : messages.map((message) => (
          <div key={message.id} className={`chat-message ${message.sender_id === user.id ? "mine" : "theirs"}`}>
            {message.image_url && <a className="chat-image-link" href={message.image_url} target="_blank" rel="noreferrer"><img className="chat-image" src={message.image_url} alt="Отправленное фото" /></a>}
            {message.body && <div className="chat-message-text">{message.body}</div>}
            <time className="chat-message-time">{formatMessageTime(message.created_at)}</time>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </main>

      <form className="chat-input-area" onSubmit={sendMessage}>
        {selectedImage && <div className="chat-image-preview"><span>📷 {selectedImage.name}</span><button type="button" onClick={() => setSelectedImage(null)} aria-label="Убрать фото">×</button></div>}
        <label className="chat-attach-button" title="Отправить фото" aria-label="Отправить фото">
          📎
          <input type="file" accept="image/*" onChange={handleImageChange} disabled={sending} />
        </label>
        <input type="text" value={messageText} onChange={(e) => setMessageText(e.target.value)} placeholder={selectedImage ? "Добавьте подпись..." : "Напишите сообщение..."} maxLength={2000} disabled={sending} />
        <button type="submit" disabled={sending || imageUploading || (!messageText.trim() && !selectedImage)}>{imageUploading ? "…" : "➤"}</button>
      </form>
      <BottomNav activePage="matches" onHome={onHome} onDiscovery={onDiscovery} onMatches={onMatches} onProfile={onProfile} />
    </div>
  );
}

export default Chat;
