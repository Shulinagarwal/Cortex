import { useSearchParams } from "react-router-dom";
import ProfileTab from "./profile.tab";
import MemoryTab from "./memory.tab";
import ConnectorsTab from "./connectors.tab";

const TABS = [
  { key: "profile", label: "Profile" },
  { key: "memory", label: "Memory" },
  { key: "connectors", label: "Connectors" },
];

const SettingsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const activeTab = TABS.some((tab) => tab.key === requestedTab) ? requestedTab : "profile";

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-900">
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-3xl mx-auto mt-6">
          <div className="bg-zinc-900 border border-white/10 rounded-3xl p-10 shadow-2xl">
            <div className="flex items-center gap-2 mb-8 border-b border-white/10 pb-4">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setSearchParams({ tab: tab.key })}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                    activeTab === tab.key
                      ? "bg-accent text-white"
                      : "text-secondary-text hover:text-white hover:bg-white/5"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === "profile" && <ProfileTab />}
            {activeTab === "memory" && <MemoryTab />}
            {activeTab === "connectors" && <ConnectorsTab />}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
