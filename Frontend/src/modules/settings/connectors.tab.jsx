import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../shared/api/client";
import toast from "react-hot-toast";
import { getApiErrorMessage } from "../../shared/utils/apiError";
import {
  Plus,
  Check,
  Mail,
  Calendar,
  HardDrive,
  NotebookText,
  MessagesSquare,
  Plug,
} from "lucide-react";

// lucide-react doesn't export a Github icon in the version this project has installed
// (verified against the installed package) - a real GitHub mark needs an inline SVG instead.
const GitHubLogo = ({ size = 18, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} fill="currentColor">
    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
  </svg>
);

const toastStyle = { style: { background: "#18181b", color: "#fff" } };

const CONNECTOR_ICONS = {
  github: { Icon: GitHubLogo, bg: "bg-zinc-800", fg: "text-neutral-100" },
  gmail: { Icon: Mail, bg: "bg-red-500/15", fg: "text-red-400" },
  "google-calendar": { Icon: Calendar, bg: "bg-blue-500/15", fg: "text-blue-400" },
  "google-drive": { Icon: HardDrive, bg: "bg-green-500/15", fg: "text-green-400" },
  notion: { Icon: NotebookText, bg: "bg-zinc-800", fg: "text-neutral-100" },
  slack: { Icon: MessagesSquare, bg: "bg-purple-500/15", fg: "text-purple-400" },
};

const iconFor = (id) => CONNECTOR_ICONS[id] || { Icon: Plug, bg: "bg-zinc-800", fg: "text-secondary-text" };

const ConnectorsTab = () => {
  const [connectors, setConnectors] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();

  const loadConnectors = async () => {
    setIsLoading(true);
    try {
      const response = await api.get("/api/connectors");
      setConnectors(response.data.connectors);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to load connectors."), toastStyle);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadConnectors();
  }, []);

  useEffect(() => {
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");

    if (connected) {
      toast.success(`Connected to ${connected}.`, toastStyle);
      loadConnectors();
    } else if (error) {
      toast.error("Failed to connect. Please try again.", toastStyle);
    }

    if (connected || error) {
      const next = new URLSearchParams(searchParams);
      next.delete("connected");
      next.delete("error");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = async (id) => {
    try {
      const response = await api.get(`/api/connectors/${id}/start`);
      window.location.href = response.data.url;
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to start connection."), toastStyle);
    }
  };

  const disconnect = async (id) => {
    try {
      await api.delete(`/api/connectors/${id}`);
      setConnectors((prev) => prev.map((c) => (c.id === id ? { ...c, connected: false } : c)));
      toast.success("Disconnected.", toastStyle);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to disconnect."), toastStyle);
    }
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-neutral-50">Connectors</h1>
        <ul className="text-sm text-secondary-text mt-2 space-y-1 list-disc list-inside">
          <li>Lets Cortex use tools from other services on your behalf, inside any chat</li>
          <li>Each connector needs your explicit sign-in and approval before it's usable</li>
          <li>Disconnect at any time to revoke access immediately</li>
        </ul>
      </div>

      {isLoading ? (
        <p className="text-secondary-text text-sm">Loading...</p>
      ) : connectors.length === 0 ? (
        <p className="text-secondary-text text-sm">No connectors available yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {connectors.map((connector) => {
            const { Icon, bg, fg } = iconFor(connector.id);
            return (
              <div
                key={connector.id}
                className="flex items-center justify-between gap-3 bg-zinc-950 border border-white/10 rounded-xl p-3.5"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${bg}`}>
                    <Icon size={18} className={fg} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-neutral-50 truncate">{connector.name}</p>
                    <p className="text-xs text-secondary-text truncate">{connector.description}</p>
                  </div>
                </div>

                {connector.connected ? (
                  <button
                    onClick={() => disconnect(connector.id)}
                    title="Connected — click to disconnect"
                    className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-green-500/15 hover:bg-red-500/15 text-green-400 hover:text-red-400 transition-colors"
                  >
                    <Check size={16} />
                  </button>
                ) : (
                  <button
                    onClick={() => connect(connector.id)}
                    title={`Connect ${connector.name}`}
                    className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-zinc-900 hover:bg-accent border border-white/10 hover:border-accent text-secondary-text hover:text-white transition-colors"
                  >
                    <Plus size={16} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ConnectorsTab;
