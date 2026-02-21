"use client";

import { useState } from "react";
import Sidebar from "@/components/triton/Sidebar";
import FourYearGrid from "@/components/triton/FourYearGrid";
import AIChatbot from "@/components/triton/AIChatbot";
import type { College } from "@/components/triton/types";

export default function Home() {
  const [selectedCollege, setSelectedCollege] = useState<College | null>(null);
  const [selectedMajor, setSelectedMajor] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Left Sidebar */}
      <div className="w-60 shrink-0 flex flex-col h-full overflow-hidden shadow-xl">
        <Sidebar
          selectedCollege={selectedCollege}
          setSelectedCollege={setSelectedCollege}
          selectedMajor={selectedMajor}
          setSelectedMajor={setSelectedMajor}
        />
      </div>

      {/* Main Content */}
      <main
        className="flex-1 overflow-hidden"
        style={{ marginRight: chatOpen ? "320px" : "0", transition: "margin 0.3s ease" }}
      >
        <FourYearGrid />
      </main>

      {/* AI Chatbot */}
      <AIChatbot
        isOpen={chatOpen}
        setIsOpen={setChatOpen}
        selectedCollege={selectedCollege}
      />
    </div>
  );
}
