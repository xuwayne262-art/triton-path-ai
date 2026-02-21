"use client";

import { useState, useRef, useEffect } from "react";
import { MessageCircle, Send, Bot, User, Sparkles, ChevronDown, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "./types";
import type { College } from "./types";

const SUGGESTED_PROMPTS = [
  "What GE courses does Revelle require?",
  "Best CS electives for ML track?",
  "How do I plan for double major?",
  "Which quarters are hardest for CS?",
];

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
        "Hi! I'm your TritonPath AI Advisor 🔱 I can help with course selection, GE planning, major requirements, and building the best 4-year plan for you. What would you like to know?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isTyping) return;
    setError(null);

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text.trim(),
      timestamp: new Date(),
    };

    // Placeholder for the streaming AI reply
    const aiMsgId = `ai-${Date.now()}`;
    const aiMsg: ChatMessage = {
      id: aiMsgId,
      role: "assistant",
      content: "",
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg, aiMsg]);
    setInput("");
    setIsTyping(true);

    // Abort any previous in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          studentMessage: text.trim(),
          selectedCollege: selectedCollege ?? "Undeclared",
          currentPlan,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error ?? `Server error ${response.status}`);
      }

      if (!response.body) throw new Error("No response body from server.");

      // Read SSE stream and append text chunks incrementally
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);
          if (payload === "[DONE]") break;

          try {
            const parsed = JSON.parse(payload);
            if (parsed.error) throw new Error(parsed.error);
            if (parsed.text) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === aiMsgId
                    ? { ...m, content: m.content + parsed.text }
                    : m
                )
              );
            }
          } catch (parseErr) {
            if (parseErr instanceof Error && parseErr.message !== "Unexpected end of JSON input") {
              throw parseErr;
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      setError(msg);
      // Replace empty AI bubble with error notice
      setMessages((prev) =>
        prev.map((m) =>
          m.id === aiMsgId && m.content === ""
            ? { ...m, content: "Sorry, I couldn't get a response. Please try again." }
            : m
        )
      );
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
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
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                <p className="text-white/50 text-[10px]">
                  {selectedCollege ? `${selectedCollege} College` : "Always available"}
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

            {/* Typing indicator (shown only before first chunk arrives) */}
            {isTyping && messages[messages.length - 1]?.content === "" && (
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
                  className="text-[10px] px-2 py-1 rounded-full border border-gray-200 text-gray-600 hover:border-[#182B49] hover:text-[#182B49] transition-colors leading-tight"
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
              placeholder="Ask about your courses…"
              rows={1}
              className="flex-1 bg-transparent text-xs text-gray-800 outline-none resize-none placeholder:text-gray-400 max-h-24 leading-relaxed"
            />
            <Button
              size="icon"
              disabled={!input.trim() || isTyping}
              onClick={() => sendMessage(input)}
              className="w-7 h-7 shrink-0 rounded-lg text-white disabled:opacity-30"
              style={{ background: "#182B49" }}
            >
              <Send className="w-3.5 h-3.5" />
            </Button>
          </div>
          <p className="text-[10px] text-gray-300 text-center mt-1.5">
            Press Enter to send · Shift+Enter for newline
          </p>
        </div>
      </div>
    </>
  );
}
