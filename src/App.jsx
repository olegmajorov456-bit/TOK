import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import Auth from "./Auth";
import PasswordReset from "./PasswordReset";
import PrivacyPolicy from "./PrivacyPolicy";
import ProfileForm from "./ProfileForm";
import Home from "./Home";
import Profile from "./Profile";
import Discovery from "./Discovery";
import Matches from "./Matches";
import Notifications from "./Notifications";
import Chat from "./Chat";
import Support from "./Support";
import Admin from "./Admin";
import Header from "./Header";
import BottomNav from "./BottomNav";
import "./App.css";

const DEFAULT_HOME_SETTINGS = {
  title: "Общайся. Знакомься. Находи своих.",
  description: "ТОК создан специально для студентов ИГЭУ. Здесь всё начинается с обычной симпатии.",
};

function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState("home");
  const [selectedChat, setSelectedChat] = useState(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const [homeSettings, setHomeSettings] = useState(DEFAULT_HOME_SETTINGS);
  const [recoveryMode, setRecoveryMode] = useState(() => window.location.hash.includes("type=recovery"));
  const [theme, setTheme] = useState(() => {
    const savedTheme = localStorage.getItem("tok-theme");
    const migrated = localStorage.getItem("tok-theme-v2");
    if (!migrated) {
      const nextTheme = "light";
      localStorage.setItem("tok-theme-v2", "1");
      localStorage.setItem("tok-theme", nextTheme);
      return nextTheme;
    }
    return savedTheme === "neon" || savedTheme === "light" ? savedTheme : "light";
  });

  useEffect(() => { localStorage.setItem("tok-theme", theme); }, [theme]);

  useEffect(() => {
    if (!session?.user?.id) return;
    let channel;
    async function loadUnreadNotifications() {
      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", session.user.id)
        .eq("is_read", false);
      if (!error) setUnreadNotifications(count || 0);
    }
    loadUnreadNotifications();
    channel = supabase.channel(`app-notifications-${session.user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${session.user.id}` }, () => {
        loadUnreadNotifications();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${session.user.id}` }, () => {
        loadUnreadNotifications();
      })
      .subscribe();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [session?.user?.id]);

  const isPrivacyPage = window.location.pathname === "/privacy";

  useEffect(() => {
    let mounted = true;

    async function loadUserProfile(userId) {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
      if (!mounted) return null;
      if (error) {
        console.error("Ошибка загрузки профиля:", error);
        return null;
      }
      setProfile(data);
      setBlocked(data?.is_blocked === true);
      return data;
    }

    async function loadHomeSettings() {
      const { data, error } = await supabase
        .from("app_settings")
        .select("key,value")
        .in("key", ["home_title", "home_description"]);

      if (error) {
        console.error("Ошибка загрузки текста главной:", error);
        return;
      }

      const next = { ...DEFAULT_HOME_SETTINGS };
      for (const item of data || []) {
        if (item.key === "home_title" && item.value) next.title = item.value;
        if (item.key === "home_description" && item.value) next.description = item.value;
      }
      if (mounted) setHomeSettings(next);
    }

    async function initialize() {
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (!mounted) return;
        setSession(currentSession);
        if (currentSession?.user) {
          await Promise.all([loadUserProfile(currentSession.user.id), loadHomeSettings()]);
        } else {
          setProfile(null);
        }
      } catch (error) {
        console.error("Ошибка инициализации:", error);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    initialize();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY") setRecoveryMode(true);
      setSession(newSession);
      if (!newSession) {
        setProfile(null);
        setBlocked(false);
        setSelectedChat(null);
        setPage("home");
        setLoading(false);
        return;
      }

      async function loadAfterAuth() {
        setLoading(true);
        await Promise.all([loadUserProfile(newSession.user.id), loadHomeSettings()]);
        if (mounted) setLoading(false);
      }
      loadAfterAuth();
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  function handleProfileCreated(newProfile) {
    setProfile(newProfile);
    setBlocked(newProfile?.is_blocked === true);
    setPage("home");
  }

  function openChat(chatData) {
    setSelectedChat(chatData);
    setPage("chat");
  }

  function goHome() {
    setPage("home");
    setSelectedChat(null);
  }

  if (isPrivacyPage) return <PrivacyPolicy />;
  if (recoveryMode) return <PasswordReset />;

  if (loading) {
    return (
      <div className={`site-loading tok-theme-${theme}`}>
        <div className="site-loading-content">
          <div className="site-loading-logo">
            <img src="/tok-logo.png" alt="ТОК — Знакомства в ИГЭУ" />
          </div>
          <div className="site-loading-spinner" aria-label="Загрузка" />
        </div>
      </div>
    );
  }

  if (!session) return <Auth />;

  if (blocked) {
    return (
      <div className={`auth-page tok-auth-${theme}`}>
        <div className="auth-card">
          <img className="auth-logo" src="/tok-logo.png" alt="ТОК" />
          <h2>Аккаунт заблокирован</h2>
          <p className="auth-message">Доступ к ТОК ограничен администрацией. Если вы считаете, что это ошибка, обратитесь в поддержку.</p>
          <button className="switch-button" onClick={() => supabase.auth.signOut()}>Выйти</button>
        </div>
      </div>
    );
  }

  if (!profile) return <ProfileForm user={session.user} onProfileCreated={handleProfileCreated} />;

  if (page === "chat" && selectedChat) return <Chat user={session.user} match={selectedChat.match} profile={selectedChat.profile} theme={theme} onBack={() => setPage("matches")} />;
  if (page === "support") return <Support user={session.user} onBack={() => setPage("home")} />;
  if (page === "admin") return <Admin user={session.user} onBack={() => setPage("profile")} />;

  return (
    <div className={`app-shell tok-theme-${theme}`}>
      <Header user={session.user} profile={profile} onHome={goHome} onSupport={() => setPage("support")} onProfile={() => setPage("profile")} onMatches={() => setPage("matches")} />
      <main className="app-content">
        {page === "home" && <Home profile={profile} homeSettings={homeSettings} onDiscovery={() => setPage("discovery")} onMatches={() => setPage("matches")} onProfile={() => setPage("profile")} />}
        {page === "discovery" && <Discovery user={session.user} onHome={goHome} />}
        {page === "matches" && <Matches user={session.user} onHome={goHome} onOpenChat={openChat} />}\n        {page === "notifications" && <Notifications user={session.user} />}
        {page === "profile" && <Profile user={session.user} profile={profile} theme={theme} onThemeChange={setTheme} onHome={goHome} onAdmin={() => setPage("admin")} onProfileUpdated={(updatedProfile) => { setProfile(updatedProfile); setBlocked(updatedProfile?.is_blocked === true); }} />}
      </main>
      <BottomNav activePage={page} onDiscovery={() => setPage("discovery")} onMatches={() => setPage("matches")} onNotifications={() => setPage("notifications")} onProfile={() => setPage("profile")} notificationCount={unreadNotifications} />
    </div>
  );
}

export default App;
