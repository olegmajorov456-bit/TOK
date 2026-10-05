import { useEffect, useRef, useState } from "react";
import { supabase } from "./supabaseClient";
import AppUpdateAdmin from "./AppUpdateAdmin";
import "./Admin.css";

const DEFAULT_TITLE = "Общайся. Знакомься. Находи своих.";
const DEFAULT_DESCRIPTION = "ТОК создан специально для студентов ИГЭУ. Здесь всё начинается с обычной симпатии.";

function Admin({ user, onBack }) {
  const theme = localStorage.getItem("tok-theme") || "light";
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [activeTab, setActiveTab] = useState("users");
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState(["", ""]);
  const [matchMessage, setMatchMessage] = useState("");
  const [supportConversations, setSupportConversations] = useState([]);
  const [reports, setReports] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [supportMessages, setSupportMessages] = useState([]);
  const [supportText, setSupportText] = useState("");
  const [sendingSupport, setSendingSupport] = useState(false);
  const [loadingSupport, setLoadingSupport] = useState(false);
  const [loadingReports, setLoadingReports] = useState(false);
  const [homeTitle, setHomeTitle] = useState(DEFAULT_TITLE);
  const [homeDescription, setHomeDescription] = useState(DEFAULT_DESCRIPTION);
  const [savingHome, setSavingHome] = useState(false);
  const [homeMessage, setHomeMessage] = useState("");
  const channelsRef = useRef([]);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    checkAdmin();
    return () => {
      mountedRef.current = false;
      channelsRef.current.forEach((channel) => supabase.removeChannel(channel));
      channelsRef.current = [];
    };
  }, [user.id]);

  useEffect(() => {
    if (!isAdmin) return;
    loadUsers();
    loadSupportConversations();
    loadReports();
    loadHomeSettings();
    subscribeToAdminEvents();
    return () => {
      channelsRef.current.forEach((channel) => supabase.removeChannel(channel));
      channelsRef.current = [];
    };
  }, [isAdmin]);

  async function checkAdmin() {
    setCheckingAdmin(true);
    const { data, error } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
    if (error) {
      console.error("Ошибка проверки администратора:", error);
      setIsAdmin(false);
    } else setIsAdmin(data?.is_admin === true);
    if (mountedRef.current) setCheckingAdmin(false);
  }

  function subscribeToAdminEvents() {
    channelsRef.current.forEach((channel) => supabase.removeChannel(channel));
    channelsRef.current = [];
    const channel = supabase
      .channel(`admin-panel-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => loadUsers())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_conversations" }, () => loadSupportConversations())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages" }, (payload) => {
        loadSupportConversations();
        if (selectedConversationRef.current?.id === payload.new.conversation_id) {
          setSupportMessages((current) => current.some((item) => item.id === payload.new.id) ? current : [...current, payload.new]);
          setTimeout(scrollSupportToBottom, 30);
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "reports" }, () => loadReports())
      .subscribe();
    channelsRef.current.push(channel);
  }

  async function loadUsers() {
    setLoadingUsers(true);
    const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
    if (error) console.error("Ошибка загрузки пользователей:", error);
    else setUsers(data || []);
    setLoadingUsers(false);
  }

  async function toggleBlock(target) {
    const nextBlocked = target.is_blocked !== true;
    const action = nextBlocked ? "заблокировать" : "разблокировать";
    if (!window.confirm(`Точно ${action} пользователя ${target.name || "без имени"}?`)) return;

    const { data, error } = await supabase.from("profiles").update({ is_blocked: nextBlocked }).eq("id", target.id).select().single();
    if (error) {
      console.error("Ошибка блокировки:", error);
      alert("Не удалось изменить блокировку. Проверьте SQL-политику администратора.");
      return;
    }
    setUsers((current) => current.map((item) => item.id === target.id ? data : item));
  }

  function selectMatchUser(index, value) {
    setSelectedUserIds((current) => {
      const next = [...current];
      next[index] = value;
      return next;
    });
    setMatchMessage("");
  }

  async function createManualMatch() {
    const [user1, user2] = selectedUserIds;
    if (!user1 || !user2) {
      setMatchMessage("Выберите двух пользователей.");
      return;
    }
    if (user1 === user2) {
      setMatchMessage("Нельзя создать мэтч пользователя с самим собой.");
      return;
    }

    const [first, second] = [user1, user2].sort();
    const { error } = await supabase.from("matches").insert({ user1_id: first, user2_id: second });
    if (error) {
      console.error("Ошибка создания мэтча:", error);
      if (error.code === "23505") setMatchMessage("Мэтч между этими пользователями уже существует.");
      else setMatchMessage("Не удалось создать мэтч. Проверьте таблицу matches и права администратора.");
      return;
    }
    setMatchMessage("💕 Мэтч создан. Он появится у обоих пользователей.");
    setSelectedUserIds(["", ""]);
  }

  async function loadSupportConversations() {
    setLoadingSupport(true);
    const { data, error } = await supabase.from("support_conversations").select("*").order("created_at", { ascending: false });
    if (error) {
      console.error("Ошибка загрузки обращений:", error);
      setLoadingSupport(false);
      return;
    }
    const conversations = data || [];
    if (!conversations.length) {
      setSupportConversations([]);
      setLoadingSupport(false);
      return;
    }
    const userIds = conversations.map((item) => item.user_id);
    const { data: profiles } = await supabase.from("profiles").select("id,name,avatar_url,faculty,course").in("id", userIds);
    setSupportConversations(conversations.map((conversation) => ({ ...conversation, profile: profiles?.find((profile) => profile.id === conversation.user_id) })));
    setLoadingSupport(false);
  }

  async function openSupportConversation(conversation) {
    setSelectedConversation(conversation);
    setSupportMessages([]);
    const { data, error } = await supabase.from("support_messages").select("*").eq("conversation_id", conversation.id).order("created_at", { ascending: true });
    if (error) {
      console.error("Ошибка загрузки сообщений поддержки:", error);
      return;
    }
    setSupportMessages(data || []);
    setTimeout(scrollSupportToBottom, 30);
  }

  function scrollSupportToBottom() {
    const element = document.querySelector(".admin-support-messages");
    if (element) element.scrollTop = element.scrollHeight;
  }

  async function sendSupportMessage(event) {
    event.preventDefault();
    const body = supportText.trim();
    if (!body || !selectedConversation || sendingSupport) return;
    setSendingSupport(true);
    const { data, error } = await supabase.from("support_messages").insert({ conversation_id: selectedConversation.id, sender_id: user.id, body }).select().single();
    if (error) {
      console.error("Ошибка отправки сообщения поддержки:", error);
      alert("Не удалось отправить сообщение.");
      setSendingSupport(false);
      return;
    }
    setSupportMessages((current) => current.some((item) => item.id === data.id) ? current : [...current, data]);
    setSupportText("");
    setSendingSupport(false);
    setTimeout(scrollSupportToBottom, 30);
  }

  async function loadReports() {
    setLoadingReports(true);
    const { data, error } = await supabase.from("reports").select("*").order("created_at", { ascending: false });
    if (error) {
      console.error("Ошибка загрузки жалоб:", error);
      setLoadingReports(false);
      return;
    }
    const reportList = data || [];
    if (!reportList.length) {
      setReports([]);
      setLoadingReports(false);
      return;
    }
    const userIds = [...new Set(reportList.flatMap((report) => [report.reporter_id, report.reported_user_id]))];
    const { data: profiles } = await supabase.from("profiles").select("id,name,avatar_url,faculty,course").in("id", userIds);
    setReports(reportList.map((report) => ({ ...report, reporter: profiles?.find((profile) => profile.id === report.reporter_id), reported: profiles?.find((profile) => profile.id === report.reported_user_id) })));
    setLoadingReports(false);
  }

  async function updateReportStatus(reportId, status) {
    const { error } = await supabase.from("reports").update({ status }).eq("id", reportId);
    if (error) {
      console.error(error);
      alert("Не удалось изменить статус жалобы.");
      return;
    }
    setReports((current) => current.map((report) => report.id === reportId ? { ...report, status } : report));
  }

  async function loadHomeSettings() {
    const { data, error } = await supabase.from("app_settings").select("key,value").in("key", ["home_title", "home_description"]);
    if (error) return;
    for (const item of data || []) {
      if (item.key === "home_title") setHomeTitle(item.value);
      if (item.key === "home_description") setHomeDescription(item.value);
    }
  }

  async function saveHomeSettings(event) {
    event.preventDefault();
    setSavingHome(true);
    setHomeMessage("");
    const { error } = await supabase.from("app_settings").upsert([
      { key: "home_title", value: homeTitle.trim() },
      { key: "home_description", value: homeDescription.trim() },
    ], { onConflict: "key" });
    setHomeMessage(error ? "Не удалось сохранить изменения." : "Изменения сохранены.");
    setSavingHome(false);
  }

  const filteredUsers = users.filter((item) => {
    const query = userSearch.trim().toLowerCase();
    if (!query) return true;
    return [item.name, item.faculty, item.id].some((value) => String(value || "").toLowerCase().includes(query));
  });

  const tabButtonStyle = { minHeight: 50, border: "none", borderRadius: 15, background: "transparent", color: "var(--admin-muted)", fontFamily: "inherit", fontSize: 13, fontWeight: 700, cursor: "pointer", padding: "0 10px" };
  const activeTabStyle = { ...tabButtonStyle, background: "var(--admin-active)", color: "var(--admin-text)" };
  const selectStyle = { width: "100%", padding: "12px", border: "1px solid var(--admin-border)", borderRadius: 13, background: "var(--admin-input)", color: "var(--admin-text)", fontFamily: "inherit", marginTop: 7 };
  const cardStyle = { background: "var(--admin-card)", borderRadius: 20, padding: 14, boxShadow: "var(--admin-shadow)" };

  if (checkingAdmin) return <div className={`admin-page tok-theme-${theme}`}><div className="admin-loading"><div className="admin-spinner" /><p>Проверяем доступ...</p></div></div>;
  if (!isAdmin) return <div className={`admin-page tok-theme-${theme}`}><div className="admin-access-denied"><div className="admin-denied-icon">🔒</div><h1>Доступ запрещён</h1><p>Эта страница доступна только администраторам ТОК.</p><button className="admin-back-button" onClick={onBack}>Вернуться назад</button></div></div>;

  return (
    <div className={`admin-page tok-theme-${theme}`}>
      <header className="admin-header"><button className="admin-back" onClick={onBack}>←</button><img src="/tok-logo.png" alt="ТОК" className="admin-logo" /></header>
      <main className="admin-container">
        <div className="admin-tabs" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
          <button style={activeTab === "users" ? activeTabStyle : tabButtonStyle} onClick={() => setActiveTab("users")}>👥 Пользователи <span>{users.length}</span></button>
          <button style={activeTab === "support" ? activeTabStyle : tabButtonStyle} onClick={() => { setActiveTab("support"); setSelectedConversation(null); }}>💬 Поддержка <span>{supportConversations.length}</span></button>
          <button style={activeTab === "reports" ? activeTabStyle : tabButtonStyle} onClick={() => { setActiveTab("reports"); setSelectedConversation(null); }}>🚩 Жалобы <span>{reports.length}</span></button>
          <button style={activeTab === "home" ? activeTabStyle : tabButtonStyle} onClick={() => setActiveTab("home")}>🏠 Главная</button>
          <button style={activeTab === "update" ? activeTabStyle : tabButtonStyle} onClick={() => setActiveTab("update")}>📦 Обновление</button>
        </div>

        {activeTab === "users" && (
          <section className="admin-section">
            <div className="admin-section-heading"><div><span className="admin-section-kicker">МОДЕРАЦИЯ</span><h2>Пользователи</h2></div><button className="admin-refresh" onClick={loadUsers}>↻ Обновить</button></div>
            <input className="admin-user-search" value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Поиск по имени, факультету или ID..." />
            {loadingUsers ? <div className="admin-empty"><div className="admin-spinner" /><p>Загружаем пользователей...</p></div> : <div className="admin-support-list">
              {filteredUsers.map((item) => (
                <article key={item.id} style={{ ...cardStyle, display: "flex", alignItems: "center", gap: 12 }}>
                  <div className="admin-user-avatar">{item.avatar_url ? <img src={item.avatar_url} alt={item.name || ""} /> : <span>👤</span>}</div>
                  <div className="admin-support-info" style={{ flex: 1 }}><strong>{item.name || "Без имени"} {item.is_admin ? "🛡️" : ""}</strong><span>{item.faculty ? `🎓 ${item.faculty}` : "Факультет не указан"}{item.course ? ` · ${item.course} курс` : ""}</span><small>{item.is_blocked ? "🚫 Заблокирован" : "Активен"}</small></div>
                  <button onClick={() => toggleBlock(item)} style={{ border: "none", borderRadius: 12, padding: "9px 11px", background: item.is_blocked ? "#e9f7ed" : "#fff0f0", color: item.is_blocked ? "#20863a" : "#c83232", fontFamily: "inherit", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>{item.is_blocked ? "Разблокировать" : "Заблокировать"}</button>
                </article>
              ))}
              {!filteredUsers.length && <div className="admin-empty"><div className="admin-empty-icon">🔎</div><h3>Ничего не найдено</h3></div>}
            </div>}

            <div style={{ ...cardStyle, marginTop: 18 }}>
              <span className="admin-section-kicker">РУЧНОЙ МЭТЧ</span>
              <h3 style={{ margin: "4px 0 10px" }}>Создать мэтч между двумя пользователями</h3>
              <label>Первый пользователь<select style={selectStyle} value={selectedUserIds[0]} onChange={(e) => selectMatchUser(0, e.target.value)}><option value="">Выберите...</option>{users.filter((item) => item.id !== selectedUserIds[1]).map((item) => <option key={item.id} value={item.id}>{item.name || "Без имени"}{item.is_blocked ? " — заблокирован" : ""}</option>)}</select></label>
              <label style={{ display: "block", marginTop: 10 }}>Второй пользователь<select style={selectStyle} value={selectedUserIds[1]} onChange={(e) => selectMatchUser(1, e.target.value)}><option value="">Выберите...</option>{users.filter((item) => item.id !== selectedUserIds[0]).map((item) => <option key={item.id} value={item.id}>{item.name || "Без имени"}{item.is_blocked ? " — заблокирован" : ""}</option>)}</select></label>
              <button onClick={createManualMatch} style={{ width: "100%", marginTop: 13, border: "none", borderRadius: 14, padding: 13, background: "linear-gradient(90deg,#ff2f73,#d92766)", color: "#fff", fontFamily: "inherit", fontWeight: 700, cursor: "pointer" }}>💕 Создать мэтч</button>
              {matchMessage && <p className="admin-report-date" style={{ color: matchMessage.startsWith("💕") ? "#20863a" : "#c83232" }}>{matchMessage}</p>}
            </div>
          </section>
        )}

        {activeTab === "support" && (!selectedConversation ? <section className="admin-section"><div className="admin-section-heading"><div><span className="admin-section-kicker">ОБРАЩЕНИЯ ПОЛЬЗОВАТЕЛЕЙ</span><h2>Техническая поддержка</h2></div><button className="admin-refresh" onClick={loadSupportConversations}>↻ Обновить</button></div>{loadingSupport ? <div className="admin-empty"><div className="admin-spinner" /><p>Загружаем обращения...</p></div> : supportConversations.length === 0 ? <div className="admin-empty"><div className="admin-empty-icon">💬</div><h3>Обращений пока нет</h3></div> : <div className="admin-support-list">{supportConversations.map((conversation) => <button key={conversation.id} className="admin-support-card" onClick={() => openSupportConversation(conversation)}><div className="admin-user-avatar">{conversation.profile?.avatar_url ? <img src={conversation.profile.avatar_url} alt="" /> : <span>👤</span>}</div><div className="admin-support-info"><strong>{conversation.profile?.name || "Пользователь"}</strong><span>{conversation.profile?.faculty || "Обращение в поддержку"}</span><small>{new Date(conversation.created_at).toLocaleString("ru-RU")}</small></div><span className="admin-card-arrow">→</span></button>)}</div>}</section> : <section className="admin-section"><div className="admin-chat"><div className="admin-chat-header"><button className="admin-chat-back" onClick={() => setSelectedConversation(null)}>←</button><div className="admin-user-avatar small">{selectedConversation.profile?.avatar_url ? <img src={selectedConversation.profile.avatar_url} alt="" /> : <span>👤</span>}</div><div><strong>{selectedConversation.profile?.name || "Пользователь"}</strong><span>Диалог с поддержкой</span></div></div><div className="admin-support-messages">{supportMessages.length ? supportMessages.map((message) => <div key={message.id} className={`admin-support-message ${message.sender_id === user.id ? "mine" : "user"}`}><div>{message.body}</div><small>{new Date(message.created_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</small></div>) : <div className="admin-chat-empty">Сообщений пока нет.</div>}</div><form className="admin-support-input" onSubmit={sendSupportMessage}><input value={supportText} onChange={(e) => setSupportText(e.target.value)} placeholder="Ответ пользователю..." maxLength={2000} disabled={sendingSupport} /><button type="submit" disabled={sendingSupport || !supportText.trim()}>➤</button></form></div></section>)}

        {activeTab === "reports" && <section className="admin-section"><div className="admin-section-heading"><div><span className="admin-section-kicker">МОДЕРАЦИЯ</span><h2>Жалобы пользователей</h2></div><button className="admin-refresh" onClick={loadReports}>↻ Обновить</button></div>{loadingReports ? <div className="admin-empty"><div className="admin-spinner" /><p>Загружаем жалобы...</p></div> : reports.length === 0 ? <div className="admin-empty"><div className="admin-empty-icon">🚩</div><h3>Жалоб пока нет</h3></div> : <div className="admin-reports-list">{reports.map((report) => <article key={report.id} className="admin-report-card"><div className="admin-report-top"><div><span className="admin-report-label">Жалоба №{report.id}</span><h3>{report.reason}</h3></div><select value={report.status} onChange={(e) => updateReportStatus(report.id, e.target.value)}><option value="new">Новая</option><option value="in_review">На рассмотрении</option><option value="resolved">Решена</option><option value="rejected">Отклонена</option></select></div><div className="admin-report-users"><div className="admin-report-user"><span>Кто пожаловался</span><strong>{report.reporter?.name || "Пользователь"}</strong></div><div className="admin-report-arrow">→</div><div className="admin-report-user"><span>На кого</span><strong>{report.reported?.name || "Пользователь"}</strong></div></div>{report.details && <div className="admin-report-details"><span>Подробности</span><p>{report.details}</p></div>}<div className="admin-report-date">{new Date(report.created_at).toLocaleString("ru-RU")}</div></article>)}</div>}</section>}

        {activeTab === "update" && <AppUpdateAdmin />}

        {activeTab === "home" && <section className="admin-section"><div className="admin-section-heading"><div><span className="admin-section-kicker">НАСТРОЙКИ САЙТА</span><h2>Главная страница</h2></div></div><form onSubmit={saveHomeSettings} style={cardStyle}><label>Заголовок<input value={homeTitle} onChange={(e) => setHomeTitle(e.target.value)} style={selectStyle} /></label><label style={{ display: "block", marginTop: 14 }}>Описание<textarea value={homeDescription} onChange={(e) => setHomeDescription(e.target.value)} rows="5" style={{ ...selectStyle, resize: "vertical" }} /></label><button type="submit" className="admin-home-save" disabled={savingHome}>{savingHome ? "Сохраняем..." : "💾 Сохранить"}</button>{homeMessage && <p className="admin-report-date">{homeMessage}</p>}</form></section>}
      </main>
    </div>
  );
}

export default Admin;