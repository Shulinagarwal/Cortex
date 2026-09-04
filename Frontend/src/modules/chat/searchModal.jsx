import { useEffect, useRef } from "react";
import { X, MessageSquare, Search } from "lucide-react";

const SearchModal = ({ isOpen, onClose, chats, searchQuery, setSearchQuery, onChatSelect }) => {
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 w-full max-w-2xl rounded-2xl flex flex-col shadow-2xl overflow-hidden border border-white/10 max-h-[70vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 p-4 border-b border-white/10 bg-zinc-800">
          <Search className="text-secondary-text" size={20} />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent border-none outline-none text-white placeholder-secondary-text text-lg"
          />
          <button
            onClick={onClose}
            className="p-1 text-secondary-text hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 no-scrollbar">
          <p className="text-xs text-secondary-text font-semibold mb-3 uppercase px-2">
            Recent chats
          </p>
          <ul className="space-y-1">
            {chats.length === 0 ? (
              <div className="text-center text-secondary-text py-8">
                <p className="text-sm">No chats found.</p>
              </div>
            ) : (
              chats.map((chat) => (
                <li
                  key={chat._id}
                  className="flex items-center gap-3 cursor-pointer hover:bg-zinc-900 p-3 rounded-xl transition-colors"
                  onClick={() => {
                    onChatSelect(chat._id);
                    onClose();
                  }}
                >
                  <MessageSquare size={18} className="text-secondary-text" />
                  <span className="text-neutral-50 text-sm font-medium truncate flex-1">
                    {chat.title}
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default SearchModal;
