// ChatUI page — Private + Global chat tabs powered by test-hub.xyz backend.
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Menu, MessageCircle, Phone, CircleFadingPlus, Settings, User2, ChevronUp,
  SquarePen, ListFilter, Search, Video, Smile, Paperclip, Send, Mic, Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";

const API = "https://game.test-hub.xyz";

type Contact = { address: string; name: string; image?: string; message?: string };
type Msg = { from?: string; wallet?: string; to?: string; message: string; ts?: number; id?: string };

const menuItems = [
  { title: "Messages", icon: MessageCircle },
  { title: "Phone", icon: Phone },
  { title: "Status", icon: CircleFadingPlus },
];

const short = (a: string) => (a && a.length > 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a || "");
const avatarFor = (addr: string) => `https://api.dicebear.com/7.x/identicon/svg?seed=${addr || "x"}`;

const Avatar: React.FC<{ src?: string; name: string; size?: number }> = ({ src, name, size = 48 }) => (
  <div
    className="rounded-full overflow-hidden shrink-0 bg-zinc-800 flex items-center justify-center text-white text-sm font-semibold"
    style={{ width: size, height: size }}
  >
    {src ? (
      <img src={src} alt={name} className="w-full h-full object-cover" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
    ) : (
      <span>{(name || "?")[0]}</span>
    )}
  </div>
);

const IconBtn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }> = ({ className, children, ...p }) => (
  <button
    {...p}
    className={cn(
      "h-9 w-9 inline-flex items-center justify-center rounded-md text-zinc-300 hover:bg-white/5 hover:text-white transition-colors",
      className
    )}
  >
    {children}
  </button>
);

