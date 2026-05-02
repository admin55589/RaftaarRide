import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";

import { API_BASE } from "@/lib/apiBase";

interface ChatThread {
  rideId: number;
  pickup: string | null;
  destination: string | null;
  status: string | null;
  userName: string | null;
  driverName: string | null;
  messageCount: number;
  lastMessage: string | null;
  lastAt: string | null;
}

interface ChatMsg {
  id: number;
  rideId: number;
  senderType: string;
  senderId: number;
  message: string;
  createdAt: string;
}

interface RideDetail {
  id: number;
  pickup: string;
  destination: string;
  status: string;
  userName: string | null;
  driverName: string | null;
}

export function ChatHistoryPage() {
  const { token } = useAuth();
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [selectedRideId, setSelectedRideId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [rideDetail, setRideDetail] = useState<RideDetail | null>(null);
  const [msgLoading, setMsgLoading] = useState(false);
  const [search, setSearch] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchThreads = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/admin/chats/recent`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) setThreads(await res.json());
      } finally {
        setThreadsLoading(false);
      }
    };
    fetchThreads();
  }, []);

  useEffect(() => {
    if (!selectedRideId) return;
    const fetchMsgs = async () => {
      setMsgLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/admin/chat/${selectedRideId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setMessages(data.messages);
          setRideDetail(data.ride);
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
        }
      } finally {
        setMsgLoading(false);
      }
    };
    fetchMsgs();
  }, [selectedRideId]);

  const filtered = threads.filter(
    (t) =>
      !search ||
      (t.userName ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (t.driverName ?? "").toLowerCase().includes(search.toLowerCase()) ||
      String(t.rideId).includes(search)
  );

  const STATUS_COLOR: Record<string, string> = {
    completed: "text-green-400",
    ongoing: "text-blue-400",
    cancelled: "text-red-400",
    searching: "text-amber-400",
    accepted: "text-blue-400",
  };

  return (
    <div className="flex h-[calc(100vh-0px)] overflow-hidden">
      {/* Sidebar - Thread List */}
      <div className="w-80 border-r border-border flex flex-col bg-card/40">
        <div className="p-4 border-b border-border">
          <h1 className="text-lg font-bold text-foreground">Chat History</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Driver-User conversations</p>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name / ride ID..."
            className="mt-3 w-full px-3 py-2 text-xs bg-muted/40 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground"
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          {threadsLoading ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-16 bg-muted/20 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <div className="text-4xl mb-3">💬</div>
              <div className="text-sm text-muted-foreground">
                {threads.length === 0
                  ? "Abhi tak koi chat nahi hui. Jab driver aur user chat karenge toh yahan dikhega."
                  : "Koi result nahi mila"}
              </div>
            </div>
          ) : (
            filtered.map((t) => (
              <button
                key={t.rideId}
                onClick={() => setSelectedRideId(t.rideId)}
                className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-muted/30 transition-colors ${
                  selectedRideId === t.rideId ? "bg-primary/5 border-l-2 border-l-primary" : ""
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-mono font-bold text-foreground">Ride #{t.rideId}</span>
                  <span className={`text-xs ${STATUS_COLOR[t.status ?? ""] ?? "text-muted-foreground"}`}>
                    {t.status}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                  <span>👤 {t.userName ?? "?"}</span>
                  <span>•</span>
                  <span>🧑‍✈️ {t.driverName ?? "?"}</span>
                </div>
                <div className="text-xs text-muted-foreground truncate italic">
                  "{t.lastMessage ?? "..."}"
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-muted-foreground/60">
                    {t.lastAt ? new Date(t.lastAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}
                  </span>
                  <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                    {t.messageCount} msgs
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Chat Panel */}
      <div className="flex-1 flex flex-col">
        {!selectedRideId ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
            <div className="text-5xl mb-4">💬</div>
            <h2 className="text-lg font-semibold text-foreground mb-2">Chat History</h2>
            <p className="text-muted-foreground text-sm max-w-xs">
              Left side se koi ride select karo uski chat dekhne ke liye
            </p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-5 py-4 border-b border-border bg-card/60 flex items-center gap-4">
              <button
                onClick={() => setSelectedRideId(null)}
                className="text-muted-foreground hover:text-foreground lg:hidden"
              >
                ←
              </button>
              <div>
                <div className="font-semibold text-foreground text-sm">
                  Ride #{selectedRideId}
                  {rideDetail && (
                    <span className={`ml-2 text-xs ${STATUS_COLOR[rideDetail.status] ?? "text-muted-foreground"}`}>
                      • {rideDetail.status}
                    </span>
                  )}
                </div>
                {rideDetail && (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    👤 {rideDetail.userName ?? "?"} ↔ 🧑‍✈️ {rideDetail.driverName ?? "?"} &nbsp;|&nbsp;
                    {rideDetail.pickup} → {rideDetail.destination}
                  </div>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {msgLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className="text-4xl mb-3">🤫</div>
                  <div className="text-muted-foreground text-sm">
                    Is ride mein koi chat message nahi hai
                  </div>
                </div>
              ) : (
                <>
                  {messages.map((msg) => {
                    const isDriver = msg.senderType === "driver";
                    return (
                      <div key={msg.id} className={`flex ${isDriver ? "justify-start" : "justify-end"}`}>
                        <div className={`max-w-xs lg:max-w-md`}>
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-xs text-muted-foreground">
                              {isDriver ? "🧑‍✈️ Driver" : "👤 User"}
                            </span>
                            <span className="text-xs text-muted-foreground/50">
                              {new Date(msg.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                          <div
                            className={`px-4 py-2.5 rounded-2xl text-sm ${
                              isDriver
                                ? "bg-muted/60 text-foreground rounded-tl-sm"
                                : "bg-primary text-primary-foreground rounded-tr-sm"
                            }`}
                          >
                            {msg.message}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </>
              )}
            </div>

            <div className="px-5 py-3 border-t border-border bg-card/40">
              <p className="text-xs text-muted-foreground text-center">
                Admin sirf chat dekh sakta hai — messages send nahi kar sakta (read-only view)
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
