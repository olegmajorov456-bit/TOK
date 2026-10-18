import "./BottomNav.css";

function Icon({ type }) {
  const icons = {
    home: <path d="M3 10.5 12 3l9 7.5M5.5 9.5V21h13V9.5M9 21v-6h6v6" />,
    discovery: <path d="M12 19.5S4 15.2 4 9.4A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 8 2.4c0 2.4-1.2 4.4-2.9 5.9l1.9 4.2-3.6-1.3c-1 .5-2.3 1.3-3.4 1.3Z" />,
    heart: <path d="M12 20.5S4 15.9 4 9.8A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 8 2.8c0 6.1-8 10.7-8 10.7Z" />,
    rooms: <><path d="M4 5.8A2.8 2.8 0 0 1 6.8 3h10.4A2.8 2.8 0 0 1 20 5.8v6.4a2.8 2.8 0 0 1-2.8 2.8H10l-4.8 3.3.9-3.3A2.8 2.8 0 0 1 4 12.2Z" /><path className="nav-dots" d="M8.6 9h.01M12 9h.01M15.4 9h.01" /></>,
    user: <path d="M20 21a8 8 0 0 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icons[type]}</svg>;
}

function BottomNav({ activePage, onHome, onDiscovery, onMatches, onRooms, onProfile }) {
  const items = [
    ["home", "Главная", "home", onHome],
    ["discovery", "Знакомства", "discovery", onDiscovery],
    ["matches", "Мэтчи", "heart", onMatches],
    ["rooms", "Чаты", "rooms", onRooms],
    ["profile", "Профиль", "user", onProfile],
  ];

  return (
    <nav className="bottom-nav" aria-label="Основная навигация">
      {items.map(([page, label, icon, onClick]) => (
        <button key={page} className={"bottom-nav-item " + (activePage === page ? "active" : "")} onClick={onClick} aria-current={activePage === page ? "page" : undefined}>
          <span className="bottom-nav-icon"><Icon type={icon} /></span>
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

export default BottomNav;