import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileText,
  File,
  Upload,
  Trash2,
  Search,
  Plus,
  MessageSquare,
  X,
  AlertTriangle,
  Download,
} from "lucide-react";
import toast from "react-hot-toast";

import { api } from "../../shared/api/client";
import { getApiErrorMessage } from "../../shared/utils/apiError";
import { formatFileSize, formatRelativeTime } from "../../shared/utils/format";
import { useDebounce } from "../../shared/hooks/useDebounce";

const ACCEPTED_TYPES = ".pdf,.txt";
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const fileVisual = (doc) => {
  if (doc.detectedMimeType === "application/pdf") {
    return { Icon: FileText, badgeClass: "bg-red-500/15 text-red-400" };
  }
  return { Icon: File, badgeClass: "bg-accent/15 text-accent" };
};

const LibraryPage = () => {
  const navigate = useNavigate();

  const [documents, setDocuments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 250);

  const [isUploading, setIsUploading] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragDepthRef = useRef(0);
  const fileInputRef = useRef(null);

  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [previewDoc, setPreviewDoc] = useState(null);

  const fetchDocuments = useCallback(async () => {
    setIsLoading(true);
    setLoadError(false);
    try {
      const response = await api.get("/api/documents");
      setDocuments(response.data.documents);
    } catch (error) {
      setLoadError(true);
      toast.error(getApiErrorMessage(error, "Couldn't load your library."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const validateFile = (file) => {
    if (file.size > MAX_FILE_BYTES) {
      toast.error(`${file.name} is over the 10 MB limit.`);
      return false;
    }
    return true;
  };

  const uploadFile = async (file) => {
    if (!validateFile(file)) return;

    const formData = new FormData();
    formData.append("file", file);
    setIsUploading(true);

    try {
      const response = await api.post("/api/documents/upload", formData);
      setDocuments((prev) => [response.data.document, ...prev]);
      toast.success(`${response.data.document.filename} uploaded.`);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Upload failed."));
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileInputChange = (event) => {
    const file = event.target.files?.[0];
    if (file) uploadFile(file);
    event.target.value = "";
  };

  const handleDragEnter = (event) => {
    event.preventDefault();
    dragDepthRef.current += 1;
    if (event.dataTransfer.types.includes("Files")) setIsDraggingOver(true);
  };
  const handleDragLeave = (event) => {
    event.preventDefault();
    dragDepthRef.current -= 1;
    if (dragDepthRef.current <= 0) {
      dragDepthRef.current = 0;
      setIsDraggingOver(false);
    }
  };
  const handleDragOver = (event) => event.preventDefault();
  const handleDrop = (event) => {
    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDraggingOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  };

  const handleDelete = async (documentId) => {
    setDeletingId(documentId);
    try {
      await api.delete(`/api/documents/${documentId}`);
      setDocuments((prev) => prev.filter((doc) => doc._id !== documentId));
      toast.success("Deleted.");
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Couldn't delete this file."));
    } finally {
      setDeletingId(null);
      setPendingDeleteId(null);
    }
  };

  const handleAskAbout = (filename) => {
    navigate("/", { state: { prefillMessage: `Tell me about my document "${filename}"` } });
  };

  const visibleDocuments = documents.filter((doc) =>
    doc.filename.toLowerCase().includes(debouncedQuery.toLowerCase()),
  );

  return (
    <div
      className="flex-1 flex flex-col h-full bg-zinc-950 overflow-y-auto relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {isDraggingOver && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-zinc-950/90 backdrop-blur-sm border-4 border-dashed border-accent m-4 rounded-3xl pointer-events-none animate-fade-in">
          <div className="flex flex-col items-center gap-3 text-accent">
            <Upload size={48} className="animate-bounce" />
            <p className="text-xl font-semibold">Drop to upload</p>
            <p className="text-sm text-accent/70">PDF or TXT, up to 10 MB</p>
          </div>
        </div>
      )}

      <div className="max-w-5xl w-full mx-auto px-6 py-10">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-neutral-50">Library</h1>
            <p className="text-secondary-text text-sm mt-1">
              Documents you've uploaded, ready for Cortex to search when you ask about them.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-secondary-text" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search..."
                className="bg-zinc-900 border border-white/10 rounded-full py-2 pl-9 pr-4 text-sm text-white placeholder-secondary-text focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-shadow w-40 sm:w-56"
              />
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES}
              onChange={handleFileInputChange}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="flex items-center gap-2 bg-accent hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold px-4 py-2.5 rounded-full transition-colors shadow-sm shrink-0"
            >
              {isUploading ? (
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <Plus size={18} />
              )}
              {isUploading ? "Uploading…" : "New"}
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-14 bg-zinc-900 border border-white/10 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <AlertTriangle size={36} className="text-amber-500 mb-3" />
            <p className="text-neutral-50 font-medium">Couldn't load your library.</p>
            <button onClick={fetchDocuments} className="mt-4 text-sm text-accent hover:text-accent/80 font-medium">
              Try again
            </button>
          </div>
        ) : documents.length === 0 ? (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex flex-col items-center justify-center gap-3 py-20 border-2 border-dashed border-white/10 hover:border-accent/50 rounded-3xl transition-colors group"
          >
            <div className="p-4 bg-zinc-900 group-hover:bg-zinc-800 rounded-2xl border border-white/10 transition-colors">
              <Upload size={28} className="text-secondary-text group-hover:text-accent transition-colors" />
            </div>
            <p className="text-neutral-50 font-medium">No documents yet</p>
            <p className="text-secondary-text text-sm max-w-xs">
              Upload a PDF or text file, or drag one anywhere on this page — Cortex will read
              it and answer questions about it in chat.
            </p>
          </button>
        ) : visibleDocuments.length === 0 ? (
          <div className="text-center py-16 text-secondary-text">
            <p>No documents match "{debouncedQuery}".</p>
          </div>
        ) : (
          <div className="border border-white/10 rounded-xl overflow-hidden">
            <div className="grid grid-cols-[1fr_120px_90px_40px] gap-4 px-4 py-2.5 text-xs font-medium text-secondary-text uppercase border-b border-white/10 bg-zinc-900/60">
              <span>Name</span>
              <span>Modified</span>
              <span>Size</span>
              <span />
            </div>

            {visibleDocuments.map((doc) => {
              const { Icon, badgeClass } = fileVisual(doc);
              const isPendingDelete = pendingDeleteId === doc._id;
              const isDeleting = deletingId === doc._id;

              return (
                <div
                  key={doc._id}
                  className="relative grid grid-cols-[1fr_120px_90px_40px] gap-4 items-center px-4 py-3 border-b border-white/10 last:border-b-0 hover:bg-zinc-900/60 transition-colors group cursor-pointer"
                  onClick={() => setPreviewDoc(doc)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${badgeClass}`}>
                      <Icon size={15} />
                    </div>
                    <span className="text-sm text-neutral-50 truncate" title={doc.filename}>
                      {doc.filename}
                    </span>
                  </div>

                  <span className="text-xs text-secondary-text">{formatRelativeTime(doc.createdAt)}</span>
                  <span className="text-xs text-secondary-text">{formatFileSize(doc.size)}</span>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPendingDeleteId(doc._id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1.5 text-secondary-text hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all justify-self-end"
                    title="Delete"
                    aria-label={`Delete ${doc.filename}`}
                  >
                    <Trash2 size={15} />
                  </button>

                  {isPendingDelete && (
                    <div
                      className="absolute inset-0 bg-zinc-900/98 backdrop-blur-sm flex items-center justify-center gap-3 px-4 animate-fade-in"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <p className="text-sm text-neutral-50">
                        Delete <span className="font-semibold">{doc.filename}</span>?
                      </p>
                      <button
                        onClick={() => setPendingDeleteId(null)}
                        disabled={isDeleting}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-neutral-50 hover:bg-zinc-800 rounded-lg transition-colors disabled:opacity-50"
                      >
                        <X size={13} /> Cancel
                      </button>
                      <button
                        onClick={() => handleDelete(doc._id)}
                        disabled={isDeleting}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white rounded-lg transition-colors"
                      >
                        {isDeleting ? (
                          <div className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        ) : (
                          <Trash2 size={13} />
                        )}
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {previewDoc && (
        <FilePreviewModal
          doc={previewDoc}
          onClose={() => setPreviewDoc(null)}
          onAskAbout={() => handleAskAbout(previewDoc.filename)}
        />
      )}
    </div>
  );
};

const FilePreviewModal = ({ doc, onClose, onAskAbout }) => {
  const [blobUrl, setBlobUrl] = useState(null);
  const [textContent, setTextContent] = useState(null);
  const [state, setState] = useState("loading");

  useEffect(() => {
    let cancelled = false;
    let objectUrl = null;

    (async () => {
      try {
        const response = await api.get(`/api/documents/${doc._id}/content`, { responseType: "blob" });
        if (cancelled) return;

        if (doc.detectedMimeType === "text/plain") {
          setTextContent(await response.data.text());
        } else {
          objectUrl = URL.createObjectURL(response.data);
          setBlobUrl(objectUrl);
        }
        setState("ready");
      } catch (error) {
        if (cancelled) return;
        setState(error?.response?.status === 404 ? "unavailable" : "error");
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [doc._id, doc.detectedMimeType]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 w-full max-w-3xl max-h-[85vh] rounded-2xl flex flex-col shadow-2xl overflow-hidden border border-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-white/10 shrink-0">
          <h3 className="text-neutral-50 font-semibold text-sm truncate pr-4">{doc.filename}</h3>
          <div className="flex items-center gap-1 shrink-0">
            {blobUrl && (
              <a
                href={blobUrl}
                download={doc.filename}
                className="p-2 text-secondary-text hover:text-neutral-50 hover:bg-zinc-800 rounded-lg transition-colors"
                title="Download"
              >
                <Download size={16} />
              </a>
            )}
            {onAskAbout && (
              <button
                onClick={onAskAbout}
                className="flex items-center gap-1.5 text-xs font-medium text-accent hover:text-accent/80 px-2 py-1.5 transition-colors"
              >
                <MessageSquare size={14} /> Ask about this
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-secondary-text hover:text-neutral-50 hover:bg-zinc-800 rounded-lg transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-zinc-950 flex items-center justify-center min-h-[300px]">
          {state === "loading" && (
            <div className="w-6 h-6 border-2 border-white/20 border-t-accent rounded-full animate-spin" />
          )}
          {state === "unavailable" && (
            <p className="text-secondary-text text-sm text-center max-w-xs p-6">
              This file was uploaded before previews were supported, so there's nothing to show here.
            </p>
          )}
          {state === "error" && (
            <p className="text-secondary-text text-sm text-center max-w-xs p-6">Couldn't load this file.</p>
          )}
          {state === "ready" && doc.detectedMimeType === "application/pdf" && (
            <iframe src={blobUrl} title={doc.filename} className="w-full h-[70vh] border-0" />
          )}
          {state === "ready" && doc.detectedMimeType === "text/plain" && (
            <pre className="w-full h-full p-6 text-sm text-neutral-50 whitespace-pre-wrap overflow-auto">
              {textContent}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
};

export default LibraryPage;
