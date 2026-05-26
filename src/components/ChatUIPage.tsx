// ChatUI page — Private + Global chat tabs powered by LitDEX Hub backend.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  Check,
  ChevronUp,
  ChevronRight,
  Copy,
  Filter,
  Globe,
  Heart,
  Menu,
  MessageCircle,
  MoreHorizontal,
  Reply,
  Search,
  Send,
  Share2,
  ShoppingBag,
  Smile,
  Sparkles,
  SquarePen,
  Store,
  Tag,
  TrendingUp,
  Users,
  User2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { addNotif } from "@/lib/notifications";
import { showSuccess, showError } from "@/lib/feedback";
import zkltcLogo from "@/assets/zkltc.jpg";
import { BrowserProvider, Contract, parseEther } from "ethers";

const API = "https://hub.test-hub.xyz";
const CHAIN_ID_HEX = "0x1159";

// RPC endpoints — pool with auto-failover. The pool rotates whenever an
// endpoint fails (rate limit, 5xx, network error). Order = priority.
//
// To add more endpoints, set VITE_LITEFORGE_RPCS in .env as a comma-
// separated list. The default Caldera URL is always appended last as a
// fallback, so single-RPC setups still work.
const ENV_RPCS = (
  (import.meta as any).env?.VITE_LITEFORGE_RPCS as string | undefined
)
  ?.split(",")
  .map((s) => s.trim())
  .filter(Boolean) ?? [];
const DEFAULT_RPC = "https://liteforge.rpc.caldera.xyz/http";
const RPC_POOL: string[] = Array.from(new Set([...ENV_RPCS, DEFAULT_RPC]));
// Mutable cursor — moves to the next URL whenever a request fails.
let rpcIndex = 0;
const RPC_URL = RPC_POOL[0]; // for places that only need a static URL (chain add)

/**
 * fetchRPC — POST a JSON-RPC payload, automatically failing over to the
 * next endpoint in `RPC_POOL` whenever the current one rate-limits or
 * errors. Successful responses promote the working endpoint to the front
 * of the rotation so subsequent calls hit the healthy one first.
 */
async function fetchRPC(body: unknown, init?: RequestInit): Promise<Response> {
  const tried = new Set<number>();
  let lastError: unknown = null;
  for (let attempt = 0; attempt < RPC_POOL.length; attempt++) {
    const idx = (rpcIndex + attempt) % RPC_POOL.length;
    if (tried.has(idx)) continue;
    tried.add(idx);
    const url = RPC_POOL[idx];
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: typeof body === "string" ? body : JSON.stringify(body),
        ...init,
      });
      if (!r.ok) {
        // 429 / 5xx — rotate to next RPC
        if (r.status === 429 || r.status >= 500) {
          rpcIndex = (idx + 1) % RPC_POOL.length;
          continue;
        }
        return r;
      }
      // Detect JSON-RPC-level rate limit (Caldera returns 200 + bandwidth msg)
      const cloned = r.clone();
      try {
        const j = await cloned.json();
        const msg = (j?.error?.message || "").toString().toLowerCase();
        if (msg.includes("bandwidth") || msg.includes("rate limit") || msg.includes("too many")) {
          rpcIndex = (idx + 1) % RPC_POOL.length;
          continue;
        }
      } catch { /* not JSON, return raw response */ }
      // Promote healthy endpoint to front
      rpcIndex = idx;
      return r;
    } catch (err) {
      lastError = err;
      rpcIndex = (idx + 1) % RPC_POOL.length;
    }
  }
  throw lastError ?? new Error("All RPC endpoints failed");
}
const HUB_POSTS_ADDRESS = "0x33690545061cF3759350dd2C5A0d1080D9A14D73";
const LIT_REGISTRY_ADDRESS = "0x3E3aEE6d154f881A7418b2dA50c915C34664C2A8";
const MESSENGER_ADDRESS = "0x69405b51963D592C6CA9350F774045d4E76c89B8";
const MARKETPLACE_ADDRESS = "0x9cc6e4BB66EC19475d9db8082482Eb272cf6eA02";

const MARKETPLACE_ABI = [
  "function listName(string name, uint256 price) external",
  "function unlistName(string name) external",
  "function buyName(string name) external payable",
  "function placeBid(string name) external payable",
  "function cancelBid(string name) external",
  "function acceptBid(string name, address bidder) external",
] as const;

async function getMarketplaceContract() {
  const eth = (window as any).ethereum;
  if (!eth) throw new Error("No wallet detected");
  const provider = new BrowserProvider(eth);
  const signer = await provider.getSigner();
  return new Contract(MARKETPLACE_ADDRESS, MARKETPLACE_ABI, signer);
}

const REGISTRY_ABI = [
  "function register(string name, uint8 duration) external payable",
  "function isAvailable(string name) external view returns (bool)",
  "function getPrice(uint8 duration) external view returns (uint256)",
] as const;

async function getRegistryContract() {
  const eth = (window as any).ethereum;
  if (!eth) throw new Error("No wallet detected");
  const provider = new BrowserProvider(eth);
  const signer = await provider.getSigner();
  return new Contract(LIT_REGISTRY_ADDRESS, REGISTRY_ABI, signer);
}

const HUB_POSTS_ABI = [
  "function withdrawBounty(uint256 postId) external",
] as const;

async function getHubPostsContract() {
  const eth = (window as any).ethereum;
  if (!eth) throw new Error("No wallet detected");
  const provider = new BrowserProvider(eth);
  const signer = await provider.getSigner();
  return new Contract(HUB_POSTS_ADDRESS, HUB_POSTS_ABI, signer);
}

const MESSENGER_READ_ABI = [
  "function requestCount() external view returns (uint256)",
  "function friendRequests(uint256) external view returns (address from, address to, uint8 status, uint256 sentAt)",
  "function reverseResolve(address) external view returns (string)",
] as const;

const BUY_DURATION_OPTIONS: { value: number; label: string; price: string; tag?: string }[] = [
  { value: 1,  label: "1 Year",   price: "0.05" },
  { value: 2,  label: "2 Years",  price: "0.09" },
  { value: 5,  label: "5 Years",  price: "0.20", tag: "Popular" },
  { value: 10, label: "10 Years", price: "0.35" },
  { value: 99, label: "Forever",  price: "0.50", tag: "Lifetime" },
];

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
  getPendingRequests: "0xf05bfa7b", // returns uint count, not list
  friendRequests: "0xdc5bd536",     // friendRequests(uint id) -> (from, to, status, sentAt)
  requestCount: "0xb9b8af0b",       // requestCount() -> uint
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
  bountyBalance?: string;
  liked?: boolean;
  comments?: Comment[];
  pending?: boolean;
};
type PendingRequest = { id: string; from: string; to?: string; status?: number; sentAt?: number; name?: string };