export default function ChatUIPage() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [tab, setTab] = useState<"private" | "global">("private");
  const [wallet, setWallet] = useState<string>("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [current, setCurrent] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);

  // Connect wallet (read-only — use whatever's connected)
  useEffect(() => {
    const eth: any = (window as any).ethereum;
    if (!eth) return;
    eth.request({ method: "eth_accounts" }).then((accs: string[]) => {
      if (accs?.[0]) setWallet(accs[0]);
    }).catch(() => {});
    const onAcc = (accs: string[]) => setWallet(accs?.[0] || "");
    eth.on?.("accountsChanged", onAcc);
    return () => eth.removeListener?.("accountsChanged", onAcc);
  }, []);

  // Load contacts when tab/wallet changes
  const loadContacts = useCallback(async () => {
    try {
      const url = tab === "private"
        ? `${API}/hub/private/contacts/${wallet}`
        : `${API}/hub/global/users`;
      if (tab === "private" && !wallet) { setContacts([]); return; }
      const r = await fetch(url);
      const j = await r.json();
      const arr: any[] = Array.isArray(j) ? j : (j.contacts || j.users || j.data || []);
      const mapped: Contact[] = arr.map((u: any) => {
        const address = u.address || u.wallet || u.walletAddress || u.from || "";
        const name = u.name || u.username || u.displayName || short(address);
        return {
          address,
          name,
          image: u.image || u.avatar || avatarFor(address),
          message: u.lastMessage || u.message || "",
        };
      }).filter((c) => c.address);
      setContacts(mapped);
    } catch {
      setContacts([]);
    }
  }, [tab, wallet]);

  useEffect(() => { loadContacts(); setCurrent(null); setMessages([]); }, [loadContacts]);

  // Load messages on chat open / poll
  const loadMessages = useCallback(async () => {
    try {
      let url: string;
      if (tab === "private") {
        if (!wallet || !current?.address) return;
        url = `${API}/hub/private/messages/${wallet}/${current.address}`;
      } else {
        url = `${API}/hub/global/messages`;
      }
      const r = await fetch(url);
      const j = await r.json();
      const arr: any[] = Array.isArray(j) ? j : (j.messages || j.data || []);
      setMessages(arr);
    } catch { /* ignore */ }
  }, [tab, wallet, current?.address]);

  useEffect(() => {
    if (tab === "private" && !current) return;
    loadMessages();
    const id = setInterval(loadMessages, 5000);
    return () => clearInterval(id);
  }, [loadMessages, tab, current]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [messages]);

  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    try {
      if (tab === "private") {
        if (!wallet || !current?.address) return;
        await fetch(`${API}/hub/private/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ from: wallet, to: current.address, message: text }),
        });
      } else {
        if (!wallet) return;
        await fetch(`${API}/hub/global/send`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wallet, message: text }),
        });
      }
      setDraft("");
      loadMessages();
    } catch { /* ignore */ }
  };

  const filtered = contacts.filter((c) =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.address.toLowerCase().includes(search.toLowerCase())
  );

  const headerName = current?.name || (tab === "global" ? "Global Chat" : "Select a chat");
  const headerImg = current?.image || (tab === "global" ? avatarFor("global") : undefined);
  const showChat = tab === "global" || !!current;

  return (
    <div className="w-full min-h-[calc(100vh-120px)] mt-20 px-2 sm:px-4">
      <div className="max-w-[1480px] mx-auto bg-zinc-950 border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
        <div className="flex h-[calc(100vh-160px)] min-h-[600px]">
          {/* Sidebar */}
          <aside className={cn("shrink-0 border-r border-white/10 bg-zinc-950 flex flex-col transition-[width] duration-200", sidebarOpen ? "w-[200px]" : "w-[60px]")}>
            <div className="p-3">
              {sidebarOpen && <div className="text-[11px] font-semibold text-zinc-400 px-2 py-1.5">Navigate</div>}
              <button onClick={() => setSidebarOpen((v) => !v)} className="w-full flex items-center gap-3 px-2 py-2 rounded-md text-zinc-300 hover:bg-white/5 hover:text-white">
                <Menu size={18} />
              </button>
              {menuItems.map((m) => (
                <a key={m.title} href="#" onClick={(e) => e.preventDefault()} className="w-full flex items-center gap-3 px-2 py-2 rounded-md text-zinc-300 hover:bg-white/5 hover:text-white">
                  <m.icon size={18} />
                  {sidebarOpen && <span className="text-sm">{m.title}</span>}
                </a>
              ))}
            </div>
            <div className="mt-auto p-3 space-y-1">
              <button className="w-full flex items-center gap-3 px-2 py-2 rounded-md text-zinc-300 hover:bg-white/5 hover:text-white">
                <Settings size={18} />
                {sidebarOpen && <span className="text-sm">Settings</span>}
              </button>
              <button className="w-full flex items-center gap-3 px-2 py-2 rounded-md text-zinc-300 hover:bg-white/5 hover:text-white">
                <User2 size={18} />
                {sidebarOpen && (<><span className="text-sm truncate">{short(wallet) || "Not connected"}</span><ChevronUp size={16} className="ml-auto" /></>)}
              </button>
            </div>
          </aside>

          {/* Chat list */}
          <section className="w-[300px] shrink-0 border-r border-white/10 bg-zinc-950 flex flex-col">
            <div className="h-12 px-3 flex items-center">
              <p className="text-sm font-medium text-zinc-200">{tab === "private" ? "Private" : "Global"}</p>
              <div className="flex-1 flex items-center justify-center gap-1">
                <IconBtn aria-label="New" onClick={() => setTab("private")}><SquarePen size={16} /></IconBtn>
                <IconBtn aria-label="Filter"><ListFilter size={16} /></IconBtn>
              </div>
              <button
                onClick={() => setTab(tab === "private" ? "global" : "private")}
                className={cn(
                  "px-2.5 h-8 inline-flex items-center gap-1.5 rounded-md text-xs font-semibold transition-colors",
                  tab === "global" ? "bg-emerald-500/20 text-emerald-300" : "bg-white/5 text-zinc-300 hover:bg-white/10"
                )}
              >
                <Globe size={14} /> Global
              </button>
            </div>

            <div className="relative px-3 pb-3">
              <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search or start new chat"
                className="w-full h-9 pl-9 pr-3 rounded-md bg-zinc-900 border border-white/10 text-sm text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-white/20"
              />
            </div>

            <div className="flex-1 overflow-y-auto">
              {filtered.length === 0 && (
                <div className="px-4 py-6 text-xs text-zinc-500 text-center">
                  {tab === "private" && !wallet ? "Connect wallet to see contacts" : "No contacts found"}
                </div>
              )}
              {filtered.map((contact) => (
                <button
                  key={contact.address}
                  onClick={() => setCurrent(contact)}
                  className={cn("px-3 w-full py-2 text-left transition-colors", current?.address === contact.address ? "bg-white/5" : "hover:bg-white/5")}
                >
                  <div className="flex flex-row gap-2 items-start">
                    <Avatar src={contact.image} name={contact.name} size={48} />
                    <div className="min-w-0 py-1">
                      <div className="text-[15px] font-semibold text-zinc-100 leading-tight truncate">{contact.name}</div>
                      <div className="text-xs text-zinc-400 mt-1 line-clamp-2">{contact.message || short(contact.address)}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* Chat window */}
          <section className="flex-1 flex flex-col bg-zinc-950 min-w-0">
            <div className="h-16 border-b border-white/10 flex items-center px-3">
              <Avatar src={headerImg} name={headerName} size={48} />
              <div className="ml-2 min-w-0">
                <div className="text-[15px] font-semibold text-zinc-100 truncate">{headerName}</div>
                <div className="text-xs text-zinc-400 truncate">{tab === "global" ? "Public room" : (current ? short(current.address) : "Contact Info")}</div>
              </div>
              <div className="flex-grow flex justify-end gap-1">
                <IconBtn aria-label="Video call"><Video size={18} /></IconBtn>
                <IconBtn aria-label="Phone call"><Phone size={18} /></IconBtn>
                <IconBtn aria-label="Search in chat"><Search size={18} /></IconBtn>
              </div>
            </div>

            <div ref={bodyRef} className="flex-1 bg-zinc-950 overflow-y-auto px-4 py-4 space-y-2">
              {!showChat && (
                <div className="h-full flex items-center justify-center text-zinc-600 text-sm">Select a chat to start messaging</div>
              )}
              {showChat && messages.map((m, i) => {
                const mine = (m.from || m.wallet || "").toLowerCase() === wallet.toLowerCase();
                return (
                  <div key={m.id || i} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                    <div className={cn("max-w-[70%] rounded-lg px-3 py-2 text-sm", mine ? "bg-emerald-600/30 text-emerald-50" : "bg-zinc-800 text-zinc-100")}>
                      {tab === "global" && !mine && (
                        <div className="text-[10px] text-zinc-400 mb-0.5 font-mono">{short(m.from || m.wallet || "")}</div>
                      )}
                      <div className="break-words whitespace-pre-wrap">{m.message}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-1 px-2 py-2 border-t border-white/10">
              <IconBtn aria-label="Emoji"><Smile size={18} /></IconBtn>
              <IconBtn aria-label="Attach"><Paperclip size={18} /></IconBtn>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") send(); }}
                disabled={!showChat}
                placeholder={showChat ? "Type a message" : "Select a chat first"}
                className="flex-grow h-10 px-3 bg-transparent border-0 outline-none text-sm text-zinc-100 placeholder:text-zinc-500 disabled:opacity-50"
              />
              <IconBtn aria-label="Send" onClick={send}><Send size={18} /></IconBtn>
              <IconBtn aria-label="Voice"><Mic size={18} /></IconBtn>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
