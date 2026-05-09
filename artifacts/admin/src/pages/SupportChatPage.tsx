import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, RefreshCw, CheckCircle, Clock, Send, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { API_BASE } from "@/lib/apiBase";

interface SupportMsg {
  id: number;
  chatId: number;
  senderRole: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

interface SupportChat {
  id: number;
  userId: number | null;
  driverId: number | null;
  role: string;
  subject: string;
  status: string;
  unreadCount: number;
  createdAt: string;
}

function fmt(d?: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function fmtTime(d: string) {
  return new Date(d).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

const STATUS_STYLE: Record<string, string> = {
  open: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  resolved: "bg-green-500/15 text-green-400 border-green-500/30",
};

export function SupportChatPage() {
  const { token } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selectedChatId, setSelectedChatId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [replyInput, setReplyInput] = useState<Record<number, string>>({});
  const [messages, setMessages] = useState<SupportMsg[]>([]);
  const [msgsLoading, setMsgsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin-support", statusFilter],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/admin/support`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch support chats");
      return res.json();
    },
    enabled: !!token,
    refetchInterval: 15000,
  });

  const fetchMessages = useCallback(async (chatId: number) => {
    if (!token) return;
    setMsgsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/support/${chatId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await res.json();
      if (d.success) {
        setMessages(d.messages ?? []);
        qc.invalidateQueries({ queryKey: ["admin-support"] });
      }
    } finally { setMsgsLoading(false); }
  }, [token, qc]);

