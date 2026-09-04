import { useState, useRef, useEffect } from "react";
import { Paperclip, FileText, X } from "lucide-react";
import { api } from "../../shared/api/client";
import toast from "react-hot-toast";
import { getApiErrorMessage } from "../../shared/utils/apiError";

const ChatInput = ({ onSubmit, isLoading, initialText }) => {
  const [text, setText] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [uploadedFileUrl, setUploadedFileUrl] = useState(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const isSendingRef = useRef(false);

  useEffect(() => {
    if (!isLoading) isSendingRef.current = false;
  }, [isLoading]);

  const handleInput = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  useEffect(() => {
    if (text === "" && textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [text]);

  useEffect(() => {
    if (!initialText) return;
    setText(initialText);

    const el = textareaRef.current;
    if (!el) return;

    el.value = initialText;
    el.focus();
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
    const end = el.value.length;
    el.setSelectionRange(end, end);
  }, [initialText]);

  useEffect(() => {
    return () => {
      if (uploadedFileUrl) URL.revokeObjectURL(uploadedFileUrl);
    };
  }, [uploadedFileUrl]);

  const handleSend = () => {
    if (!text.trim() || isLoading || isSendingRef.current) return;
    isSendingRef.current = true;

    onSubmit(text);
    setText("");

    setUploadedFile(null);
    if (uploadedFileUrl) {
      URL.revokeObjectURL(uploadedFileUrl);
      setUploadedFileUrl(null);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleRemoveFile = (e) => {
    e.stopPropagation();
    setUploadedFile(null);
    if (uploadedFileUrl) {
      URL.revokeObjectURL(uploadedFileUrl);
      setUploadedFileUrl(null);
    }
  };

  const handleUploadDocument = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    setIsUploading(true);

    try {
      const response = await api.post(
        `/api/documents/upload`,
        formData
      );

      setUploadedFile(file);
      setUploadedFileUrl(URL.createObjectURL(file));

      toast.success(`${response.data.document.filename} is ready for document questions.`, {
        style: { background: "#18181b", color: "#fff" },
      });
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Document upload failed."), {
        style: { background: "#18181b", color: "#fff" },
      });
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  };

  return (
    <>
      <div className="p-4 w-full bg-zinc-900">
        <div className="max-w-4xl mx-auto bg-zinc-950 border border-white/10 rounded-3xl flex flex-col focus-within:border-accent transition-colors shadow-sm">

          {uploadedFile && (
            <div className="pt-4 px-4 pb-0">
              <div
                onClick={() => setIsPreviewOpen(true)}
                className="relative group flex items-center gap-3 w-64 p-2 bg-zinc-900 border border-white/10 rounded-xl cursor-pointer hover:bg-zinc-800 transition-colors"
              >
                <div className="flex items-center justify-center w-10 h-10 bg-red-500 rounded-lg shrink-0">
                  <FileText className="text-white" size={20} />
                </div>

                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-sm font-semibold text-neutral-50 truncate pr-4">
                    {uploadedFile.name}
                  </span>
                  <span className="text-xs text-secondary-text uppercase font-medium">
                    {uploadedFile.name.split('.').pop()}
                  </span>
                </div>

                <button
                  onClick={handleRemoveFile}
                  className="absolute -top-2 -right-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-full p-1 shadow-md transition-colors"
                  title="Remove file"
                >
                  <X size={14} strokeWidth={3} />
                </button>
              </div>
            </div>
          )}

          <div className="flex items-end p-2 pl-3">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,application/pdf,text/plain"
              onChange={handleUploadDocument}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading || isUploading}
              title="Upload PDF or TXT"
              aria-label="Upload PDF or TXT"
              className="mb-1 p-2 text-secondary-text hover:text-white hover:bg-zinc-800 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Paperclip size={20} className={isUploading ? "animate-pulse" : ""} />
            </button>

            <textarea
              ref={textareaRef}
              placeholder="Ask anything..."
              className="w-full max-h-48 min-h-[44px] bg-transparent text-white placeholder-secondary-text p-2.5 focus:outline-none resize-none overflow-y-auto no-scrollbar rounded-xl leading-relaxed"
              rows={1}
              onInput={handleInput}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              value={text}
              disabled={isLoading}
            />

            <button
              className={`p-2.5 rounded-full transition-colors mb-1 mr-1 ${
                isLoading || isUploading || !text.trim()
                  ? "bg-zinc-800 text-secondary-text cursor-not-allowed"
                  : "bg-accent text-white hover:opacity-90 shadow-sm"
              }`}
              onClick={handleSend}
              disabled={isLoading || isUploading || !text.trim()}
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {isPreviewOpen && uploadedFileUrl && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 md:p-8">
          <div className="bg-zinc-900 w-full max-w-6xl h-full rounded-2xl flex flex-col shadow-2xl overflow-hidden border border-white/10">

            <div className="flex items-center justify-between p-4 border-b border-white/10 bg-zinc-800">
              <div className="flex items-center gap-3">
                <FileText className="text-red-400" size={24} />
                <h3 className="text-neutral-50 font-semibold text-lg">{uploadedFile.name}</h3>
              </div>
              <button
                onClick={() => setIsPreviewOpen(false)}
                className="p-2 text-secondary-text hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 w-full bg-[#343541]">
              <iframe
                src={uploadedFileUrl}
                className="w-full h-full border-none"
                title="Document Preview"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ChatInput;
