import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

import Auth from "./Auth";
import PasswordReset from "./PasswordReset";
import ProfileForm from "./ProfileForm";
import Home from "./Home";
import Profile from "./Profile";
import Discovery from "./Discovery";
import Matches from "./Matches";
import Chat from "./Chat";
import Support from "./Support";
import Admin from "./Admin";
import Header from "./Header";
import BottomNav from "./BottomNav";
import "./App.css";

function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState("home");
  const [selectedChat, setSelectedChat] = useState(null);
  const [blocked, setBlocked] = useState(false);

  const isRecovery = window.location.hash.includes("type=recovery");

  useEffect(() => {
    let mounted = true;

    async function loadUserProfile(userId) {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();

      if (!mounted) return null;
      if (error) {
        console.error("Ошибка загрузки профиля:", error);
        return null;
      }

      setProfile(data);
      setBlocked(data?.is_blocked === true);
      return data;
    }

    async function initialize() {
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        if (!mounted) return;
        setSession(currentSession);
        if (currentSession?.user) await loadUserProfile(currentSession.user.id);
        else setProfile(null);
      } catch (error) {
        console.error("Ошибка инициализации:", error);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    initialize();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return;
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
        await loadUserProfile(newSession.user.id);
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

  if (isRecovery) return <PasswordReset />;

  if (loading) {
    return (
      <div className="site-loading">
        <div className="site-loading-content">
          <div className="site-loading-logo"><img src="/tok-logo.png" alt="ТОК — Знакомства в ИГЭУ" /></div>
          <div className="site-loading-loader"><div className="site-loading-spinner" /></div>
          <p className="site-loading-title">Загружаем ТОК</p>
          <p className="site-loading-subtitle">Знакомства в ИГЭУ</p>
          <div className="site-loading-dots"><span /><span /><span /></div>
        </div>
      </div>
    );
  }

  if (!session) return <Auth />;

  if (blocked) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <img className="auth-logo" src="/tok-logo.png" alt="ТОК" />
          <h2>Аккаунт заблокирован</h2>
          <p className="auth-message">Доступ к ТОК ограничен администрацией. Если вы считаете, что это ошибка, обратитесь в поддержку.</p>
          <button className="switch-button" onClick={() => supabase.auth.signOut()}>Выйти</button>
        </div>
      </div>
    );
  }

  if (!profile) {
    return <ProfileForm user={session.user} onProfileCreated={handleProfileCreated} />;
  }

  if (page === "chat" && selectedChat) {
    return <Chat user={session.user} match={selectedChat.match} profile={selectedChat.profile} onBack={() => setPage("matches")} />;
  }

  if (page === "support") {
    return <Support user={session.user} onBack={() => setPage("home")} />;
  }

  if (page === "admin") {
    return <Admin user={session.user} onBack={() => setPage("profile")} />;
  }

  return (
    <div className="app-shell">
      <Header onHome={goHome} onSupport={() => setPage("support")} />
      <main className="app-content">
        {page === "home" && <Home user={session.user} profile={profile} onDiscovery={() => setPage("discovery")} onMatches={() => setPage("matches")} onProfile={() => setPage("profile")} />}
        {page === "discovery" && <Discovery user={session.user} onHome={goHome} />}
        {page === "matches" && <Matches user={session.user} onHome={goHome} onOpenChat={openChat} />}
        {page === "profile" && <Profile user={session.user} profile={profile} onHome={goHome} onAdmin={() => setPage("admin")} onProfileUpdated={(updatedProfile) => { setProfile(updatedProfile); setBlocked(updatedProfile?.is_blocked === true); }} />}
      </main>
      <BottomNav activePage={page} onHome={() => setPage("home")} onDiscovery={() => setPage("discovery")} onMatches={() => setPage("matches")} onProfile={() => setPage("profile")} />
    </div>
  );
}

export default App;
