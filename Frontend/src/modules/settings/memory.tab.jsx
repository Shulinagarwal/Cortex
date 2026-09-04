import { useState, useEffect } from "react";
import { api } from "../../shared/api/client";
import toast from "react-hot-toast";
import { getApiErrorMessage } from "../../shared/utils/apiError";
import { Trash2, Pencil, Check, X, Plus } from "lucide-react";

const toastStyle = { style: { background: "#18181b", color: "#fff" } };

const MemoryTab = () => {
  const [facts, setFacts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [isTogglingEnabled, setIsTogglingEnabled] = useState(false);
  const [newFactText, setNewFactText] = useState("");
  const [isAddingFact, setIsAddingFact] = useState(false);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const [settingsResponse, factsResponse] = await Promise.all([
          api.get("/api/memory/settings"),
          api.get("/api/memory"),
        ]);
        setEnabled(settingsResponse.data.enabled);
        setFacts(factsResponse.data.facts);
      } catch (error) {
        toast.error(getApiErrorMessage(error, "Failed to load memory."), toastStyle);
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, []);

  const toggleEnabled = async () => {
    const next = !enabled;
    setIsTogglingEnabled(true);
    try {
      await api.put("/api/memory/settings", { enabled: next });
      setEnabled(next);
      toast.success(
        next ? "Cortex will now remember facts about you." : "Cortex will stop remembering new facts.",
        toastStyle,
      );
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to update memory setting."), toastStyle);
    } finally {
      setIsTogglingEnabled(false);
    }
  };

  const addFact = async (e) => {
    e.preventDefault();
    const text = newFactText.trim();
    if (!text || isAddingFact) return;

    setIsAddingFact(true);
    try {
      const response = await api.post("/api/memory", { text });

      if (response.data.created) {
        setFacts((prev) => [response.data.fact, ...prev]);
        setNewFactText("");
        toast.success("Memory added.", toastStyle);
      } else if (response.data.reason === "duplicate") {
        toast(`You already have a similar memory: "${response.data.existing.text}"`, toastStyle);
      }
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to add memory."), toastStyle);
    } finally {
      setIsAddingFact(false);
    }
  };

  const startEdit = (fact) => {
    setEditingId(fact.id);
    setEditingText(fact.text);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingText("");
  };

  const saveEdit = async (id) => {
    if (!editingText.trim()) return;

    try {
      await api.put(`/api/memory/${id}`, { text: editingText });
      setFacts((prev) => prev.map((f) => (f.id === id ? { ...f, text: editingText } : f)));
      cancelEdit();
      toast.success("Memory updated.", toastStyle);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to update memory."), toastStyle);
    }
  };

  const deleteFact = async (id) => {
    try {
      await api.delete(`/api/memory/${id}`);
      setFacts((prev) => prev.filter((f) => f.id !== id));
      toast.success("Memory removed.", toastStyle);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to remove memory."), toastStyle);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-neutral-50">Memory</h1>
        <ul className="text-sm text-secondary-text mt-2 space-y-1 list-disc list-inside">
          <li>Personalizes responses using facts learned from your conversations</li>
          <li>Applies across every chat, not just the one where a fact was mentioned</li>
          <li>Fully editable — review, correct, or delete any stored fact at any time</li>
        </ul>
      </div>

      <div className="flex items-center justify-between bg-zinc-950 border border-white/10 rounded-xl p-4 mb-8">
        <div className="pr-4">
          <p className="text-sm font-semibold text-neutral-50">Remember facts about me</p>
          <ul className="text-xs text-secondary-text mt-1 space-y-0.5 list-disc list-inside">
            <li>Off by default — nothing is stored until you enable it</li>
            <li>When on, durable facts (name, role, ongoing projects) are extracted automatically</li>
            <li>Can be turned off at any time without losing facts already stored</li>
          </ul>
        </div>
        <button
          onClick={toggleEnabled}
          disabled={isLoading || isTogglingEnabled}
          role="switch"
          aria-checked={enabled}
          className={`relative shrink-0 w-11 h-6 rounded-full transition-colors disabled:opacity-50 ${
            enabled ? "bg-accent" : "bg-zinc-700"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
              enabled ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      {enabled && (
        <form onSubmit={addFact} className="flex items-start gap-2 mb-6">
          <textarea
            value={newFactText}
            onChange={(e) => setNewFactText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) addFact(e);
            }}
            placeholder="Tell Cortex something to remember, e.g. I lead the platform team"
            rows={1}
            className="flex-1 bg-zinc-950 border border-white/10 rounded-xl p-3 text-white text-sm placeholder-secondary-text focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent resize-none"
          />
          <button
            type="submit"
            disabled={isAddingFact || !newFactText.trim()}
            className="shrink-0 flex items-center gap-1.5 bg-accent hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold py-3 px-4 rounded-xl transition-colors"
          >
            <Plus size={16} />
            Add
          </button>
        </form>
      )}

      {isLoading ? (
        <p className="text-secondary-text text-sm">Loading...</p>
      ) : facts.length === 0 ? (
        <p className="text-secondary-text text-sm">
          {enabled
            ? "Nothing remembered yet - add one above, or keep chatting and Cortex will pick up durable facts over time."
            : "Memory is off, so nothing is being remembered. Turn it on above to let Cortex start personalizing replies."}
        </p>
      ) : (
        <ul className="space-y-3">
          {facts.map((fact) => (
            <li
              key={fact.id}
              className="bg-zinc-950 border border-white/10 rounded-xl p-4 flex items-start gap-3"
            >
              {editingId === fact.id ? (
                <>
                  <textarea
                    value={editingText}
                    onChange={(e) => setEditingText(e.target.value)}
                    rows={2}
                    autoFocus
                    className="flex-1 bg-zinc-900 border border-white/10 rounded-lg p-2 text-white text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent resize-none"
                  />
                  <button
                    onClick={() => saveEdit(fact.id)}
                    className="p-2 rounded-lg hover:bg-white/10 text-green-400 shrink-0"
                    title="Save"
                  >
                    <Check size={16} />
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="p-2 rounded-lg hover:bg-white/10 text-secondary-text shrink-0"
                    title="Cancel"
                  >
                    <X size={16} />
                  </button>
                </>
              ) : (
                <>
                  <p className="flex-1 text-sm text-neutral-100">{fact.text}</p>
                  <button
                    onClick={() => startEdit(fact)}
                    className="p-2 rounded-lg hover:bg-white/10 text-secondary-text hover:text-white shrink-0"
                    title="Edit"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => deleteFact(fact.id)}
                    className="p-2 rounded-lg hover:bg-white/10 text-secondary-text hover:text-red-400 shrink-0"
                    title="Delete"
                  >
                    <Trash2 size={16} />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default MemoryTab;
