import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAccount } from "wagmi";
import {
  Globe, Users, Tag, Send, Heart, MessageCircle, Share2, Plus, X,
  Loader2, Check, Search, Wallet, ArrowRight, UserPlus, Coins, Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { showSuccess, showError } from "@/lib/feedback";
import {
  HUB_ADDR, REGISTRY_ABI, POSTS_ABI, MARKET_ABI, MESSENGER_ABI, TRANSFER_ABI,
  DURATION_OPTIONS, ensureHubChain, getHubContract, getReadContract,
  hubApi, parseEther, formatEther, shortHubAddr,
  chainReverseResolve, chainIsAvailable, chainResolveName, chainGetPrice,
  type HubPost, type HubListing, type HubMessage,
} from "@/lib/hub-logic";

// ============================================================
// Registration Modal (FORCED — cannot be dismissed)
// ============================================================
const RegisterModal: React.FC<{ wallet: string; onDone: (name: string) => void }> = ({ wallet, onDone }) => {
  const [name, setName] = useState("");
  const [duration, setDuration] = useState(1);
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [registering, setRegistering] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const valid = /^[a-z0-9-]{3,32}$/.test(name);

  useEffect(() => {
    setAvailable(null);
    if (!valid) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setChecking(true);
      const api = await hubApi.available(name);
      const ok = api?.available ?? (await chainIsAvailable(name));
      setAvailable(ok);
      setChecking(false);
    }, 350);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [name, valid]);

  // Block escape & prevent body scroll
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const block = (e: KeyboardEvent) => { if (e.key === "Escape") e.preventDefault(); };
    window.addEventListener("keydown", block, true);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", block, true); };
  }, []);

  const onRegister = async () => {
    if (!valid || !available) return;
    setRegistering(true);
    try {
      await ensureHubChain();
      const priceWei = await chainGetPrice(duration);
      const onChainAvail = await chainIsAvailable(name);
      if (!onChainAvail) throw new Error("Name was just taken");
      const reg = await getHubContract(HUB_ADDR.registry, REGISTRY_ABI);
      const tx = await reg.register(name, duration, { value: priceWei });
      await tx.wait();
      showSuccess({
        title: `${name}.lit REGISTERED`,
        subtitle: "WELCOME TO THE HUB",
        rows: [
          { label: "NAME", value: `${name}.lit` },
          { label: "DURATION", value: DURATION_OPTIONS.find(d => d.value === duration)?.label || "" },
          { label: "TX", value: tx.hash.slice(0, 10) + "..." },
        ],
      });
      onDone(name);
    } catch (e: any) {
      showError(e?.shortMessage || e?.message || "Registration failed");
    } finally {
      setRegistering(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10001] bg-black/95 backdrop-blur-3xl flex items-center justify-center p-4 overflow-y-auto">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="w-full max-w-md bg-brand-surface border border-brand-border rounded-3xl p-6 sm:p-8 shadow-[0_0_80px_rgba(255,255,255,0.05)]"
      >
        <div className="text-center mb-6">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-white text-black items-center justify-center mb-4 font-black text-lg">.lit</div>
          <h2 className="text-2xl font-black uppercase tracking-tight text-white">Claim Your .lit Name</h2>
          <p className="text-xs text-brand-text-muted mt-2 font-mono">Required to enter the LitDEX HUB</p>
          <p className="text-[10px] text-brand-text-muted/60 mt-1 font-mono break-all">{wallet}</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-brand-text-muted">Name</label>
            <div className="mt-2 relative">
              <input
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 32))}
                placeholder="yourname"
                autoFocus
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 pr-20 text-white font-bold outline-none focus:border-white/30"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-text-muted font-mono text-sm">.lit</span>
            </div>
            <div className="h-5 mt-1.5 text-xs font-mono">
              {!valid && name && <span className="text-red-400">3-32 chars, a-z 0-9 -</span>}
              {valid && checking && <span className="text-brand-text-muted flex items-center gap-1"><Loader2 size={11} className="animate-spin"/>Checking…</span>}
              {valid && !checking && available === true && <span className="text-emerald-400">✓ Available</span>}
              {valid && !checking && available === false && <span className="text-red-400">✗ Taken</span>}
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-brand-text-muted">Duration</label>
            <div className="mt-2 grid grid-cols-5 gap-1.5">
              {DURATION_OPTIONS.map((d) => (
                <button
                  key={d.value}
                  onClick={() => setDuration(d.value)}
                  className={cn(
                    "py-2.5 rounded-lg border text-[10px] font-bold uppercase tracking-wider transition-all",
                    duration === d.value
                      ? "bg-white text-black border-white"
                      : "bg-black/40 border-white/10 text-brand-text-muted hover:border-white/30"
                  )}
                >
                  <div>{d.label.replace(" Years", "y").replace(" Year", "y")}</div>
                  <div className="text-[9px] opacity-70 mt-0.5">{d.price}</div>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={onRegister}
            disabled={!valid || !available || registering}
            className="w-full mt-2 py-4 rounded-xl bg-white text-black font-black uppercase tracking-widest text-sm hover:bg-white/90 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {registering ? <><Loader2 size={16} className="animate-spin"/> Registering…</> : <>Register {DURATION_OPTIONS.find(d=>d.value===duration)?.price} zkLTC</>}
          </button>
          <p className="text-center text-[10px] text-brand-text-muted/60 font-mono">This step cannot be skipped</p>
        </div>
      </motion.div>
    </div>
  );
};

// ============================================================
// GLOBAL Tab — Posts feed
// ============================================================
const GlobalTab: React.FC<{ wallet: string; myName: string }> = ({ wallet, myName }) => {
  const [posts, setPosts] = useState<HubPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [commentDraft, setCommentDraft] = useState<Record<number, string>>({});
  const [openComments, setOpenComments] = useState<Record<number, boolean>>({});

  const load = useCallback(async () => {
    const data = await hubApi.posts();
    if (data?.posts) {
      setPosts(data.posts);
    } else {
      // on-chain fallback
      try {
        const c = getReadContract(HUB_ADDR.posts, POSTS_ABI);
        const total = Number(await c.postCount());
        const list: HubPost[] = [];
        for (let i = total; i > Math.max(0, total - 20); i--) {
          try {
            const p: any = await c.getPost(i);
            list.push({
              id: Number(p.id), creator: p.creator, content: p.content,
              likeReward: formatEther(p.likeReward), commentReward: formatEther(p.commentReward),
              bountyBalance: formatEther(p.bountyBalance),
              likeCount: Number(p.likeCount), commentCount: Number(p.commentCount),
              createdAt: Number(p.createdAt), active: p.active, bountyActive: p.bountyBalance > 0n,
            });
          } catch { /* skip */ }
        }
        setPosts(list);
      } catch { /* ignore */ }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const onLike = async (id: number) => {
    setBusyId(id);
    try {
      const c = await getHubContract(HUB_ADDR.posts, POSTS_ABI);
      const tx = await c.likePost(id);
      await tx.wait();
      showSuccess({ title: "POST LIKED", rows: [{ label: "POST", value: `#${id}` }, { label: "TX", value: tx.hash.slice(0,10)+"..." }] });
      load();
    } catch (e: any) { showError(e?.shortMessage || e?.message || "Like failed"); }
    finally { setBusyId(null); }
  };

  const onComment = async (id: number) => {
    const text = (commentDraft[id] || "").trim();
    if (!text) return;
    setBusyId(id);
    try {
      const c = await getHubContract(HUB_ADDR.posts, POSTS_ABI);
      const tx = await c.commentPost(id, text);
      await tx.wait();
      showSuccess({ title: "COMMENT POSTED", rows: [{ label: "POST", value: `#${id}` }, { label: "TX", value: tx.hash.slice(0,10)+"..." }] });
      setCommentDraft((p) => ({ ...p, [id]: "" }));
      load();
    } catch (e: any) { showError(e?.shortMessage || e?.message || "Comment failed"); }
    finally { setBusyId(null); }
  };

  const onShare = (p: HubPost) => {
    const text = `${p.content}\n\nvia LitDEX HUB`;
    const url = "https://litdex.test-hub.xyz";
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, "_blank");
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-black uppercase tracking-tight text-white">Global Feed</h3>
          <p className="text-xs text-brand-text-muted font-mono">Auto-refreshes every 15s</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white text-black font-black uppercase tracking-widest text-[11px] hover:bg-white/90 transition-all"
        >
          <Plus size={14} /> New Post
        </button>
      </div>

      {loading && <div className="text-center py-12 text-brand-text-muted text-sm font-mono">Loading posts…</div>}
      {!loading && posts.length === 0 && (
        <div className="text-center py-16 border border-dashed border-white/10 rounded-2xl text-brand-text-muted text-sm font-mono">
          No posts yet. Be the first.
        </div>
      )}

      <div className="space-y-3">
        {posts.map((p) => (
          <div key={p.id} className="bg-brand-surface border border-brand-border rounded-2xl p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-white/20 to-white/5 flex items-center justify-center font-black text-xs text-white shrink-0">
                  {(p.creatorName || p.creator).slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-white truncate">
                    {p.creatorName ? `${p.creatorName}.lit` : shortHubAddr(p.creator)}
                  </div>
                  <div className="text-[10px] text-brand-text-muted font-mono">
                    {new Date(p.createdAt * 1000).toLocaleString()}
                  </div>
                </div>
              </div>
              <span className={cn(
                "text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-md shrink-0",
                p.bountyActive ? "bg-emerald-500/15 text-emerald-400" : "bg-white/5 text-brand-text-muted"
              )}>
                {p.bountyActive ? `${Number(p.bountyBalance).toFixed(3)} zkLTC bounty` : "Bounty ended"}
              </span>
            </div>

            <p className="text-sm text-white/90 whitespace-pre-wrap break-words mb-4">{p.content}</p>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => onLike(p.id)}
                disabled={busyId === p.id}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 border border-white/10 hover:border-white/30 text-xs font-bold text-white transition-all disabled:opacity-50"
              >
                <Heart size={13} /> {p.likeCount}
                {Number(p.likeReward) > 0 && <span className="text-[9px] text-emerald-400 ml-1">+{p.likeReward}</span>}
              </button>
              <button
                onClick={() => setOpenComments((s) => ({ ...s, [p.id]: !s[p.id] }))}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 border border-white/10 hover:border-white/30 text-xs font-bold text-white transition-all"
              >
                <MessageCircle size={13} /> {p.commentCount}
                {Number(p.commentReward) > 0 && <span className="text-[9px] text-emerald-400 ml-1">+{p.commentReward}</span>}
              </button>
              <button
                onClick={() => onShare(p)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 border border-white/10 hover:border-white/30 text-xs font-bold text-white transition-all"
              >
                <Share2 size={13} /> Share
              </button>
            </div>

            {openComments[p.id] && (
              <div className="mt-3 flex gap-2">
                <input
                  value={commentDraft[p.id] || ""}
                  onChange={(e) => setCommentDraft((s) => ({ ...s, [p.id]: e.target.value }))}
                  placeholder="Write a comment…"
                  className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-white/30"
                />
                <button
                  onClick={() => onComment(p.id)}
                  disabled={busyId === p.id}
                  className="px-3 py-2 rounded-lg bg-white text-black text-xs font-black uppercase disabled:opacity-50"
                >
                  Send
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <AnimatePresence>
        {showCreate && <CreatePostModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />}
      </AnimatePresence>
    </div>
  );
};

const CreatePostModal: React.FC<{ onClose: () => void; onCreated: () => void }> = ({ onClose, onCreated }) => {
  const [content, setContent] = useState("");
  const [hasBounty, setHasBounty] = useState(false);
  const [likeReward, setLikeReward] = useState("0.01");
  const [commentReward, setCommentReward] = useState("0.01");
  const [budget, setBudget] = useState("0.5");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!content.trim()) return;
    setBusy(true);
    try {
      const c = await getHubContract(HUB_ADDR.posts, POSTS_ABI);
      const lw = hasBounty ? parseEther(likeReward || "0") : 0n;
      const cw = hasBounty ? parseEther(commentReward || "0") : 0n;
      const value = hasBounty ? parseEther(budget || "0") : 0n;
      const tx = await c.createPost(content, lw, cw, { value });
      await tx.wait();
      showSuccess({ title: "POST CREATED", rows: [{ label: "TX", value: tx.hash.slice(0, 10) + "..." }] });
      onCreated();
    } catch (e: any) {
      showError(e?.shortMessage || e?.message || "Failed to create");
    } finally { setBusy(false); }
  };

  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur-xl flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{scale:0.95}} animate={{scale:1}} onClick={(e)=>e.stopPropagation()}
        className="w-full max-w-md bg-brand-surface border border-brand-border rounded-3xl p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-black uppercase tracking-tight text-white">New Post</h3>
          <button onClick={onClose} className="text-brand-text-muted hover:text-white"><X size={18}/></button>
        </div>
        <textarea
          value={content} onChange={(e)=>setContent(e.target.value)} rows={4} placeholder="What's happening on LitVM?"
          className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-3 text-sm text-white outline-none focus:border-white/30 resize-none"
        />
        <label className="flex items-center gap-2 mt-4 cursor-pointer">
          <input type="checkbox" checked={hasBounty} onChange={(e)=>setHasBounty(e.target.checked)} className="accent-white"/>
          <span className="text-xs font-bold uppercase tracking-widest text-white">Add Bounty Reward</span>
        </label>
        {hasBounty && (
          <div className="grid grid-cols-3 gap-2 mt-3">
            <div>
              <label className="text-[9px] font-bold uppercase text-brand-text-muted">Like</label>
              <input value={likeReward} onChange={(e)=>setLikeReward(e.target.value)} className="w-full mt-1 bg-black/40 border border-white/10 rounded-lg px-2 py-2 text-xs text-white outline-none"/>
            </div>
            <div>
              <label className="text-[9px] font-bold uppercase text-brand-text-muted">Comment</label>
              <input value={commentReward} onChange={(e)=>setCommentReward(e.target.value)} className="w-full mt-1 bg-black/40 border border-white/10 rounded-lg px-2 py-2 text-xs text-white outline-none"/>
            </div>
            <div>
              <label className="text-[9px] font-bold uppercase text-brand-text-muted">Budget</label>
              <input value={budget} onChange={(e)=>setBudget(e.target.value)} className="w-full mt-1 bg-black/40 border border-white/10 rounded-lg px-2 py-2 text-xs text-white outline-none"/>
            </div>
          </div>
        )}
        <button onClick={submit} disabled={busy || !content.trim()}
          className="w-full mt-5 py-3 rounded-xl bg-white text-black font-black uppercase tracking-widest text-xs hover:bg-white/90 disabled:opacity-40 flex items-center justify-center gap-2">
          {busy ? <><Loader2 size={14} className="animate-spin"/> Posting…</> : "Post"}
        </button>
      </motion.div>
    </motion.div>
  );
};

// ============================================================
// PRIVATE Tab — WhatsApp-style chat UI
// ============================================================
type PendingReq = { id: number; from: string; name: string };

const PrivateTab: React.FC<{ wallet: string }> = ({ wallet }) => {
  const [friends, setFriends] = useState<{ address: string; name: string; lastMsg?: string }[]>([]);
  const [pendingReqs, setPendingReqs] = useState<PendingReq[]>([]);
  const [active, setActive] = useState<{ address: string; name: string } | null>(null);
  const [messages, setMessages] = useState<HubMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addInput, setAddInput] = useState("");
  const [zkOpen, setZkOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [zkNote, setZkNote] = useState("");
  const [showPending, setShowPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadFriends = useCallback(async () => {
    const data = await hubApi.friends(wallet);
    let list: { address: string; name: string }[] = [];
    if (data) list = data.friends || [];
    else {
      try {
        const c = getReadContract(HUB_ADDR.messenger, MESSENGER_ABI);
        const addrs: string[] = await c.getFriends(wallet);
        const reg = getReadContract(HUB_ADDR.registry, REGISTRY_ABI);
        list = await Promise.all(addrs.map(async (a) => ({
          address: a, name: await reg.reverseResolve(a).catch(() => "")
        })));
      } catch { /* ignore */ }
    }
    setFriends(list.map((f) => ({ ...f })));
  }, [wallet]);

  const loadPending = useCallback(async () => {
    try {
      const c = getReadContract(HUB_ADDR.messenger, MESSENGER_ABI);
      const reg = getReadContract(HUB_ADDR.registry, REGISTRY_ABI);
      const total = Number(await c.requestCount().catch(() => 0));
      const out: PendingReq[] = [];
      const max = Math.min(total, 200);
      for (let i = total; i > total - max && i > 0; i--) {
        try {
          const r = await c.friendRequests(i);
          // status 0 = pending; tuple: from, to, status, sentAt
          if (String(r.to).toLowerCase() === wallet.toLowerCase() && Number(r.status) === 0) {
            const name = await reg.reverseResolve(r.from).catch(() => "");
            out.push({ id: i, from: r.from, name });
          }
        } catch { /* skip */ }
      }
      setPendingReqs(out);
    } catch { /* ignore */ }
  }, [wallet]);

  const loadMessages = useCallback(async () => {
    if (!active) return;
    const data = await hubApi.conversation(wallet, active.address);
    if (data?.messages) setMessages(data.messages);
  }, [active, wallet]);

  useEffect(() => { loadFriends(); loadPending(); }, [loadFriends, loadPending]);
  useEffect(() => {
    loadMessages();
    if (!active) return;
    const t = setInterval(loadMessages, 8000);
    return () => clearInterval(t);
  }, [active, loadMessages]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const addFriend = async () => {
    const name = addInput.replace(/\.lit$/i, "").toLowerCase().trim();
    if (!name) return;
    setBusy(true);
    try {
      const api = await hubApi.resolve(name);
      const addr = api?.address || (await chainResolveName(name));
      if (!addr || addr === "0x0000000000000000000000000000000000000000") throw new Error("Name not found");
      const c = await getHubContract(HUB_ADDR.messenger, MESSENGER_ABI);
      const tx = await c.sendFriendRequest(addr);
      await tx.wait();
      showSuccess({ title: "FRIEND REQUEST SENT", rows: [{ label: "TO", value: `${name}.lit` }, { label: "TX", value: tx.hash.slice(0,10)+"..." }] });
      setAddInput(""); setAddOpen(false);
      loadFriends();
    } catch (e: any) { showError(e?.shortMessage || e?.message || "Failed"); }
    finally { setBusy(false); }
  };

  const acceptReq = async (id: number) => {
    setBusy(true);
    try {
      const c = await getHubContract(HUB_ADDR.messenger, MESSENGER_ABI);
      const tx = await c.acceptFriendRequest(id); await tx.wait();
      showSuccess({ title: "FRIEND REQUEST ACCEPTED", rows: [] });
      loadFriends(); loadPending();
    } catch (e: any) { showError(e?.shortMessage || e?.message || "Failed"); }
    finally { setBusy(false); }
  };

  const rejectReq = async (id: number) => {
    setBusy(true);
    try {
      const c = await getHubContract(HUB_ADDR.messenger, MESSENGER_ABI);
      const tx = await c.rejectFriendRequest(id); await tx.wait();
      loadPending();
    } catch (e: any) { showError(e?.shortMessage || e?.message || "Failed"); }
    finally { setBusy(false); }
  };

  const sendText = async () => {
    if (!active || !draft.trim()) return;
    setBusy(true);
    try {
      const c = await getHubContract(HUB_ADDR.messenger, MESSENGER_ABI);
      const stored = await hubApi.storeMessage({ fromWallet: wallet, toWallet: active.address, encryptedContent: draft, msgType: "text" });
      const hash = stored?.msgId || draft.slice(0, 64);
      const tx = await c.sendMessage(active.address, hash, "text");
      await tx.wait();
      setDraft("");
      loadMessages();
    } catch (e: any) { showError(e?.shortMessage || e?.message || "Send failed"); }
    finally { setBusy(false); }
  };

  const sendZk = async () => {
    if (!active || !amount) return;
    setBusy(true);
    try {
      const c = await getHubContract(HUB_ADDR.messenger, MESSENGER_ABI);
      const tx = await c.sendZkLTC(active.address, zkNote || "", { value: parseEther(amount) });
      await tx.wait();
      showSuccess({ title: "ZKLTC SENT", rows: [{ label: "AMOUNT", value: `${amount} zkLTC` }, { label: "TO", value: active.name ? `${active.name}.lit` : shortHubAddr(active.address) }] });
      setAmount(""); setZkNote(""); setZkOpen(false);
      loadMessages();
    } catch (e: any) { showError(e?.shortMessage || e?.message || "Failed"); }
    finally { setBusy(false); }
  };

  const filteredFriends = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return friends;
    return friends.filter((f) =>
      (f.name && f.name.toLowerCase().includes(q)) || f.address.toLowerCase().includes(q)
    );
  }, [friends, search]);

  const initials = (s: string) => (s || "?").slice(0, 2).toUpperCase();
  const displayName = (f: { address: string; name: string }) => f.name ? `${f.name}.lit` : shortHubAddr(f.address);

  return (
    <div className="bg-brand-surface border border-brand-border rounded-2xl overflow-hidden grid md:grid-cols-[320px_1fr] min-h-[70vh] h-[70vh]">
      {/* LEFT — Contacts */}
      <div className="flex flex-col border-r border-white/10 bg-black/40 min-h-0">
        <div className="px-4 py-3 flex items-center justify-between border-b border-white/10">
          <h3 className="text-sm font-black uppercase tracking-tight text-white">Chats</h3>
          <div className="flex items-center gap-2">
            {pendingReqs.length > 0 && (
              <button
                onClick={() => setShowPending((v) => !v)}
                className="relative text-white/70 hover:text-white"
                title="Pending requests"
              >
                <Users size={16}/>
                <span className="absolute -top-1.5 -right-2 text-[9px] font-black bg-red-500 text-white px-1.5 rounded-full">{pendingReqs.length}</span>
              </button>
            )}
            <button onClick={() => setAddOpen(true)} className="text-white/70 hover:text-white" title="Add friend">
              <UserPlus size={16}/>
            </button>
          </div>
        </div>

        <div className="p-3 border-b border-white/10">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40"/>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search or start new chat"
              className="w-full bg-black/50 border border-white/10 rounded-lg pl-8 pr-3 py-2 text-xs text-white placeholder:text-white/30 outline-none focus:border-white/30"
            />
          </div>
        </div>

        {showPending && pendingReqs.length > 0 && (
          <div className="px-3 py-2 border-b border-white/10 space-y-2 max-h-40 overflow-y-auto">
            <div className="text-[10px] font-bold uppercase tracking-widest text-white/50">Pending Requests</div>
            {pendingReqs.map((r) => (
              <div key={r.id} className="flex items-center gap-2 bg-black/40 rounded-lg p-2">
                <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-black text-white">{initials(r.name || r.from)}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-white truncate">{r.name ? `${r.name}.lit` : shortHubAddr(r.from)}</div>
                </div>
                <button onClick={() => acceptReq(r.id)} disabled={busy} className="px-2 py-1 rounded bg-emerald-500 text-black text-[10px] font-black disabled:opacity-50">
                  <Check size={11}/>
                </button>
                <button onClick={() => rejectReq(r.id)} disabled={busy} className="px-2 py-1 rounded bg-white/10 text-white text-[10px] font-black disabled:opacity-50">
                  <X size={11}/>
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {filteredFriends.length === 0 && (
            <div className="text-[11px] text-brand-text-muted font-mono py-6 text-center px-4">
              No friends yet. Add one by .lit name.
            </div>
          )}
          {filteredFriends.map((f) => (
            <button
              key={f.address}
              onClick={() => setActive(f)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 text-left border-b border-white/5 transition-colors",
                active?.address === f.address ? "bg-white/10" : "hover:bg-white/5"
              )}
            >
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-white/20 to-white/5 flex items-center justify-center text-xs font-black text-white shrink-0">
                {initials(f.name || f.address)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-white truncate">{displayName(f)}</div>
                <div className="text-[10px] text-white/40 font-mono truncate">{f.lastMsg || shortHubAddr(f.address)}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* RIGHT — Chat panel */}
      <div className="flex flex-col min-h-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.04),transparent_70%)]">
        {!active ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
            <MessageCircle size={42} className="text-white/20 mb-3"/>
            <div className="text-sm font-bold text-white/70">Select a chat</div>
            <div className="text-[11px] text-white/40 font-mono mt-1">Pick a friend on the left to start messaging</div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between bg-black/30">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-white/20 to-white/5 flex items-center justify-center text-xs font-black text-white">
                  {initials(active.name || active.address)}
                </div>
                <div>
                  <div className="text-sm font-bold text-white">{displayName(active)}</div>
                  <div className="text-[10px] text-white/40 font-mono">{shortHubAddr(active.address)}</div>
                </div>
              </div>
              <button
                onClick={() => setZkOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-emerald-500 text-black text-[11px] font-black flex items-center gap-1.5 hover:bg-emerald-400"
              >
                <Coins size={12}/> Send zkLTC
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2">
              {messages.length === 0 && (
                <div className="text-center text-xs text-brand-text-muted font-mono py-10">
                  No messages yet — say hi 👋
                </div>
              )}
              {messages.map((m) => {
                const mine = m.from.toLowerCase() === wallet.toLowerCase();
                const isZk = m.msgType === "zkltc" || Number(m.amount) > 0;
                return (
                  <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                    <div className={cn(
                      "max-w-[75%] px-3 py-2 rounded-2xl text-xs shadow-sm",
                      mine
                        ? "bg-emerald-500 text-black rounded-br-sm"
                        : "bg-white/10 text-white border border-white/5 rounded-bl-sm"
                    )}>
                      {isZk ? (
                        <span className="font-black">💸 {formatEther(BigInt(m.amount || "0"))} zkLTC</span>
                      ) : (
                        <span className="break-words whitespace-pre-wrap">{m.contentHash}</span>
                      )}
                      <div className={cn("text-[9px] mt-1 font-mono", mine ? "text-black/60" : "text-white/40")}>
                        {new Date(m.sentAt * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Input */}
            <div className="border-t border-white/10 p-3 bg-black/40">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setZkOpen(true)}
                  className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 text-white flex items-center justify-center"
                  title="Send zkLTC"
                >
                  💸
                </button>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendText())}
                  placeholder="Type a message"
                  className="flex-1 bg-white/5 border border-white/10 rounded-full px-4 py-2.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/30"
                />
                <button
                  onClick={sendText}
                  disabled={busy || !draft.trim()}
                  className="w-10 h-10 rounded-full bg-emerald-500 text-black flex items-center justify-center disabled:opacity-50 hover:bg-emerald-400"
                >
                  {busy ? <Loader2 size={15} className="animate-spin"/> : <Send size={15}/>}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Add Friend Modal */}
      {addOpen && (
        <div className="fixed inset-0 z-[10002] bg-black/80 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setAddOpen(false)}>
          <div className="w-full max-w-sm bg-brand-surface border border-brand-border rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-black uppercase tracking-tight text-white">Add Friend</h3>
              <button onClick={() => setAddOpen(false)} className="text-white/50 hover:text-white"><X size={16}/></button>
            </div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-white/50">.lit Name</label>
            <input
              value={addInput}
              onChange={(e) => setAddInput(e.target.value)}
              placeholder="alice"
              className="mt-2 w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-white/30"
              autoFocus
            />
            <button
              onClick={addFriend}
              disabled={busy || !addInput.trim()}
              className="mt-4 w-full py-2.5 rounded-lg bg-white text-black text-xs font-black uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {busy ? <Loader2 size={13} className="animate-spin"/> : <UserPlus size={13}/>}
              Send Friend Request
            </button>
          </div>
        </div>
      )}

      {/* Send zkLTC Modal */}
      {zkOpen && active && (
        <div className="fixed inset-0 z-[10002] bg-black/80 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setZkOpen(false)}>
          <div className="w-full max-w-sm bg-brand-surface border border-brand-border rounded-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-black uppercase tracking-tight text-white">Send zkLTC</h3>
              <button onClick={() => setZkOpen(false)} className="text-white/50 hover:text-white"><X size={16}/></button>
            </div>
            <div className="text-[11px] text-white/60 font-mono mb-3">To: {displayName(active)}</div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-white/50">Amount (zkLTC)</label>
            <input
              type="number" step="0.0001" min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.01"
              className="mt-2 w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-white/30"
              autoFocus
            />
            <label className="text-[10px] font-bold uppercase tracking-widest text-white/50 mt-3 block">Note (optional)</label>
            <input
              value={zkNote}
              onChange={(e) => setZkNote(e.target.value)}
              placeholder="gm"
              className="mt-2 w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-white/30"
            />
            <button
              onClick={sendZk}
              disabled={busy || !amount}
              className="mt-4 w-full py-2.5 rounded-lg bg-emerald-500 text-black text-xs font-black uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {busy ? <Loader2 size={13} className="animate-spin"/> : <Coins size={13}/>}
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================
// MARKET Tab
// ============================================================
const MarketTab: React.FC<{ wallet: string; myName: string; onNameUpdate: () => void }> = ({ wallet, myName, onNameUpdate }) => {
  const [listings, setListings] = useState<HubListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [salePrice, setSalePrice] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [avatar, setAvatar] = useState("");
  const [bio, setBio] = useState("");

  const load = useCallback(async () => {
    const data = await hubApi.listings();
    if (data?.listings) setListings(data.listings);
    else {
      try {
        const c = getReadContract(HUB_ADDR.marketplace, MARKET_ABI);
        const raw: any[] = await c.getActiveListings();
        setListings(raw.map((l) => ({
          name: l.name, seller: l.seller, price: formatEther(l.price), priceWei: l.price.toString(),
          active: l.active, listedAt: Number(l.listedAt),
        })));
      } catch { /* ignore */ }
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const buy = async (l: HubListing) => {
    setBusy(l.name);
    try {
      const c = await getHubContract(HUB_ADDR.marketplace, MARKET_ABI);
      const tx = await c.buyName(l.name, { value: BigInt(l.priceWei) });
      await tx.wait();
      showSuccess({ title: "NAME PURCHASED", rows: [{ label: "NAME", value: `${l.name}.lit` }, { label: "PRICE", value: `${l.price} zkLTC` }] });
      load(); onNameUpdate();
    } catch (e: any) { showError(e?.shortMessage || e?.message || "Buy failed"); }
    finally { setBusy(null); }
  };

  const bid = async (l: HubListing) => {
    const amt = prompt(`Bid amount for ${l.name}.lit (in zkLTC):`);
    if (!amt) return;
    setBusy(l.name);
    try {
      const c = await getHubContract(HUB_ADDR.marketplace, MARKET_ABI);
      const tx = await c.placeBid(l.name, { value: parseEther(amt) });
      await tx.wait();
      showSuccess({ title: "BID PLACED", rows: [{ label: "NAME", value: `${l.name}.lit` }, { label: "AMOUNT", value: `${amt} zkLTC` }] });
      load();
    } catch (e: any) { showError(e?.shortMessage || e?.message || "Bid failed"); }
    finally { setBusy(null); }
  };

  const listMine = async () => {
    if (!myName || !salePrice) return;
    setBusy(myName);
    try {
      const reg = await getHubContract(HUB_ADDR.registry, REGISTRY_ABI);
      const txA = await reg.setOperatorApproval(HUB_ADDR.marketplace, true);
      await txA.wait();
      const mk = await getHubContract(HUB_ADDR.marketplace, MARKET_ABI);
      const tx = await mk.listName(myName, parseEther(salePrice));
      await tx.wait();
      showSuccess({ title: "NAME LISTED", rows: [{ label: "NAME", value: `${myName}.lit` }, { label: "PRICE", value: `${salePrice} zkLTC` }] });
      setSalePrice(""); load();
    } catch (e: any) { showError(e?.shortMessage || e?.message || "Listing failed"); }
    finally { setBusy(null); }
  };

  const unlistMine = async () => {
    setBusy(myName);
    try {
      const mk = await getHubContract(HUB_ADDR.marketplace, MARKET_ABI);
      const tx = await mk.unlistName(myName);
      await tx.wait();
      showSuccess({ title: "NAME UNLISTED", rows: [{ label: "NAME", value: `${myName}.lit` }] });
      load();
    } catch (e: any) { showError(e?.shortMessage || e?.message || "Failed"); }
    finally { setBusy(null); }
  };

  const doTransfer = async () => {
    if (!transferTo) return;
    setBusy(myName);
    try {
      let to = transferTo.trim();
      if (!to.startsWith("0x")) {
        const n = to.replace(/\.lit$/i, "");
        const api = await hubApi.resolve(n);
        to = api?.address || (await chainResolveName(n));
      }
      if (!to) throw new Error("Could not resolve");
      const reg = await getHubContract(HUB_ADDR.registry, REGISTRY_ABI);
      const tx = await reg.transfer(myName, to);
      await tx.wait();
      showSuccess({ title: "NAME TRANSFERRED", rows: [{ label: "NAME", value: `${myName}.lit` }, { label: "TO", value: shortHubAddr(to) }] });
      setTransferTo(""); onNameUpdate();
    } catch (e: any) { showError(e?.shortMessage || e?.message || "Transfer failed"); }
    finally { setBusy(null); }
  };

  const updateProfile = async () => {
    setBusy(myName);
    try {
      const reg = await getHubContract(HUB_ADDR.registry, REGISTRY_ABI);
      const tx = await reg.setProfile(myName, avatar, bio);
      await tx.wait();
      showSuccess({ title: "PROFILE UPDATED", rows: [{ label: "NAME", value: `${myName}.lit` }] });
    } catch (e: any) { showError(e?.shortMessage || e?.message || "Failed"); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-6">
      {/* My name controls */}
      <div className="bg-brand-surface border border-brand-border rounded-2xl p-5">
        <h3 className="text-sm font-black uppercase tracking-tight text-white mb-4">My .lit Name</h3>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-white text-black flex items-center justify-center font-black">.lit</div>
          <div>
            <div className="text-lg font-black text-white">{myName}.lit</div>
            <div className="text-[10px] text-brand-text-muted font-mono">{wallet}</div>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase text-brand-text-muted">List for sale</label>
            <div className="flex gap-2">
              <input value={salePrice} onChange={(e)=>setSalePrice(e.target.value)} placeholder="Price in zkLTC"
                className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-white/30"/>
              <button onClick={listMine} disabled={!salePrice||busy===myName} className="px-3 rounded-lg bg-white text-black text-[10px] font-black uppercase disabled:opacity-40">List</button>
              <button onClick={unlistMine} disabled={busy===myName} className="px-3 rounded-lg bg-white/10 text-white text-[10px] font-black uppercase disabled:opacity-40">Unlist</button>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase text-brand-text-muted">Transfer</label>
            <div className="flex gap-2">
              <input value={transferTo} onChange={(e)=>setTransferTo(e.target.value)} placeholder="0x… or name.lit"
                className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-white/30"/>
              <button onClick={doTransfer} disabled={!transferTo||busy===myName} className="px-3 rounded-lg bg-white text-black text-[10px] font-black uppercase disabled:opacity-40">Send</button>
            </div>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <label className="text-[10px] font-bold uppercase text-brand-text-muted">Profile</label>
            <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2">
              <input value={avatar} onChange={(e)=>setAvatar(e.target.value)} placeholder="Avatar URL"
                className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-white/30"/>
              <input value={bio} onChange={(e)=>setBio(e.target.value)} placeholder="Bio"
                className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-white/30"/>
              <button onClick={updateProfile} disabled={busy===myName} className="px-3 rounded-lg bg-white text-black text-[10px] font-black uppercase disabled:opacity-40">Save</button>
            </div>
          </div>
        </div>
      </div>

      {/* Active listings */}
      <div>
        <h3 className="text-sm font-black uppercase tracking-tight text-white mb-3">Active Listings</h3>
        {loading && <div className="text-center py-8 text-brand-text-muted text-sm font-mono">Loading…</div>}
        {!loading && listings.length === 0 && (
          <div className="text-center py-12 border border-dashed border-white/10 rounded-2xl text-brand-text-muted text-sm font-mono">No names for sale</div>
        )}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {listings.map((l) => (
            <div key={l.name} className="bg-brand-surface border border-brand-border rounded-2xl p-4">
              <div className="text-lg font-black text-white mb-1">{l.name}.lit</div>
              <div className="text-[10px] text-brand-text-muted font-mono mb-3">seller {shortHubAddr(l.seller)}</div>
              <div className="text-2xl font-black text-white mb-3">{Number(l.price).toFixed(3)} <span className="text-xs text-brand-text-muted">zkLTC</span></div>
              <div className="flex gap-2">
                <button onClick={()=>buy(l)} disabled={busy===l.name} className="flex-1 py-2 rounded-lg bg-white text-black text-[10px] font-black uppercase disabled:opacity-40">
                  {busy===l.name ? "…" : "Buy"}
                </button>
                <button onClick={()=>bid(l)} disabled={busy===l.name} className="flex-1 py-2 rounded-lg bg-white/10 text-white text-[10px] font-black uppercase disabled:opacity-40">
                  Bid
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ============================================================
// Send zkLTC floating modal
// ============================================================
const SendModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [target, setTarget] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!target || !amount) return;
    setBusy(true);
    try {
      const c = await getHubContract(HUB_ADDR.transfer, TRANSFER_ABI);
      const value = parseEther(amount);
      let tx;
      if (target.startsWith("0x")) {
        tx = await c.sendToAddress(target, note, { value });
      } else {
        const n = target.replace(/\.lit$/i, "");
        tx = await c.sendToName(n, note, { value });
      }
      await tx.wait();
      showSuccess({ title: "SENT", rows: [{ label: "TO", value: target }, { label: "AMOUNT", value: `${amount} zkLTC` }, { label: "TX", value: tx.hash.slice(0,10)+"..." }] });
      onClose();
    } catch (e: any) { showError(e?.shortMessage || e?.message || "Send failed"); }
    finally { setBusy(false); }
  };

  return (
    <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
      className="fixed inset-0 z-[10000] bg-black/80 backdrop-blur-xl flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{scale:0.95}} animate={{scale:1}} onClick={(e)=>e.stopPropagation()}
        className="w-full max-w-md bg-brand-surface border border-brand-border rounded-3xl p-6">
        <div className="flex justify-between items-center mb-5">
          <h3 className="font-black uppercase tracking-tight text-white">💸 Send zkLTC</h3>
          <button onClick={onClose} className="text-brand-text-muted hover:text-white"><X size={18}/></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-bold uppercase text-brand-text-muted">Recipient</label>
            <input value={target} onChange={(e)=>setTarget(e.target.value)} placeholder="name.lit or 0x…"
              className="mt-1 w-full bg-black/40 border border-white/10 rounded-xl px-3 py-3 text-sm text-white outline-none focus:border-white/30"/>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase text-brand-text-muted">Amount (zkLTC)</label>
            <input value={amount} onChange={(e)=>setAmount(e.target.value)} placeholder="0.0"
              className="mt-1 w-full bg-black/40 border border-white/10 rounded-xl px-3 py-3 text-sm text-white outline-none focus:border-white/30"/>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase text-brand-text-muted">Note (optional)</label>
            <input value={note} onChange={(e)=>setNote(e.target.value)} placeholder="gm"
              className="mt-1 w-full bg-black/40 border border-white/10 rounded-xl px-3 py-3 text-sm text-white outline-none focus:border-white/30"/>
          </div>
          <button onClick={send} disabled={busy||!target||!amount}
            className="w-full py-4 rounded-xl bg-white text-black font-black uppercase tracking-widest text-sm disabled:opacity-40 flex items-center justify-center gap-2">
            {busy ? <><Loader2 size={14} className="animate-spin"/> Sending…</> : "Send"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

// ============================================================
// Main HUB Page
// ============================================================
export default function HubPage() {
  const { address, isConnected } = useAccount();
  const wallet = (address || "").toLowerCase();
  const [tab, setTab] = useState<"global" | "private" | "market">("global");
  const [myName, setMyName] = useState<string | null>(null);
  const [loadingName, setLoadingName] = useState(true);
  const [sendOpen, setSendOpen] = useState(false);

  const refreshName = useCallback(async () => {
    if (!wallet) return;
    setLoadingName(true);
    const api = await hubApi.reverse(wallet);
    const name = api?.name ?? (await chainReverseResolve(wallet));
    setMyName(name && name.length > 0 ? name : null);
    setLoadingName(false);
  }, [wallet]);

  useEffect(() => { if (wallet) refreshName(); }, [wallet, refreshName]);

  if (!isConnected) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="text-center">
          <Wallet size={42} className="mx-auto mb-4 text-brand-text-muted"/>
          <h2 className="text-xl font-black uppercase tracking-tight text-white mb-2">Connect Wallet</h2>
          <p className="text-xs text-brand-text-muted font-mono">Connect to access the LitDEX HUB</p>
        </div>
      </div>
    );
  }

  if (loadingName) {
    return <div className="min-h-[50vh] flex items-center justify-center text-brand-text-muted text-sm font-mono"><Loader2 size={16} className="animate-spin mr-2"/>Loading hub…</div>;
  }

  const tabs = [
    { id: "global", label: "Global", icon: Globe },
    { id: "private", label: "Private", icon: Users },
    { id: "market", label: ".lit Market", icon: Tag },
  ] as const;

  return (
    <div className="max-w-5xl mx-auto pb-24">
      <div className="text-center mb-6">
        <h1 className="text-3xl sm:text-4xl font-black tracking-tighter text-white">LitDEX HUB</h1>
        <p className="text-xs text-brand-text-muted font-mono mt-1">
          Welcome, <span className="text-white font-bold">{myName}.lit</span>
        </p>
      </div>

      <div className="flex justify-center mb-6">
        <div className="inline-flex bg-brand-surface border border-brand-border rounded-2xl p-1.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as any)}
              className={cn(
                "flex items-center gap-1.5 px-4 sm:px-5 py-2.5 rounded-xl text-[10px] sm:text-[11px] font-black uppercase tracking-widest transition-all",
                tab === t.id ? "bg-white text-black" : "text-brand-text-muted hover:text-white"
              )}
            >
              <t.icon size={13}/> {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "global" && myName && <GlobalTab wallet={wallet} myName={myName}/>}
      {tab === "private" && <PrivateTab wallet={wallet}/>}
      {tab === "market" && myName && <MarketTab wallet={wallet} myName={myName} onNameUpdate={refreshName}/>}

      {/* Forced registration */}
      {!myName && <RegisterModal wallet={wallet} onDone={(n) => setMyName(n)}/>}

      {/* Floating send button */}
      <button
        onClick={() => setSendOpen(true)}
        className="fixed bottom-6 right-6 z-[55] px-5 py-3.5 rounded-2xl bg-white text-black font-black uppercase tracking-widest text-[11px] shadow-[0_0_40px_rgba(255,255,255,0.3)] hover:scale-105 transition-transform flex items-center gap-2"
      >
        💸 Send zkLTC
      </button>

      <AnimatePresence>
        {sendOpen && <SendModal onClose={() => setSendOpen(false)}/>}
      </AnimatePresence>
    </div>
  );
}