const short = (a: string) => (a && a.length > 10 ? `${a.slice(0, 6)}...${a.slice(-4)}` : a || "");
const initials = (name: string) => {
  const label = name?.replace(".lit", "").trim() || "?";
  if (label.startsWith("0x")) return label.slice(2, 4).toUpperCase();
  return label.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?";
};
const displayTime = (value?: number | string) => {
  if (value === undefined || value === null || value === "") return "";
  // Server returns timestamps as numeric strings (e.g. "1779730991") — coerce
  // numerics first so the bubble shows a real time after page navigation,
  // not just at the moment of send. Falls back to ISO/date strings.
  let raw: number | string = value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) raw = Number(trimmed);
    else raw = trimmed;
  }
  if (typeof raw === "number") {
    // Treat anything < 1e11 as seconds (unix), else ms.
    raw = raw < 10_000_000_000 ? raw * 1000 : raw;
  }
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
  // Outgoing friend requests we sent — tracked in localStorage so the
  // "to: name.lit · pending/accepted/rejected" badge survives navigation
  // and refresh. Status is derived: once the recipient appears in our
  // friends list we mark accepted; if their pending request to us shows
  // up as status=2 (rejected) we mark rejected; otherwise pending.
  // NOTE: per-wallet — see hydrate effect below.
  const [outgoing, setOutgoing] = useState<Array<{
    id: string;
    to: string;       // recipient address (lowercase)
    name: string;     // recipient .lit name
    txHash?: string;
    sentAt: number;   // unix seconds
    status: "pending" | "accepted" | "rejected";
  }>>([]);
  const [current, setCurrent] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  // Optimistic outbound DMs awaiting backend indexing. Kept separate from
  // server-fetched `messages` so polling never wipes them.
  const [pendingMsgs, setPendingMsgs] = useState<Array<Msg & { txHash?: string; status?: "sending" | "sent" }>>([]);
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
  const [outgoingPanelOpen, setOutgoingPanelOpen] = useState(false);
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
  const [inlineBountyMultiplier, setInlineBountyMultiplier] = useState<string>("");
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
  const [postsLoading, setPostsLoading] = useState(true);
  const [emojiOpen, setEmojiOpen] = useState(false);

  const [visitedMentions, setVisitedMentions] = useState<Set<string>>(new Set());

  // FIX 1 — feed filter
  const [feedFilter, setFeedFilter] = useState<"all" | "bounty">("all");
  // FIX 4/5/6 — in-app view (no react-router available)
  const [view, setView] = useState<"chat" | "profile" | "market" | "buy">("chat");
  const [profileAddr, setProfileAddr] = useState<string>("");
  const [myDisplayName, setMyDisplayName] = useState<string>("");
  // FIX 6 — market state
  const [listings, setListings] = useState<Array<{ name: string; price: string; seller: string }>>([]);
  const [listName, setListName] = useState("");
  const [listPrice, setListPrice] = useState("");
  // FIX 5 — profile data
  const [profilePoints, setProfilePoints] = useState<string>("0");
  const [profileBalance, setProfileBalance] = useState<string>("0");
  const [profileDomains, setProfileDomains] = useState<string[]>([]);
  const [profileName, setProfileName] = useState<string>("");

  // localStorage helpers — survive top-navbar page navigation that
  // unmounts ChatUIPage and clears React state.
  const dmCacheKey = (a: string, b: string) => `litdex:dm:${a.toLowerCase()}:${b.toLowerCase()}`;
  const profileCacheKey = (a: string) => `litdex:profile:${a.toLowerCase()}`;
  // Per-wallet keys so swapping wallets in MetaMask never leaks the prior
  // wallet's outgoing requests / transfer feed into the new account.
  const outgoingKey = (w: string) => `litdex:outgoingFriendReqs:${w.toLowerCase()}`;
  const transfersKey = (w: string) => `litdex:globalTransfers:${w.toLowerCase()}`;
  const safeGet = (k: string) => {
    try { return typeof window !== "undefined" ? localStorage.getItem(k) : null; } catch { return null; }
  };
  const safeSet = (k: string, v: string) => {
    try { if (typeof window !== "undefined") localStorage.setItem(k, v); } catch { /* quota */ }
  };

  // Buy .lit domain — registry registration form state
  const [buyName, setBuyName] = useState<string>("");
  const [buyDuration, setBuyDuration] = useState<number>(1);
  const [buyAvailable, setBuyAvailable] = useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");
  const [buyPrice, setBuyPrice] = useState<string>("0.05");
  const [buyBusy, setBuyBusy] = useState<boolean>(false);
  const [buySuccess, setBuySuccess] = useState<string | null>(null);

  // FIX 6 — extended market state
  const [listingsFull, setListingsFull] = useState<Array<{ name: string; price: string; seller: string; listedAt: number }>>([]);
  const [myDomains, setMyDomains] = useState<string[]>([]);
  const [marketFilter, setMarketFilter] = useState<"all" | "latest" | "low" | "high" | "sold">("all");
  const [soldItems, setSoldItems] = useState<Array<{ buyer: string; seller: string; domain: string; price: string; soldAt: number }>>([]);
  const [bids, setBids] = useState<Record<string, Array<{ bidder: string; amount: string }>>>({});
  const [bidInputs, setBidInputs] = useState<Record<string, string>>({});
  const [listPriceFor, setListPriceFor] = useState<Record<string, string>>({});
  const [transferTo, setTransferTo] = useState<Record<string, string>>({});

  // Market UX — OpenSea-style state
  const [marketSearch, setMarketSearch] = useState("");
  const [profileTab, setProfileTab] = useState<"domains" | "listings" | "bids" | "activity">("domains");
  const [bidsForOwner, setBidsForOwner] = useState<Array<{ domain: string; bidder: string; bidderName?: string; amount: string; bidAt: number }>>([]);
  const [bidsByDomain, setBidsByDomain] = useState<Record<string, Array<{ bidder: string; amount: string; bidAt: number }>>>({});
  const [profileCopied, setProfileCopied] = useState(false);
  // Marketplace UX — Your Domains panel collapses by default so it never
  // pushes the listings grid below the fold.
  const [yourDomainsOpen, setYourDomainsOpen] = useState(false);

  // Resolve my own .lit name for sidebar bottom
  useEffect(() => {
    if (!wallet) { setMyDisplayName(""); return; }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API}/hub/resolve/reverse/${wallet}`);
        if (r.ok) {
          const j = await r.json();
          const n = j?.name || j?.litName || j?.data?.name || "";
          if (!cancelled) setMyDisplayName(n && typeof n === "string" ? n : "");
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [wallet]);

  // Reset + hydrate private messages from localStorage when contact changes.
  // ChatUIPage unmounts on top-navbar navigation, so on remount we restore
  // the cached conversation immediately (no flash of empty bubble) before
  // the backend re-fetch resolves.
  useEffect(() => {
    setMessages([]);
    setPendingMsgs([]);
    if (!wallet || !current?.address) return;
    try {
      const raw = safeGet(dmCacheKey(wallet, current.address));
      if (raw) {
        const cached = JSON.parse(raw);
        if (Array.isArray(cached?.messages)) setMessages(cached.messages);
        if (Array.isArray(cached?.pendingMsgs)) setPendingMsgs(cached.pendingMsgs);
      }
    } catch { /* ignore corrupt cache */ }
  }, [current?.address, wallet]);

  // Persist messages + pending bubble to localStorage so they survive
  // page navigation and a backend that hasn't deployed the
  // getConversation `{from}` override yet.
  useEffect(() => {
    if (!wallet || !current?.address) return;
    if (messages.length === 0 && pendingMsgs.length === 0) return;
    try {
      safeSet(
        dmCacheKey(wallet, current.address),
        JSON.stringify({ messages, pendingMsgs, savedAt: Date.now() }),
      );
    } catch { /* ignore */ }
  }, [messages, pendingMsgs, wallet, current?.address]);

  // Persist global-feed transfer notifications. The funds-send message in
  // global must stay visible across navigations (per UX request).
  // Keyed per-wallet so swapping accounts in MetaMask doesn't show another
  // user's history.
  useEffect(() => {
    if (!wallet) { setLocalTransfers([]); return; }
    try {
      const raw = safeGet(transfersKey(wallet));
      if (!raw) { setLocalTransfers([]); return; }
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) { setLocalTransfers([]); return; }
      const cutoff = Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 7;
      setLocalTransfers(arr.filter((t: any) => t && Number(t.ts) > cutoff));
    } catch { setLocalTransfers([]); }
  }, [wallet]);
  useEffect(() => {
    if (!wallet) return;
    try { safeSet(transfersKey(wallet), JSON.stringify(localTransfers)); }
    catch { /* quota */ }
  }, [localTransfers, wallet]);

  // Hydrate + persist outgoing friend requests, also keyed per-wallet so
  // each connected account sees its own list and never the previous one.
  useEffect(() => {
    if (!wallet) { setOutgoing([]); return; }
    try {
      const raw = safeGet(outgoingKey(wallet));
      if (!raw) { setOutgoing([]); return; }
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) { setOutgoing([]); return; }
      const cutoff = Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 14;
      setOutgoing(arr.filter((r: any) => r && Number(r.sentAt) > cutoff));
    } catch { setOutgoing([]); }
  }, [wallet]);
  useEffect(() => {
    if (!wallet) return;
    try { safeSet(outgoingKey(wallet), JSON.stringify(outgoing)); }
    catch { /* ignore */ }
  }, [outgoing, wallet]);

  // Sync outgoing-request status against the live friends list. As soon as
  // the recipient appears in our `contacts` we mark accepted and toast the
  // user. Status flips happen once and persist via the effect above.
  useEffect(() => {
    if (outgoing.length === 0) return;
    const friendsLc = new Set(contacts.map((c) => (c.address || "").toLowerCase()));
    let changed = false;
    const next = outgoing.map((r) => {
      if (r.status !== "pending") return r;
      if (friendsLc.has(r.to)) {
        changed = true;
        showSuccess({
          title: "FRIEND REQUEST ACCEPTED",
          subtitle: `${r.name}.lit accepted you`,
          rows: [{ label: "TO", value: `${r.name}.lit` }],
        });
        return { ...r, status: "accepted" as const };
      }
      return r;
    });
    if (changed) setOutgoing(next);
  }, [contacts, outgoing]);

  // FIX 5 — load profile data when entering profile view
  useEffect(() => {
    if (view !== "profile" || !profileAddr) return;
    let cancelled = false;
    // Hydrate from localStorage cache first so the UI shows real numbers
    // instantly instead of flashing 0 → final values. Background refresh
    // below updates them when the network responds.
    try {
      const raw = safeGet(profileCacheKey(profileAddr));
      if (raw) {
        const c = JSON.parse(raw);
        if (typeof c?.points === "string") setProfilePoints(c.points);
        if (typeof c?.balance === "string") setProfileBalance(c.balance);
        if (Array.isArray(c?.domains)) setProfileDomains(c.domains);
        if (typeof c?.name === "string") setProfileName(c.name);
      }
    } catch { /* ignore corrupt cache */ }

    const writeCache = (patch: Record<string, unknown>) => {
      try {
        const raw = safeGet(profileCacheKey(profileAddr));
        const prev = raw ? JSON.parse(raw) : {};
        safeSet(profileCacheKey(profileAddr), JSON.stringify({ ...prev, ...patch, savedAt: Date.now() }));
      } catch { /* ignore */ }
    };

    // Run all 4 fetches in parallel — was sequential before, which made the
    // profile feel slow (4x sum of latencies). Each branch is isolated so a
    // single slow/failing endpoint never blocks the others.
    void Promise.all([
      // 1) reverse-resolve .lit name (best-effort; navbar already shows one)
      (async () => {
        try {
          const r = await fetch(`${API}/hub/name/reverse/${profileAddr}`);
          const j = await r.json();
          const n = j?.name || j?.litName || j?.data?.name || "";
          if (!cancelled) {
            const val = n && typeof n === "string" ? n : "";
            setProfileName(val);
            writeCache({ name: val });
          }
        } catch { /* keep cached value */ }
      })(),
      // 2) Points — same endpoint the top navbar uses so numbers match.
      (async () => {
        try {
          const r = await fetch(`https://api.test-hub.xyz/points/${profileAddr.toLowerCase()}`);
          const j = await r.json();
          if (!cancelled) {
            const val = String(j?.total ?? j?.points ?? j?.balance ?? 0);
            setProfilePoints(val);
            writeCache({ points: val });
          }
        } catch { /* keep cached value */ }
      })(),
      // 3) zkLTC native balance via JSON-RPC
      (async () => {
        try {
          const r = await fetchRPC({
            jsonrpc: "2.0",
            id: 1,
            method: "eth_getBalance",
            params: [profileAddr, "latest"],
          });
          const j = await r.json();
          if (!cancelled) {
            const val = formatUnitsStr(BigInt(j.result || "0x0"), 18);
            setProfileBalance(val);
            writeCache({ balance: val });
          }
        } catch { /* keep cached value */ }
      })(),
      // 4) Owned .lit domains — backend route is /hub/names/owned/:addr
      // (the old /hub/domains/:addr was a 404, which is why this card was
      // stuck at 0). Fall back to the legacy URL for resilience. The
      // backend rejects mixed-case addresses with a "bad address checksum"
      // error, so always use lower-case.
      (async () => {
        const addr = profileAddr.toLowerCase();
        const tryUrls = [
          `${API}/hub/names/owned/${addr}`,
          `${API}/hub/domains/${addr}`,
        ];
        for (const url of tryUrls) {
          try {
            const r = await fetch(url);
            if (!r.ok) continue;
            const j = await r.json();
            const arr = readArray(j, ["names", "domains", "owned", "data"]);
            const list = arr.map((d: any) => (typeof d === "string" ? d : d.name || d.domain)).filter(Boolean);
            if (!cancelled) {
              setProfileDomains(list);
              writeCache({ domains: list });
            }
            return;
          } catch { /* try next */ }
        }
      })(),
    ]);
    return () => { cancelled = true; };
  }, [view, profileAddr]);

  // FIX 6 — load market listings
  const loadListings = useCallback(async () => {
    try {
      const r = await fetch(`${API}/hub/marketplace/listings`);
      if (!r.ok) return; // keep prior state on 5xx
      const j = await r.json();
      if (j && typeof j.error === "string") return; // RPC hiccup, keep cached
      const arr = readArray(j, ["listings", "data", "items"]);
      const mapped = arr.map((l: any) => ({
        name: l.name || l.domain || "",
        price: String(l.price ?? l.priceZkLTC ?? "0"),
        seller: l.seller || l.owner || l.address || "",
        listedAt: Number(l.listedAt ?? l.createdAt ?? l.timestamp ?? 0),
      })).filter((l: any) => l.name);
      setListings(mapped);
      setListingsFull(mapped);
    } catch {
      // Network error — preserve last good state instead of clearing.
    }
  }, []);

  // Recently Sold history — backend indexes the marketplace `Sold` event
  // and returns it via /hub/marketplace/sold. If the endpoint is not deployed
  // yet (older backend), gracefully fall back to empty so the tab/ticker
  // stays blank instead of breaking.
  const loadSold = useCallback(async () => {
    try {
      const r = await fetch(`${API}/hub/marketplace/sold`);
      if (!r.ok) return;
      const j = await r.json();
      if (j && typeof j.error === "string") return;
      const arr = readArray(j, ["sold", "items", "history", "data"]);
      const mapped = arr
        .map((s: any) => ({
          domain: String(s.domain || s.name || ""),
          seller: String(s.seller || ""),
          buyer: String(s.buyer || ""),
          price: String(s.price ?? "0"),
          soldAt: Number(s.soldAt || s.timestamp || s.time || 0),
        }))
        .filter((s: any) => s.domain)
        .sort((a: any, b: any) => b.soldAt - a.soldAt);
      setSoldItems(mapped);
    } catch {
      // Preserve last good state on transient errors.
    }
  }, []);

  const loadMyDomains = useCallback(async () => {
    if (!wallet) { setMyDomains([]); return; }
    try {
      // Always lower-case — the backend rejects mixed-case checksums.
      const r = await fetch(`${API}/hub/names/owned/${wallet.toLowerCase()}`);
      if (!r.ok) return;
      const j = await r.json();
      if (j && typeof j.error === "string") return;
      const arr = readArray(j, ["names", "domains", "owned", "data"]);
      setMyDomains(arr.map((d: any) => (typeof d === "string" ? d : d.name || d.domain)).filter(Boolean));
    } catch {
      // Preserve last good state.
    }
  }, [wallet]);

  // Buy .lit — keep price in sync with chosen duration
  useEffect(() => {
    const local = BUY_DURATION_OPTIONS.find((d) => d.value === buyDuration);
    if (local) setBuyPrice(local.price);
    // Try to refine via API too (so any contract pricing change propagates).
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API}/hub/name/price/${buyDuration}`);
        if (!r.ok) return;
        const j = await r.json();
        const p = j?.price ?? j?.priceEther;
        if (!cancelled && p) setBuyPrice(String(p));
      } catch { /* keep static price */ }
    })();
    return () => { cancelled = true; };
  }, [buyDuration]);

  // Buy .lit — availability check (debounced) for whatever the user types.
  useEffect(() => {
    const raw = buyName.trim();
    if (!raw) { setBuyAvailable("idle"); return; }
    // Domain rules: at least 1 character, no spaces, no dots, no leading/trailing whitespace.
    if (/[\s.]/.test(raw)) { setBuyAvailable("invalid"); return; }
    setBuyAvailable("checking");
    const id = setTimeout(async () => {
      try {
        const r = await fetch(`${API}/hub/name/available/${encodeURIComponent(raw)}`);
        const j = await r.json();
        const ok = j?.available === true || j?.available === "true";
        setBuyAvailable(ok ? "available" : "taken");
      } catch {
        setBuyAvailable("idle");
      }
    }, 350);
    return () => clearTimeout(id);
  }, [buyName]);

  const registerLitName = useCallback(async () => {
    const name = buyName.trim();
    if (!name) return;
    if (!wallet) { alert("Connect wallet first"); return; }
    setBuyBusy(true);
    setBuySuccess(null);
    try {
      const c = await getRegistryContract();
      const valueWei = parseEther(buyPrice);
      console.log("[BuyLit] register()", { name, duration: buyDuration, price: buyPrice });
      const tx = await c.register(name, buyDuration, { value: valueWei });
      console.log("[BuyLit] tx submitted", tx.hash);
      await tx.wait();
      console.log("[BuyLit] tx confirmed");
      setBuySuccess(name);
      addNotif(wallet, {
        type: "gf",
        title: "Domain registered",
        message: `${name}.lit is yours${buyDuration === 99 ? " forever" : ` for ${buyDuration} year${buyDuration > 1 ? "s" : ""}`}`,
        link: "/chat",
      });
      showSuccess({
        title: `${name}.lit REGISTERED`,
        subtitle: "WELCOME TO LITDEX",
        rows: [
          { label: "DURATION", value: buyDuration === 99 ? "Forever" : `${buyDuration} year${buyDuration > 1 ? "s" : ""}` },
          { label: "PRICE", value: `${buyPrice} zkLTC` },
          { label: "TX", value: `${tx.hash.slice(0, 10)}...` },
        ],
      });
      // Refresh profile + market caches so it shows up immediately.
      setBuyName("");
      setBuyAvailable("idle");
      await loadMyDomains();
      // Refetch profile domains for the side panel and profile view.
      try {
        const r = await fetch(`${API}/hub/names/owned/${wallet.toLowerCase()}`);
        const j = await r.json();
        const arr = readArray(j, ["domains", "names", "data"]);
        setProfileDomains(arr.map((d: any) => (typeof d === "string" ? d : d.name || d.domain)).filter(Boolean));
      } catch { /* ignore */ }
    } catch (err: any) {
      const msg = err?.shortMessage || err?.reason || err?.message || "Registration failed";
      console.error("[BuyLit] failed:", msg);
      showError(msg);
    } finally {
      setBuyBusy(false);
    }
  }, [buyName, buyDuration, buyPrice, wallet, loadMyDomains]);

  // Bids on listings the connected wallet is selling.
  const loadBidsForOwner = useCallback(async () => {
    if (!wallet) { setBidsForOwner([]); return; }
    try {
      const r = await fetch(`${API}/hub/marketplace/bids/seller/${wallet.toLowerCase()}`);
      if (!r.ok) return;
      const j = await r.json();
      if (j && typeof j.error === "string") return;
      const arr = readArray(j, ["bids", "data", "items"]);
      const mapped = arr.map((b: any) => ({
        domain: b.domain || b.name || "",
        bidder: b.bidder || b.from || "",
        bidderName: b.bidderName || b.litName || undefined,
        amount: String(b.amount ?? b.price ?? 0),
        bidAt: Number(b.bidAt ?? b.placedAt ?? b.timestamp ?? b.createdAt ?? 0),
      })).filter((b: any) => b.domain && b.bidder);
      setBidsForOwner(mapped);
    } catch {
      // preserve last good state
    }
  }, [wallet]);

  // All active bids grouped by domain — used to show bid count on each market
  // card and to populate the bid history inside the listing detail view.
  // Backend returns { bidsByDomain: { name: [{bidder, amount, placedAt}] } }
  const loadBidsByDomain = useCallback(async () => {
    try {
      const r = await fetch(`${API}/hub/marketplace/all-bids`);
      if (!r.ok) return;
      const j = await r.json();
      if (j && typeof j.error === "string") return;
      const raw = (j && (j.bidsByDomain || j.data)) || {};
      const grouped: Record<string, Array<{ bidder: string; amount: string; bidAt: number }>> = {};
      for (const [name, list] of Object.entries(raw)) {
        if (!Array.isArray(list)) continue;
        grouped[name] = (list as any[]).map((b) => ({
          bidder: b.bidder || b.from || "",
          amount: String(b.amount ?? b.price ?? 0),
          bidAt: Number(b.placedAt ?? b.bidAt ?? b.timestamp ?? 0),
        }));
        grouped[name].sort((a, b) => b.bidAt - a.bidAt);
      }
      setBidsByDomain(grouped);
    } catch { /* ignore */ }
  }, []);

  const acceptBid = useCallback(async (domain: string, bidder: string, amount: string) => {
    if (!wallet) return;
    setBusy(true);
    try {
      const c = await getMarketplaceContract();
      console.log("[Market] acceptBid()", { domain, bidder });
      const tx = await c.acceptBid(domain, bidder);
      console.log("[Market] acceptBid: tx submitted", tx.hash);
      await tx.wait();
      console.log("[Market] acceptBid: confirmed");
      addNotif(wallet, {
        type: "gf",
        title: `Bid accepted`,
        message: `Sold ${domain} to ${short(bidder)} for ${amount} zkLTC`,
        link: `/chat`,
      });
      addNotif(bidder, {
        type: "gf",
        title: `Your bid was accepted`,
        message: `${short(wallet)} accepted your ${amount} zkLTC bid on ${domain}`,
        link: `/chat`,
      });
      await Promise.all([loadListings(), loadMyDomains(), loadBidsForOwner(), loadBidsByDomain()]);
      showSuccess({
        title: "BID ACCEPTED",
        subtitle: "DOMAIN SOLD",
        rows: [
          { label: "NAME", value: `${domain}.lit` },
          { label: "BUYER", value: short(bidder) },
          { label: "AMOUNT", value: `${amount} zkLTC` },
          { label: "TX", value: `${tx.hash.slice(0, 10)}...` },
        ],
      });
    } catch (err: any) {
      const msg = err?.shortMessage || err?.reason || err?.message || "Accept failed";
      console.error("[Market] acceptBid failed", err);
      showError(msg);
    } finally { setBusy(false); }
  }, [wallet, loadListings, loadMyDomains, loadBidsForOwner, loadBidsByDomain]);

  // The marketplace contract has no on-chain "seller rejects" function — only
  // the bidder can cancelBid (gets refund). So Reject is purely a UX signal:
  // notify the bidder that the seller declined and ask them to cancel the bid
  // on their side to recover their funds.
  const rejectBid = useCallback(async (domain: string, bidder: string) => {
    if (!wallet) return;
    addNotif(bidder, {
      type: "gf",
      title: `Bid declined`,
      message: `${short(wallet)} declined your bid on ${domain}. Cancel from your bids to recover funds.`,
      link: `/chat`,
    });
    showSuccess({
      title: "BID DECLINED",
      subtitle: "BIDDER NOTIFIED",
      rows: [
        { label: "NAME", value: `${domain}.lit` },
        { label: "BIDDER", value: short(bidder) },
      ],
    });
  }, [wallet]);

  useEffect(() => {
    if (view !== "market") return;
    loadListings();
    loadSold();
    loadMyDomains();
    loadBidsForOwner();
    loadBidsByDomain();
  }, [view, loadListings, loadSold, loadMyDomains, loadBidsForOwner, loadBidsByDomain]);

  // Profile view depends on the same market data: My Listings tab needs
  // `listingsFull`, Incoming Bids tab needs `bidsForOwner`, and the
  // Domains tab's "Listed" badge needs `bidsByDomain`. Without this hook
  // a user who navigates straight to profile from another tab would see
  // stale 0/empty values until they swung through .lit Market first.
  useEffect(() => {
    if (view !== "profile") return;
    loadListings();
    loadBidsForOwner();
    loadBidsByDomain();
  }, [view, profileAddr, loadListings, loadBidsForOwner, loadBidsByDomain]);

  // Keep "incoming bids" badge fresh in profile, even when the user hasn't
  // opened the market yet.
  useEffect(() => {
    if (!wallet) return;
    loadBidsForOwner();
    const id = setInterval(loadBidsForOwner, 30_000);
    return () => clearInterval(id);
  }, [wallet, loadBidsForOwner]);

  const openProfile = (addr: string) => {
    setProfileAddr(addr);
    setView("profile");
  };

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
    // Only flag mentions from the last 30 minutes — older posts shouldn't
    // trigger a "you have a mention" badge anymore.
    const cutoff = Math.floor(Date.now() / 1000) - 30 * 60;
    return posts
      .filter((p) => {
        const ts = Number(p.timestamp || (p as any).createdAt || (p as any).ts || 0);
        if (!ts || ts < cutoff) return false;
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
    const result = await fetchRPC({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to: address, data }, "latest"],
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

  // Hydrate the in-memory name cache from localStorage on mount so we don't
  // re-RPC the same names every page navigation. Backed by /hub/name/reverse
  // (DB-fast) + an on-chain fallback. Persisted lazily in resolveName below.
  const NAMES_CACHE_KEY = "litdex:names";
  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(NAMES_CACHE_KEY) : null;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") {
          namesRef.current = { ...parsed, ...namesRef.current };
        }
      }
    } catch { /* ignore */ }
  }, []);

  const persistNames = useCallback(() => {
    try {
      // Cap at 200 entries to keep storage small.
      const all = Object.entries(namesRef.current).slice(-200);
      const obj: Record<string, string> = {};
      for (const [k, v] of all) obj[k] = v;
      localStorage.setItem(NAMES_CACHE_KEY, JSON.stringify(obj));
    } catch { /* quota / SSR */ }
  }, []);

  const resolveName = useCallback(async (address: string) => {
    if (!address) return "";
    const key = address.toLowerCase();
    if (namesRef.current[key]) return namesRef.current[key];
    // 1) Try the backend DB-cached resolver first — zero RPC cost.
    try {
      const r = await fetch(`${API}/hub/name/reverse/${key}`);
      if (r.ok) {
        const j = await r.json();
        const n = j?.name || j?.litName || j?.data?.name || "";
        if (typeof n === "string" && n) {
          namesRef.current[key] = n;
          persistNames();
          return n;
        }
      }
    } catch { /* fall through to chain */ }
    // 2) Fallback: on-chain reverseResolve via the RPC pool.
    try {
      const data = encodeCall(SELECTOR.reverseResolve, [{ type: "address", value: address }]);
      const name = decodeString(await readContract(LIT_REGISTRY_ADDRESS, data));
      namesRef.current[key] = name || short(address);
    } catch {
      namesRef.current[key] = short(address);
    }
    persistNames();
    return namesRef.current[key];
  }, [readContract, persistNames]);

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

  // Wallet swap = reset everything that was scoped to the old account.
  // Without this, the previous wallet's profile data, contacts and
  // outgoing friend requests bleed into the new account until the user
  // navigates away and back. We also bounce the user back to /chat so a
  // stale "available.lit" profile view doesn't linger.
  const lastWalletRef = useRef<string>("");
  useEffect(() => {
    const prev = lastWalletRef.current;
    if (prev && prev.toLowerCase() !== wallet.toLowerCase()) {
      // Account just changed — wipe per-session state.
      setView("chat");
      setProfileAddr("");
      setProfileName("");
      setProfilePoints("0");
      setProfileBalance("0");
      setProfileDomains([]);
      setCurrent(null);
      setMessages([]);
      setPendingMsgs([]);
      setContacts([]);
      setPending([]);
      setMyDomains([]);
      setBidsForOwner([]);
      setOutgoingPanelOpen(false);
    }
    lastWalletRef.current = wallet;
  }, [wallet]);

  const loadPosts = useCallback(async () => {
    let arr0: any[] = [];
    try {
      console.log("[ChatUI] fetching posts:", `${API}/hub/posts`);
      const response = await fetch(`${API}/hub/posts`);
      const data = await response.json();
      console.log("[ChatUI] /hub/posts response:", data);
      arr0 = readArray(data, ["posts", "data", "items"]);
      console.log("[ChatUI] posts array length:", arr0.length);
      const mapped: Post[] = await Promise.all(arr0.map(async (p: any, index: number): Promise<Post> => {
        const author = p.author || p.wallet || p.walletAddress || p.from || p.creator || "";
        const id = String(p.id ?? p.postId ?? index);
        const cachedName = namesRef.current[(author || "").toLowerCase()];
        const name = p.name || p.litName || p.creatorName || cachedName || short(author);
        const liked = Boolean(p.liked || p.hasLiked);
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
          bountyBalance: String(p.bountyBalance ?? p.bountyAmount ?? "0"),
          liked,
          comments,
        };
      }));
      console.log("[ChatUI] mapped posts:", mapped);
      setPosts((prev) => {
        const pendingPosts = prev.filter((p) => p.pending);
        const realPrev = prev.filter((p) => !p.pending);
        const sameLen = realPrev.length === mapped.length;
        const sameTop = sameLen && realPrev[0]?.id === mapped[0]?.id && realPrev[realPrev.length - 1]?.id === mapped[mapped.length - 1]?.id;
        if (sameLen && sameTop && pendingPosts.length === 0) return prev;
        // Drop pending posts whose content now appears in real list (by content match)
        const remainingPending = pendingPosts.filter((pp) => !mapped.some((m) => m.author?.toLowerCase() === pp.author?.toLowerCase() && m.content === pp.content));
        return [...mapped, ...remainingPending];
      });
    } catch (err) {
      console.error("[ChatUI] loadPosts error:", err);
      setPosts((prev) => (prev.length === 0 ? prev : prev));
    } finally {
      setPostsLoading(false);
    }
    // background: resolve unresolved names and patch posts in
    (async () => {
      try {
        const toResolve = new Set<string>();
        for (const p of arr0) {
          const a = (p.author || p.wallet || p.creator || "").toLowerCase();
          if (a && !namesRef.current[a]) toResolve.add(a);
        }
        for (const a of toResolve) { await resolveName(a); }
        setPosts((prev) => prev.map((p) => ({ ...p, name: p.name && !p.name.startsWith("0x") ? p.name : (namesRef.current[(p.author||"").toLowerCase()] || p.name) })));
      } catch { /* ignore */ }
    })();
  }, [resolveName]);

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
      const url = `${API}/hub/messenger/friends/${connectedWallet.toLowerCase()}`;
      console.log("[ChatUI] fetching friends:", url);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`friends ${response.status}`);
      const data = await response.json();
      // Backend bubbles RPC errors as {"error": "..."} 200 — keep last
      // known state so the contact list isn't wiped during a hiccup.
      if (data && typeof data.error === "string") {
        console.warn("[ChatUI] friends transient error, keeping last state:", data.error);
        return;
      }
      console.log("[ChatUI] /hub/messenger/friends response:", data);
      const arr = readArray(data, ["friends", "contacts", "data"]);
      console.log("[ChatUI] data.friends:", arr);
      const mapped = (await Promise.all(arr.map(mapContact))).filter(Boolean) as Contact[];
      console.log("[ChatUI] mapped contacts:", mapped);
      setContacts(mapped);
    } catch (err) {
      console.error("[ChatUI] loadPrivate friends error:", err);
      // Keep prior contacts on error — don't blank the sidebar.
    }

    try {
      // The contract's getPendingRequests(addr) returns a *count*, not the
      // ID list — that's why receivers never saw incoming requests in the
      // sidebar. Walk the global requestCount() and pick rows where
      // to == me && status == pending.
      const totalHex = await readContract(MESSENGER_ADDRESS, encodeCall(SELECTOR.requestCount, []));
      const total = Number(BigInt(totalHex || "0x0"));
      const out: PendingRequest[] = [];
      const max = Math.min(total, 200);
      const meLc = wallet.toLowerCase();
      for (let i = total; i > total - max && i > 0; i--) {
        try {
          const raw = await readContract(MESSENGER_ADDRESS, encodeCall(SELECTOR.friendRequests, [{ type: "uint", value: i }]));
          const req = decodeFriendRequest(raw);
          if ((req.to || "").toLowerCase() !== meLc) continue;
          if (Number(req.status) !== 0) continue; // 0 = pending
          out.push({ id: String(i), from: req.from, to: req.to, status: req.status, sentAt: req.sentAt, name: await resolveName(req.from) });
        } catch { /* skip bad row */ }
      }
      setPending(out);
    } catch { setPending([]); }
  }, [mapContact, resolveName, wallet]);

  const loadConversation = useCallback(async () => {
    if (!wallet || !current?.address) return;
    try {
      const r = await fetch(`${API}/hub/messenger/conversation/${wallet.toLowerCase()}/${current.address.toLowerCase()}`);
      if (!r.ok) {
        // Server-side error (RPC rate limit, contract revert) — keep last
        // known state so optimistic + previously fetched msgs stay visible.
        return;
      }
      const j = await r.json();
      // Backend may return {"error": "..."} as 200 in some failure modes
      // (e.g. RPC bandwidth exceeded). Treat that as transient and skip.
      if (j && typeof j.error === "string") return;
      const serverMsgs = readArray(j, ["messages", "conversation", "data"]) as Msg[];
      // Preserve last known state when the backend returns nothing — this
      // commonly happens before the `getConversation({from})` override is
      // deployed, where server eth_call sets msg.sender = 0x0 and the
      // contract returns an empty array. Wiping the UI in that case would
      // make confirmed messages disappear after navigating away and back.
      if (serverMsgs.length > 0) {
        setMessages(serverMsgs);
      }
      // Drop any optimistic message that is now reflected by the backend.
      // We match on (sender == me) + same text within a 5-minute window.
      const myAddr = wallet.toLowerCase();
      setPendingMsgs((prev) => prev.filter((p) => {
        const text = getMessageText(p);
        const ts = Number(p.timestamp || p.ts || (p as any).sentAt || 0);
        return !serverMsgs.some((s) => {
          const sFrom = (s.from || s.wallet || (s as any).fromWallet || (s as any).sender || "").toString().toLowerCase();
          if (sFrom !== myAddr) return false;
          const sText = getMessageText(s);
          if (sText !== text) return false;
          const sTs = Number(s.timestamp || s.ts || (s as any).sentAt || 0);
          // Allow generous window because backend timestamps may differ from
          // the optimistic clock.
          return !ts || !sTs || Math.abs(sTs - ts) < 600;
        });
      }));
    } catch {
      // Transient fetch errors must NOT wipe the conversation — keep last
      // known state so optimistic + previously fetched msgs stay visible.
    }
  }, [current?.address, wallet]);

  // Poll cadence: keep messaging snappy but don't hammer the chain. Posts
  // and conversations are DB-backed (fast + cheap), so we can poll them
  // often. Friend list pulls direct RPC (pending requests), so we poll it
  // less aggressively. We also pause every interval when the tab is hidden.
  const isVisible = () => typeof document === "undefined" || document.visibilityState === "visible";

  useEffect(() => {
    if (tab === "global") {
      loadPosts();
      const id = setInterval(() => { if (isVisible()) loadPosts(); }, 8_000);
      return () => clearInterval(id);
    }
    loadPrivate();
    // Friend list + pending requests poll. 30s is plenty — the message
    // poll below already keeps the active conversation fresh.
    const id = setInterval(() => { if (isVisible()) loadPrivate(); }, 30_000);
    return () => clearInterval(id);
  }, [loadPosts, loadPrivate, tab]);

  // When the tab toggles, clear search + the active contact pointer, but
  // keep `messages` and `pendingMsgs` intact — the localStorage hydrate
  // effect re-fills them when the user re-selects the contact, and we
  // never want to wipe an in-flight optimistic bubble due to a tab nudge.
  useEffect(() => {
    setCurrent(null);
    setSearch("");
  }, [tab]);

  useEffect(() => {
    if (tab !== "private" || !current) return;
    loadConversation();
    // DB-backed endpoint, cheap — keep at ~5s for snappy DM feel and pause
    // when the tab is hidden.
    const isVisibleNow = () => typeof document === "undefined" || document.visibilityState === "visible";
    const id = setInterval(() => { if (isVisibleNow()) loadConversation(); }, 5_000);
    const onVis = () => { if (isVisibleNow()) loadConversation(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [current, loadConversation, tab]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [messages, pendingMsgs, posts, replyTo]);

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
        bountyBalance: String(p.bountyBalance ?? p.bountyAmount ?? it.bountyBalance ?? "0"),
        comments: comments ?? it.comments,
      } : it));
    } catch (err) { console.error("[ChatUI] refreshPost error:", err); }
  }, []);

  const likePost = async (post: Post) => {
    if (post.liked) return;
    // Block self-likes — contract rejects them, the user only burns gas and
    // the like count never moves. Show a toast instead.
    if (post.author && wallet && post.author.toLowerCase() === wallet.toLowerCase()) {
      try { (await import("sonner")).toast.error("You can't like your own post"); } catch { /* ignore */ }
      return;
    }
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

  // Reclaim unclaimed bounty after 24h. Calls HubPosts.withdrawBounty(postId)
  // from the creator's wallet. On confirmation we publish a global post
  // announcing the reclaim and refresh the feed.
  const reclaimBounty = async (post: Post) => {
    if (!wallet) {
      showError("Connect wallet first");
      return;
    }
    if (post.author?.toLowerCase() !== wallet.toLowerCase()) {
      showError("Only the post creator can reclaim");
      return;
    }
    setBusy(true);
    try {
      const c = await getHubPostsContract();
      console.log("[ChatUI] reclaimBounty()", { postId: post.postId });
      const tx = await c.withdrawBounty(post.postId);
      console.log("[ChatUI] reclaimBounty tx submitted", tx.hash);
      await tx.wait();
      console.log("[ChatUI] reclaimBounty confirmed");

      // Best-effort: post a global feed message announcing the reclaim.
      // Failure here doesn't block the reclaim itself.
      const balance = post.bountyBalance && post.bountyBalance !== "0" ? post.bountyBalance : "";
      const announceText = balance
        ? `💰 Reclaimed ${balance} zkLTC unclaimed bounty from post #${post.postId}`
        : `💰 Reclaimed unclaimed bounty from post #${post.postId}`;
      try {
        await writeContract(
          HUB_POSTS_ADDRESS,
          encodeCall(SELECTOR.createPost, [
            { type: "string", value: announceText },
            { type: "uint", value: 0n },
            { type: "uint", value: 0n },
          ]),
          0n,
        );
      } catch (e) {
        console.warn("[ChatUI] reclaim announcement post failed", e);
      }

      addNotif(wallet, {
        type: "gf",
        title: "Bounty reclaimed",
        message: balance
          ? `Got back ${balance} zkLTC from post #${post.postId}`
          : `Reclaimed bounty from post #${post.postId}`,
        link: "/chat",
      });
      showSuccess({
        title: "BOUNTY RECLAIMED",
        subtitle: "FUNDS BACK IN YOUR WALLET",
        rows: [
          { label: "POST", value: `#${post.postId}` },
          ...(balance ? [{ label: "AMOUNT", value: `${balance} zkLTC` }] : []),
          { label: "TX", value: `${String(tx.hash).slice(0, 10)}...` },
        ],
      });
      await loadPosts();
    } catch (err: any) {
      const msg = err?.shortMessage || err?.reason || err?.message || "Reclaim failed";
      console.error("[ChatUI] reclaimBounty failed", err);
      showError(msg);
    } finally {
      setBusy(false);
    }
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
    const isReply = !!replyTo;
    const replyToName = replyTo?.name || (replyTo ? short(replyTo.authorAddr) : "");
    const content = replyTo
      ? `[replyTo:${replyTo.postId}] @${replyTo.name || short(replyTo.authorAddr)} ${body}`
      : body;
    const useBounty = inlineBountyActive && Number(inlineLikeReward || 0) > 0 && Number(inlineTotalBounty || 0) > 0;
    const likeWei = useBounty ? parseAmount(inlineLikeReward || "0") : 0n;
    const commentWei = 0n;
    const budgetWei = useBounty ? parseAmount(inlineTotalBounty || "0") : 0n;
    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticPost: Post = {
      id: optimisticId,
      postId: optimisticId,
      author: wallet,
      name: namesRef.current[wallet.toLowerCase()] || short(wallet),
      content,
      timestamp: Math.floor(Date.now() / 1000),
      likeCount: 0,
      commentCount: 0,
      bountyActive: useBounty,
      liked: false,
      comments: [],
      pending: true,
    };
    setPosts((prev) => [...prev, optimisticPost]);
    setBusy(true);
    try {
      const txHash = await writeContract(
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
      setInlineBountyMultiplier("");
      setBountyPopupOpen(false);
      await loadPosts();
      // Wallet-style popup so global posts/replies feel the same as Swap/Pool.
      const rows: Array<{ label: string; value: string }> = [];
      if (isReply) rows.push({ label: "REPLY TO", value: `@${replyToName}` });
      if (useBounty) rows.push({ label: "BOUNTY", value: `${inlineTotalBounty} zkLTC` });
      rows.push({ label: "TX", value: `${String(txHash).slice(0, 10)}...` });
      showSuccess({
        title: isReply ? "REPLY POSTED" : "POST PUBLISHED",
        subtitle: "ON-CHAIN CONFIRMATION",
        rows,
      });
    } catch (err: any) {
      console.error("[ChatUI] sendGlobal error:", err);
      setPosts((prev) => prev.filter((p) => p.id !== optimisticId));
      const msg = err?.shortMessage || err?.reason || err?.message || "Failed to send post";
      showError(msg);
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
    let clean = friendName.trim().replace(/^@/, "").toLowerCase();
    // Strip optional ".lit" suffix so the resolver gets the bare name.
    if (clean.endsWith(".lit")) clean = clean.slice(0, -4);
    if (!clean) {
      showError("Enter a .lit name");
      return;
    }
    setBusy(true);
    try {
      // Resolve .lit -> wallet. Empty / zero / null means the name isn't
      // registered, so we refuse to send the request and tell the user.
      const r = await fetch(`${API}/hub/name/resolve/${encodeURIComponent(clean)}`);
      let resolved = "";
      if (r.ok) {
        const j = await r.json();
        resolved = j?.address || j?.wallet || j?.walletAddress || j?.data?.address || "";
      }
      const ZERO = "0x0000000000000000000000000000000000000000";
      if (!resolved || resolved.toLowerCase() === ZERO) {
        showError(`${clean}.lit is not registered on LitDEX`);
        return;
      }
      if (resolved.toLowerCase() === wallet.toLowerCase()) {
        showError("You can't friend yourself");
        return;
      }
      const txHash = await writeContract(MESSENGER_ADDRESS, encodeCall(SELECTOR.sendFriendRequest, [{ type: "address", value: resolved }]));
      setFriendName("");
      setAddFriendOpen(false);
      // Track outbound — the sidebar badge will show pending/accepted/rejected.
      setOutgoing((prev) => {
        const lcTo = resolved.toLowerCase();
        // De-dupe: drop any prior entry to same address (re-send case),
        // keep the new pending one.
        const filtered = prev.filter((r) => r.to !== lcTo);
        return [
          ...filtered,
          {
            id: `out-${Date.now()}`,
            to: lcTo,
            name: clean,
            txHash: typeof txHash === "string" ? txHash : undefined,
            sentAt: Math.floor(Date.now() / 1000),
            status: "pending",
          },
        ];
      });
      showSuccess({
        title: "FRIEND REQUEST SENT",
        subtitle: "WAITING FOR ACCEPTANCE",
        rows: [
          { label: "TO", value: `${clean}.lit` },
          { label: "TX", value: `${String(txHash).slice(0, 10)}...` },
        ],
      });
    } catch (err: any) {
      const msg = err?.shortMessage || err?.reason || err?.message || "Failed to send friend request";
      showError(msg);
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

  // Poll for tx receipt; resolves with receipt or null after timeout.
  const waitForReceipt = useCallback(async (hash: string, timeoutMs = 60_000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const r = await fetchRPC({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_getTransactionReceipt",
          params: [hash],
        });
        const j = await r.json();
        if (j?.result) return j.result;
      } catch { /* swallow and retry */ }
      await new Promise((res) => setTimeout(res, 2000));
    }
    return null;
  }, []);

  const sendPrivate = async () => {
    const text = draft.trim();
    if (!text || !current?.address) return;
    const optimisticId = `opt-${Date.now()}`;
    const optimisticMsg: Msg & { status?: "sending" | "sent"; txHash?: string } = {
      id: optimisticId,
      from: wallet,
      to: current.address,
      content: text,
      timestamp: Math.floor(Date.now() / 1000),
      status: "sending",
    };
    // Stage in the dedicated pending bucket so polling never wipes it.
    setPendingMsgs((prev) => [...prev, optimisticMsg]);
    setDraft("");
    setBusy(true);
    let txHash: string | null = null;
    try {
      const eth: any = (window as any).ethereum;
      if (!eth) throw new Error("Wallet not found");
      await ensureChain();
      const provider = new BrowserProvider(eth);
      const signer = await provider.getSigner();
      const messenger = new Contract(
        MESSENGER_ADDRESS,
        ["function sendMessage(address to, string content, string msgType) external"],
        signer,
      );
      console.log("[ChatUI] sendPrivate -> sendMessage()", {
        messenger: MESSENGER_ADDRESS,
        to: current.address,
        text,
        from: wallet,
      });
      const tx = await messenger.sendMessage(current.address, text, "text");
      txHash = tx.hash;
      console.log("[ChatUI] sendPrivate: tx submitted", tx.hash);
      // Mark optimistic as on-chain submitted.
      setPendingMsgs((prev) => prev.map((m) => m.id === optimisticId ? { ...m, txHash: tx.hash, status: "sent" } : m));
      const receipt = await tx.wait();
      console.log("[ChatUI] sendPrivate: tx confirmed", { hash: tx.hash, status: receipt?.status, block: receipt?.blockNumber });
      // Pull the block timestamp so the bubble shows a real time, not the
      // local clock — keeps it consistent with server-indexed messages.
      let chainTs = Math.floor(Date.now() / 1000);
      try {
        if (receipt?.blockNumber) {
          const block = await provider.getBlock(receipt.blockNumber);
          if (block?.timestamp) chainTs = Number(block.timestamp);
        }
      } catch { /* fallback to local clock */ }
      // Promote optimistic → locally-confirmed. The bubble now shows a real
      // timestamp instead of "syncing…", and stays visible regardless of
      // whether the backend indexer echoes it back.
      setPendingMsgs((prev) => prev.map((m) => m.id === optimisticId ? {
        ...m,
        txHash: tx.hash,
        status: "sent",
        timestamp: chainTs,
        confirmed: true,
      } as any : m));
      // Wallet-style success popup (consistent with Swap/Pool flows).
      const friendLabel = current.name ? `${current.name}` : short(current.address);
      showSuccess({
        title: "MESSAGE SENT",
        subtitle: "ON-CHAIN CONFIRMATION",
        rows: [
          { label: "TO", value: friendLabel },
          { label: "TX", value: `${tx.hash.slice(0, 10)}...` },
        ],
      });
    } catch (err) {
      console.error("[ChatUI] sendPrivate: failed", err);
      // User rejected or RPC/contract error — drop the optimistic msg.
      setPendingMsgs((prev) => prev.filter((m) => m.id !== optimisticId));
      const msg = (err as any)?.shortMessage || (err as any)?.reason || (err as any)?.message || "Failed to send message";
      showError(msg);
      setBusy(false);
      return;
    } finally {
      setBusy(false);
    }

    // After confirmation, re-fetch the conversation so the message
    // transitions from optimistic ("syncing") to a confirmed server-indexed
    // entry. The existing scroll effect on [messages, pendingMsgs] handles
    // auto-scroll to the latest. Keep a short retry loop in case the
    // backend indexer lags slightly behind the chain receipt.
    for (let i = 0; i < 10; i++) {
      await loadConversation();
      const stillPending = await new Promise<boolean>((resolve) => {
        setPendingMsgs((prev) => {
          resolve(prev.some((m) => m.id === optimisticId));
          return prev;
        });
      });
      if (!stillPending) {
        if (txHash) console.log("[ChatUI] sendPrivate: indexed by hub", txHash);
        return;
      }
      await new Promise((res) => setTimeout(res, 2000));
    }
  };

  const sendTip = async () => {
    if (!current?.address) return;
    const amountStr = (tipAmount || "").trim();
    const note = tipNote.trim();
    const amountNum = parseFloat(amountStr);
    if (!amountStr || !Number.isFinite(amountNum) || amountNum <= 0) {
      showError("Enter a valid amount");
      return;
    }
    // Optimistic transfer bubble — appears in the conversation immediately
    // with a "sending…" label, gets promoted to confirmed once the tx
    // mines. Matches the sendMessage UX so funds + note are always visible.
    const optimisticId = `opt-${Date.now()}`;
    const optimisticMsg: Msg & { status?: "sending" | "sent"; txHash?: string; msgType?: string; amount?: string } = {
      id: optimisticId,
      from: wallet,
      to: current.address,
      content: note || "",
      timestamp: Math.floor(Date.now() / 1000),
      status: "sending",
      msgType: "transfer",
      amount: amountStr,
    } as any;
    setPendingMsgs((prev) => [...prev, optimisticMsg]);
    setTipOpen(false);
    setBusy(true);
    try {
      const txHash = await writeContract(
        MESSENGER_ADDRESS,
        encodeCall(SELECTOR.sendZkLTC, [
          { type: "address", value: current.address },
          { type: "string", value: note || "zkLTC" },
        ]),
        parseAmount(amountStr),
      );
      setPendingMsgs((prev) => prev.map((m) => m.id === optimisticId ? { ...m, txHash: typeof txHash === "string" ? txHash : undefined, status: "sent" } : m));
      // Wait for receipt so we can promote → confirmed with chain timestamp.
      try {
        const receipt = typeof txHash === "string" ? await waitForReceipt(txHash) : null;
        let chainTs = Math.floor(Date.now() / 1000);
        if (receipt?.blockNumber) {
          try {
            const blk = await fetchRPC({
              jsonrpc: "2.0",
              id: 1,
              method: "eth_getBlockByNumber",
              params: [receipt.blockNumber, false],
            });
            const j = await blk.json();
            const ts = j?.result?.timestamp;
            if (ts) chainTs = parseInt(ts, 16);
          } catch { /* keep local ts */ }
        }
        setPendingMsgs((prev) => prev.map((m) => m.id === optimisticId ? {
          ...m,
          status: "sent",
          timestamp: chainTs,
          confirmed: true,
        } as any : m));
      } catch { /* receipt poll already swallows errors */ }
      setTipNote("");
      setTipAmount("0.01");
      // Wallet-style success popup so the user sees it just like Swap/Pool.
      const friendLabel = current.name ? current.name : short(current.address);
      showSuccess({
        title: "ZKLTC SENT",
        subtitle: "TRANSFER CONFIRMED",
        rows: [
          { label: "AMOUNT", value: `${amountStr} zkLTC` },
          { label: "TO", value: friendLabel },
          ...(note ? [{ label: "NOTE", value: note }] : []),
          { label: "TX", value: `${String(txHash).slice(0, 10)}...` },
        ],
      });
      // Refresh conversation so the chain-indexed entry shows up and
      // dedupes the optimistic bubble.
      try { await loadConversation(); } catch { /* polling will catch up */ }
    } catch (err: any) {
      console.error("[ChatUI] sendTip failed", err);
      setPendingMsgs((prev) => prev.filter((m) => m.id !== optimisticId));
      const msg = err?.shortMessage || err?.reason || err?.message || "Send failed";
      showError(msg);
    } finally {
      setBusy(false);
    }
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
        const r = await fetchRPC({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_getBalance",
          params: [wallet, "latest"],
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
    if (!amount || !recipient) {
      showError("Enter amount and recipient");
      return;
    }
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
      setSendPanelOpen(false);
      setSendAmount("");
      setSendRecipient("");
      // Wallet-style success popup, same as Swap/Pool flows.
      showSuccess({
        title: "TRANSFER SENT",
        subtitle: "ON-CHAIN CONFIRMATION",
        rows: [
          { label: "AMOUNT", value: `${amount} ${token.symbol}` },
          { label: "TO", value: toName },
          { label: "TX", value: `${String(txHash).slice(0, 10)}...` },
        ],
      });
    } catch (err: any) {
      console.error("[ChatUI] executeSend error:", err);
      const msg = err?.shortMessage || err?.reason || err?.message || "Send failed";
      showError(msg);
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
              <button
                onClick={() => { setView("market"); }}
                className={cn(
                  "w-full flex items-center gap-3 px-2 py-2 rounded-md",
                  view === "market" ? "bg-white/10 text-brand-text-primary" : "text-brand-text-muted hover:bg-white/5 hover:text-brand-text-primary"
                )}
              >
                <Store size={18} />
                {sidebarOpen && <span className="text-sm">.lit Market</span>}
              </button>
              <button
                onClick={() => { setView("buy"); }}
                className={cn(
                  "w-full flex items-center gap-3 px-2 py-2 rounded-md",
                  view === "buy" ? "bg-white/10 text-brand-text-primary" : "text-brand-text-muted hover:bg-white/5 hover:text-brand-text-primary"
                )}
              >
                <Sparkles size={18} />
                {sidebarOpen && <span className="text-sm">Buy .lit</span>}
              </button>
            </div>
            <div className="mt-auto p-3 space-y-1">
              <button
                onClick={() => wallet && openProfile(wallet)}
                disabled={!wallet}
                className="w-full flex items-center gap-3 px-2 py-2 rounded-md text-brand-text-muted hover:bg-white/5 hover:text-brand-text-primary disabled:opacity-50"
                title={wallet || "Not connected"}
              >
                <User2 size={18} />
                {sidebarOpen && (
                  <>
                    <span className="text-sm truncate">
                      {myDisplayName || short(wallet) || "Not connected"}
                    </span>
                    <ChevronUp size={16} className="ml-auto" />
                  </>
                )}
              </button>
            </div>
          </aside>

          <section className="w-[300px] shrink-0 border-r border-brand-border bg-brand-bg flex flex-col">
            <div className="h-12 px-3 flex items-center gap-2">
              <p className="text-sm font-medium text-brand-text-primary">{tab === "private" ? "Private" : "Global"}</p>
              <div className="ml-auto flex items-center gap-1">
                {tab === "private" && (
                  <>
                    {/* Outgoing friend requests button — shows status of who
                        you've added (pending / accepted / rejected). */}
                    <div className="relative">
                      <button
                        onClick={() => setOutgoingPanelOpen((v) => !v)}
                        title="Sent friend requests"
                        className="relative h-9 w-9 inline-flex items-center justify-center rounded-md text-brand-text-muted hover:bg-white/5 hover:text-brand-text-primary"
                      >
                        <Users size={16} />
                        {outgoing.some((r) => r.status === "pending") && (
                          <span className="absolute -right-1 -top-1 min-w-4 h-4 rounded-full bg-white px-1 text-[10px] text-black leading-4 text-center font-bold">
                            {outgoing.filter((r) => r.status === "pending").length}
                          </span>
                        )}
                      </button>
                      {outgoingPanelOpen && (
                        <div className="absolute right-0 top-full mt-1 z-30 w-72 max-h-80 overflow-y-auto rounded-lg border border-brand-border bg-brand-surface-2 shadow-2xl">
                          <div className="px-3 py-2 border-b border-brand-border flex items-center gap-2">
                            <Users size={14} className="text-brand-text-muted" />
                            <span className="text-xs font-semibold text-brand-text-primary">Sent Requests</span>
                            <button
                              onClick={() => setOutgoingPanelOpen(false)}
                              aria-label="Close"
                              className="ml-auto p-1 rounded hover:bg-white/10 text-brand-text-muted hover:text-brand-text-primary"
                            >
                              <X size={12} />
                            </button>
                          </div>
                          {outgoing.length === 0 ? (
                            <div className="px-4 py-6 text-center text-xs text-brand-text-muted">
                              You haven't sent any friend requests yet.
                            </div>
                          ) : (
                            <div className="py-1">
                              {[...outgoing]
                                .sort((a, b) => b.sentAt - a.sentAt)
                                .map((r) => {
                                  const statusLabel =
                                    r.status === "accepted"
                                      ? "Friend request accepted"
                                      : r.status === "rejected"
                                      ? "Friend request rejected"
                                      : "Friend request pending";
                                  const dotClass =
                                    r.status === "accepted"
                                      ? "bg-white"
                                      : r.status === "rejected"
                                      ? "bg-brand-danger"
                                      : "bg-brand-text-muted animate-pulse";
                                  return (
                                    <div
                                      key={r.id}
                                      className="flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-colors"
                                    >
                                      <Avatar name={r.name} size={32} />
                                      <div className="min-w-0 flex-1">
                                        <div className="text-xs font-semibold text-brand-text-primary truncate">
                                          {r.name}.lit
                                        </div>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                          <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", dotClass)} />
                                          <span className="text-[10px] text-brand-text-muted truncate">{statusLabel}</span>
                                        </div>
                                      </div>
                                      {r.status !== "pending" && (
                                        <button
                                          aria-label="Dismiss"
                                          onClick={() => setOutgoing((prev) => prev.filter((o) => o.id !== r.id))}
                                          className="p-1 rounded hover:bg-white/10 text-brand-text-muted hover:text-brand-text-primary"
                                        >
                                          <X size={12} />
                                        </button>
                                      )}
                                    </div>
                                  );
                                })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <button onClick={() => setAddFriendOpen(true)} className="relative h-9 w-9 inline-flex items-center justify-center rounded-md text-brand-text-muted hover:bg-white/5 hover:text-brand-text-primary">
                      <SquarePen size={16} />
                      {pending.length > 0 && <span className="absolute -right-1 -top-1 min-w-4 h-4 rounded-full bg-brand-danger px-1 text-[10px] text-brand-text-primary leading-4 text-center">{pending.length}</span>}
                    </button>
                  </>
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
              {tab === "global" && (
                <div className="ml-auto flex items-center gap-1 rounded-full border border-brand-border bg-brand-surface p-0.5">
                  <button
                    onClick={() => setFeedFilter("all")}
                    className={cn(
                      "px-3 h-7 rounded-full text-[11px] font-semibold transition-colors",
                      feedFilter === "all" ? "bg-white/10 text-brand-text-primary" : "text-brand-text-muted hover:text-brand-text-primary"
                    )}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setFeedFilter("bounty")}
                    className={cn(
                      "px-3 h-7 rounded-full text-[11px] font-semibold transition-colors inline-flex items-center gap-1",
                      feedFilter === "bounty" ? "bg-white/10 text-brand-text-primary" : "text-brand-text-muted hover:text-brand-text-primary"
                    )}
                  >
                    🪙 Bounty
                  </button>
                </div>
              )}
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


              {tab === "global" && postsLoading && posts.length === 0 && (
                <div className="space-y-3">
                  {[0,1,2,3,4].map((i) => (
                    <div key={`sk-${i}`} className="flex justify-start">
                      <div className="max-w-[760px] w-[420px] rounded-lg border border-brand-border bg-brand-surface px-3 py-3 animate-pulse">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded-full bg-white/10" />
                          <div className="flex-1 space-y-2">
                            <div className="h-3 w-32 bg-white/10 rounded" />
                            <div className="h-2 w-20 bg-white/5 rounded" />
                          </div>
                        </div>
                        <div className="mt-3 space-y-2">
                          <div className="h-3 w-full bg-white/10 rounded" />
                          <div className="h-3 w-4/5 bg-white/10 rounded" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {tab === "global" && (() => {
                type FeedItem =
                  | { kind: "post"; id: string; ts: number; post: Post }
                  | { kind: "reply"; id: string; ts: number; parent: Post; commenter: string; name?: string; text: string; timestamp?: number | string }
                  | { kind: "transfer"; id: string; ts: number; transfer: typeof localTransfers[number] };
                const items: FeedItem[] = [];
                const nowSec = Math.floor(Date.now() / 1000);
                const cutoff = nowSec - 1800;
                const visiblePosts = feedFilter === "bounty"
                  ? posts.filter((p) => p.bountyActive)
                  : posts.filter((p) => {
                      if (p.pending) return true;
                      const ts = Number(p.timestamp || 0);
                      return ts === 0 || ts >= cutoff;
                    });
                visiblePosts.forEach((post, pi) => {
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
                        <div className="max-w-[760px] w-fit bg-brand-surface-2 border-l-4 border-brand-text-primary/60 rounded-xl px-4 py-3 text-sm text-brand-text-primary">
                          <div className="font-medium">
                            💸 <span className="font-semibold">{t.fromName}</span> sent{" "}
                            <span className="font-semibold text-brand-text-primary">{t.amount} {t.token}</span> to{" "}
                            <span className="font-semibold">{t.toName}</span>
                          </div>
                          <a
                            href={EXPLORER_TX(t.txHash)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 inline-block text-[11px] text-brand-text-muted hover:text-brand-text-primary hover:underline"
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
                              "relative max-w-[760px] w-fit rounded-xl border border-brand-border bg-brand-surface-2 px-4 py-3 text-sm text-brand-text-primary transition-all",
                              isHighlighted && "ring-2 ring-white/40"
                            )}
                          >
                            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-brand-text-muted">
                              <span>➤</span>
                              <span>Token Sent</span>
                              <span className="ml-2 text-[10px] font-normal text-brand-text-muted normal-case tracking-normal">{displayTime(post.timestamp)}</span>
                            </div>
                            <div className="mt-2 flex items-center gap-2">
                              <Avatar name={senderName} size={30} />
                              <div className="text-sm leading-snug">
                                <span className="font-semibold">{senderName}</span>{" "}
                                sent <span className="font-semibold text-brand-text-primary">{sendMatch[1]} {sendMatch[2]}</span>{" "}
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
                            isHighlighted && "ring-2 ring-yellow-400 bg-yellow-400/10",
                            post.pending && "opacity-60"
                          )}
                        >
                          {post.bountyActive && <div className="absolute right-3 top-3 text-brand-text-primary" title="Bounty active">💰</div>}
                          {post.pending && <div className="absolute right-3 top-3 text-[10px] text-brand-text-muted">sending…</div>}

                          {/* Discord-style hover action bar */}
                          {!post.pending && (
                          <div className="absolute -top-4 right-4 z-10 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                            <div className="flex items-center gap-0.5 rounded-full border border-brand-border bg-brand-surface-2 px-1 py-1 shadow-lg">
                              <button
                                aria-label={post.author?.toLowerCase() === wallet.toLowerCase() ? "Can't like your own post" : "Like"}
                                title={post.author?.toLowerCase() === wallet.toLowerCase() ? "You can't like your own post" : "Like"}
                                disabled={busy || post.liked || post.author?.toLowerCase() === wallet.toLowerCase()}
                                onClick={() => likePost(post)}
                                className={cn("p-2 rounded-full hover:bg-white/10 transition-colors disabled:cursor-not-allowed", (post.liked || post.author?.toLowerCase() === wallet.toLowerCase()) && "opacity-40")}
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
                          )}

                          <div className="flex items-center gap-2 pr-8">
                            <Avatar name={post.name || post.author} size={34} />
                            <div className="min-w-0 flex-1">
                              <span className="font-semibold">{post.name || short(post.author)}</span>
                              <span className="ml-2 text-xs text-brand-text-muted">{displayTime(post.timestamp)}</span>
                              <span className="ml-2 text-xs text-brand-text-muted">· ♥ {post.likeCount}</span>
                              {post.bountyActive && commentedPosts[post.id] && (
                                <span className="ml-2 text-[11px] text-brand-text-primary">✓ Bounty claimed</span>
                              )}
                            </div>
                            {(() => {
                              // Reclaim button: visible only to the post
                              // creator on a still-active bounty older than
                              // 24h. Lets them pull back funds nobody claimed.
                              const isMine = post.author?.toLowerCase() === wallet.toLowerCase();
                              const ageSec = Math.floor(Date.now() / 1000) - Number(post.timestamp || 0);
                              const balanceNum = parseFloat(post.bountyBalance || "0");
                              const eligible = isMine && post.bountyActive && balanceNum > 0 && ageSec > 24 * 60 * 60;
                              if (!eligible) return null;
                              return (
                                <button
                                  onClick={() => reclaimBounty(post)}
                                  disabled={busy}
                                  title="Reclaim unclaimed bounty (24h+)"
                                  className="ml-2 px-2.5 h-7 inline-flex items-center gap-1 rounded-full bg-white/10 hover:bg-white/15 border border-brand-border text-[10px] font-bold uppercase tracking-wider text-brand-text-primary transition-colors disabled:opacity-50"
                                >
                                  💰 Reclaim
                                </button>
                              );
                            })()}
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


              {tab === "private" && showChat && [...messages, ...pendingMsgs].sort((a, b) => Number(a.timestamp || a.ts || (a as any).sentAt || 0) - Number(b.timestamp || b.ts || (b as any).sentAt || 0)).map((m, i) => {
                const fromAddr = (m.from || m.wallet || (m as any).fromWallet || (m as any).sender || "").toString();
                const mine = fromAddr.toLowerCase() === wallet.toLowerCase();
                const isOptimistic = typeof m.id === "string" && m.id.startsWith("opt-");
                const optStatus = (m as any).status as ("sending" | "sent" | undefined);
                const confirmed = (m as any).confirmed === true;
                const showOptimisticLabel = isOptimistic && !confirmed;
                const msgType = (m as any).msgType as string | undefined;
                const rawAmount = (m as any).amount;
                const amountNum = rawAmount === undefined || rawAmount === null
                  ? 0
                  : (typeof rawAmount === "string" ? parseFloat(rawAmount) : Number(rawAmount));
                const isTransfer = msgType === "transfer" || (Number.isFinite(amountNum) && amountNum > 0);
                const note = getMessageText(m);
                return (
                  <div key={m.id || i} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                    <div className={cn("max-w-[70%] rounded-lg px-3 py-2 text-sm border", mine ? "bg-white/10 border-white/10 text-brand-text-primary" : "bg-brand-surface border-brand-border text-brand-text-primary", showOptimisticLabel && "opacity-70")}>
                      {isTransfer ? (
                        <>
                          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-brand-text-muted font-bold mb-1">
                            <span>💸</span>
                            <span>{mine ? "Sent" : "Received"} zkLTC</span>
                          </div>
                          <div className="text-base font-bold tabular-nums">
                            {Number.isFinite(amountNum) ? amountNum.toString() : String(rawAmount)} zkLTC
                          </div>
                          {note && note !== "zkLTC" && (
                            <div className="mt-1 text-xs text-brand-text-muted break-words whitespace-pre-wrap">
                              “{note}”
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="break-words whitespace-pre-wrap">{note}</div>
                      )}
                      <div className="mt-1 text-[10px] text-brand-text-muted text-right">
                        {showOptimisticLabel
                          ? (optStatus === "sent" ? "sent · syncing…" : "sending…")
                          : displayTime(m.timestamp || m.createdAt || m.ts || (m as any).sentAt)}
                      </div>
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
                  <span className="truncate opacity-60 hidden sm:inline">{replyTo.content.length > 60 ? `${replyTo.content.slice(0, 60)}…` : replyTo.content}</span>
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
                        className="px-4 h-9 rounded-md bg-white text-black hover:bg-white/90 text-xs font-semibold disabled:opacity-50"
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
                    <label className="block text-[11px] text-brand-text-muted mb-1">Per like reward (zkLTC)</label>
                    <input
                      value={inlineLikeReward}
                      onChange={(e) => setInlineLikeReward(e.target.value)}
                      placeholder="0.01"
                      className="w-full h-8 px-2 mb-2 rounded-md bg-brand-bg border border-brand-border text-xs text-brand-text-primary outline-none"
                    />
                    <label className="block text-[11px] text-brand-text-muted mb-1">How many likes to reward?</label>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs text-brand-text-muted">x</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={1000}
                        step={1}
                         value={inlineBountyMultiplier}
                         placeholder=""
                         onKeyDown={(e) => {
                           if (e.key === "." || e.key === "-" || e.key === "e" || e.key === "E" || e.key === "+") e.preventDefault();
                         }}
                         onChange={(e) => {
                           const raw = e.target.value.replace(/[^0-9]/g, "");
                           setInlineBountyMultiplier(raw);
                         }}
                        className="flex-1 h-8 px-2 rounded-md bg-brand-bg border border-brand-border text-xs text-brand-text-primary outline-none"
                      />
                    </div>
                    <div className="text-[10px] text-brand-text-muted mb-2">Range: x1 to x1000. Integers only.</div>
                     {(() => {
                       const per = Number(inlineLikeReward || 0);
                       const parsed = parseInt(inlineBountyMultiplier, 10);
                       const hasCount = Number.isFinite(parsed) && parsed > 0;
                       const count = hasCount ? Math.max(1, Math.min(1000, parsed)) : 0;
                       const total = per > 0 && count > 0 ? per * count : 0;
                       return (
                         <div className="text-[11px] text-brand-text-primary mb-2">
                           Total bounty: <span className="font-semibold text-brand-text-primary">{total.toFixed(4)} zkLTC</span>
                           <span className="text-brand-text-muted"> ({count} likes × {per || 0} zkLTC each)</span>
                         </div>
                       );
                     })()}
                    <button
                      onClick={async () => {
                        const per = Number(inlineLikeReward || 0);
                        const parsed = parseInt(inlineBountyMultiplier, 10);
                        if (!Number.isFinite(parsed) || parsed <= 0) {
                          try { (await import("sonner")).toast.error("Enter number of likes (1-1000)"); } catch { /* ignore */ }
                          return;
                        }
                        const count = Math.max(1, Math.min(1000, parsed));
                        setInlineBountyMultiplier(String(count));
                        if (per <= 0) return;
                        const total = per * count;
                        setInlineTotalBounty(total.toString());
                        setInlineBountyActive(true);
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
                          setInlineBountyMultiplier("");
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
                  <span className="relative inline-flex items-center gap-1 text-[10px] pl-1.5 pr-5 py-0.5 rounded bg-white/10 text-brand-text-primary border border-brand-border">
                    💰 {inlineBountyTotal}
                    <button
                      type="button"
                      aria-label="Remove bounty"
                      onClick={() => {
                        setInlineBountyActive(false);
                        setInlineLikeReward("");
                        setInlineTotalBounty("");
                        setInlineBountyMultiplier("");
                      }}
                      className="absolute right-0.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-white/20 text-brand-text-muted hover:text-brand-text-primary"
                    >
                      <X size={10} />
                    </button>
                  </span>
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
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] bg-white text-black rounded-xl px-6 py-3 shadow-xl font-bold text-sm pointer-events-none">
          {sendToast}
        </div>
      )}

      {view === "profile" && (
        <div className="fixed top-16 sm:top-20 left-0 right-0 bottom-0 z-[40] bg-brand-bg overflow-y-auto">
          <div className="max-w-5xl mx-auto p-4 sm:p-6 pb-16">
            {/* Top bar */}
            <div className="flex items-center mb-6">
              <button
                onClick={() => setView("chat")}
                className="inline-flex items-center gap-1.5 text-sm text-brand-text-muted hover:text-brand-text-primary transition-colors"
              >
                <ChevronRight className="rotate-180" size={16} /> Back
              </button>
              <h1 className="ml-4 text-base sm:text-lg font-semibold text-brand-text-primary">Profile</h1>
            </div>

            {/* Identity card */}
            <div className="rounded-2xl border border-brand-border bg-gradient-to-br from-brand-surface to-brand-bg p-5 sm:p-6 mb-5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <Avatar name={profileName || namesRef.current[profileAddr.toLowerCase()] || profileAddr} size={84} />
                <div className="min-w-0 flex-1">
                  {(() => {
                    const litName = profileName || (profileAddr.toLowerCase() === wallet.toLowerCase() ? myDisplayName : "") || namesRef.current[profileAddr.toLowerCase()];
                    const hasLit = litName && !litName.startsWith("0x");
                    return (
                      <>
                        <div className="text-2xl font-semibold text-brand-text-primary truncate">
                          {hasLit ? litName : short(profileAddr)}
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-xs text-brand-text-muted font-mono truncate">{short(profileAddr)}</span>
                          <button
                            type="button"
                            aria-label="Copy address"
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(profileAddr);
                                setProfileCopied(true);
                                setTimeout(() => setProfileCopied(false), 1500);
                              } catch { /* ignore */ }
                            }}
                            className="inline-flex items-center gap-1 px-2 h-6 rounded-md bg-white/5 hover:bg-white/10 border border-brand-border text-[10px] text-brand-text-muted hover:text-brand-text-primary transition-colors"
                          >
                            <Copy size={11} />
                            {profileCopied ? "Copied" : "Copy"}
                          </button>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Stat tiles */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
                <div className="rounded-xl border border-brand-border bg-brand-surface px-4 py-3">
                  <div className="text-[10px] uppercase tracking-wider text-brand-text-muted font-semibold">Points</div>
                  <div className="text-xl font-bold text-brand-text-primary mt-1 tabular-nums">{Number(profilePoints || 0).toLocaleString()}</div>
                </div>
                <div className="rounded-xl border border-brand-border bg-brand-surface px-4 py-3">
                  <div className="text-[10px] uppercase tracking-wider text-brand-text-muted font-semibold">zkLTC</div>
                  <div className="text-xl font-bold text-brand-text-primary mt-1 tabular-nums">{(parseFloat(profileBalance) || 0).toFixed(4)}</div>
                </div>
                <div className="rounded-xl border border-brand-border bg-brand-surface px-4 py-3">
                  <div className="text-[10px] uppercase tracking-wider text-brand-text-muted font-semibold">Domains</div>
                  <div className="text-xl font-bold text-brand-text-primary mt-1 tabular-nums">{profileDomains.length}</div>
                </div>
                <div className="rounded-xl border border-brand-border bg-brand-surface px-4 py-3">
                  <div className="text-[10px] uppercase tracking-wider text-brand-text-muted font-semibold">Listings</div>
                  <div className="text-xl font-bold text-brand-text-primary mt-1 tabular-nums">
                    {listingsFull.filter((l) => l.seller?.toLowerCase() === profileAddr.toLowerCase()).length}
                  </div>
                </div>
              </div>
            </div>

            {/* Tabs (only show full tab set for own profile) */}
            {(() => {
              const isMe = profileAddr.toLowerCase() === wallet.toLowerCase();
              const myListings = listingsFull.filter((l) => l.seller?.toLowerCase() === profileAddr.toLowerCase());
              const incomingBids = isMe ? bidsForOwner : [];
              const tabs: Array<{ key: typeof profileTab; label: string; badge?: number; show: boolean }> = [
                { key: "domains", label: "Domains", badge: profileDomains.length, show: true },
                { key: "listings", label: "My Listings", badge: myListings.length, show: true },
                { key: "bids", label: "Incoming Bids", badge: incomingBids.length, show: isMe },
              ];

              return (
                <>
                  <div className="flex items-center gap-1 mb-4 border-b border-brand-border">
                    {tabs.filter((t) => t.show).map((t) => (
                      <button
                        key={t.key}
                        onClick={() => setProfileTab(t.key)}
                        className={cn(
                          "px-4 py-2.5 text-sm font-semibold transition-colors -mb-px border-b-2",
                          profileTab === t.key
                            ? "border-white text-brand-text-primary"
                            : "border-transparent text-brand-text-muted hover:text-brand-text-primary"
                        )}
                      >
                        {t.label}
                        {typeof t.badge === "number" && t.badge > 0 && (
                          <span className={cn(
                            "ml-2 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[10px] font-bold",
                            profileTab === t.key ? "bg-white/15 text-brand-text-primary" : "bg-white/5 text-brand-text-muted"
                          )}>
                            {t.badge}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* DOMAINS TAB */}
                  {profileTab === "domains" && (
                    <div>
                      {profileDomains.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-brand-border bg-brand-surface/50 px-6 py-10 text-center">
                          <Tag size={28} className="mx-auto mb-3 text-brand-text-muted" />
                          <div className="text-sm text-brand-text-muted">No .lit domains owned yet</div>
                          {isMe && (
                            <button
                              onClick={() => setView("market")}
                              className="mt-4 inline-flex items-center gap-1.5 px-4 h-9 rounded-md bg-white hover:bg-white/90 text-black text-xs font-bold transition-colors"
                            >
                              Browse Marketplace <ChevronRight size={14} />
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {profileDomains.map((d) => {
                            const listed = listingsFull.find((l) => l.name === d && l.seller?.toLowerCase() === profileAddr.toLowerCase());
                            return (
                              <div
                                key={d}
                                className="group relative rounded-xl border border-brand-border bg-brand-surface p-4 hover:border-brand-border transition-colors"
                              >
                                <div className="flex items-start justify-between mb-2">
                                  <div className="text-[10px] font-bold tracking-wider text-brand-text-primary">.LIT</div>
                                  {listed && (
                                    <span className="px-2 py-0.5 rounded-full bg-white/10 border border-brand-border text-[10px] font-semibold text-brand-text-primary">
                                      Listed
                                    </span>
                                  )}
                                </div>
                                <div className="text-lg font-semibold text-brand-text-primary truncate" title={d}>{d}</div>
                                {listed && (
                                  <div className="mt-1 text-xs text-brand-text-muted">
                                    Asking <span className="text-brand-text-primary font-semibold">{listed.price} zkLTC</span>
                                  </div>
                                )}
                                {isMe && (
                                  <button
                                    onClick={() => setView("market")}
                                    className="mt-3 w-full h-8 rounded-md bg-white/5 hover:bg-white/10 border border-brand-border text-[11px] font-semibold text-brand-text-primary transition-colors"
                                  >
                                    Manage in Market
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* MY LISTINGS TAB */}
                  {profileTab === "listings" && (
                    <div>
                      {myListings.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-brand-border bg-brand-surface/50 px-6 py-10 text-center">
                          <ShoppingBag size={28} className="mx-auto mb-3 text-brand-text-muted" />
                          <div className="text-sm text-brand-text-muted">No active listings</div>
                          {isMe && (
                            <button
                              onClick={() => setView("market")}
                              className="mt-4 inline-flex items-center gap-1.5 px-4 h-9 rounded-md bg-white hover:bg-white/90 text-black text-xs font-bold transition-colors"
                            >
                              List a Domain <ChevronRight size={14} />
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {myListings.map((l) => {
                            const cardBids = bidsByDomain[l.name] || [];
                            return (
                              <div key={`${l.name}-${l.listedAt}`} className="rounded-xl border border-brand-border bg-brand-surface p-4">
                                <div className="flex items-start justify-between mb-2">
                                  <div>
                                    <div className="text-[10px] font-bold tracking-wider text-brand-text-primary">.LIT</div>
                                    <div className="text-lg font-semibold text-brand-text-primary truncate">{l.name}</div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-xl font-bold text-brand-text-primary tabular-nums">{l.price}</div>
                                    <div className="text-[10px] text-brand-text-muted">zkLTC</div>
                                  </div>
                                </div>
                                <div className="text-[11px] text-brand-text-muted">
                                  Listed {l.listedAt ? displayTime(l.listedAt) : "recently"} ·{" "}
                                  <span className="text-brand-text-primary font-semibold">{cardBids.length}</span> bid{cardBids.length === 1 ? "" : "s"}
                                </div>
                                {isMe && (
                                  <div className="flex gap-2 mt-3">
                                    <button
                                      disabled={busy}
                                      onClick={async () => {
                                        setBusy(true);
                                        try {
                                          const c = await getMarketplaceContract();
                                          console.log("[Market] unlistName()", l.name);
                                          const tx = await c.unlistName(l.name);
                                          await tx.wait();
                                          console.log("[Market] unlist confirmed");
                                          addNotif(wallet, { type: "gf", title: "Listing removed", message: `${l.name} unlisted from market`, link: "/chat" });
                                          await loadListings();
                                          showSuccess({
                                            title: "DOMAIN UNLISTED",
                                            rows: [
                                              { label: "NAME", value: `${l.name}.lit` },
                                              { label: "TX", value: `${tx.hash.slice(0, 10)}...` },
                                            ],
                                          });
                                        } catch (err: any) {
                                          const msg = err?.shortMessage || err?.reason || err?.message || "Unlist failed";
                                          showError(msg);
                                        } finally { setBusy(false); }
                                      }}
                                      className="flex-1 h-9 rounded-md border border-brand-border text-xs font-semibold text-brand-text-primary hover:bg-white/5 disabled:opacity-50 transition-colors"
                                    >
                                      Unlist
                                    </button>
                                    {cardBids.length > 0 && (
                                      <button
                                        onClick={() => setProfileTab("bids")}
                                        className="flex-1 h-9 rounded-md bg-white text-black hover:bg-white/90 text-xs font-bold transition-colors"
                                      >
                                        View {cardBids.length} bid{cardBids.length === 1 ? "" : "s"}
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* INCOMING BIDS TAB (own profile only) */}
                  {profileTab === "bids" && isMe && (
                    <div>
                      {incomingBids.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-brand-border bg-brand-surface/50 px-6 py-10 text-center">
                          <TrendingUp size={28} className="mx-auto mb-3 text-brand-text-muted" />
                          <div className="text-sm text-brand-text-muted">No incoming bids on your listings</div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {incomingBids
                            .slice()
                            .sort((a, b) => b.bidAt - a.bidAt)
                            .map((b, i) => (
                              <div key={`${b.domain}-${b.bidder}-${i}`} className="rounded-xl border border-brand-border bg-brand-surface p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                                <Avatar name={b.bidderName || b.bidder} size={40} />
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm text-brand-text-primary">
                                    <span className="font-semibold">{b.bidderName || short(b.bidder)}</span>
                                    {" "}bid{" "}
                                    <span className="font-bold text-brand-text-primary">{b.amount} zkLTC</span>
                                    {" "}on{" "}
                                    <span className="font-semibold">{b.domain}</span>
                                  </div>
                                  <div className="text-[11px] text-brand-text-muted mt-0.5">
                                    {b.bidAt ? displayTime(b.bidAt) : "just now"}
                                  </div>
                                </div>
                                <div className="flex gap-2 self-stretch sm:self-auto">
                                  <button
                                    disabled={busy}
                                    onClick={() => acceptBid(b.domain, b.bidder, b.amount)}
                                    className="px-4 h-9 rounded-md bg-white hover:bg-white/90 text-black text-xs font-bold disabled:opacity-50 transition-colors"
                                  >
                                    Accept
                                  </button>
                                  <button
                                    disabled={busy}
                                    onClick={() => rejectBid(b.domain, b.bidder)}
                                    className="px-4 h-9 rounded-md border border-brand-border text-xs font-semibold text-brand-text-primary hover:bg-white/5 disabled:opacity-50 transition-colors"
                                  >
                                    Reject
                                  </button>
                                </div>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}

      {view === "market" && (
        <div className="fixed top-16 sm:top-20 left-0 right-0 bottom-0 z-[40] bg-brand-bg overflow-y-auto">
          <div className="max-w-7xl mx-auto p-4 sm:p-6 pb-32">
            {/* Top bar */}
            <div className="flex items-center mb-5">
              <button
                onClick={() => setView("chat")}
                className="inline-flex items-center gap-1.5 text-sm text-brand-text-muted hover:text-brand-text-primary transition-colors"
              >
                <ChevronRight className="rotate-180" size={16} /> Back
              </button>
              <h1 className="ml-4 text-base sm:text-lg font-semibold text-brand-text-primary">.lit Domain Marketplace</h1>
            </div>

            {/* Hero stats */}
            {(() => {
              const myListings = listingsFull.filter((l) => l.seller?.toLowerCase() === wallet.toLowerCase());
              const totalVolume = soldItems.reduce((sum, s) => sum + (parseFloat(s.price) || 0), 0);
              return (
                <div className="rounded-2xl border border-brand-border bg-gradient-to-br from-white/5 via-brand-surface to-brand-bg p-5 sm:p-6 mb-5">
                  <div className="flex flex-col lg:flex-row lg:items-end gap-4">
                    <div className="flex-1">
                      <div className="text-[10px] uppercase tracking-[0.25em] text-brand-text-primary font-bold mb-1">Verified Marketplace</div>
                      <h2 className="text-2xl sm:text-3xl font-bold text-brand-text-primary tracking-tight">Trade .lit Domains</h2>
                      <p className="text-xs text-brand-text-muted mt-2 max-w-md">
                        Discover, bid on, and sell ownership of .lit names on the LiteForge network.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 lg:gap-3 lg:w-auto w-full">
                      <div className="rounded-xl bg-black/30 border border-brand-border px-3 py-2.5 backdrop-blur-sm">
                        <div className="text-[9px] uppercase tracking-wider text-brand-text-muted font-bold">Listings</div>
                        <div className="text-lg font-bold text-brand-text-primary tabular-nums">{listingsFull.length}</div>
                      </div>
                      <div className="rounded-xl bg-black/30 border border-brand-border px-3 py-2.5 backdrop-blur-sm">
                        <div className="text-[9px] uppercase tracking-wider text-brand-text-muted font-bold">Sold</div>
                        <div className="text-lg font-bold text-brand-text-primary tabular-nums">{soldItems.length}</div>
                      </div>
                      <div className="rounded-xl bg-black/30 border border-brand-border px-3 py-2.5 backdrop-blur-sm">
                        <div className="text-[9px] uppercase tracking-wider text-brand-text-muted font-bold">Volume</div>
                        <div className="text-lg font-bold text-brand-text-primary tabular-nums">{totalVolume.toFixed(2)}</div>
                      </div>
                      <div className="rounded-xl bg-black/30 border border-brand-border px-3 py-2.5 backdrop-blur-sm">
                        <div className="text-[9px] uppercase tracking-wider text-brand-text-muted font-bold">Yours</div>
                        <div className="text-lg font-bold text-brand-text-primary tabular-nums">{myListings.length}</div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Incoming bids alert (only when user has any) */}
            {bidsForOwner.length > 0 && (
              <button
                onClick={() => { setProfileAddr(wallet); setProfileTab("bids"); setView("profile"); }}
                className="w-full mb-5 rounded-xl border border-brand-border bg-white/5 hover:bg-white/10 px-4 py-3 flex items-center gap-3 text-left transition-colors"
              >
                <div className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center">
                  <TrendingUp size={16} className="text-brand-text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-brand-text-primary">
                    {bidsForOwner.length} pending bid{bidsForOwner.length === 1 ? "" : "s"} on your listing{bidsForOwner.length === 1 ? "" : "s"}
                  </div>
                  <div className="text-[11px] text-brand-text-muted">Tap to review and accept or reject</div>
                </div>
                <ChevronRight size={18} className="text-brand-text-primary" />
              </button>
            )}

          {/* Recently Sold inline ticker (moved from bottom — sits above
              listings so the bottom navbar / page chrome is never overlaid). */}
          {soldItems.length > 0 && (
            <div className="rounded-xl border border-brand-border bg-brand-surface mb-5 overflow-hidden">
              <div className="px-3 py-1.5 border-b border-brand-border text-[10px] uppercase tracking-[0.18em] text-brand-text-muted font-bold flex items-center gap-2">
                <Tag size={11} /> Recently Sold
              </div>
              <div className="overflow-hidden">
                <div className="flex gap-8 whitespace-nowrap py-2 px-4 animate-[marquee_40s_linear_infinite] text-[11px] text-brand-text-primary">
                  {[...soldItems, ...soldItems].slice(0, 16).map((s, i) => (
                    <span key={i}>
                      🏷️ <span className="font-semibold">{s.domain}</span> sold for <span className="font-semibold">{s.price} zkLTC</span> · {displayTime(s.soldAt)}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

            {/* My Domains panel — collapsed by default so it doesn't
                push the marketplace listings below the fold. Click to
                expand and quickly list / unlist / send. */}
            {wallet && myDomains.length > 0 && (
              <div className="mb-6">
                <button
                  type="button"
                  onClick={() => setYourDomainsOpen((v) => !v)}
                  className="w-full flex items-center justify-between rounded-xl border border-brand-border bg-brand-surface px-4 py-3 hover:bg-white/[0.04] transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Tag size={14} className="text-brand-text-muted" />
                    <span className="text-sm font-semibold text-brand-text-primary">Your Domains</span>
                    <span className="text-[11px] text-brand-text-muted">({myDomains.length})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        setProfileAddr(wallet);
                        setProfileTab("domains");
                        setView("profile");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setProfileAddr(wallet);
                          setProfileTab("domains");
                          setView("profile");
                        }
                      }}
                      className="text-[11px] text-brand-text-muted hover:text-brand-text-primary transition-colors inline-flex items-center gap-1 cursor-pointer"
                    >
                      View all <ChevronRight size={12} />
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center justify-center h-6 w-6 rounded-md border border-brand-border text-brand-text-muted transition-transform",
                        yourDomainsOpen && "rotate-180"
                      )}
                    >
                      <ChevronUp size={14} />
                    </span>
                  </div>
                </button>
                {yourDomainsOpen && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {myDomains.map((d) => {
                    const existing = listingsFull.find((l) => l.name === d && l.seller?.toLowerCase() === wallet.toLowerCase());
                    return (
                      <div key={d} className="rounded-xl border border-brand-border bg-brand-surface p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <div className="text-[10px] font-bold tracking-wider text-brand-text-primary">.LIT</div>
                            <div className="text-base font-semibold text-brand-text-primary truncate">{d}</div>
                          </div>
                          {existing ? (
                            <span className="px-2 py-0.5 rounded-full bg-white/10 border border-brand-border text-[10px] font-semibold text-brand-text-primary">
                              Listed · {existing.price}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-white/5 border border-brand-border text-[10px] font-medium text-brand-text-muted">
                              Not listed
                            </span>
                          )}
                        </div>
                        {!existing ? (
                          <div className="flex gap-2">
                            <input
                              value={listPriceFor[d] || ""}
                              onChange={(e) => setListPriceFor((p) => ({ ...p, [d]: e.target.value }))}
                              placeholder="Price (zkLTC)"
                              inputMode="decimal"
                              className="flex-1 h-9 px-3 rounded-md bg-brand-bg border border-brand-border text-sm text-brand-text-primary placeholder:text-brand-text-muted outline-none focus:border-white/40"
                            />
                            <button
                              disabled={busy || !(listPriceFor[d] || "").trim() || parseFloat(listPriceFor[d] || "0") <= 0}
                              onClick={async () => {
                                setBusy(true);
                                try {
                                  const c = await getMarketplaceContract();
                                  const priceWei = parseEther(listPriceFor[d]);
                                  console.log("[Market] listName()", { name: d, price: listPriceFor[d] });
                                  const tx = await c.listName(d, priceWei);
                                  await tx.wait();
                                  console.log("[Market] list confirmed");
                                  addNotif(wallet, {
                                    type: "gf",
                                    title: "Domain listed",
                                    message: `${d} listed for ${listPriceFor[d]} zkLTC`,
                                    link: "/chat",
                                  });
                                  const priceLabel = listPriceFor[d];
                                  setListPriceFor((p) => ({ ...p, [d]: "" }));
                                  await loadListings();
                                  showSuccess({
                                    title: "DOMAIN LISTED",
                                    subtitle: "ON THE MARKETPLACE",
                                    rows: [
                                      { label: "NAME", value: `${d}.lit` },
                                      { label: "PRICE", value: `${priceLabel} zkLTC` },
                                      { label: "TX", value: `${tx.hash.slice(0, 10)}...` },
                                    ],
                                  });
                                } catch (err: any) {
                                  const msg = err?.shortMessage || err?.reason || err?.message || "List failed";
                                  showError(msg);
                                } finally { setBusy(false); }
                              }}
                              className="h-9 px-3 rounded-md bg-white text-black hover:bg-white/90 text-xs font-bold disabled:opacity-50 transition-colors"
                            >
                              List
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              disabled={busy}
                              onClick={async () => {
                                setBusy(true);
                                try {
                                  const c = await getMarketplaceContract();
                                  console.log("[Market] unlistName()", d);
                                  const tx = await c.unlistName(d);
                                  await tx.wait();
                                  console.log("[Market] unlist confirmed");
                                  addNotif(wallet, { type: "gf", title: "Listing removed", message: `${d} unlisted`, link: "/chat" });
                                  await loadListings();
                                  showSuccess({
                                    title: "DOMAIN UNLISTED",
                                    rows: [
                                      { label: "NAME", value: `${d}.lit` },
                                      { label: "TX", value: `${tx.hash.slice(0, 10)}...` },
                                    ],
                                  });
                                } catch (err: any) {
                                  const msg = err?.shortMessage || err?.reason || err?.message || "Unlist failed";
                                  showError(msg);
                                } finally { setBusy(false); }
                              }}
                              className="flex-1 h-9 rounded-md border border-brand-border text-xs font-semibold text-brand-text-primary hover:bg-white/5 disabled:opacity-50 transition-colors"
                            >
                              Unlist
                            </button>
                            {(bidsByDomain[d]?.length || 0) > 0 && (
                              <button
                                onClick={() => { setProfileAddr(wallet); setProfileTab("bids"); setView("profile"); }}
                                className="flex-1 h-9 rounded-md bg-white text-black hover:bg-white/90 text-xs font-bold transition-colors"
                              >
                                {bidsByDomain[d]?.length} bid{(bidsByDomain[d]?.length || 0) === 1 ? "" : "s"}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                )}
              </div>
            )}

            {/* Search + filter bar */}
            <div className="sticky top-0 z-10 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 mb-4 bg-brand-bg/95 backdrop-blur-md border-b border-brand-border">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-brand-text-muted" />
                  <input
                    value={marketSearch}
                    onChange={(e) => setMarketSearch(e.target.value)}
                    placeholder="Search .lit domains"
                    className="w-full h-10 pl-10 pr-3 rounded-lg bg-brand-surface border border-brand-border text-sm text-brand-text-primary placeholder:text-brand-text-muted outline-none focus:border-brand-border transition-colors"
                  />
                </div>
                <div className="flex items-center gap-1.5 overflow-x-auto -mx-1 px-1 scrollbar-none">
                  {([
                    ["all", "All", null],
                    ["latest", "New", null],
                    ["low", "Low → High", null],
                    ["high", "High → Low", null],
                    ["sold", "Recently Sold", null],
                  ] as const).map(([k, lbl]) => (
                    <button
                      key={k}
                      onClick={() => setMarketFilter(k as any)}
                      className={cn(
                        "shrink-0 px-3.5 h-9 rounded-lg text-xs font-semibold transition-colors",
                        marketFilter === k
                          ? "bg-brand-text-primary text-brand-bg"
                          : "border border-brand-border text-brand-text-muted hover:text-brand-text-primary hover:bg-white/5"
                      )}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Listings grid OR sold list */}
            {marketFilter === "sold" ? (
              <div className="space-y-2">
                {soldItems.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-brand-border bg-brand-surface/50 px-6 py-12 text-center">
                    <ShoppingBag size={28} className="mx-auto mb-3 text-brand-text-muted" />
                    <div className="text-sm text-brand-text-muted">No recent sales yet</div>
                  </div>
                ) : (
                  soldItems.map((s, i) => (
                    <div key={`${s.domain}-${i}`} className="rounded-xl border border-brand-border bg-white/[0.04] px-4 py-3 flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-white/10 flex items-center justify-center">
                        <Tag size={14} className="text-brand-text-primary" />
                      </div>
                      <div className="min-w-0 flex-1 text-sm">
                        <span className="font-semibold text-brand-text-primary">{short(s.buyer)}</span>
                        <span className="text-brand-text-muted"> bought </span>
                        <span className="font-semibold text-brand-text-primary">{s.domain}</span>
                        <span className="text-brand-text-muted"> from </span>
                        <span className="font-semibold text-brand-text-primary">{short(s.seller)}</span>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold text-brand-text-primary tabular-nums">{s.price} zkLTC</div>
                        <div className="text-[10px] text-brand-text-muted">{displayTime(s.soldAt)}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              (() => {
                let sorted = [...listingsFull];
                if (marketSearch.trim()) {
                  const q = marketSearch.trim().toLowerCase();
                  sorted = sorted.filter((l) => l.name.toLowerCase().includes(q));
                }
                if (marketFilter === "latest") sorted.sort((a, b) => b.listedAt - a.listedAt);
                else if (marketFilter === "low") sorted.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
                else if (marketFilter === "high") sorted.sort((a, b) => parseFloat(b.price) - parseFloat(a.price));

                if (sorted.length === 0) {
                  return (
                    <div className="rounded-xl border border-dashed border-brand-border bg-brand-surface/50 px-6 py-12 text-center">
                      <Filter size={28} className="mx-auto mb-3 text-brand-text-muted" />
                      <div className="text-sm text-brand-text-muted">
                        {marketSearch.trim() ? `No domains match "${marketSearch.trim()}"` : "No active listings yet"}
                      </div>
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {sorted.map((l) => {
                      const cardBids = bidsByDomain[l.name] || [];
                      const isMine = l.seller?.toLowerCase() === wallet.toLowerCase();
                      const showBidInput = bidInputs[l.name] !== undefined;
                      return (
                        <div
                          key={`${l.name}-${l.seller}`}
                          className="group rounded-xl border border-brand-border bg-brand-surface overflow-hidden hover:border-brand-border hover:shadow-2xl hover:shadow-white/5 transition-all"
                        >
                          {/* Card header */}
                          <div className="relative h-28 bg-gradient-to-br from-white/10 via-white/5 to-transparent flex items-center justify-center">
                            <div className="text-center">
                              <div className="text-[9px] font-bold tracking-[0.3em] text-brand-text-primary">.LIT</div>
                              <div className="text-xl font-bold text-brand-text-primary mt-0.5 px-3 truncate max-w-[200px]">{l.name}</div>
                            </div>
                            {cardBids.length > 0 && (
                              <span className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/60 border border-brand-border text-[10px] font-semibold text-brand-text-primary backdrop-blur-sm">
                                <TrendingUp size={10} /> {cardBids.length}
                              </span>
                            )}
                            {isMine && (
                              <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/60 border border-brand-border text-[10px] font-semibold text-brand-text-muted backdrop-blur-sm">
                                Yours
                              </span>
                            )}
                          </div>
                          {/* Card body */}
                          <div className="p-3.5">
                            <div className="flex items-center justify-between mb-1">
                              <div className="text-[10px] uppercase tracking-wider text-brand-text-muted font-semibold">Price</div>
                              <div className="text-[10px] text-brand-text-muted">{l.listedAt ? displayTime(l.listedAt) : ""}</div>
                            </div>
                            <div className="flex items-baseline gap-1">
                              <span className="text-2xl font-bold text-brand-text-primary tabular-nums">{l.price}</span>
                              <span className="text-xs text-brand-text-muted font-semibold">zkLTC</span>
                            </div>
                            <div className="text-[11px] text-brand-text-muted mt-1.5 truncate">
                              by <button
                                type="button"
                                onClick={() => { setProfileAddr(l.seller); setProfileTab("listings"); setView("profile"); }}
                                className="hover:text-brand-text-primary hover:underline transition-colors"
                              >
                                {short(l.seller)}
                              </button>
                            </div>
                            {/* Action buttons */}
                            {!isMine && (
                              <div className="flex gap-2 mt-3">
                                <button
                                  disabled={busy || !wallet}
                                  onClick={async () => {
                                    setBusy(true);
                                    try {
                                      const c = await getMarketplaceContract();
                                      const priceWei = parseEther(l.price);
                                      console.log("[Market] buyName()", { name: l.name, price: l.price });
                                      const tx = await c.buyName(l.name, { value: priceWei });
                                      await tx.wait();
                                      console.log("[Market] buy confirmed");
                                      addNotif(wallet, { type: "gf", title: "Domain purchased", message: `Bought ${l.name} for ${l.price} zkLTC`, link: "/chat" });
                                      addNotif(l.seller, { type: "gf", title: "Domain sold", message: `${short(wallet)} bought ${l.name} for ${l.price} zkLTC`, link: "/chat" });
                                      await Promise.all([loadListings(), loadMyDomains(), loadBidsByDomain()]);
                                      showSuccess({
                                        title: "DOMAIN PURCHASED",
                                        subtitle: "WELCOME TO YOUR NEW NAME",
                                        rows: [
                                          { label: "NAME", value: `${l.name}.lit` },
                                          { label: "PRICE", value: `${l.price} zkLTC` },
                                          { label: "TX", value: `${tx.hash.slice(0, 10)}...` },
                                        ],
                                      });
                                    } catch (err: any) {
                                      const msg = err?.shortMessage || err?.reason || err?.message || "Buy failed";
                                      showError(msg);
                                    } finally { setBusy(false); }
                                  }}
                                  className="flex-1 h-9 rounded-md bg-white text-black hover:bg-white/90 text-xs font-bold disabled:opacity-40 transition-colors"
                                >
                                  Buy Now
                                </button>
                                <button
                                  disabled={busy}
                                  onClick={() => setBidInputs((p) => ({ ...p, [l.name]: p[l.name] ?? "" }))}
                                  className="flex-1 h-9 rounded-md border border-brand-border text-xs font-bold text-brand-text-primary hover:bg-white/5 disabled:opacity-40 transition-colors"
                                >
                                  Place Bid
                                </button>
                              </div>
                            )}
                            {isMine && (
                              <button
                                onClick={() => { setProfileAddr(wallet); setProfileTab("listings"); setView("profile"); }}
                                className="mt-3 w-full h-9 rounded-md border border-brand-border text-xs font-semibold text-brand-text-primary hover:bg-white/5 transition-colors"
                              >
                                Manage Listing
                              </button>
                            )}
                            {showBidInput && !isMine && (
                              <div className="mt-2 space-y-2">
                                <div className="flex gap-2">
                                  <input
                                    autoFocus
                                    value={bidInputs[l.name]}
                                    onChange={(e) => setBidInputs((p) => ({ ...p, [l.name]: e.target.value }))}
                                    placeholder="zkLTC bid"
                                    inputMode="decimal"
                                    className="flex-1 h-8 px-2 rounded-md bg-brand-bg border border-brand-border text-xs text-brand-text-primary placeholder:text-brand-text-muted outline-none focus:border-white/40"
                                  />
                                  <button
                                    disabled={busy || !(bidInputs[l.name] || "").trim() || parseFloat(bidInputs[l.name] || "0") <= 0}
                                    onClick={async () => {
                                      const amount = bidInputs[l.name];
                                      setBusy(true);
                                      try {
                                        const c = await getMarketplaceContract();
                                        const amountWei = parseEther(amount);
                                        console.log("[Market] placeBid()", { name: l.name, amount });
                                        const tx = await c.placeBid(l.name, { value: amountWei });
                                        await tx.wait();
                                        console.log("[Market] bid confirmed");
                                        addNotif(wallet, { type: "gf", title: "Bid placed", message: `Bid ${amount} zkLTC on ${l.name}`, link: "/chat" });
                                        addNotif(l.seller, { type: "gf", title: "New bid received", message: `${short(wallet)} bid ${amount} zkLTC on ${l.name}`, link: "/chat" });
                                        setBidInputs((p) => { const n = { ...p }; delete n[l.name]; return n; });
                                        await loadBidsByDomain();
                                        showSuccess({
                                          title: "BID PLACED",
                                          subtitle: "WAITING FOR SELLER",
                                          rows: [
                                            { label: "NAME", value: `${l.name}.lit` },
                                            { label: "AMOUNT", value: `${amount} zkLTC` },
                                            { label: "TX", value: `${tx.hash.slice(0, 10)}...` },
                                          ],
                                        });
                                      } catch (err: any) {
                                        const msg = err?.shortMessage || err?.reason || err?.message || "Bid failed";
                                        showError(msg);
                                      } finally { setBusy(false); }
                                    }}
                                    className="h-8 px-3 rounded-md bg-white text-black hover:bg-white/90 text-xs font-bold disabled:opacity-40 transition-colors"
                                  >
                                    Submit
                                  </button>
                                  <button
                                    onClick={() => setBidInputs((p) => { const n = { ...p }; delete n[l.name]; return n; })}
                                    aria-label="Cancel bid"
                                    className="h-8 w-8 rounded-md border border-brand-border text-brand-text-muted hover:text-brand-text-primary inline-flex items-center justify-center"
                                  >
                                    <X size={12} />
                                  </button>
                                </div>
                              </div>
                            )}
                            {cardBids.length > 0 && (
                              <div className="mt-3 pt-2.5 border-t border-brand-border space-y-1">
                                <div className="text-[10px] uppercase tracking-wider text-brand-text-muted font-semibold mb-1">Top Bids</div>
                                {cardBids.slice(0, 2).map((b, i) => (
                                  <div key={i} className="flex items-center justify-between text-[11px]">
                                    <span className="text-brand-text-muted truncate">{short(b.bidder)}</span>
                                    <span className="text-brand-text-primary font-semibold tabular-nums shrink-0 ml-2">{b.amount} zkLTC</span>
                                  </div>
                                ))}
                                {cardBids.length > 2 && (
                                  <div className="text-[10px] text-brand-text-muted">+{cardBids.length - 2} more</div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()
            )}
          </div>

          {/* (Recently Sold ticker moved up into the listings flow — see
              the inline panel above. The fixed-bottom version was hiding
              the page footer / next view's content below it.) */}
        </div>
      )}

      {view === "buy" && (
        <div className="fixed top-16 sm:top-20 left-0 right-0 bottom-0 z-[40] bg-brand-bg overflow-y-auto">
          <div className="max-w-5xl mx-auto p-4 sm:p-6 pb-24">
            {/* Header */}
            <div className="flex items-center mb-6">
              <button
                onClick={() => setView("chat")}
                className="inline-flex items-center gap-1.5 text-sm text-brand-text-muted hover:text-brand-text-primary transition-colors"
              >
                <ChevronRight size={14} className="rotate-180" />
                Back
              </button>
              <h1 className="ml-4 text-lg sm:text-xl font-bold text-brand-text-primary">Buy .lit Domain</h1>
              <button
                onClick={() => wallet && (setProfileAddr(wallet), setProfileTab("domains"), setView("profile"))}
                disabled={!wallet}
                className="ml-auto px-3 h-9 rounded-md border border-brand-border text-xs font-semibold text-brand-text-primary hover:bg-white/5 transition-colors disabled:opacity-50"
              >
                My Domains
              </button>
            </div>

            {/* Hero */}
            <div className="rounded-2xl border border-brand-border bg-gradient-to-br from-white/5 via-brand-surface to-white/5 p-6 sm:p-8 mb-6">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-brand-text-primary">.lit Identity</span>
                <span className="px-2 py-0.5 rounded-full bg-white/10 border border-brand-border text-[10px] font-semibold text-brand-text-primary">On-chain</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-brand-text-primary mb-2">
                Claim your .lit name
              </h2>
              <p className="text-sm text-brand-text-muted max-w-2xl">
                Use any character in the world. Letters, numbers, emojis, symbols, fonts. Your .lit becomes your identity for chat, posts, transfers, and the marketplace.
              </p>
            </div>

            {/* Card: input + duration + register */}
            <div className="rounded-2xl border border-brand-border bg-brand-surface p-5 sm:p-6 mb-6">
              <label className="block text-[11px] uppercase tracking-wider font-semibold text-brand-text-muted mb-2">Choose your name</label>
              <div className="relative">
                <input
                  value={buyName}
                  onChange={(e) => setBuyName(e.target.value)}
                  placeholder="anything · 你好 · ✨ · 𝓢𝓪𝓬𝓱𝓲𝓷"
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                  className={cn(
                    "w-full h-16 sm:h-20 px-4 sm:px-5 pr-28 sm:pr-36 rounded-xl bg-brand-bg border-2 text-2xl sm:text-3xl font-bold text-brand-text-primary outline-none transition-colors",
                    buyAvailable === "available" && "border-white/60",
                    buyAvailable === "taken" && "border-red-500/60",
                    buyAvailable === "invalid" && "border-amber-500/60",
                    (buyAvailable === "idle" || buyAvailable === "checking") && "border-brand-border focus:border-brand-border",
                  )}
                />
                <span className="pointer-events-none absolute right-4 sm:right-5 top-1/2 -translate-y-1/2 text-lg sm:text-xl font-bold text-brand-text-muted">.lit</span>
              </div>

              {/* Status row */}
              <div className="mt-3 min-h-[20px] flex items-center gap-2 text-xs">
                {buyName.trim() === "" && (
                  <span className="text-brand-text-muted">Type any character. Emoji, fancy fonts, unicode all work.</span>
                )}
                {buyAvailable === "checking" && (
                  <span className="text-brand-text-muted inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" /> Checking…
                  </span>
                )}
                {buyAvailable === "available" && (
                  <span className="text-brand-text-primary font-semibold inline-flex items-center gap-1.5">
                    <Check size={12} /> {buyName}.lit is available
                  </span>
                )}
                {buyAvailable === "taken" && (
                  <span className="text-red-400 font-semibold inline-flex items-center gap-1.5">
                    <X size={12} /> {buyName}.lit is already taken
                  </span>
                )}
                {buyAvailable === "invalid" && (
                  <span className="text-amber-300 font-semibold">Cannot contain spaces or dots</span>
                )}
              </div>

              {/* Live preview */}
              {buyName.trim() !== "" && (
                <div className="mt-4 p-4 rounded-xl bg-brand-bg border border-brand-border">
                  <div className="text-[10px] uppercase tracking-wider text-brand-text-muted mb-2 font-semibold">Live preview</div>
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-gradient-to-br from-white/30 to-white/10 inline-flex items-center justify-center text-xl font-bold text-white shrink-0">
                      {Array.from(buyName)[0] || "?"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-lg font-bold text-brand-text-primary truncate">{buyName}.lit</div>
                      <div className="text-xs text-brand-text-muted truncate">{wallet ? short(wallet) : "Connect wallet to register"}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Duration */}
              <div className="mt-6">
                <label className="block text-[11px] uppercase tracking-wider font-semibold text-brand-text-muted mb-2">Duration</label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {BUY_DURATION_OPTIONS.map((d) => (
                    <button
                      key={d.value}
                      onClick={() => setBuyDuration(d.value)}
                      className={cn(
                        "relative p-3 rounded-xl border text-left transition-colors",
                        buyDuration === d.value
                          ? "border-white/60 bg-white/5"
                          : "border-brand-border bg-brand-bg hover:bg-white/5",
                      )}
                    >
                      {d.tag && (
                        <span className="absolute -top-2 right-2 px-1.5 py-0.5 rounded-full bg-white text-[9px] font-bold text-black uppercase tracking-wider">{d.tag}</span>
                      )}
                      <div className="text-sm font-bold text-brand-text-primary">{d.label}</div>
                      <div className="text-xs text-brand-text-primary font-semibold tabular-nums mt-1">{d.price} zkLTC</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* CTA */}
              <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1">
                  <div className="text-[11px] uppercase tracking-wider text-brand-text-muted font-semibold">Total</div>
                  <div className="text-2xl font-bold text-brand-text-primary tabular-nums">{buyPrice} <span className="text-sm font-semibold text-brand-text-primary">zkLTC</span></div>
                </div>
                <button
                  disabled={buyBusy || !wallet || buyAvailable !== "available"}
                  onClick={registerLitName}
                  className="h-12 px-6 rounded-xl bg-white hover:bg-white/90 text-black text-sm font-extrabold disabled:opacity-40 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center gap-2"
                >
                  {buyBusy
                    ? "Registering…"
                    : !wallet
                      ? "Connect wallet"
                      : buyAvailable === "available"
                        ? `Register ${buyName}.lit →`
                        : "Pick a name"}
                </button>
              </div>

              {buySuccess && (
                <div className="mt-4 p-3 rounded-xl bg-white/5 border border-brand-border text-sm text-brand-text-primary inline-flex items-center gap-2">
                  <Check size={14} /> Registered <span className="font-bold">{buySuccess}.lit</span>. Visible in your profile.
                </div>
              )}
            </div>

            {/* Existing domains panel */}
            {wallet && (
              <div className="rounded-2xl border border-brand-border bg-brand-surface p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-bold text-brand-text-primary">Your .lit names</div>
                  <button
                    onClick={() => { setProfileAddr(wallet); setProfileTab("domains"); setView("profile"); }}
                    className="text-xs text-brand-text-primary hover:text-brand-text-primary font-semibold"
                  >
                    View profile →
                  </button>
                </div>
                {myDomains.length === 0 ? (
                  <div className="text-xs text-brand-text-muted">No .lit names yet. Register your first above.</div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {myDomains.map((d) => (
                      <span key={d} className="px-3 py-1.5 rounded-full bg-brand-bg border border-brand-border text-xs font-semibold text-brand-text-primary">
                        {d}.lit
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Inspiration tips */}
            <div className="mt-6 rounded-2xl border border-brand-border bg-brand-surface p-5">
              <div className="text-sm font-bold text-brand-text-primary mb-3">💡 Try any of these styles</div>
              <div className="flex flex-wrap gap-2">
                {["sachin", "alice", "🚀rocket", "𝒮𝒶𝒸𝒽𝒾𝓃", "ᴅᴀʀᴋ", "你好", "café", "金融", "♛king", "✨vibe"].map((s) => (
                  <button
                    key={s}
                    onClick={() => setBuyName(s)}
                    className="px-3 py-1.5 rounded-full bg-brand-bg border border-brand-border text-xs text-brand-text-primary hover:border-brand-border transition-colors"
                  >
                    {s}.lit
                  </button>
                ))}
              </div>
            </div>
          </div>
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
