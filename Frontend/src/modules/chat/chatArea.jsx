import { useEffect, useState, useRef, useCallback } from "react";
import ChatInput from "./chatInput";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { fetchEventSource } from "@microsoft/fetch-event-source";
import { api, getAccessToken, refreshSession } from "../../shared/api/client";
import { useDispatch, useSelector } from "react-redux";
import { updateChatTitle, addChat } from "./chat.slice";

import { useAuth } from "../auth/auth.hook";
import { useAutoScroll } from "./autoScroll.hook";

import WelcomeScreen from "./welcomeScreen";
import MessageBubble from "./messageBubble";
import { getApiErrorMessage } from "../../shared/utils/apiError";

const isTokenNearExpiry = (token, secondsOfSlack = 60) => {
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (!payload.exp) return true;
    return payload.exp * 1000 - Date.now() < secondsOfSlack * 1000;
  } catch {
    return true;
  }
};

const ChatArea = () => {
  const { chatId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [prefillMessage, setPrefillMessage] = useState(null);
  useEffect(() => {
    if (location.state?.prefillMessage) {
      setPrefillMessage(location.state.prefillMessage);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate]);

  const { token } = useAuth();
  const dispatch = useDispatch();
  const settings = useSelector((state) => state.settings);

  const [message, setmessage] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const abortControllerRef = useRef(null);
  const isSendingRef = useRef(false);

  const endOfMessagesRef = useAutoScroll([message, isLoading, error]);

  const loadMessages = useCallback(async (id) => {
    try {
      const response = await api.get(`/api/messages/${id}`);
      setmessage(response.data.messages);
    } catch (err) {
      console.log("Error Occured while fetching messages", err);
    }
  }, []);

  useEffect(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
    }

    if (!chatId) {
      setmessage([]);
      return;
    }

    let cancelled = false;

    const fetchmessages = async () => {
      try {
        const response = await api.get(`/api/messages/${chatId}`);
        if (!cancelled) setmessage(response.data.messages);
      } catch (error) {
        if (!cancelled) console.log("Error Occured while fetching messages", error);
      }
    };
    fetchmessages();

    return () => {
      cancelled = true;
    };
  }, [chatId, token]);

  useEffect(
    () => () => {
      abortControllerRef.current?.abort();
    },
    [],
  );

  const handleStopGenerating = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);

      setmessage((prev) =>
        prev.map((msg) =>
          msg.role === "AI" && msg._id.startsWith("ai-") && msg.content === ""
            ? { ...msg, content: "*[Generation stopped by user]*" }
            : msg,
        ),
      );
    }
  };

  const handleSendMessage = async (text) => {
    if (isSendingRef.current) return;
    isSendingRef.current = true;

    abortControllerRef.current = new AbortController();

    let activeChatId = chatId;

    let failedIntoChat = null;

    // One key per logical send. If the transport re-issues the request internally (retry,
    // reconnect), the same key goes out and the backend rejects the repeat. A genuinely new
    // message gets a fresh key, so sending the same text twice on purpose still works.
    const idempotencyKey =
      globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const tempUserMsg = {
      _id: Date.now().toString(),
      content: text,
      role: "USER",
    };

    const tempAiMsgId = "ai-" + Date.now().toString();
    const tempAiMsg = { _id: tempAiMsgId, content: "", role: "AI" };

    setmessage((prev) => [...prev, tempUserMsg, tempAiMsg]);
    setIsLoading(true);
    setError(null);

    try {
      let streamToken = getAccessToken();
      if (isTokenNearExpiry(streamToken)) {
        try {
          streamToken = await refreshSession();
        } catch {
        }
      }

      const streamController = abortControllerRef.current;

      await fetchEventSource(`${import.meta.env.VITE_API_URL}/api/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${streamToken}`,
        },
        body: JSON.stringify({
          content: text,
          chatId: chatId || undefined,
          model: settings.model,
          systemPrompt: settings.systemPrompt,
          idempotencyKey,
        }),

        signal: abortControllerRef.current.signal,

        // Without this, fetch-event-source registers a `visibilitychange` listener that
        // aborts the in-flight request and re-issues the ENTIRE POST every time the tab
        // regains focus - producing a duplicate user message and a duplicate AI reply on
        // every alt-tab. The retry happens inside the library, so no guard in this file
        // can catch it; the only fix is to stop it registering the listener at all.
        openWhenHidden: true,

        async onopen(response) {
          const contentType = response.headers.get("content-type") || "";
          if (response.ok && contentType.includes("text/event-stream")) return;

          if (response.status === 401) {
            throw new Error("Your session expired. Please sign in again.");
          }

          let detail = "";
          try {
            const body = await response.json();
            detail = getApiErrorMessage({ response: { data: body } }, "");
            if (body?.newChat) failedIntoChat = { newChat: body.newChat };
          } catch {
            detail = "";
          }
          throw new Error(detail || `The server couldn't start the response (${response.status}).`);
        },

        onmessage(event) {
          if (streamController?.signal.aborted) return;

          let parsedData;
          try {
            parsedData = JSON.parse(event.data);
          } catch {
            console.error("Failed to parse event:", event.data);
            return;
          }

          if (parsedData.error) {
            if (parsedData.newChat) failedIntoChat = { newChat: parsedData.newChat };
            throw new Error(parsedData.error);
          }

          try {
            if (parsedData.chunk) {
              setmessage((prev) =>
                prev.map((msg) =>
                  msg._id === tempAiMsgId
                    ? { ...msg, content: msg.content + parsedData.chunk }
                    : msg,
                ),
              );
            }

            if (parsedData.done) {
              setmessage((prev) =>
                prev.map((msg) =>
                  msg._id === tempAiMsgId ? parsedData.aiMessage : msg,
                ),
              );

              if (parsedData.newChat && !chatId) {
                dispatch(
                  addChat(
                    parsedData.newTitle
                      ? { ...parsedData.newChat, title: parsedData.newTitle }
                      : parsedData.newChat,
                  ),
                );
                navigate(`/chat/${parsedData.newChat._id}`);
              } else if (parsedData.newTitle) {
                dispatch(
                  updateChatTitle({
                    chatId: parsedData.newChat?._id || activeChatId,
                    newTitle: parsedData.newTitle,
                  }),
                );
              }

              abortControllerRef.current?.abort();
            }
          } catch {
            console.error("Failed to parse event:", event.data);
          }
        },
        onerror(err) {
          throw err;
        },
      });
    } catch (err) {
      if (abortControllerRef.current?.signal.aborted) {
        console.log("Generation successfully stopped by the user.");
      } else {
        console.error("Message send error:", err);
        setmessage((prev) =>
          prev.filter(
            (m) => m._id !== tempUserMsg._id && m._id !== tempAiMsgId,
          ),
        );

        if (!chatId && failedIntoChat?.newChat) {
          dispatch(addChat(failedIntoChat.newChat));
          navigate(`/chat/${failedIntoChat.newChat._id}`);
        } else if (chatId) {
          await loadMessages(chatId);
        } else {
          setError({ text, reason: err?.message });
        }
      }
    } finally {
      isSendingRef.current = false;
      setIsLoading(false);
    }
  };

  const handleRetry = () => {
    if (error && error.text) {
      handleSendMessage(error.text);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-900">
      <div className="flex-1 overflow-y-auto no-scrollbar p-4 text-neutral-50">
        <div className="max-w-4xl mx-auto flex flex-col text-left h-full">
          {message.length === 0 && !isLoading ? (
            <WelcomeScreen />
          ) : (
            <div className="flex flex-col gap-8 py-8 h-full">
              <div className="max-w-4xl mx-auto flex flex-col gap-6 py-6 w-full">
                {message.map((msg) => (
                  <MessageBubble key={msg._id} msg={msg} />
                ))}

                {error && (
                  <div className="flex flex-col items-center justify-center p-4 bg-red-900/50 border border-red-500 rounded-xl mt-4 mx-auto max-w-lg">
                    <span className="text-red-200 font-semibold mb-2 text-center">
                      {error.reason || "Failed to reach the AI server."}
                    </span>
                    <button
                      onClick={handleRetry}
                      className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                    >
                      Retry Message
                    </button>
                  </div>
                )}

                <div ref={endOfMessagesRef} />
              </div>
            </div>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="flex justify-center -mb-2 z-10 relative">
          <button
            onClick={handleStopGenerating}
            className="flex items-center gap-2 bg-zinc-900 hover:bg-red-600 text-secondary-text hover:text-white px-4 py-2 rounded-full text-sm font-semibold border border-white/10 hover:border-red-500 transition-all shadow-lg"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            </svg>
            Stop Generating
          </button>
        </div>
      )}

      <ChatInput onSubmit={handleSendMessage} isLoading={isLoading} initialText={prefillMessage} />
    </div>
  );
};

export default ChatArea;
