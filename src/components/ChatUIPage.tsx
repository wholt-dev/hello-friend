// ChatUI page — Private + Global chat tabs powered by LitDEX Hub backend.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronUp,
  DollarSign,
  Globe,
  Heart,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Paperclip,
  Reply,
  Search,
  Send,
  Settings,
  Share2,
  Smile,
  SquarePen,
  User2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { addNotif } from "@/lib/notifications";

const API = "https://hub.test-hub.xyz";
const CHAIN_ID_HEX = "0x1159";
const RPC_URL = "https://liteforge.rpc.caldera.xyz/http";
const HUB_POSTS_ADDRESS = "0x33690545061cF3759350dd2C5A0d1080D9A14D73";
const LIT_REGISTRY_ADDRESS = "0x3E3aEE6d154f881A7418b2dA50c915C34664C2A8";
const MESSENGER_ADDRESS = "0x69405b51963D592C6CA9350F774045d4E76c89B8";

const SELECTOR = {
  createPost: "0xbf95fe57",
  likePost: "0x725009d3",
  commentPost: "0x0418e5ff",
  hasLiked: "0x8fb7092c",
  reverseResolve: "0x9af8b7aa",
  sendFriendRequest: "0x837b770a",
  acceptFriendRequest: "0x2b5aeab7",
  rejectFriendRequest: "0xd1b5b906",
  sendMessage: "0xcea14c26",
  sendZkLTC: "0x096a0efb",
  getPendingRequests: "0xf05bfa7b",
  friendRequests: "0xdc5bd536",
};

type Contact = { address: string; name: string; message?: string };
type Msg = { id?: string | number; from?: string; wallet?: string; to?: string; message?: string; content?: string; text?: string; contentHash?: string; ts?: number; timestamp?: number | string; createdAt?: string };
type Comment = { commenter: string; text: string; timestamp?: number | string; name?: string };
type Post = {
  id: string;
  postId: string;
  author: string;
  name?: string;
  content: string;
  timestamp?: number | string;
  likeCount: number;
  commentCount: number;
  bountyActive: boolean;
  liked?: boolean;
  comments?: Comment[];
};
type PendingRequest = { id: string; from: string; to?: string; status?: number; sentAt?: number; name?: string };

const short = (a: string) => (a && a.length > 10 ? `${a.slice(0, 6)}...${a.slice(-4)}` : a || "");
const initials = (name: string) => {
  const label = name?.replace(".lit", "").trim() || "?";
  if (label.startsWith("0x")) return label.slice(2, 4).toUpperCase();
  return label.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?";
};
const displayTime = (value?: number | string) => {
  if (!value) return "";
  const raw = typeof value === "number" && value < 10_000_000_000 ? value * 1000 : value;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};
const readArray = (data: any, keys: string[]) => {
  if (Array.isArray(data)) return data;
  for (const key of keys) if (Array.isArray(data?.[key])) return data[key];
  return [];
};
const getMessageText = (m: Msg) => m.message || m.content || m.text || m.contentHash || "";
const stripHex = (hex: string) => hex.replace(/^0x/, "");
const pad32 = (hex: string) => stripHex(hex).padStart(64, "0");
const padRight32 = (hex: string) => stripHex(hex).padEnd(Math.ceil(stripHex(hex).length / 64) * 64 || 64, "0");
const uintHex = (value: string | number | bigint) => pad32(BigInt(value).toString(16));
const addressHex = (value: string) => pad32(stripHex(value).toLowerCase());
const stringHex = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return uintHex(bytes.length) + padRight32(hex);
};
const encodeCall = (selector: string, args: { type: "uint" | "address" | "string"; value: string | number | bigint }[]) => {
  const heads: string[] = [];
  const tails: string[] = [];
  args.forEach((arg) => {
    if (arg.type === "string") {
      const priorTailLength = tails.reduce((sum, tail) => sum + tail.length / 2, 0);
      heads.push(uintHex(args.length * 32 + priorTailLength));
      tails.push(stringHex(String(arg.value)));
    } else if (arg.type === "address") {
      heads.push(addressHex(String(arg.value)));
    } else {
      heads.push(uintHex(arg.value));
    }
  });
  return selector + heads.join("") + tails.join("");
};
const parseAmount = (value: string) => {
  const [whole = "0", fraction = ""] = value.trim().split(".");
  return BigInt(whole || "0") * 10n ** 18n + BigInt((fraction + "0".repeat(18)).slice(0, 18));
};
const quantity = (value: bigint) => `0x${value.toString(16)}`;
const decodeBool = (hex: string) => BigInt(`0x${stripHex(hex) || "0"}`) !== 0n;
const decodeString = (hex: string) => {
  const data = stripHex(hex);
  if (!data || data.length < 128) return "";
  const offset = Number(BigInt(`0x${data.slice(0, 64)}`)) * 2;
  const length = Number(BigInt(`0x${data.slice(offset, offset + 64)}`)) * 2;
  const body = data.slice(offset + 64, offset + 64 + length);
  const bytes = new Uint8Array((body.match(/.{1,2}/g) || []).map((byte) => parseInt(byte, 16)));
  return new TextDecoder().decode(bytes);
};
const decodeUintArray = (hex: string) => {
  const data = stripHex(hex);
  if (!data || data.length < 128) return [] as bigint[];
  const offset = Number(BigInt(`0x${data.slice(0, 64)}`)) * 2;
  const length = Number(BigInt(`0x${data.slice(offset, offset + 64)}`));
  return Array.from({ length }, (_, i) => BigInt(`0x${data.slice(offset + 64 + i * 64, offset + 128 + i * 64)}`));
};
const decodeFriendRequest = (hex: string) => {
  const data = stripHex(hex).padEnd(256, "0");
  return {
    from: `0x${data.slice(24, 64)}`,
    to: `0x${data.slice(88, 128)}`,
    status: Number(BigInt(`0x${data.slice(128, 192)}`)),
    sentAt: Number(BigInt(`0x${data.slice(192, 256)}`)),
  };
};

