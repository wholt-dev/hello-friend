// ChatUI page — Private + Global chat tabs powered by LitDEX Hub backend.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  Check,
  ChevronUp,
  Globe,
  Heart,
  Menu,
  MessageCircle,
  MoreHorizontal,
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
import zkltcLogo from "@/assets/zkltc.jpg";

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

const ERC20_TRANSFER_SELECTOR = "0xa9059cbb";
const TOKENS: Record<string, { address: string | null; decimals: number; symbol: string }> = {
  ZKLTC:   { address: null, decimals: 18, symbol: "zkLTC" },
  USDC:    { address: "0xFC43ABE529CDC61B7F0aa2e677451AFd83d2B304", decimals: 6,  symbol: "USDC" },
  PEPE:    { address: "0x6858790e164a8761a711BAD1178220C5AebcF7eC", decimals: 18, symbol: "PEPE" },
  USDT:    { address: "0xa38c318a0B755154b25f28cAD7b2312747B073C6", decimals: 6,  symbol: "USDT" },
  LESTER:  { address: "0xFC73cdB75F37B0da829c4e54511f410D525B76b2", decimals: 18, symbol: "Lester" },
  WETH:    { address: "0x68Bf11e64cfD939fE1761012862FBFE47048118e", decimals: 18, symbol: "WETH" },
  WBTC:    { address: "0xcFe6BE457D366329CCdeE7fBC48aBf1d6FFeB9C0", decimals: 18, symbol: "WBTC" },
  LDEX:    { address: "0xBAaba603e6298fbb76325a6B0d47Cd57154ca641", decimals: 18, symbol: "LDEX" },
  ZKPEPE:  { address: "0x314522DD1B3f74Dd1DdE03E5B5a628C28134b25d", decimals: 18, symbol: "zkPEPE" },
  ZKETH:   { address: "0xaf9F497007342Dd025Ff696964A736Ec9584c3dd", decimals: 18, symbol: "zkETH" },
  LDTOAD:  { address: "0xF425553A84e579BE353a6180F7d53d8101bfb3E4", decimals: 18, symbol: "LDTOAD" },
  "USDC.T": { address: "0x60DD65bAd8a73Dfd8DF029C4e3b372d575B03BC2", decimals: 6, symbol: "USDC.t" },
  YURI:    { address: "0xd8C4e6dBe48472d6C563eB1cc330207d020D4c8f", decimals: 18, symbol: "YURI" },
  CHAWLEE: { address: "0x05149f41AFE7ca712D6A42390e8047E0f2887284", decimals: 18, symbol: "CHAWLEE" },
};
const SEND_CMD_RE = /^\s*send\s+([\d]+(?:\.\d+)?)\s+([A-Za-z][\w.]*)\s+to\s+([\w-]+\.lit)\s*$/i;
const SENT_DISPLAY_RE = /^💸\s*Sent\s+([\d]+(?:\.\d+)?)\s+([A-Za-z][\w.]*)\s+to\s+([\w-]+\.lit)/i;
const SLASH_SEND_FULL_RE = /^\s*\/send\s+([A-Za-z][\w.]*)\s+([\d]+(?:\.\d+)?)\s+to\s+([\w-]+\.lit)\s*$/i;
const REPLY_TAG_RE = /^@(0x[a-fA-F0-9]{2,8}(?:\.{2,3}[a-fA-F0-9]{2,8})?|[\w-]+\.lit)\s+/;
const REPLY_ID_RE = /^\[replyTo:([^\]]+)\]\s*/;
const EXPLORER_TX = (hash: string) => `https://liteforge.explorer.caldera.xyz/tx/${hash}`;
const TOKEN_LIST = ["ZKLTC","USDC","USDT","PEPE","WETH","WBTC","LDEX","ZKPEPE","ZKETH","LDTOAD","USDC.T","YURI","CHAWLEE","LESTER"];
const parseUnitsStr = (value: string, decimals: number) => {
  const [whole = "0", fraction = ""] = value.trim().split(".");
  const frac = (fraction + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(frac || "0");
};
const formatUnitsStr = (value: bigint, decimals: number) => {
  const s = value.toString().padStart(decimals + 1, "0");
  const whole = s.slice(0, -decimals);
  const frac = s.slice(-decimals).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
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
  const postRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [bountyPopupOpen, setBountyPopupOpen] = useState(false);
  const [bountyToast, setBountyToast] = useState<{ amount: string; name: string } | null>(null);
  const [sendToast, setSendToast] = useState<string | null>(null);
  const [sendPanelOpen, setSendPanelOpen] = useState(false);
  const [sendTokenKey, setSendTokenKey] = useState("ZKLTC");
  const [sendAmount, setSendAmount] = useState("");
  const [sendRecipient, setSendRecipient] = useState("");
  const [sendBalance, setSendBalance] = useState("0");
  const [localTransfers, setLocalTransfers] = useState<Array<{
    id: string; ts: number; from: string; fromName: string; to: string; toName: string;
    amount: string; token: string; txHash: string; createdAt: number;
  }>>([]);
  const [fetchedReplyPosts, setFetchedReplyPosts] = useState<Record<string, { id: string; author: string; name?: string; content: string }>>({});
  const [inlineBountyActive, setInlineBountyActive] = useState(false);
  const [inlineLikeReward, setInlineLikeReward] = useState("");
  const [inlineTotalBounty, setInlineTotalBounty] = useState("");
  const inlineBountyTotal = useMemo(() => {
    const t = Number(inlineTotalBounty || 0);
    return Number.isFinite(t) ? t.toFixed(4) : "0";
  }, [inlineTotalBounty]);
  const inlineBountyLikes = useMemo(() => {
    const per = Number(inlineLikeReward || 0);
    const total = Number(inlineTotalBounty || 0);
    if (!per || !total || per <= 0) return 0;
    return Math.floor(total / per);
  }, [inlineLikeReward, inlineTotalBounty]);
  const [emojiOpen, setEmojiOpen] = useState(false);

  const [visitedMentions, setVisitedMentions] = useState<Set<string>>(new Set());

  const scrollToPost = useCallback((id: string) => {
    const el = postRefs.current[id];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedId(id);
    setTimeout(() => setHighlightedId((h) => (h === id ? null : h)), 1500);
  }, []);

  const walletLc = wallet.toLowerCase();
  const shortMe = walletLc ? short(wallet).toLowerCase() : "";
  const myLitName = walletLc ? (namesRef.current[walletLc] || "").toLowerCase() : "";

  const taggedIds = useMemo(() => {
    if (!walletLc) return [] as string[];
    return posts
      .filter((p) => {
        const c = (p.content || "").toLowerCase();
        return (shortMe && c.includes(`@${shortMe}`)) || (!!myLitName && c.includes(`@${myLitName}`));
      })
      .map((p) => p.id);
  }, [posts, walletLc, shortMe, myLitName]);

  const unreadMentions = useMemo(() => taggedIds.filter((id) => !visitedMentions.has(id)), [taggedIds, visitedMentions]);

  const jumpToLatestMention = useCallback(() => {
    if (unreadMentions.length === 0) return;
    const latest = unreadMentions[unreadMentions.length - 1];
    setVisitedMentions((prev) => {
      const next = new Set(prev);
      next.add(latest);
      return next;
    });
    scrollToPost(latest);
  }, [unreadMentions, scrollToPost]);

  const renderPostContent = useCallback((content: string) => {
    const re = /(@0x[a-fA-F0-9]{2,8}(?:\.{2,3}[a-fA-F0-9]{2,8})?|@[\w-]+\.lit)/g;
    const parts: React.ReactNode[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      if (m.index > last) parts.push(content.slice(last, m.index));
      const tag = m[0];
      const needle = tag.slice(1).toLowerCase();
      parts.push(
        <button
          key={`${m.index}-${tag}`}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            const target = posts.find(
              (p) =>
                short(p.author).toLowerCase() === needle ||
                p.author.toLowerCase() === needle ||
                (p.name || "").toLowerCase() === needle,
            );
            if (target) scrollToPost(target.id);
          }}
          className="text-sky-400 hover:underline cursor-pointer font-medium"
        >
          {tag}
        </button>,
      );
      last = m.index + tag.length;
    }
    if (last < content.length) parts.push(content.slice(last));
    return parts.length ? parts : content;
  }, [posts, scrollToPost]);


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
      try {
        const r = await fetch(`${API}/hub/posts/${post.postId}`);
        const j = await r.json();
        const p = j.post || j.data || j;
        const rewardRaw = p?.likeReward ?? p?.likeBounty ?? p?.likeRewardWei;
        if (rewardRaw && BigInt(rewardRaw) > 0n) {
          const wei = BigInt(rewardRaw);
          const whole = wei / 10n ** 18n;
          const frac = (wei % 10n ** 18n).toString().padStart(18, "0").replace(/0+$/, "");
          const amount = frac ? `${whole}.${frac}` : `${whole}`;
          const creatorName = post.name || short(post.author);
          setBountyToast({ amount, name: creatorName });
          setTimeout(() => setBountyToast(null), 4000);
        }
      } catch (err) { console.error("[ChatUI] bounty toast error:", err); }
    } finally { setBusy(false); }
  };

  const sendTokenCommand = async (amount: string, tokenSym: string, litName: string) => {
    const key = tokenSym.toUpperCase();
    const token = TOKENS[key];
    if (!token) throw new Error(`Unknown token: ${tokenSym}`);
    const r = await fetch(`${API}/hub/resolve/${encodeURIComponent(litName)}`);
    const j = await r.json();
    const to = j?.address || j?.wallet || j?.walletAddress || j?.data?.address;
    if (!to) throw new Error(`Could not resolve ${litName}`);
    if (token.address === null) {
      await writeContract(to, "0x", parseUnitsStr(amount, 18));
    } else {
      const data = ERC20_TRANSFER_SELECTOR + addressHex(to) + uintHex(parseUnitsStr(amount, token.decimals));
      await writeContract(token.address, data, 0n);
    }
    const content = `💸 Sent ${amount} ${token.symbol} to ${litName}`;
    await writeContract(
      HUB_POSTS_ADDRESS,
      encodeCall(SELECTOR.createPost, [
        { type: "string", value: content },
        { type: "uint", value: 0n },
        { type: "uint", value: 0n },
      ]),
      0n,
    );
    await loadPosts();
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

  const sendGlobal = async () => {
    const body = draft.trim();
    if (!body) return;
    const content = replyTo
      ? `[replyTo:${replyTo.postId}] @${replyTo.name || short(replyTo.authorAddr)} ${body}`
      : body;
    const useBounty = inlineBountyActive && Number(inlineLikeReward || 0) > 0 && Number(inlineTotalBounty || 0) > 0;
    const likeWei = useBounty ? parseAmount(inlineLikeReward || "0") : 0n;
    const commentWei = 0n;
    const budgetWei = useBounty ? parseAmount(inlineTotalBounty || "0") : 0n;
    setBusy(true);
    try {
      await writeContract(
        HUB_POSTS_ADDRESS,
        encodeCall(SELECTOR.createPost, [
          { type: "string", value: content },
          { type: "uint", value: likeWei },
          { type: "uint", value: commentWei },
        ]),
        budgetWei,
      );
      setDraft("");
      setReplyTo(null);
      setInlineBountyActive(false);
      setInlineLikeReward("");
      setInlineTotalBounty("");
      setBountyPopupOpen(false);
      await loadPosts();
    } finally { setBusy(false); }
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

  // Fetch quoted-reply parent posts not already loaded
  useEffect(() => {
    if (tab !== "global") return;
    const need = new Set<string>();
    for (const p of posts) {
      const m = (p.content || "").match(REPLY_ID_RE);
      if (m) {
        const id = m[1];
        if (!posts.find((pp) => pp.id === id) && !fetchedReplyPosts[id]) need.add(id);
      }
    }
    if (need.size === 0) return;
    (async () => {
      const updates: Record<string, { id: string; author: string; name?: string; content: string }> = {};
      for (const id of need) {
        try {
          const r = await fetch(`${API}/hub/posts/${id}`);
          const j = await r.json();
          const p = j.post || j.data || j;
          if (!p) continue;
          const author = p.author || p.wallet || p.walletAddress || p.from || p.creator || "";
          const name = p.name || p.litName || p.creatorName || (author ? await resolveName(author) : "");
          updates[id] = { id, author, name, content: p.content || p.message || p.text || "" };
        } catch { /* ignore */ }
      }
      if (Object.keys(updates).length) setFetchedReplyPosts((prev) => ({ ...prev, ...updates }));
    })();
  }, [posts, fetchedReplyPosts, resolveName, tab]);

  // Send-panel: balance fetch
  const fetchSendBalance = useCallback(async () => {
    if (!wallet) { setSendBalance("0"); return; }
    const token = TOKENS[sendTokenKey];
    if (!token) { setSendBalance("0"); return; }
    try {
      if (token.address === null) {
        const r = await fetch(RPC_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [wallet, "latest"] }),
        });
        const j = await r.json();
        setSendBalance(formatUnitsStr(BigInt(j.result || "0x0"), 18));
      } else {
        const data = "0x70a08231" + addressHex(wallet);
        const res = await readContract(token.address, data);
        setSendBalance(formatUnitsStr(BigInt(res || "0x0"), token.decimals));
      }
    } catch { setSendBalance("0"); }
  }, [wallet, sendTokenKey, readContract]);

  useEffect(() => { if (sendPanelOpen) fetchSendBalance(); }, [sendPanelOpen, fetchSendBalance]);

  useEffect(() => {
    if (!sendPanelOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSendPanelOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sendPanelOpen]);

  const executeSend = async () => {
    const amount = sendAmount.trim();
    const recipient = sendRecipient.trim();
    if (!amount || !recipient) { alert("Enter amount and recipient"); return; }
    const token = TOKENS[sendTokenKey];
    if (!token) return;
    setBusy(true);
    try {
      let to = recipient;
      let toName = recipient;
      if (!recipient.startsWith("0x")) {
        const r = await fetch(`${API}/hub/resolve/${encodeURIComponent(recipient)}`);
        const j = await r.json();
        to = j?.address || j?.wallet || j?.walletAddress || j?.data?.address;
        if (!to) throw new Error(`Could not resolve ${recipient}`);
      } else {
        toName = short(recipient);
      }
      let txHash: string;
      if (token.address === null) {
        txHash = await writeContract(to, "0x", parseUnitsStr(amount, 18));
      } else {
        const data = ERC20_TRANSFER_SELECTOR + addressHex(to) + uintHex(parseUnitsStr(amount, token.decimals));
        txHash = await writeContract(token.address, data, 0n);
      }
      const fromName = namesRef.current[wallet.toLowerCase()] || short(wallet);
      const now = Date.now();
      setLocalTransfers((prev) => [...prev, {
        id: `tx-${txHash}`,
        ts: Math.floor(now / 1000),
        from: wallet, fromName,
        to, toName,
        amount, token: token.symbol,
        txHash, createdAt: now,
      }]);
      setSendToast(`✅ Sent ${amount} ${token.symbol} to ${toName}!`);
      setTimeout(() => setSendToast(null), 4000);
      setSendPanelOpen(false);
      setSendAmount("");
      setSendRecipient("");
    } catch (err: any) {
      console.error("[ChatUI] executeSend error:", err);
      alert(err?.message || "Send failed");
    } finally { setBusy(false); }
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

          <section className="flex-1 flex flex-col bg-brand-bg min-w-0 relative">
            <div className="h-16 border-b border-brand-border flex items-center px-3">
              <Avatar name={headerName} size={44} />
              <div className="ml-2 min-w-0">
                <div className="text-[15px] font-semibold text-brand-text-primary truncate">{headerName}</div>
                <div className="text-xs text-brand-text-muted truncate">{tab === "global" ? "Public posts" : current ? short(current.address) : "Contact Info"}</div>
              </div>
            </div>

            {tab === "global" && unreadMentions.length > 0 && (
              <>
                <button
                  onClick={jumpToLatestMention}
                  className="absolute top-20 right-4 z-20 px-3 h-8 inline-flex items-center gap-1.5 rounded-full bg-sky-500 text-white text-xs font-semibold shadow-lg hover:bg-sky-600 transition-colors"
                >
                  <ArrowUp size={14} />
                  {unreadMentions.length} mention{unreadMentions.length === 1 ? "" : "s"}
                </button>
                <button
                  onClick={jumpToLatestMention}
                  aria-label="Jump to mention"
                  className="absolute bottom-24 right-4 z-20 h-11 w-11 inline-flex items-center justify-center rounded-full bg-sky-500 text-white shadow-xl hover:bg-sky-600 transition-colors animate-pulse"
                >
                  <ArrowUp size={20} />
                </button>
              </>
            )}

            <div ref={bodyRef} className="flex-1 bg-brand-bg overflow-y-auto px-4 py-4 space-y-3">
              {!showChat && <div className="h-full flex items-center justify-center text-brand-text-muted text-sm">Select a chat to start messaging</div>}


              {tab === "global" && (() => {
                type FeedItem =
                  | { kind: "post"; id: string; ts: number; post: Post }
                  | { kind: "reply"; id: string; ts: number; parent: Post; commenter: string; name?: string; text: string; timestamp?: number | string }
                  | { kind: "transfer"; id: string; ts: number; transfer: typeof localTransfers[number] };
                const items: FeedItem[] = [];
                posts.forEach((post, pi) => {
                  const pts = Number(post.timestamp || 0) || pi;
                  items.push({ kind: "post", id: `p-${post.id}`, ts: pts, post });
                  (post.comments || []).forEach((c, ci) => {
                    const cts = Number(c.timestamp || 0) || pts + ci + 1;
                    items.push({ kind: "reply", id: `r-${post.id}-${ci}`, ts: cts, parent: post, commenter: c.commenter, name: c.name, text: c.text, timestamp: c.timestamp });
                  });
                });
                localTransfers.forEach((t) => items.push({ kind: "transfer", id: t.id, ts: t.ts, transfer: t }));
                items.sort((a, b) => a.ts - b.ts);
                const walletLc = wallet.toLowerCase();
                const myLitName = walletLc ? (namesRef.current[walletLc] || "").toLowerCase() : "";

                return items.map((item) => {
                  if (item.kind === "transfer") {
                    const t = item.transfer;
                    return (
                      <div key={item.id} className="flex justify-start">
                        <div className="max-w-[760px] w-fit bg-gradient-to-r from-emerald-950 to-green-900 border-l-4 border-emerald-400 rounded-xl px-4 py-3 text-sm text-brand-text-primary">
                          <div className="font-medium">
                            💸 <span className="font-semibold">{t.fromName}</span> sent{" "}
                            <span className="font-semibold text-emerald-300">{t.amount} {t.token}</span> to{" "}
                            <span className="font-semibold">{t.toName}</span>
                          </div>
                          <a
                            href={EXPLORER_TX(t.txHash)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 inline-block text-[11px] text-emerald-300/80 hover:text-emerald-200 hover:underline"
                          >
                            View TX ↗
                          </a>
                        </div>
                      </div>
                    );
                  }
                  if (item.kind === "post") {
                    const post = item.post;
                    const shortMe = walletLc ? short(wallet).toLowerCase() : "";
                    const contentLc = (post.content || "").toLowerCase();
                    const tagged = !!walletLc && (
                      (shortMe && contentLc.includes(`@${shortMe}`)) ||
                      (myLitName && contentLc.includes(`@${myLitName}`))
                    );
                    const isHighlighted = highlightedId === post.id;
                    const sendMatch = (post.content || "").match(SENT_DISPLAY_RE) || (post.content || "").match(SEND_CMD_RE);
                    if (sendMatch) {
                      const senderName = post.name || short(post.author);
                      return (
                        <div key={item.id} className="flex justify-start">
                          <div
                            ref={(el) => { postRefs.current[post.id] = el; }}
                            className={cn(
                              "relative max-w-[760px] w-fit rounded-xl border border-green-500/50 bg-gradient-to-r from-green-900/40 to-emerald-900/40 px-4 py-3 text-sm text-brand-text-primary transition-all",
                              isHighlighted && "ring-2 ring-yellow-400"
                            )}
                          >
                            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-emerald-300">
                              <span>➤</span>
                              <span>Token Sent</span>
                              <span className="ml-2 text-[10px] font-normal text-brand-text-muted normal-case tracking-normal">{displayTime(post.timestamp)}</span>
                            </div>
                            <div className="mt-2 flex items-center gap-2">
                              <Avatar name={senderName} size={30} />
                              <div className="text-sm leading-snug">
                                <span className="font-semibold">{senderName}</span>{" "}
                                sent <span className="font-semibold text-emerald-300">{sendMatch[1]} {sendMatch[2]}</span>{" "}
                                to <span className="font-semibold">{sendMatch[3]}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div key={item.id} className="flex justify-start">
                        <div
                          ref={(el) => { postRefs.current[post.id] = el; }}
                          className={cn(
                            "group relative max-w-[760px] w-fit rounded-lg border bg-brand-surface px-3 py-3 text-sm text-brand-text-primary transition-all",
                            tagged ? "border-l-4 border-l-gray-400 border-brand-border bg-gray-700/40" : "border-brand-border",
                            isHighlighted && "ring-2 ring-yellow-400 bg-yellow-400/10"
                          )}
                        >
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
                            </div>
                          </div>

                          <div className="flex items-center gap-2 pr-8">
                            <Avatar name={post.name || post.author} size={34} />
                            <div className="min-w-0">
                              <span className="font-semibold">{post.name || short(post.author)}</span>
                              <span className="ml-2 text-xs text-brand-text-muted">{displayTime(post.timestamp)}</span>
                              <span className="ml-2 text-xs text-brand-text-muted">· ♥ {post.likeCount}</span>
                              {post.bountyActive && commentedPosts[post.id] && (
                                <span className="ml-2 text-[11px] text-emerald-400">✓ Bounty claimed</span>
                              )}
                            </div>
                          </div>
                          {(() => {
                            const idMatch = (post.content || "").match(REPLY_ID_RE);
                            let replyBody = post.content;
                            let original: { id?: string; author: string; name?: string; content: string } | null = null;
                            let loadingRef = false;
                            if (idMatch) {
                              const refId = idMatch[1];
                              replyBody = post.content.slice(idMatch[0].length).replace(REPLY_TAG_RE, "");
                              const inList = posts.find((p) => p.id === refId);
                              if (inList) original = inList;
                              else if (fetchedReplyPosts[refId]) original = fetchedReplyPosts[refId];
                              else loadingRef = true;
                            } else {
                              const replyMatch = (post.content || "").match(REPLY_TAG_RE);
                              if (!replyMatch) {
                                return <div className="mt-2 whitespace-pre-wrap break-words leading-relaxed">{renderPostContent(post.content)}</div>;
                              }
                              const tagBody = replyMatch[1].toLowerCase();
                              replyBody = post.content.slice(replyMatch[0].length);
                              const found = posts.find((p) =>
                                short(p.author).toLowerCase() === tagBody ||
                                p.author.toLowerCase() === tagBody ||
                                (p.name || "").toLowerCase() === tagBody
                              );
                              if (found) original = found;
                            }
                            const previewName = original ? (original.name || short(original.author)) : (loadingRef ? "Loading…" : "Original post");
                            const previewText = original ? original.content : (loadingRef ? "Fetching original post…" : "Original post not found");
                            const previewShort = previewText.length > 100 ? `${previewText.slice(0, 100)}…` : previewText;
                            return (
                              <>
                                <button
                                  type="button"
                                  onClick={() => original?.id && scrollToPost(original.id)}
                                  disabled={!original?.id}
                                  className="mt-2 block w-full text-left pl-2 pr-2 py-1.5 border-l-4 border-gray-400 bg-gray-700/40 rounded-r-md hover:bg-gray-700/60 transition-colors disabled:cursor-default"
                                >
                                  <div className="flex items-center gap-1.5 text-[11px] text-brand-text-muted truncate">
                                    <Avatar name={previewName} size={14} />
                                    <span className="font-medium">{previewName}</span>
                                  </div>
                                  <div className="text-[12px] text-brand-text-muted/90 truncate mt-0.5">{previewShort}</div>
                                </button>
                                <div className="mt-2 whitespace-pre-wrap break-words leading-relaxed">{renderPostContent(replyBody)}</div>
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    );
                  }

                  // reply as its own feed item
                  const parent = item.parent;
                  const quotedPreview = parent.content.length > 80 ? `${parent.content.slice(0, 80)}…` : parent.content;
                  return (
                    <div key={item.id} className="flex justify-start">
                      <div className="max-w-[760px] w-fit rounded-lg border border-brand-border bg-brand-surface px-3 py-3 text-sm text-brand-text-primary">
                        <button
                          type="button"
                          onClick={() => scrollToPost(parent.id)}
                          className="block w-full text-left pl-2 border-l-2 border-brand-teal/60 bg-white/[0.03] rounded-r-md py-1 mb-2 hover:bg-white/[0.06] transition-colors"
                        >
                          <div className="flex items-center gap-1.5 text-[11px] text-brand-text-muted truncate">
                            <Reply size={11} />
                            <Avatar name={parent.name || parent.author} size={14} />
                            <span className="font-medium">@{parent.name || short(parent.author)}</span>
                          </div>
                          <div className="text-[12px] text-brand-text-muted/80 truncate mt-0.5">{quotedPreview}</div>
                        </button>
                        <div className="flex items-center gap-2">
                          <Avatar name={item.name || item.commenter} size={30} />
                          <div className="min-w-0">
                            <span className="font-semibold">{item.name || short(item.commenter)}</span>
                            <span className="ml-2 text-xs text-brand-text-muted">{displayTime(item.timestamp)}</span>
                          </div>
                        </div>
                        <div className="mt-1.5 whitespace-pre-wrap break-words leading-relaxed">{item.text}</div>
                      </div>
                    </div>
                  );
                });
              })()}


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
              {tab === "global" && sendPanelOpen && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setSendPanelOpen(false)}
                  />
                  <div className="mx-2 mb-2 relative z-40 rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="text-sm font-semibold text-brand-text-primary">💸 Send Token</div>
                      <button
                        onClick={() => setSendPanelOpen(false)}
                        aria-label="Close"
                        className="p-1 rounded hover:bg-white/10 text-brand-text-muted hover:text-brand-text-primary"
                      ><X size={14} /></button>
                    </div>
                    <label className="block text-[11px] text-brand-text-muted mb-1">Token</label>
                    <select
                      value={sendTokenKey}
                      onChange={(e) => setSendTokenKey(e.target.value)}
                      className="w-full h-9 px-2 mb-3 rounded-md bg-brand-bg border border-gray-700 text-sm text-brand-text-primary outline-none"
                    >
                      {TOKEN_LIST.map((k) => (
                        <option key={k} value={k}>{TOKENS[k].symbol}</option>
                      ))}
                    </select>
                    <label className="block text-[11px] text-brand-text-muted mb-1">
                      Amount <span className="opacity-60">· balance {sendBalance} {TOKENS[sendTokenKey]?.symbol}</span>
                    </label>
                    <div className="flex gap-2 mb-3">
                      <input
                        value={sendAmount}
                        onChange={(e) => setSendAmount(e.target.value)}
                        placeholder="0.0"
                        inputMode="decimal"
                        className="flex-1 h-9 px-2 rounded-md bg-brand-bg border border-gray-700 text-sm text-brand-text-primary outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setSendAmount(sendBalance)}
                        className="px-3 h-9 rounded-md bg-gray-800 hover:bg-gray-700 border border-gray-700 text-xs font-semibold text-sky-300"
                      >MAX</button>
                    </div>
                    <label className="block text-[11px] text-brand-text-muted mb-1">To</label>
                    <input
                      value={sendRecipient}
                      onChange={(e) => setSendRecipient(e.target.value)}
                      placeholder="alice.lit or 0x…"
                      className="w-full h-9 px-2 mb-3 rounded-md bg-brand-bg border border-gray-700 text-sm text-brand-text-primary outline-none"
                    />
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => setSendPanelOpen(false)}
                        className="px-3 h-9 rounded-md border border-gray-700 text-xs font-semibold text-brand-text-muted hover:text-brand-text-primary"
                      >Cancel</button>
                      <button
                        disabled={busy}
                        onClick={executeSend}
                        className="px-4 h-9 rounded-md bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-semibold disabled:opacity-50"
                      >Send Token →</button>
                    </div>
                  </div>
                </>
              )}
              <div className="relative flex items-center gap-1 px-2 py-2">
                <IconBtn aria-label="Emoji" onClick={() => setEmojiOpen((v) => !v)}><Smile size={18} /></IconBtn>
                {tab === "global" && (
                  <button
                    type="button"
                    aria-label="Add bounty"
                    onClick={() => setBountyPopupOpen((v) => !v)}
                    className="h-9 w-9 inline-flex items-center justify-center rounded-md hover:bg-white/5 transition-colors"
                    title="Add bounty"
                  >
                    <img
                      src={zkltcLogo}
                      alt="zkLTC"
                      style={{ width: 22, height: 22, borderRadius: "50%", objectFit: "cover" }}
                    />
                  </button>
                )}
                {tab === "private" && (
                  <button
                    type="button"
                    aria-label="Send zkLTC"
                    disabled={!current}
                    onClick={() => setTipOpen(true)}
                    className="h-9 w-9 inline-flex items-center justify-center rounded-md hover:bg-white/5 transition-colors disabled:opacity-40 disabled:pointer-events-none"
                  >
                    <img
                      src={zkltcLogo}
                      alt="zkLTC"
                      style={{ width: 22, height: 22, borderRadius: "50%", objectFit: "cover" }}
                    />
                  </button>
                )}
                {tab === "global" && bountyPopupOpen && (
                  <div className="absolute bottom-full left-2 mb-2 z-20 w-72 rounded-lg border border-brand-border bg-brand-surface-2 p-3 shadow-2xl">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs font-semibold text-brand-text-primary">Add bounty</div>
                      <button aria-label="Close" onClick={() => setBountyPopupOpen(false)} className="p-1 rounded hover:bg-white/10 text-brand-text-muted hover:text-brand-text-primary"><X size={12} /></button>
                    </div>
                    <label className="block text-[11px] text-brand-text-muted mb-1">♥ Like reward (zkLTC)</label>
                    <input
                      value={inlineLikeReward}
                      onChange={(e) => setInlineLikeReward(e.target.value)}
                      placeholder="0.01"
                      className="w-full h-8 px-2 mb-2 rounded-md bg-brand-bg border border-brand-border text-xs text-brand-text-primary outline-none"
                    />
                    <label className="block text-[11px] text-brand-text-muted mb-1">Total bounty to place (zkLTC)</label>
                    <input
                      value={inlineTotalBounty}
                      onChange={(e) => setInlineTotalBounty(e.target.value)}
                      placeholder="1.00"
                      className="w-full h-8 px-2 mb-2 rounded-md bg-brand-bg border border-brand-border text-xs text-brand-text-primary outline-none"
                    />
                    <div className="text-[11px] text-brand-text-muted mb-2">ℹ️ Bounty lasts for <span className="text-brand-text-primary font-medium">{inlineBountyLikes}</span> likes</div>
                    <button
                      onClick={() => {
                        const hasVal = Number(inlineLikeReward || 0) > 0 && Number(inlineTotalBounty || 0) > 0;
                        setInlineBountyActive(hasVal);
                        setBountyPopupOpen(false);
                      }}
                      className="w-full h-8 rounded-md bg-brand-teal text-brand-bg text-xs font-semibold"
                    >
                      {inlineBountyActive ? "Update Bounty" : "Add Bounty"}
                    </button>
                    {inlineBountyActive && (
                      <button
                        onClick={() => {
                          setInlineBountyActive(false);
                          setInlineLikeReward("");
                          setInlineTotalBounty("");
                          setBountyPopupOpen(false);
                        }}
                        className="mt-2 w-full h-7 rounded-md border border-brand-border text-[11px] text-brand-text-muted hover:text-brand-text-primary"
                      >
                        Remove bounty
                      </button>
                    )}
                  </div>
                )}
                {tab === "global" && inlineBountyActive && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">💰 {inlineBountyTotal}</span>
                )}
                {emojiOpen && (
                  <EmojiPicker
                    onClose={() => setEmojiOpen(false)}
                    onPick={(emoji) => {
                      const el = inputRef.current;
                      if (el) {
                        const start = el.selectionStart ?? draft.length;
                        const end = el.selectionEnd ?? draft.length;
                        const next = draft.slice(0, start) + emoji + draft.slice(end);
                        setDraft(next);
                        requestAnimationFrame(() => {
                          el.focus();
                          const pos = start + emoji.length;
                          el.setSelectionRange(pos, pos);
                        });
                      } else {
                        setDraft(draft + emoji);
                      }
                    }}
                  />
                )}
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (tab === "global" && v === "/") {
                      setDraft("");
                      setSendPanelOpen(true);
                      return;
                    }
                    setDraft(v);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      if (tab === "global") sendGlobal();
                      else sendPrivate();
                    } else if (e.key === "Escape") {
                      if (replyTo) setReplyTo(null);
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
                  onClick={tab === "global" ? sendGlobal : sendPrivate}
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

      {bountyToast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] bg-yellow-500/90 text-black rounded-xl px-6 py-3 shadow-xl font-bold text-sm pointer-events-none">
          🎉 You received {bountyToast.amount} zkLTC like bounty from @{bountyToast.name}!
        </div>
      )}

      {sendToast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] bg-emerald-500/95 text-black rounded-xl px-6 py-3 shadow-xl font-bold text-sm pointer-events-none">
          {sendToast}
        </div>
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

const EMOJI_CATEGORIES: { label: string; emojis: string[] }[] = [
  { label: "Smileys", emojis: ["😀","😃","😄","😁","😆","😅","😂","🤣","😊","🙂","😉","😍","😘","😜","🤪","😎","🤩","🥳","😏","😭","😡","🤔","😴","🤤","🤯","🥺","😬","😱","🤗","🤐"] },
  { label: "Gestures", emojis: ["👍","👎","👌","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","👇","☝️","👋","🤚","🖐️","✋","🖖","👏","🙌","🙏","💪","🫶","🤝","✊","👊"] },
  { label: "Animals", emojis: ["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🐔","🐧","🐦","🐤","🦄","🐝","🦋","🐢","🐍","🐙","🦀","🐬","🐳","🦈","🐊"] },
  { label: "Food", emojis: ["🍎","🍊","🍋","🍌","🍉","🍇","🍓","🍒","🍑","🥭","🍍","🥥","🥝","🍅","🥑","🌽","🌶️","🥕","🍔","🍟","🍕","🌭","🥪","🌮","🍣","🍩","🍪","🎂","🍰","🍫","🍿","🍺","🍷","☕","🍵"] },
  { label: "Travel", emojis: ["🚗","🚕","🚙","🚌","🚎","🏎️","🚓","🚑","🚒","🚜","🛵","🏍️","🚲","✈️","🚀","🛸","🚁","⛵","🚤","🛳️","🚂","🗽","🗼","🏰","🏖️","🏝️","🏔️","🌋","🗺️","🧭"] },
  { label: "Objects", emojis: ["💎","💰","💸","💵","🎁","🎉","🎊","🎈","🔔","💡","🔦","📱","💻","⌨️","🖥️","🖱️","💾","📷","🎥","📺","🎮","🕹️","🎲","🎯","🏆","🥇","🔑","🔒","📦","📚"] },
  { label: "Symbols", emojis: ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","💔","❣️","💕","💞","💓","💗","💖","💘","💝","🔥","⭐","🌟","✨","⚡","☀️","🌈","☁️","❄️","✅","❌","⚠️","♻️","🔱","💯","✔️","➡️","⬅️"] },
];

function EmojiPicker({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  const [cat, setCat] = React.useState(0);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return (
    <div
      ref={ref}
      className="absolute bottom-full left-2 mb-2 z-30 w-72 rounded-lg border border-brand-border bg-brand-surface-2 p-2 shadow-2xl"
    >
      <div className="flex gap-1 overflow-x-auto mb-2 pb-1 border-b border-brand-border">
        {EMOJI_CATEGORIES.map((c, i) => (
          <button
            key={c.label}
            type="button"
            onClick={() => setCat(i)}
            className={cn(
              "px-2 py-1 rounded text-[10px] whitespace-nowrap",
              i === cat ? "bg-white/10 text-brand-text-primary" : "text-brand-text-muted hover:text-brand-text-primary",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-8 gap-1 max-h-48 overflow-y-auto">
        {EMOJI_CATEGORIES[cat].emojis.map((e, i) => (
          <button
            key={`${e}-${i}`}
            type="button"
            onClick={() => onPick(e)}
            className="h-7 w-7 inline-flex items-center justify-center rounded hover:bg-white/10 text-lg"
          >
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}
