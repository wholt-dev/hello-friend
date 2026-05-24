// HUB — LitDEX Hub contract addresses, ABIs & API client
import { BrowserProvider, Contract, JsonRpcProvider, parseEther, formatEther } from "ethers";

export const HUB_CHAIN_ID = 4441;
export const HUB_CHAIN_HEX = "0x1159";
export const HUB_RPC = "https://liteforge.rpc.caldera.xyz/http";
export const HUB_EXPLORER = "https://liteforge.explorer.caldera.xyz";
export const HUB_API_BASE = "http://155.133.23.14:3005";

export const HUB_ADDR = {
  registry: "0x3E3aEE6d154f881A7418b2dA50c915C34664C2A8",
  posts: "0x33690545061cF3759350dd2C5A0d1080D9A14D73",
  marketplace: "0x9cc6e4BB66EC19475d9db8082482Eb272cf6eA02",
  messenger: "0x69405b51963D592C6CA9350F774045d4E76c89B8",
  transfer: "0xaA6154Fa2E03A2dFf6b4Ca85f31334652C2dcF11",
};

export const REGISTRY_ABI = [
  "function register(string name, uint8 duration) external payable",
  "function isAvailable(string name) external view returns (bool)",
  "function resolve(string name) external view returns (address)",
  "function reverseResolve(address wallet) external view returns (string)",
  "function getPrice(uint8 duration) external view returns (uint256)",
  "function setProfile(string name, string avatar, string bio) external",
  "function transfer(string name, address to) external",
  "function setOperatorApproval(address operator, bool approved) external",
  "function names(string) external view returns (address owner, uint256 expiresAt, string avatar, string bio)",
] as const;

export const POSTS_ABI = [
  "function createPost(string content, uint256 likeReward, uint256 commentReward) external payable returns (uint256)",
  "function likePost(uint256 postId) external",
  "function commentPost(uint256 postId, string text) external",
  "function rechargeBounty(uint256 postId) external payable",
  "function withdrawBounty(uint256 postId) external",
  "function getPost(uint256 postId) external view returns (tuple(uint256 id, address creator, string content, uint256 likeReward, uint256 commentReward, uint256 bountyBalance, uint256 likeCount, uint256 commentCount, uint256 createdAt, bool active))",
  "function getComments(uint256 postId) external view returns (tuple(address commenter, string text, uint256 createdAt)[])",
  "function postCount() external view returns (uint256)",
  "function hasLiked(uint256, address) external view returns (bool)",
  "function hasCommented(uint256, address) external view returns (bool)",
] as const;

export const MARKET_ABI = [
  "function listName(string name, uint256 price) external",
  "function unlistName(string name) external",
  "function buyName(string name) external payable",
  "function placeBid(string name) external payable",
  "function cancelBid(string name) external",
  "function acceptBid(string name, address bidder) external",
  "function getBids(string name) external view returns (tuple(address bidder, uint256 amount, uint256 placedAt, bool active)[])",
  "function getActiveListings() external view returns (tuple(string name, address seller, uint256 price, bool active, uint256 listedAt)[])",
  "function listings(string) external view returns (string name, address seller, uint256 price, bool active, uint256 listedAt)",
] as const;

export const MESSENGER_ABI = [
  "function sendFriendRequest(address to) external",
  "function acceptFriendRequest(uint256 reqId) external",
  "function rejectFriendRequest(uint256 reqId) external",
  "function sendMessage(address to, string contentHash, string msgType) external",
  "function sendZkLTC(address to, string note) external payable",
  "function blockUser(address user) external",
  "function getConversation(address other) external view returns (tuple(uint256 id, address from, address to, string contentHash, string msgType, uint256 amount, uint256 sentAt, bool read)[])",
  "function getFriends(address user) external view returns (address[])",
  "function getPendingRequests(address user) external view returns (uint256)",
  "function isFriend(address, address) external view returns (bool)",
  "function isBlocked(address, address) external view returns (bool)",
  "function requestCount() external view returns (uint256)",
  "function friendRequests(uint256) external view returns (address from, address to, uint8 status, uint256 sentAt)",
] as const;

export const TRANSFER_ABI = [
  "function sendToName(string toLitName, string note) external payable",
  "function sendToAddress(address to, string note) external payable",
  "function multiSendToNames(string[] names, uint256[] amounts, string note) external payable",
  "function getSentHistory(address user) external view returns (tuple(uint256 id, address from, address to, string fromName, string toName, uint256 amount, string note, uint256 sentAt)[])",
  "function getReceivedHistory(address user) external view returns (tuple(uint256 id, address from, address to, string fromName, string toName, uint256 amount, string note, uint256 sentAt)[])",
] as const;

export const DURATION_OPTIONS = [
  { value: 1, label: "1 Year", price: "0.05" },
  { value: 2, label: "2 Years", price: "0.09" },
  { value: 5, label: "5 Years", price: "0.20" },
  { value: 10, label: "10 Years", price: "0.35" },
  { value: 99, label: "Forever", price: "0.50" },
];

// ---- network helpers ----
export async function ensureHubChain() {
  const eth = (window as unknown as { ethereum?: any }).ethereum;
  if (!eth) throw new Error("No wallet detected");
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: HUB_CHAIN_HEX }] });
  } catch (e: any) {
    if (e?.code === 4902 || /Unrecognized chain/i.test(String(e?.message))) {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: HUB_CHAIN_HEX,
          chainName: "LitVM LiteForge",
          nativeCurrency: { name: "zkLTC", symbol: "zkLTC", decimals: 18 },
          rpcUrls: [HUB_RPC],
          blockExplorerUrls: [HUB_EXPLORER],
        }],
      });
    } else {
      throw e;
    }
  }
}

