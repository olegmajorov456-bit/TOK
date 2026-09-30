import "./BottomNav.css";

function Icon({ type }) {
  const paths = {
    home: "M3 10.5 12 3l9 7.5M5.5 9.5V21h13V9.5M9 21v-6h6v6",
    heart: "M12 20.5S4 15.9 4 9.8A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 8 2.8c0 6.1-8 10.7-8 10.7Z",
    message: "M4 5.8A2.8 2.8 0 0 1 6.8 3h10.4A2.8 2.8 0 0 1 20 5.8v6.4a2.8 2.8 0 0 1-2.8 2.8H10l-4.8 3.3.9-3.3h-.3A2.8 2.8 0 0 1 3 12.2V5.8Z",
    user: "M20 21a8 8 0 0 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[type]} /></svg>;
}

function BottomNav({ activePage, onHome, onDiscovery, onMatches, onProfile }) {
  const items = [
    ["home", "Главная", "home", onHome],
    ["discovery", "Знакомства", "heart", onDiscovery],
    ["matches", "Чаты", "message", onMatches],
    ["profile", "Профиль", "user", onProfile],
  ];

  return (
    <nav className="bottom-nav" aria-label="Основная навигация">
      {items.map(([page, label, icon, onClick]) => (
        <button key={page} className={"bottom-nav-item " + (activePage === page ? "active" : "")} onClick={onClick}>
          <span className="bottom-nav-icon"><Icon type={icon} /></span>
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

export default BottomNav;
