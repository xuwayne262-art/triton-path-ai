"use client";

import { useState, useRef, useEffect } from "react";
import { MessageCircle, Send, Bot, User, Sparkles, ChevronDown, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
// One source of truth for the limit, shared with the server-side schema.
import { MAX_MESSAGE_CHARS } from "@/lib/ai/chatSchema";
import type { ChatMessage } from "./types";
import type { College } from "./types";

const SUGGESTED_PROMPTS = [
  "What GE courses does Revelle require?",
  "Best CS electives for ML track?",
  "How do I plan for double major?",
  "Which quarters are hardest for CS?",
];

const UNAVAILABLE_COPY = "The AI advisor is temporarily unavailable.";
const GENERIC_ERROR = "Sorry, I couldn't get a response. Please try again.";

/**
 * Shows a server message only when it arrives as a recognised `{error, code}`
 * pair, so nothing unexpected — a proxy's HTML, a stack trace, a missing
 * environment variable — can reach a student as chat copy.
 */
function safeMessage(payload: unknown): string {
  if (payload && typeof payload === "object") {
    const { error, code } = payload as { error?: unknown; code?: unknown };
    if (typeof error === "string" && typeof code === "string" && error.length <= 200) {
      return error;
    }
  }
  return GENERIC_ERROR;
}

interface AIChatbotProps {
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
  selectedCollege: College | null;
  currentPlan?: Record<string, unknown>;
}

export default function AIChatbot({
  isOpen,
  setIsOpen,
  selectedCollege,
  currentPlan = {},
}: AIChatbotProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Hi! I'm your UCSDPlans AI Advisor 🔱 I can help with course selection, GE planning, major requirements, and building the best 4-year plan for you. What would you like to know?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Availability is the server's answer, never a guess. It starts closed and
   * only `GET /api/chat` can open it, so the UI can never invite a student to
   * send something the server will refuse.
   */
  const [availability, setAvailability] = useState({
    checked: false,
    available: false,
    message: UNAVAILABLE_COPY,
  });
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  /** Guards against a second submit landing before `isTyping` has re-rendered. */
  const inFlightRef = useRef(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  useEffect(() => {
    if (isOpen && availability.available) inputRef.current?.focus();
  }, [isOpen, availability.available]);

  useEffect(() => {
    const probe = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/chat", {
          method: "GET",
          cache: "no-store",
          signal: probe.signal,
        });
        const data = await res.json();
        setAvailability({
          checked: true,
          available: data?.available === true,
          message: typeof data?.message === "string" ? data.message : UNAVAILABLE_COPY,
        });
      } catch {
        if (!probe.signal.aborted) {
          setAvailability({ checked: true, available: false, message: UNAVAILABLE_COPY });
        }
      }
    })();
    return () => probe.abort();
  }, []);

  // Never leave a request running for a component that is gone.
  useEffect(() => () => abortRef.current?.abort(), []);

  const canSend = availability.available && !isTyping;

  const sendMessage = async (text: string, restoreDraft = false) => {
    const trimmed = text.trim();
    if (!trimmed || inFlightRef.current || !canSend) return;
    inFlightRef.current = true;
    setError(null);

    setMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, role: "user", content: trimmed, timestamp: new Date() },
    ]);
    setInput("");
    setIsTyping(true);

    // Abort any previous in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // The assistant bubble is created on the first token, so a request that
    // fails early never leaves an empty bubble behind.
    const aiMsgId = `ai-${Date.now()}`;
    let bubbleCreated = false;
    const appendText = (chunk: string) => {
      if (!bubbleCreated) {
        bubbleCreated = true;
        setMessages((prev) => [
          ...prev,
          { id: aiMsgId, role: "assistant", content: "", timestamp: new Date() },
        ]);
      }
      setMessages((prev) =>
        prev.map((m) => (m.id === aiMsgId ? { ...m, content: m.content + chunk } : m)),
      );
    };

    let failure: string | null = null;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          studentMessage: trimmed,
          selectedCollege: selectedCollege ?? "Undeclared",
          currentPlan,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        // A 503 means the server has closed the advisor; believe it.
        if (response.status === 503) {
          setAvailability({ checked: true, available: false, message: safeMessage(data) });
        }
        failure = safeMessage(data);
      } else if (!response.body) {
        failure = GENERIC_ERROR;
      } else {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let sawDone = false;
        let ended = false;

        // Split on newlines and keep the trailing partial line, so an event
        // cut in half by a network chunk boundary is reassembled, not dropped.
        while (!sawDone && !ended) {
          const { done, value } = await reader.read();
          if (done) {
            ended = true;
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice(6);

            if (payload === "[DONE]") {
              sawDone = true;
              break;
            }

            let parsed: unknown;
            try {
              parsed = JSON.parse(payload);
            } catch {
              continue; // a malformed event, not a split one — skip it
            }

            const event = parsed as { text?: unknown; error?: unknown; code?: unknown };
            if (event.error !== undefined) {
              failure = safeMessage(event);
              sawDone = true;
              break;
            }
            if (typeof event.text === "string") appendText(event.text);
          }
        }

        // Stop pulling as soon as we are finished, done or not.
        await reader.cancel().catch(() => {});

        // A stream that stopped without [DONE] did not succeed, whatever it
        // managed to deliver first. A stream that finished cleanly but said
        // nothing is no better — never leave the student with silence.
        if (failure === null && (!sawDone || !bubbleCreated)) failure = GENERIC_ERROR;
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        // Superseded or unmounted: no error to show.
        setIsTyping(false);
        inFlightRef.current = false;
        return;
      }
      failure = GENERIC_ERROR;
    } finally {
      setIsTyping(false);
      inFlightRef.current = false;
    }

    if (failure !== null) {
      setError(failure);
      // Keep whatever text did arrive; only annotate an answer that never came.
      if (!bubbleCreated) {
        const notice = failure;
        setMessages((prev) => [
          ...prev,
          { id: aiMsgId, role: "assistant", content: notice, timestamp: new Date() },
        ]);
      }
      // Give the student their words back if they have not started retyping.
      if (restoreDraft) setInput((current) => (current === "" ? trimmed : current));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input, true);
    }
  };

  return (
    <>
      {/* Floating toggle button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center text-white transition-transform hover:scale-105 active:scale-95 z-50"
          style={{ background: "#182B49" }}
        >
          <MessageCircle className="w-6 h-6" />
          <span
            className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center"
            style={{ background: "#FFCD00", color: "#182B49" }}
          >
            AI
          </span>
        </button>
      )}

      {/* Chat panel */}
      <div
        className={cn(
          "fixed bottom-0 right-0 z-50 flex flex-col bg-white shadow-2xl transition-all duration-300 ease-in-out",
          "border-l border-gray-200",
          isOpen ? "w-80 h-[calc(100vh-0px)]" : "w-0 h-0 overflow-hidden opacity-0"
        )}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 shrink-0"
          style={{ background: "#182B49" }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: "#FFCD00" }}
            >
              <Sparkles className="w-4 h-4" style={{ color: "#182B49" }} />
            </div>
            <div>
              <p className="text-white font-bold text-sm leading-tight">AI Advisor</p>
              <div className="flex items-center gap-1">
                {/* The dot reports what the server said, not what we hope. */}
                <span
                  className={cn(
                    "w-1.5 h-1.5 rounded-full inline-block",
                    availability.available ? "bg-green-400" : "bg-white/30",
                  )}
                />
                <p className="text-white/50 text-[10px]">
                  {!availability.checked
                    ? "Checking availability…"
                    : availability.available
                      ? selectedCollege
                        ? `${selectedCollege} College`
                        : "Ready"
                      : "Unavailable"}
                </p>
              </div>
            </div>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="text-white/50 hover:text-white transition-colors p-1"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>

        {/* Unavailable notice — the honest state, straight from the server */}
        {availability.checked && !availability.available && (
          <div className="mx-3 mt-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2 shrink-0">
            <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-700 leading-snug">{availability.message}</p>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="mx-3 mt-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 flex items-start gap-2 shrink-0">
            <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-red-600 leading-snug">{error}</p>
          </div>
        )}

        {/* Messages */}
        <ScrollArea className="flex-1 px-3 py-3">
          <div className="space-y-3">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex gap-2",
                  msg.role === "user" ? "flex-row-reverse" : "flex-row"
                )}
              >
                {/* Avatar */}
                <div
                  className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                    msg.role === "assistant" ? "text-white" : "bg-gray-200"
                  )}
                  style={msg.role === "assistant" ? { background: "#182B49" } : {}}
                >
                  {msg.role === "assistant" ? (
                    <Bot className="w-3.5 h-3.5 text-white" />
                  ) : (
                    <User className="w-3.5 h-3.5 text-gray-500" />
                  )}
                </div>

                {/* Bubble */}
                <div
                  className={cn(
                    "max-w-[80%] px-3 py-2 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap",
                    msg.role === "assistant"
                      ? "bg-gray-100 text-gray-800 rounded-tl-none"
                      : "text-white rounded-tr-none"
                  )}
                  style={msg.role === "user" ? { background: "#182B49" } : {}}
                >
                  {/* Streaming cursor while empty */}
                  {msg.content || (
                    <span className="inline-block w-1.5 h-3.5 bg-gray-400 animate-pulse rounded-sm" />
                  )}
                </div>
              </div>
            ))}

            {/* Typing indicator — only while waiting, since the assistant
                bubble is not created until the first chunk arrives. */}
            {isTyping && messages[messages.length - 1]?.role === "user" && (
              <div className="flex gap-2">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: "#182B49" }}
                >
                  <Bot className="w-3.5 h-3.5 text-white" />
                </div>
                <div className="bg-gray-100 rounded-2xl rounded-tl-none px-3 py-2 flex items-center gap-1">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        {/* Suggested prompts */}
        {messages.length <= 2 && (
          <div className="px-3 pb-2 shrink-0">
            <p className="text-[10px] text-gray-400 mb-1.5 px-0.5">Suggested questions</p>
            <div className="flex flex-wrap gap-1">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => sendMessage(prompt)}
                  disabled={!canSend}
                  className="text-[10px] px-2 py-1 rounded-full border border-gray-200 text-gray-600 hover:border-[#182B49] hover:text-[#182B49] transition-colors leading-tight disabled:opacity-40 disabled:hover:border-gray-200 disabled:hover:text-gray-600 disabled:cursor-not-allowed"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="px-3 pb-3 pt-2 shrink-0 border-t border-gray-100">
          <div className="flex items-end gap-2 bg-gray-50 rounded-xl border border-gray-200 px-3 py-2 focus-within:ring-2 focus-within:ring-[#182B49]/20 focus-within:border-[#182B49]">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                availability.available
                  ? "Ask about your courses…"
                  : "The AI advisor is unavailable right now"
              }
              rows={1}
              /* Matches the server's 4,000-character limit on the trimmed message. */
              maxLength={MAX_MESSAGE_CHARS}
              disabled={!availability.available}
              className="flex-1 bg-transparent text-xs text-gray-800 outline-none resize-none placeholder:text-gray-400 max-h-24 leading-relaxed disabled:cursor-not-allowed"
            />
            <Button
              size="icon"
              disabled={!input.trim() || !canSend}
              onClick={() => sendMessage(input, true)}
              className="w-7 h-7 shrink-0 rounded-lg text-white disabled:opacity-30"
              style={{ background: "#182B49" }}
            >
              <Send className="w-3.5 h-3.5" />
            </Button>
          </div>
          <p className="text-[10px] text-gray-300 text-center mt-1.5">
            {availability.available
              ? "Press Enter to send · Shift+Enter for newline"
              : UNAVAILABLE_COPY}
          </p>
        </div>
      </div>
    </>
  );
}