const Avatar: React.FC<{ name: string; size?: number }> = ({ name, size = 42 }) => (
  <div
    className="rounded-full shrink-0 bg-white/10 border border-white/10 flex items-center justify-center text-brand-text-primary text-xs font-semibold"
    style={{ width: size, height: size }}
  >
    {initials(name)}
  </div>
);

const IconBtn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { children: React.ReactNode }> = ({ className, children, ...p }) => (
  <button
    {...p}
    className={cn(
      "h-9 w-9 inline-flex items-center justify-center rounded-md text-brand-text-muted hover:bg-white/5 hover:text-brand-text-primary transition-colors disabled:opacity-40 disabled:pointer-events-none",
      className
    )}
  >
    {children}
  </button>
);

export default function ChatUIPage() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [tab, setTab] = useState<"private" | "global">("global");
  const [wallet, setWallet] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [pending, setPending] = useState<PendingRequest[]>([]);
  const [current, setCurrent] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [replyTo, setReplyTo] = useState<{ postId: string; name: string; authorAddr: string; content: string } | null>(null);
  const [commentedPosts, setCommentedPosts] = useState<Record<string, boolean>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [postContent, setPostContent] = useState("");
  const [addBounty, setAddBounty] = useState(false);
  const [likeReward, setLikeReward] = useState("0.01");
  const [commentReward, setCommentReward] = useState("0.01");
  const [addFriendOpen, setAddFriendOpen] = useState(false);
  const [friendName, setFriendName] = useState("");
  const [tipOpen, setTipOpen] = useState(false);
  const [tipAmount, setTipAmount] = useState("0.01");
  const [tipNote, setTipNote] = useState("");
  const [busy, setBusy] = useState(false);
  const namesRef = useRef<Record<string, string>>({});
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const totalBudget = useMemo(() => {
    if (!addBounty) return "0";
    const total = (Number(likeReward || 0) + Number(commentReward || 0)).toFixed(4);
    return Number.isFinite(Number(total)) ? total : "0";
  }, [addBounty, likeReward, commentReward]);

  const ensureChain = useCallback(async () => {
    const eth: any = (window as any).ethereum;
    if (!eth) throw new Error("Wallet not found");
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_ID_HEX }] });
    } catch (err: any) {
      if (err?.code === 4902) {
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [{ chainId: CHAIN_ID_HEX, chainName: "LiteForge", rpcUrls: [RPC_URL], nativeCurrency: { name: "zkLTC", symbol: "zkLTC", decimals: 18 } }],
        });
      } else {
        throw err;
      }
    }
  }, []);

  const readContract = useCallback(async (address: string, data: string) => {
    const result = await fetch(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: address, data }, "latest"] }),
    });
    const json = await result.json();
    if (json.error) throw new Error(json.error.message || "Contract read failed");
    return json.result as string;
  }, []);

  const writeContract = useCallback(async (address: string, data: string, value = 0n) => {
    const eth: any = (window as any).ethereum;
    if (!eth) throw new Error("Wallet not found");
    await ensureChain();
    const [from] = await eth.request({ method: "eth_requestAccounts" });
    const hash = await eth.request({ method: "eth_sendTransaction", params: [{ from, to: address, data, value: quantity(value) }] });
    return hash as string;
  }, [ensureChain]);

  const resolveName = useCallback(async (address: string) => {
    if (!address) return "";
    const key = address.toLowerCase();
    if (namesRef.current[key]) return namesRef.current[key];
    try {
      const data = encodeCall(SELECTOR.reverseResolve, [{ type: "address", value: address }]);
      const name = decodeString(await readContract(LIT_REGISTRY_ADDRESS, data));
      namesRef.current[key] = name || short(address);
    } catch {
      namesRef.current[key] = short(address);
    }
    return namesRef.current[key];
  }, [readContract]);

  const mapContact = useCallback(async (item: any): Promise<Contact | null> => {
    const address = typeof item === "string" ? item : item.address || item.wallet || item.walletAddress || item.friend || item.from || item.to || "";
    if (!address) return null;
    const name = item.name || item.litName || item.username || await resolveName(address);
    return { address, name, message: item.lastMessage || item.preview || item.message || short(address) };
  }, [resolveName]);

  useEffect(() => {
    const eth: any = (window as any).ethereum;
    if (!eth) return;
    eth.request({ method: "eth_accounts" }).then((accs: string[]) => setWallet(accs?.[0] || "")).catch(() => {});
    const onAcc = (accs: string[]) => setWallet(accs?.[0] || "");
    eth.on?.("accountsChanged", onAcc);
    return () => eth.removeListener?.("accountsChanged", onAcc);
  }, []);

  const loadPosts = useCallback(async () => {
    try {
      console.log("[ChatUI] fetching posts:", `${API}/hub/posts`);
      const response = await fetch(`${API}/hub/posts`);
      const data = await response.json();
      console.log("[ChatUI] /hub/posts response:", data);
      const arr = readArray(data, ["posts", "data", "items"]);
      console.log("[ChatUI] posts array length:", arr.length);
      const mapped = await Promise.all(arr.map(async (p: any, index: number): Promise<Post> => {
        const author = p.author || p.wallet || p.walletAddress || p.from || p.creator || "";
        const id = String(p.id ?? p.postId ?? index);
        const name = p.name || p.litName || p.creatorName || await resolveName(author);
        let liked = Boolean(p.liked || p.hasLiked);
        if (wallet && !liked) {
          try {
            const data = encodeCall(SELECTOR.hasLiked, [{ type: "uint", value: id }, { type: "address", value: wallet }]);
            liked = decodeBool(await readContract(HUB_POSTS_ADDRESS, data));
          } catch { /* keep backend value */ }
        }
        const commentsRaw = Array.isArray(p.comments) ? p.comments : [];
        const comments: Comment[] = commentsRaw.map((c: any) => ({
          commenter: c.commenter || c.from || c.wallet || c.author || "",
          text: c.text || c.content || c.message || "",
          timestamp: c.timestamp || c.createdAt || c.ts,
          name: c.name || c.litName,
        }));
        return {
          id,
          postId: id,
          author,
          name,
          content: p.content || p.message || p.text || "",
          timestamp: p.timestamp || p.createdAt || p.ts,
          likeCount: Number(p.likeCount ?? p.likes ?? 0),
          commentCount: Number(p.commentCount ?? p.comments?.length ?? 0),
          bountyActive: Boolean(p.bountyActive || p.hasBounty || p.bounty),
          liked,
          comments,
        };
      }));
      console.log("[ChatUI] mapped posts:", mapped);
      setPosts(mapped);
    } catch (err) {
      console.error("[ChatUI] loadPosts error:", err);
      setPosts([]);
    }
  }, [resolveName, wallet]);

  const loadPrivate = useCallback(async () => {
    let connectedWallet = wallet;
    try {
      const eth: any = (window as any).ethereum;
      if (eth && !connectedWallet) {
        const accs: string[] = await eth.request({ method: "eth_accounts" });
        console.log("[ChatUI] eth_accounts:", accs);
        connectedWallet = accs?.[0] || "";
      }
    } catch (err) {
      console.error("[ChatUI] eth_accounts error:", err);
    }
    console.log("[ChatUI] connectedWallet:", connectedWallet);
    if (!connectedWallet) { setContacts([]); setPending([]); return; }
    try {
      const url = `${API}/hub/messenger/friends/${connectedWallet}`;
      console.log("[ChatUI] fetching friends:", url);
      const response = await fetch(url);
      const data = await response.json();
      console.log("[ChatUI] /hub/messenger/friends response:", data);
      const arr = readArray(data, ["friends", "contacts", "data"]);
      console.log("[ChatUI] data.friends:", arr);
      const mapped = (await Promise.all(arr.map(mapContact))).filter(Boolean) as Contact[];
      console.log("[ChatUI] mapped contacts:", mapped);
      setContacts(mapped);
    } catch (err) {
      console.error("[ChatUI] loadPrivate friends error:", err);
      setContacts([]);
    }

    try {
      const ids = decodeUintArray(await readContract(MESSENGER_ADDRESS, encodeCall(SELECTOR.getPendingRequests, [{ type: "address", value: wallet }])));
      const requests = await Promise.all(ids.map(async (id) => {
        const req = decodeFriendRequest(await readContract(MESSENGER_ADDRESS, encodeCall(SELECTOR.friendRequests, [{ type: "uint", value: id }])));
        return { id: id.toString(), from: req.from, to: req.to, status: req.status, sentAt: req.sentAt, name: await resolveName(req.from) };
      }));
      setPending(requests.filter((req) => req.from.toLowerCase() !== wallet.toLowerCase()));
    } catch { setPending([]); }
  }, [mapContact, resolveName, wallet]);

  const loadConversation = useCallback(async () => {
    if (!wallet || !current?.address) return;
    try {
      const r = await fetch(`${API}/hub/messenger/conversation/${wallet}/${current.address}`);
      const j = await r.json();
      setMessages(readArray(j, ["messages", "conversation", "data"]));
    } catch { setMessages([]); }
  }, [current?.address, wallet]);

  useEffect(() => {
    if (tab === "global") {
      loadPosts();
      const id = setInterval(loadPosts, 15_000);
      return () => clearInterval(id);
    }
    loadPrivate();
    const id = setInterval(loadPrivate, 15_000);
    return () => clearInterval(id);
  }, [loadPosts, loadPrivate, tab]);

  useEffect(() => {
    setCurrent(null);
    setMessages([]);
    setSearch("");
  }, [tab]);

  useEffect(() => {
    if (tab !== "private" || !current) return;
    loadConversation();
    const id = setInterval(loadConversation, 15_000);
    return () => clearInterval(id);
  }, [current, loadConversation, tab]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [messages, posts, replyTo]);

  const refreshPost = useCallback(async (postId: string) => {
    try {
      const r = await fetch(`${API}/hub/posts/${postId}`);
      const j = await r.json();
      const p = j.post || j.data || j;
      if (!p) return;
      const commentsRaw = Array.isArray(p.comments) ? p.comments : null;
      const comments: Comment[] | undefined = commentsRaw
        ? commentsRaw.map((c: any) => ({
            commenter: c.commenter || c.from || c.wallet || c.author || "",
            text: c.text || c.content || c.message || "",
            timestamp: c.timestamp || c.createdAt || c.ts,
            name: c.name || c.litName,
          }))
        : undefined;
      setPosts((list) => list.map((it) => it.id === postId ? {
        ...it,
        content: p.content ?? it.content,
        likeCount: Number(p.likeCount ?? p.likes ?? it.likeCount),
        commentCount: Number(p.commentCount ?? (comments ? comments.length : it.commentCount)),
        bountyActive: Boolean(p.bountyActive ?? p.hasBounty ?? it.bountyActive),
        comments: comments ?? it.comments,
      } : it));
    } catch (err) { console.error("[ChatUI] refreshPost error:", err); }
  }, []);

  const likePost = async (post: Post) => {
    if (post.liked) return;
    setBusy(true);
    try {
      await writeContract(HUB_POSTS_ADDRESS, encodeCall(SELECTOR.likePost, [{ type: "uint", value: post.postId }]));
      setPosts((list) => list.map((p) => p.id === post.id ? { ...p, liked: true } : p));
      await refreshPost(post.postId);
    } finally { setBusy(false); }
  };

  const commentPost = async (postId: string, rawText: string) => {
    const text = (rawText || "").trim();
    if (!text) return;
    setBusy(true);
    try {
      await writeContract(HUB_POSTS_ADDRESS, encodeCall(SELECTOR.commentPost, [{ type: "uint", value: postId }, { type: "string", value: text }]));
      const post = posts.find((p) => p.id === postId);
      if (post && post.author && wallet && post.author.toLowerCase() !== wallet.toLowerCase()) {
        const senderName = namesRef.current[wallet.toLowerCase()] || short(wallet);
        const preview = text.length > 80 ? `${text.slice(0, 80)}…` : text;
        addNotif(post.author, {
          type: "gf",
          title: `@${senderName} replied to your post`,
          message: preview,
          link: `/chat`,
        });
      }
      await refreshPost(postId);
      try {
        if (wallet) {
          const r = await fetch(`${API}/hub/posts/${postId}/status/${wallet}`);
          const j = await r.json();
          if (j?.hasCommented || j?.commented) {
            setCommentedPosts((m) => ({ ...m, [postId]: true }));
          }
        }
      } catch (err) { console.error("[ChatUI] post status error:", err); }
    } finally { setBusy(false); }
  };

  const sendReply = async () => {
    if (!replyTo) return;
    const body = draft.trim();
    if (!body) return;
    const mention = `@${replyTo.name} `;
    const full = body.startsWith("@") ? body : mention + body;
    await commentPost(replyTo.postId, full);
    setDraft("");
    setReplyTo(null);
  };

  const openCreatePost = () => {
    const text = draft.trim();
    if (!text) return;
    setPostContent(text);
    setCreateOpen(true);
  };

  const createPost = async () => {
    const content = postContent.trim();
    if (!content) return;
    setBusy(true);
    try {
      const likeWei = addBounty ? parseAmount(likeReward || "0") : 0n;
      const commentWei = addBounty ? parseAmount(commentReward || "0") : 0n;
      const budgetWei = addBounty ? parseAmount(totalBudget || "0") : 0n;
      await writeContract(HUB_POSTS_ADDRESS, encodeCall(SELECTOR.createPost, [{ type: "string", value: content }, { type: "uint", value: likeWei }, { type: "uint", value: commentWei }]), budgetWei);
      setDraft("");
      setPostContent("");
      setCreateOpen(false);
      loadPosts();
    } finally { setBusy(false); }
  };

  const addFriend = async () => {
    const clean = friendName.trim().replace(/^@/, "");
    if (!clean) return;
    setBusy(true);
    try {
      const r = await fetch(`${API}/hub/name/resolve/${encodeURIComponent(clean)}`);
      const j = await r.json();
      const resolved = j.address || j.wallet || j.walletAddress || j.data?.address;
      if (!resolved) throw new Error("Name not found");
      await writeContract(MESSENGER_ADDRESS, encodeCall(SELECTOR.sendFriendRequest, [{ type: "address", value: resolved }]));
      setFriendName("");
      setAddFriendOpen(false);
    } finally { setBusy(false); }
  };

  const respondRequest = async (reqId: string, accept: boolean) => {
    setBusy(true);
    try {
      await writeContract(MESSENGER_ADDRESS, encodeCall(accept ? SELECTOR.acceptFriendRequest : SELECTOR.rejectFriendRequest, [{ type: "uint", value: reqId }]));
      setPending((list) => list.filter((req) => req.id !== reqId));
      loadPrivate();
    } finally { setBusy(false); }
  };

  const sendPrivate = async () => {
    const text = draft.trim();
    if (!text || !current?.address) return;
    setBusy(true);
    try {
      await writeContract(MESSENGER_ADDRESS, encodeCall(SELECTOR.sendMessage, [{ type: "address", value: current.address }, { type: "string", value: text }, { type: "string", value: "text" }]));
      setDraft("");
      loadConversation();
    } finally { setBusy(false); }
  };

  const sendTip = async () => {
    if (!current?.address) return;
    setBusy(true);
    try {
      await writeContract(MESSENGER_ADDRESS, encodeCall(SELECTOR.sendZkLTC, [{ type: "address", value: current.address }, { type: "string", value: tipNote || "zkLTC" }]), parseAmount(tipAmount || "0"));
      setTipOpen(false);
      setTipNote("");
    } finally { setBusy(false); }
  };

  const sharePost = (post: Post) => {
    const text = `${post.content}\n\nlitdex.test-hub.xyz`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  };

  const filtered = contacts.filter((c) => !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.address.toLowerCase().includes(search.toLowerCase()));
  const showChat = tab === "global" || !!current;
  const headerName = tab === "global" ? "Global" : current?.name || "Select a chat";

  return (
    <div className="w-full min-h-[calc(100vh-120px)] mt-20 px-2 sm:px-4">
      <div className="max-w-[1480px] mx-auto bg-brand-bg border border-brand-border rounded-2xl overflow-hidden shadow-2xl">
        <div className="flex h-[calc(100vh-160px)] min-h-[600px]">
          <aside className={cn("shrink-0 border-r border-brand-border bg-brand-bg flex flex-col transition-[width] duration-200", sidebarOpen ? "w-[200px]" : "w-[60px]")}>
            <div className="p-3">
              {sidebarOpen && <div className="text-[11px] font-semibold text-brand-text-muted px-2 py-1.5">Navigate</div>}
              <button onClick={() => setSidebarOpen((v) => !v)} className="w-full flex items-center gap-3 px-2 py-2 rounded-md text-brand-text-muted hover:bg-white/5 hover:text-brand-text-primary">
                <Menu size={18} />
              </button>
              <button onClick={() => setTab("private")} className={cn("w-full flex items-center gap-3 px-2 py-2 rounded-md", tab === "private" ? "bg-white/10 text-brand-text-primary" : "text-brand-text-muted hover:bg-white/5 hover:text-brand-text-primary")}>
                <MessageCircle size={18} />{sidebarOpen && <span className="text-sm">Private</span>}
              </button>
              <button onClick={() => setTab("global")} className={cn("w-full flex items-center gap-3 px-2 py-2 rounded-md", tab === "global" ? "bg-white/10 text-brand-text-primary" : "text-brand-text-muted hover:bg-white/5 hover:text-brand-text-primary")}>
                <Globe size={18} />{sidebarOpen && <span className="text-sm">Global</span>}
              </button>
            </div>
            <div className="mt-auto p-3 space-y-1">
              <button className="w-full flex items-center gap-3 px-2 py-2 rounded-md text-brand-text-muted hover:bg-white/5 hover:text-brand-text-primary">
                <Settings size={18} />{sidebarOpen && <span className="text-sm">Settings</span>}
              </button>
              <button className="w-full flex items-center gap-3 px-2 py-2 rounded-md text-brand-text-muted hover:bg-white/5 hover:text-brand-text-primary">
                <User2 size={18} />{sidebarOpen && (<><span className="text-sm truncate">{short(wallet) || "Not connected"}</span><ChevronUp size={16} className="ml-auto" /></>)}
              </button>
            </div>
          </aside>

          <section className="w-[300px] shrink-0 border-r border-brand-border bg-brand-bg flex flex-col">
            <div className="h-12 px-3 flex items-center gap-2">
              <p className="text-sm font-medium text-brand-text-primary">{tab === "private" ? "Private" : "Global"}</p>
              <div className="ml-auto flex items-center gap-1">
                {tab === "private" && (
                  <button onClick={() => setAddFriendOpen(true)} className="relative h-9 w-9 inline-flex items-center justify-center rounded-md text-brand-text-muted hover:bg-white/5 hover:text-brand-text-primary">
                    <SquarePen size={16} />
                    {pending.length > 0 && <span className="absolute -right-1 -top-1 min-w-4 h-4 rounded-full bg-brand-danger px-1 text-[10px] text-brand-text-primary leading-4 text-center">{pending.length}</span>}
                  </button>
                )}
                <button onClick={() => setTab(tab === "private" ? "global" : "private")} className="px-2.5 h-8 inline-flex items-center gap-1.5 rounded-md text-xs font-semibold bg-white/5 text-brand-text-primary hover:bg-white/10 transition-colors">
                  {tab === "private" ? <Globe size={14} /> : <MessageCircle size={14} />}{tab === "private" ? "Global" : "Private"}
                </button>
              </div>
            </div>

            {tab === "private" ? (
              <>
                <div className="relative px-3 pb-3">
                  <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-text-muted" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search contacts" className="w-full h-9 pl-9 pr-3 rounded-md bg-brand-surface border border-brand-border text-sm text-brand-text-primary placeholder:text-brand-text-muted outline-none focus:border-white/20" />
                </div>
                <div className="flex-1 overflow-y-auto">
                  {pending.map((req) => (
                    <div key={req.id} className="mx-3 mb-2 rounded-md border border-brand-border bg-white/5 p-2">
                      <div className="flex items-center gap-2">
                        <Avatar name={req.name || req.from} size={34} />
                        <div className="min-w-0 flex-1"><div className="text-xs font-semibold text-brand-text-primary truncate">{req.name || short(req.from)}</div><div className="text-[11px] text-brand-text-muted">Friend request</div></div>
                        <IconBtn aria-label="Accept" disabled={busy} onClick={() => respondRequest(req.id, true)} className="h-8 w-8 text-brand-text-primary"><Check size={15} /></IconBtn>
                        <IconBtn aria-label="Reject" disabled={busy} onClick={() => respondRequest(req.id, false)} className="h-8 w-8"><X size={15} /></IconBtn>
                      </div>
                    </div>
                  ))}
                  {filtered.length === 0 && <div className="px-4 py-6 text-xs text-brand-text-muted text-center">{wallet ? "No contacts found" : "Connect wallet to see contacts"}</div>}
                  {filtered.map((contact) => (
                    <button key={contact.address} onClick={() => setCurrent(contact)} className={cn("px-3 w-full py-2 text-left transition-colors", current?.address === contact.address ? "bg-white/10" : "hover:bg-white/5")}>
                      <div className="flex gap-2 items-start">
                        <Avatar name={contact.name} size={44} />
                        <div className="min-w-0 py-1"><div className="text-[15px] font-semibold text-brand-text-primary leading-tight truncate">{contact.name}</div><div className="text-xs text-brand-text-muted mt-1 line-clamp-2">{contact.message || short(contact.address)}</div></div>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center px-6 text-center text-sm text-brand-text-muted">Global posts are shown in the chat panel.</div>
            )}
          </section>

          <section className="flex-1 flex flex-col bg-brand-bg min-w-0">
            <div className="h-16 border-b border-brand-border flex items-center px-3">
              <Avatar name={headerName} size={44} />
              <div className="ml-2 min-w-0">
                <div className="text-[15px] font-semibold text-brand-text-primary truncate">{headerName}</div>
                <div className="text-xs text-brand-text-muted truncate">{tab === "global" ? "Public posts" : current ? short(current.address) : "Contact Info"}</div>
              </div>
            </div>

            <div ref={bodyRef} className="flex-1 bg-brand-bg overflow-y-auto px-4 py-4 space-y-3">
              {!showChat && <div className="h-full flex items-center justify-center text-brand-text-muted text-sm">Select a chat to start messaging</div>}

              {tab === "global" && [...posts].sort((a, b) => Number(a.timestamp || 0) - Number(b.timestamp || 0)).map((post) => {
                const walletLc = wallet.toLowerCase();
                const myLitName = walletLc ? (namesRef.current[walletLc] || "").toLowerCase() : "";
                const tagged = !!walletLc && (post.comments || []).some((c) => {
                  const t = (c.text || "").toLowerCase();
                  return t.includes(walletLc) || (myLitName && myLitName.endsWith(".lit") && t.includes(myLitName));
                });
                const quotedPreview = post.content.length > 60 ? `${post.content.slice(0, 60)}…` : post.content;
                return (
                  <div key={post.id} className="flex justify-start">
                    <div className={cn(
                      "group relative max-w-[760px] w-fit rounded-lg border bg-brand-surface px-3 py-3 text-sm text-brand-text-primary",
                      tagged ? "border-l-4 border-l-blue-500 border-brand-border" : "border-brand-border"
                    )}>
                      {post.bountyActive && <div className="absolute right-3 top-3 text-emerald-400" title="Bounty active">💰</div>}

                      {/* Discord-style hover action bar */}
                      <div className="absolute -top-4 right-4 z-10 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        <div className="flex items-center gap-0.5 rounded-full border border-brand-border bg-brand-surface-2 px-1 py-1 shadow-lg">
                          <button
                            aria-label="Like"
                            disabled={busy || post.liked}
                            onClick={() => likePost(post)}
                            className={cn("p-2 rounded-full hover:bg-white/10 transition-colors disabled:cursor-default", post.liked && "opacity-50")}
                          >
                            <Heart size={16} className={post.liked ? "fill-current" : ""} />
                          </button>
                          <button
                            aria-label="Reply"
                            onClick={() => {
                              setReplyTo({
                                postId: post.id,
                                name: post.name || short(post.author),
                                authorAddr: post.author,
                                content: post.content,
                              });
                              setTimeout(() => inputRef.current?.focus(), 0);
                            }}
                            className="p-2 rounded-full hover:bg-white/10 transition-colors"
                          >
                            <Reply size={16} />
                          </button>
                          <button
                            aria-label="Share"
                            onClick={() => sharePost(post)}
                            className="p-2 rounded-full hover:bg-white/10 transition-colors"
                          >
                            <Share2 size={16} />
                          </button>
                          <button
                            aria-label="More"
                            className="p-2 rounded-full hover:bg-white/10 transition-colors"
                          >
                            <MoreHorizontal size={16} />
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pr-8">
                        <Avatar name={post.name || post.author} size={34} />
                        <div className="min-w-0">
                          <span className="font-semibold">{post.name || short(post.author)}</span>
                          <span className="ml-2 text-xs text-brand-text-muted">{displayTime(post.timestamp)}</span>
                          <span className="ml-2 text-xs text-brand-text-muted">· ♥ {post.likeCount} · 💬 {post.commentCount}</span>
                          {post.bountyActive && commentedPosts[post.id] && (
                            <span className="ml-2 text-[11px] text-emerald-400">✓ Bounty claimed</span>
                          )}
                        </div>
                      </div>
                      <div className="mt-2 whitespace-pre-wrap break-words leading-relaxed">{post.content}</div>

                      {/* Existing replies */}
                      {post.comments && post.comments.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {post.comments.map((c, idx) => (
                            <div key={idx} className="reply-bubble pl-3 border-l-2 border-gray-400/60 bg-white/[0.03] rounded-r-md py-1.5">
                              <div className="quoted-preview flex items-center gap-1.5 text-[11px] text-brand-text-muted mb-1 truncate">
                                <Avatar name={post.name || post.author} size={16} />
                                <span className="font-medium">{post.name || short(post.author)}</span>
                                <span className="quoted-text truncate opacity-70">{quotedPreview}</span>
                              </div>
                              <div className="reply-content flex items-start gap-2">
                                <Avatar name={c.name || c.commenter} size={22} />
                                <div className="min-w-0 flex-1">
                                  <div className="text-xs">
                                    <span className="font-semibold">{c.name || short(c.commenter)}</span>
                                    <span className="ml-2 text-[10px] text-brand-text-muted">{displayTime(c.timestamp)}</span>
                                  </div>
                                  <div className="text-sm break-words whitespace-pre-wrap">{c.text}</div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                    </div>
                  </div>
                );
              })}

              {tab === "private" && showChat && [...messages].sort((a, b) => Number(a.timestamp || a.ts || 0) - Number(b.timestamp || b.ts || 0)).map((m, i) => {
                const fromAddr = (m.from || m.wallet || (m as any).fromWallet || (m as any).sender || "").toString();
                const mine = fromAddr.toLowerCase() === wallet.toLowerCase();
                return (
                  <div key={m.id || i} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                    <div className={cn("max-w-[70%] rounded-lg px-3 py-2 text-sm border", mine ? "bg-white/10 border-white/10 text-brand-text-primary" : "bg-brand-surface border-brand-border text-brand-text-primary")}>
                      <div className="break-words whitespace-pre-wrap">{getMessageText(m)}</div>
                      <div className="mt-1 text-[10px] text-brand-text-muted text-right">{displayTime(m.timestamp || m.createdAt || m.ts)}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-brand-border">
              {replyTo && tab === "global" && (
                <div className="flex items-center gap-2 px-3 py-2 bg-white/[0.04] border-b border-brand-border text-xs text-brand-text-muted">
                  <span className="text-brand-text-primary">↩</span>
                  <span className="truncate">
                    Replying to <span className="font-semibold text-brand-text-primary">@{replyTo.name}</span>
                  </span>
                  <span className="truncate opacity-60 hidden sm:inline">— {replyTo.content.length > 60 ? `${replyTo.content.slice(0, 60)}…` : replyTo.content}</span>
                  <button aria-label="Cancel reply" onClick={() => setReplyTo(null)} className="ml-auto p-1 rounded hover:bg-white/10 text-brand-text-muted hover:text-brand-text-primary">
                    <X size={14} />
                  </button>
                </div>
              )}
              <div className="flex items-center gap-1 px-2 py-2">
                <IconBtn aria-label="Emoji"><Smile size={18} /></IconBtn>
                <IconBtn aria-label="Attach"><Paperclip size={18} /></IconBtn>
                {tab === "private" && <IconBtn aria-label="Send zkLTC" disabled={!current} onClick={() => setTipOpen(true)}><DollarSign size={18} /></IconBtn>}
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      if (tab === "global" && replyTo) sendReply();
                      else if (tab === "global") openCreatePost();
                      else sendPrivate();
                    } else if (e.key === "Escape" && replyTo) {
                      setReplyTo(null);
                    }
                  }}
                  disabled={!showChat || busy}
                  placeholder={
                    !showChat ? "Select a chat first" :
                    tab === "global" ? (replyTo ? `Reply to @${replyTo.name}` : "Create a global post") :
                    "Type a message"
                  }
                  className="flex-grow h-10 px-3 bg-transparent border-0 outline-none text-sm text-brand-text-primary placeholder:text-brand-text-muted disabled:opacity-50"
                />
                <IconBtn
                  aria-label="Send"
                  disabled={!showChat || busy}
                  onClick={tab === "global" ? (replyTo ? sendReply : openCreatePost) : sendPrivate}
                >
                  <Send size={18} />
                </IconBtn>
              </div>
            </div>
          </section>
        </div>
      </div>

      {createOpen && (
        <Modal title="Create Post" onClose={() => setCreateOpen(false)}>
          <textarea value={postContent} onChange={(e) => setPostContent(e.target.value)} className="h-28 w-full rounded-md bg-brand-bg border border-brand-border p-3 text-sm text-brand-text-primary outline-none" />
          <label className="mt-3 flex items-center gap-2 text-sm text-brand-text-primary"><input type="checkbox" checked={addBounty} onChange={(e) => setAddBounty(e.target.checked)} /> Add Bounty?</label>
          {addBounty && <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2"><Field label="Like reward" value={likeReward} setValue={setLikeReward} /><Field label="Comment reward" value={commentReward} setValue={setCommentReward} /><div><div className="mb-1 text-xs text-brand-text-muted">Total budget</div><div className="h-10 rounded-md border border-brand-border bg-white/5 px-3 text-sm text-brand-text-primary flex items-center">{totalBudget} zkLTC</div></div></div>}
          <button disabled={busy} onClick={createPost} className="mt-4 w-full h-10 rounded-md bg-brand-teal text-brand-bg text-sm font-semibold disabled:opacity-50">Submit</button>
        </Modal>
      )}

      {addFriendOpen && (
        <Modal title="Add Friend" onClose={() => setAddFriendOpen(false)}>
          <input value={friendName} onChange={(e) => setFriendName(e.target.value)} placeholder="name.lit" className="w-full h-10 rounded-md bg-brand-bg border border-brand-border px-3 text-sm text-brand-text-primary placeholder:text-brand-text-muted outline-none" />
          <button disabled={busy} onClick={addFriend} className="mt-4 w-full h-10 rounded-md bg-brand-teal text-brand-bg text-sm font-semibold disabled:opacity-50">Send request</button>
        </Modal>
      )}

      {tipOpen && (
        <Modal title="Send zkLTC" onClose={() => setTipOpen(false)}>
          <Field label="Amount" value={tipAmount} setValue={setTipAmount} />
          <div className="mt-3"><div className="mb-1 text-xs text-brand-text-muted">Note</div><input value={tipNote} onChange={(e) => setTipNote(e.target.value)} className="w-full h-10 rounded-md bg-brand-bg border border-brand-border px-3 text-sm text-brand-text-primary outline-none" /></div>
          <button disabled={busy} onClick={sendTip} className="mt-4 w-full h-10 rounded-md bg-brand-teal text-brand-bg text-sm font-semibold disabled:opacity-50">Send</button>
        </Modal>
      )}
    </div>
  );
}

function Field({ label, value, setValue }: { label: string; value: string; setValue: (value: string) => void }) {
  return <div><div className="mb-1 text-xs text-brand-text-muted">{label}</div><input value={value} onChange={(e) => setValue(e.target.value)} className="w-full h-10 rounded-md bg-brand-bg border border-brand-border px-3 text-sm text-brand-text-primary outline-none" /></div>;
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-md rounded-lg border border-brand-border bg-brand-surface p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-semibold text-brand-text-primary">{title}</h2><IconBtn aria-label="Close" onClick={onClose}><X size={18} /></IconBtn></div>
        {children}
      </div>
    </div>
  );
}