export async function getHubSigner() {
  const eth = (window as unknown as { ethereum?: any }).ethereum;
  if (!eth) throw new Error("No wallet detected");
  await ensureHubChain();
  const provider = new BrowserProvider(eth);
  return provider.getSigner();
}

export async function getHubContract(addr: string, abi: readonly unknown[]) {
  const signer = await getHubSigner();
  return new Contract(addr, abi as never, signer);
}

const readProvider = new JsonRpcProvider(HUB_RPC);
export function getReadContract(addr: string, abi: readonly unknown[]) {
  return new Contract(addr, abi as never, readProvider);
}

// ---- API client (with on-chain fallback) ----
async function apiGet<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(`${HUB_API_BASE}${path}`, { method: "GET" });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}
async function apiPost<T>(path: string, body: unknown): Promise<T | null> {
  try {
    const r = await fetch(`${HUB_API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

export const hubApi = {
  // name
  available: (name: string) => apiGet<{ available: boolean }>(`/hub/name/available/${name}`),
  price: (dur: number) => apiGet<{ price: string; priceWei: string }>(`/hub/name/price/${dur}`),
  resolve: (name: string) => apiGet<{ address: string; expiresAt: number; avatar?: string; bio?: string }>(`/hub/name/resolve/${name}`),
  reverse: (addr: string) => apiGet<{ name: string }>(`/hub/name/reverse/${addr}`),
  // posts
  posts: () => apiGet<{ posts: HubPost[] }>(`/hub/posts`),
  post: (id: number) => apiGet<{ post: HubPost; comments: HubComment[] }>(`/hub/posts/${id}`),
  postStatus: (id: number, wallet: string) => apiGet<{ liked: boolean; commented: boolean }>(`/hub/posts/${id}/status/${wallet}`),
  // marketplace
  listings: () => apiGet<{ listings: HubListing[] }>(`/hub/marketplace/listings`),
  listing: (name: string) => apiGet<{ listing: HubListing; bids: HubBid[] }>(`/hub/marketplace/listing/${name}`),
  // messenger
  friends: (addr: string) => apiGet<{ friends: { address: string; name: string }[]; pendingRequests: number }>(`/hub/messenger/friends/${addr}`),
  conversation: (a: string, b: string) => apiGet<{ messages: HubMessage[] }>(`/hub/messenger/conversation/${a}/${b}`),
  storeMessage: (b: { fromWallet: string; toWallet: string; encryptedContent: string; msgType: string }) =>
    apiPost<{ msgId: string }>(`/hub/messenger/store`, b),
  messageContent: (id: string) => apiGet<{ content: string }>(`/hub/messenger/content/${id}`),
  // transfer
  sent: (addr: string) => apiGet<{ history: HubTransfer[] }>(`/hub/transfer/sent/${addr}`),
  received: (addr: string) => apiGet<{ history: HubTransfer[] }>(`/hub/transfer/received/${addr}`),
  // notifications
  notifications: (wallet: string) => apiGet<{ notifications: any[] }>(`/hub/notifications/${wallet}`),
  markRead: (wallet: string) => apiPost(`/hub/notifications/read/${wallet}`, {}),
};

// ---- types ----
export type HubPost = {
  id: number;
  creator: string;
  creatorName?: string | null;
  content: string;
  likeReward: string;
  commentReward: string;
  bountyBalance: string;
  likeCount: number;
  commentCount: number;
  createdAt: number;
  active: boolean;
  bountyActive: boolean;
};
export type HubComment = { commenter: string; text: string; createdAt: number };
export type HubListing = { name: string; seller: string; price: string; priceWei: string; active: boolean; listedAt: number };
export type HubBid = { bidder: string; amount: string; placedAt: number; active: boolean };
export type HubMessage = { id: number; from: string; to: string; contentHash: string; msgType: string; amount: string; sentAt: number; read: boolean };
export type HubTransfer = { id: number; from: string; to: string; fromName: string; toName: string; amount: string; note: string; sentAt: number };

export function shortHubAddr(a: string) {
  if (!a) return "";
  return `${a.slice(0, 6)}...${a.slice(-4)}`;
}

// On-chain fallbacks (used when backend not reachable)
export async function chainReverseResolve(addr: string): Promise<string> {
  try {
    const c = getReadContract(HUB_ADDR.registry, REGISTRY_ABI);
    return (await c.reverseResolve(addr)) as string;
  } catch { return ""; }
}
export async function chainIsAvailable(name: string): Promise<boolean> {
  try {
    const c = getReadContract(HUB_ADDR.registry, REGISTRY_ABI);
    return (await c.isAvailable(name)) as boolean;
  } catch { return false; }
}
export async function chainResolveName(name: string): Promise<string> {
  try {
    const c = getReadContract(HUB_ADDR.registry, REGISTRY_ABI);
    return (await c.resolve(name)) as string;
  } catch { return ""; }
}
export async function chainGetPrice(dur: number): Promise<bigint> {
  const c = getReadContract(HUB_ADDR.registry, REGISTRY_ABI);
  return (await c.getPrice(dur)) as bigint;
}

export { parseEther, formatEther };
