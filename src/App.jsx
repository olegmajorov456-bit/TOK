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
import Chat from "./Chat";
import Support from "./Support";
import Confessions from "./Confessions";
import Achievements from "./Achievements";
import RandomChat from "./RandomChat";
import Notifications from "./Notifications";
import Admin from "./Admin";
import PublicProfile from "./PublicProfile";
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
  const [page, setPage] = useState(() => sessionStorage.getItem("tok-page") || "home");
  const [selectedChat, setSelectedChat] = useState(() => {
    try {
      const saved = sessionStorage.getItem("tok-selected-chat");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [viewedProfile, setViewedProfile] = useState(null);
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

  // Keep the current screen when Android temporarily recreates the WebView
  // while the system file picker is open.
  useEffect(() => {
    sessionStorage.setItem("tok-page", page);
    if (selectedChat) {
      try {
        sessionStorage.setItem("tok-selected-chat", JSON.stringify(selectedChat));
      } catch (error) {
        console.warn("Не удалось сохранить состояние чата:", error);
      }
    } else {
      sessionStorage.removeItem("tok-selected-chat");
    }
  }, [page, selectedChat]);


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
      if (mounted) {
        setHomeSettings(next);
        // Android update prompts are handled natively from the actual installed APK version.
      }
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
        sessionStorage.removeItem("tok-selected-chat");
        sessionStorage.setItem("tok-page", "home");
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

  if (isPrivacyPage) return <PrivacyPolicy theme={theme} />;
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

  if (page === "random-chat") return <RandomChat user={session.user} theme={theme} onHome={goHome} onDiscovery={() => setPage("discovery")} onMatches={() => setPage("matches")} onProfile={() => setPage("profile")} />;

  if (page === "view-profile" && viewedProfile) return (
    <PublicProfile
      profile={viewedProfile}
      onBack={() => { setPage("chat"); setViewedProfile(null); }}
      theme={theme}
    />
  );

  if (page === "chat" && selectedChat) return (
    <Chat
      user={session.user}
      match={selectedChat.match}
      profile={selectedChat.profile}
      theme={theme}
      onBack={() => setPage("matches")}
      onHome={goHome}
      onDiscovery={() => { setPage("discovery"); setSelectedChat(null); }}
      onMatches={() => setPage("matches")}
      onProfile={() => { setPage("profile"); setSelectedChat(null); }}
      onViewProfile={(otherProfile) => { setViewedProfile(otherProfile); setPage("view-profile"); }}
    />
  );
  if (page === "support") return <Support user={session.user} onBack={() => setPage("home")} />;
  if (page === "admin") return <Admin user={session.user} onBack={() => setPage("profile")} />;

  return (
    <>
    <div className={`app-shell tok-theme-${theme}`}>
      <Header user={session.user} profile={profile} onHome={goHome} onSupport={() => setPage("support")} onProfile={() => setPage("profile")} onMatches={() => setPage("matches")} onNotifications={() => setPage("notifications")} />
      <main className="app-content">
        {page === "home" && <Home profile={profile} homeSettings={homeSettings} onDiscovery={() => setPage("discovery")} onMatches={() => setPage("matches")} onProfile={() => setPage("profile")} onConfessions={() => setPage("confessions")} onAchievements={() => setPage("achievements")} onRandomChat={() => setPage("random-chat")} onNotifications={() => setPage("notifications")} />}
        {page === "discovery" && <Discovery user={session.user} onHome={goHome} />}
        {page === "matches" && <Matches user={session.user} onHome={goHome} onOpenChat={openChat} theme={theme} />}
        {page === "confessions" && <Confessions user={session.user} theme={theme} />}
        {page === "achievements" && <Achievements user={session.user} theme={theme} />}
        {page === "notifications" && <Notifications user={session.user} theme={theme} onHome={goHome} />}
        {page === "profile" && <Profile user={session.user} profile={profile} theme={theme} onThemeChange={setTheme} onHome={goHome} onAdmin={() => setPage("admin")} onProfileUpdated={(updatedProfile) => { setProfile(updatedProfile); setBlocked(updatedProfile?.is_blocked === true); }} />}
      </main>
      <BottomNav activePage={["confessions", "achievements", "notifications"].includes(page) ? "home" : page} onHome={() => setPage("home")} onDiscovery={() => setPage("discovery")} onMatches={() => setPage("matches")} onProfile={() => setPage("profile")} />
    </div>
    </>
  );
}

export default App;