  useEffect(() => {
    if (selectedChatId !== null) fetchMessages(selectedChatId);
  }, [selectedChatId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  /* Poll selected chat every 10s */
  useEffect(() => {
    if (selectedChatId === null) return;
    const id = setInterval(() => fetchMessages(selectedChatId), 10000);
    return () => clearInterval(id);
  }, [selectedChatId, fetchMessages]);

  const replyMutation = useMutation({
    mutationFn: async ({ chatId, message }: { chatId: number; message: string }) => {
      const res = await fetch(`${API_BASE}/api/admin/support/${chatId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) throw new Error("Reply failed");
      return res.json();
    },
    onSuccess: (data, { chatId }) => {
      if (data.success) {
        setMessages(prev => [...prev, data.message]);
        setReplyInput(prev => ({ ...prev, [chatId]: "" }));
      }
    },
    onError: () => toast({ title: "Error", description: "Reply send nahi ho saka", variant: "destructive" }),
  });

  const resolveMutation = useMutation({
    mutationFn: async (chatId: number) => {
      const res = await fetch(`${API_BASE}/api/admin/support/${chatId}/resolve`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Resolve failed");
      return res.json();
    },
    onSuccess: async (_, chatId) => {
      await fetchMessages(chatId);
      qc.invalidateQueries({ queryKey: ["admin-support"] });
      toast({ title: "Resolved ✅", description: "Chat resolved — user ko message bhej diya" });
    },
    onError: () => toast({ title: "Error", description: "Resolve nahi ho saka", variant: "destructive" }),
  });

  const chats: SupportChat[] = data?.chats ?? [];
  const filtered = chats.filter(c => statusFilter === "all" ? true : c.status === statusFilter);
  const selectedChat = chats.find(c => c.id === selectedChatId);

  const totalOpen = chats.filter(c => c.status === "open").length;
  const totalUnread = chats.reduce((s, c) => s + (c.unreadCount ?? 0), 0);

  return (
    <div className="flex h-full">
      {/* Left panel — chat list */}
      <div className="w-80 shrink-0 border-r border-border flex flex-col h-full">
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-primary" />
                Support Chats
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {totalOpen} open · {totalUnread} unread
              </p>
            </div>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="p-1.5 rounded-lg hover:bg-muted/20 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 text-muted-foreground ${isFetching ? "animate-spin" : ""}`} />
            </button>
          </div>
          <div className="flex gap-1.5">
            {["open", "resolved", "all"].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`flex-1 text-xs py-1.5 rounded-lg font-medium transition-colors capitalize ${statusFilter === s ? "bg-primary text-primary-foreground" : "bg-muted/20 text-muted-foreground hover:bg-muted/30"}`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center text-muted-foreground text-sm p-8">
              {statusFilter === "open" ? "🎉 Koi open chat nahi!" : "Koi chat nahi mili"}
            </div>
          ) : (
            filtered.map(c => (
              <button
                key={c.id}
                onClick={() => setSelectedChatId(c.id)}
                className={`w-full text-left px-4 py-3 border-b border-border/50 transition-colors hover:bg-muted/10 ${selectedChatId === c.id ? "bg-primary/10 border-l-2 border-l-primary" : ""}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">
                        {c.role === "driver" ? "🚗" : "👤"} #{c.id}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${STATUS_STYLE[c.status] ?? STATUS_STYLE.open}`}>
                        {c.status}
                      </span>
                      {c.unreadCount > 0 && (
                        <span className="text-[10px] bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center font-bold">
                          {c.unreadCount}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">{c.subject}</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">{fmt(c.createdAt)}</p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Right panel — chat thread */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {!selectedChat ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Koi chat select karo</p>
            </div>
          </div>
        ) : (
          <>
            {/* Thread header */}
            <div className="px-5 py-3 border-b border-border flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">
                    {selectedChat.role === "driver" ? "🚗 Driver" : "👤 User"} · Ticket #{selectedChat.id}
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${STATUS_STYLE[selectedChat.status] ?? STATUS_STYLE.open}`}>
                    {selectedChat.status}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{selectedChat.subject}</p>
              </div>
              <div className="flex items-center gap-2">
                {selectedChat.status === "open" && (
                  <button
                    onClick={() => resolveMutation.mutate(selectedChat.id)}
                    disabled={resolveMutation.isPending}
                    className="flex items-center gap-1.5 text-xs bg-green-500/15 text-green-400 border border-green-500/30 rounded-lg px-3 py-1.5 hover:bg-green-500/25 transition-colors font-medium"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    Resolve
                  </button>
                )}
                <button onClick={() => setSelectedChatId(null)} className="p-1.5 rounded-lg hover:bg-muted/20 transition-colors">
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
              {msgsLoading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center text-muted-foreground text-sm pt-12">Koi messages nahi</div>
              ) : (
                messages.map(msg => {
                  const isAdmin = msg.senderRole === "admin";
                  return (
                    <div key={msg.id} className={`flex ${isAdmin ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 text-sm ${isAdmin
                          ? "bg-primary/15 border border-primary/25 rounded-br-sm"
                          : "bg-muted/20 border border-border/50 rounded-bl-sm"
                        }`}>
                        {!isAdmin && (
                          <p className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase tracking-wide">
                            {msg.senderRole === "driver" ? "DRIVER" : "USER"}
                          </p>
                        )}
                        {isAdmin && (
                          <p className="text-[10px] font-semibold text-primary mb-1 uppercase tracking-wide">YOU (ADMIN)</p>
                        )}
                        <p className="text-foreground whitespace-pre-wrap leading-relaxed">{msg.message}</p>
                        <p className="text-[10px] text-muted-foreground/60 mt-1">{fmtTime(msg.createdAt)}</p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Reply box */}
            {selectedChat.status === "open" && (
              <div className="px-4 py-3 border-t border-border flex items-end gap-2">
                <textarea
                  value={replyInput[selectedChat.id] ?? ""}
                  onChange={e => setReplyInput(prev => ({ ...prev, [selectedChat.id]: e.target.value }))}
                  placeholder="Reply likhein..."
                  rows={2}
                  className="flex-1 bg-muted/10 border border-border/50 rounded-xl px-3 py-2 text-sm text-foreground placeholder-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary/50"
                  onKeyDown={e => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      const msg = replyInput[selectedChat.id];
                      if (msg?.trim()) replyMutation.mutate({ chatId: selectedChat.id, message: msg });
                    }
                  }}
                />
                <button
                  onClick={() => {
                    const msg = replyInput[selectedChat.id];
                    if (msg?.trim()) replyMutation.mutate({ chatId: selectedChat.id, message: msg });
                  }}
                  disabled={!replyInput[selectedChat.id]?.trim() || replyMutation.isPending}
                  className="h-10 w-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {replyMutation.isPending
                    ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <Send className="w-4 h-4" />
                  }
                </button>
              </div>
            )}

            {selectedChat.status === "resolved" && (
              <div className="px-4 py-3 border-t border-border text-center text-sm text-muted-foreground">
                <Clock className="w-4 h-4 inline mr-1.5" />
                Chat resolved — user ko message bhej diya gaya hai
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
