function ChatTabs({ active, onPersonal, onRooms }) {
  return (
    <div className="chat-tabs" role="tablist" aria-label="Тип чатов">
      <button type="button" role="tab" aria-selected={active === "personal"} className={active === "personal" ? "active" : ""} onClick={onPersonal}>Личные</button>
      <button type="button" role="tab" aria-selected={active === "rooms"} className={active === "rooms" ? "active" : ""} onClick={onRooms}>Комнаты</button>
    </div>
  );
}

export default ChatTabs;