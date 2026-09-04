import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { api } from "../shared/api/client";
import { useSelector, useDispatch } from "react-redux";
import { addChat, removeChat } from "../modules/chat/chat.slice";
import toast from "react-hot-toast";
import { Search, Plus, Settings, Home, Library, Trash2, PanelLeftClose, LogOut } from "lucide-react";

import { useChats } from "../modules/chat/chat.hook";
import { useDebounce } from "../shared/hooks/useDebounce";
import { useAuth } from "../modules/auth/auth.hook";

import SearchModal from "../modules/chat/searchModal";

const Sidebar = ({ isOpen, setIsSidebarOpen }) => {
  const chats = useSelector((state) => state.chat.chats);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { User, logout } = useAuth();

  const { isLoading } = useChats();

  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = async () => {
    setIsUserMenuOpen(false);
    await logout();
    navigate("/Login", { replace: true });
  };

  const filteredChats = chats.filter((chat) =>
    chat.title?.toLowerCase().includes(debouncedSearch.toLowerCase())
  );

  const CreateNewChat = async () => {
    try {
      const response = await api.post(
        `/api/chats`,
        {}
      );

      dispatch(addChat(response.data.chat));
      navigate(`/chat/${response.data.chat._id}`);
    } catch (error) {
      console.log("Error occured while Creating new chat", error);
    }
  };

  const handleDeleteChat = async (e, id) => {
    e.stopPropagation();

    dispatch(removeChat(id));

    if (window.location.pathname.includes(id)) {
      navigate("/");
    }

    try {
      await api.delete(`/api/chats/${id}`);
      toast.success("Chat deleted!", { style: { background: '#18181b', color: '#fff' } });
    } catch (error) {
      console.error("Failed to delete chat", error);
      toast.error("Failed to delete chat.", { style: { background: '#18181b', color: '#fff' } });
    }
  };

  const navItemClass = (path) =>
    `w-full flex items-center gap-2.5 text-left p-2 rounded-md mb-1 transition-colors font-medium ${
      location.pathname === path
        ? "bg-zinc-900 text-white"
        : "text-neutral-50 hover:bg-zinc-900 hover:text-white"
    }`;

  return (
    <>
      <div
        className={`bg-zinc-950 text-white h-screen flex flex-col justify-between transition-all duration-300 ease-in-out shrink-0
        ${isOpen ? "w-64 translate-x-0 p-4 border-r border-white/10" : "w-0 -translate-x-full p-0 border-transparent overflow-hidden"}`}
      >
        <div className={`flex flex-col h-full w-[14rem] transition-opacity duration-300 ${isOpen ? "opacity-100" : "opacity-0"}`}>
          <div className="flex items-center justify-end mb-3">
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="p-2 shrink-0 rounded-md hover:bg-zinc-900 text-secondary-text hover:text-white transition-colors"
              title="Close Sidebar"
            >
              <PanelLeftClose size={18} />
            </button>
          </div>

          <button
            onClick={CreateNewChat}
            className="w-full flex items-center justify-center gap-2 border border-white/10 hover:border-white/20 rounded-xl p-2.5 hover:bg-zinc-900 transition-colors font-semibold mb-4"
          >
            <Plus size={16} />
            New chat
          </button>

          <div className="mb-2">
            <button
              onClick={() => setIsSearchModalOpen(true)}
              className={navItemClass(null)}
            >
              <Search size={16} className="shrink-0" />
              Search
            </button>

            <button onClick={() => navigate("/")} className={navItemClass("/")}>
              <Home size={16} className="shrink-0" />
              Home
            </button>

            <button onClick={() => navigate("/library")} className={navItemClass("/library")}>
              <Library size={16} className="shrink-0" />
              Library
            </button>
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar mt-2">
            <p className="text-xs text-secondary-text font-semibold mb-3 uppercase">
              Recent chats
            </p>
            <ul className="space-y-2">
              {isLoading ? (
                <>
                  <li className="h-10 bg-zinc-900 rounded-md animate-pulse"></li>
                  <li className="h-10 bg-zinc-900 rounded-md animate-pulse"></li>
                  <li className="h-10 bg-zinc-900 rounded-md animate-pulse"></li>
                </>
              ) : chats.length === 0 ? (
                <div className="text-center text-secondary-text mt-10">
                  <p className="text-sm">No chats found.</p>
                  <p className="text-xs mt-1">Start a new conversation!</p>
                </div>
              ) : (
                chats.slice(0, 15).map((chat) => {
                  const isActive = location.pathname === `/chat/${chat._id}`;
                  return (
                    <li
                      key={chat._id}
                      className={`group flex items-center justify-between cursor-pointer p-2 rounded-md transition-colors ${
                        isActive ? "bg-zinc-900" : "hover:bg-zinc-900"
                      }`}
                      onClick={() => navigate("/chat/" + chat._id)}
                    >
                      <span className="truncate pr-2">{chat.title}</span>
                      <button
                        onClick={(e) => handleDeleteChat(e, chat._id)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-secondary-text hover:text-red-400 hover:bg-zinc-800 rounded transition-all shrink-0"
                        title="Delete Chat"
                        aria-label={`Delete ${chat.title}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>

          <div className="border-t border-white/10 pt-3 mt-2 relative" ref={userMenuRef}>
            {isUserMenuOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-2 bg-zinc-800 border border-white/10 rounded-xl shadow-2xl overflow-hidden py-1">
                <div className="px-3 py-2 border-b border-white/10">
                  <p className="text-sm font-semibold text-white truncate">
                    {User?.fullname || "User"}
                  </p>
                  <p className="text-xs text-secondary-text truncate">{User?.email}</p>
                </div>

                <button
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    navigate("/settings");
                  }}
                  className="w-full flex items-center gap-2.5 text-left px-3 py-2 text-sm text-neutral-50 hover:bg-zinc-900 transition-colors"
                >
                  <Settings size={16} className="shrink-0" />
                  Settings
                </button>

                <div className="border-t border-white/10 mt-1 pt-1">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2.5 text-left px-3 py-2 text-sm text-red-400 hover:bg-zinc-900 transition-colors"
                  >
                    <LogOut size={16} className="shrink-0" />
                    Log out
                  </button>
                </div>
              </div>
            )}

            <button
              onClick={() => setIsUserMenuOpen((prev) => !prev)}
              className="w-full flex items-center gap-2.5 text-left p-2 rounded-md transition-colors font-medium text-neutral-50 hover:bg-zinc-900 hover:text-white"
            >
              <img
                src={`https://ui-avatars.com/api/?name=${encodeURIComponent(User?.fullname || "User")}&background=155dfc&color=fff`}
                alt=""
                className="w-6 h-6 rounded-full shrink-0"
              />
              <span className="truncate">{User?.fullname || "Account"}</span>
            </button>
          </div>
        </div>
      </div>

      <SearchModal
        isOpen={isSearchModalOpen}
        onClose={() => setIsSearchModalOpen(false)}
        chats={filteredChats}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onChatSelect={(chatId) => navigate(`/chat/${chatId}`)}
      />
    </>
  );
};

export default Sidebar;
