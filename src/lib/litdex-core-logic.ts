/**
 * litdex-core-logic.ts
 * ----------------------------------------------------------------------------
 * Single-file export of all CORE LOGIC for the LitDeX dApp:
 *   - Chain config (LitVM 4441) & viem chain definition
 *   - All contract addresses + ABIs
 *   - Wagmi/RainbowKit config
 *   - Swap logic (LiteSwap V2 / OmniFun routers)
 *   - Pool/liquidity logic (add / remove)
 *   - Deploy token logic (LitDeXDeployer + legacy TokenFactory)
 *   - Points system (PointsSystemV5) read & record helpers
 *   - Daily check-in (DailyCheckinV2)
 *   - NFT (LitDeXNFT) mint + claim
 *   - Game API (https://game.test-hub.xyz)
 *   - Quest API + Faucet API (https://api.test-hub.xyz)
 *   - All TypeScript types/interfaces
 *
 * Dependencies (already in this project):
 *   ethers v6, viem, wagmi, @rainbow-me/rainbowkit
 *
 * Drop this file into another project as-is and import what you need.
 * ----------------------------------------------------------------------------
 */

import { BrowserProvider, Contract, JsonRpcProvider, parseEther, parseUnits, formatEther } from "ethers";
import { defineChain, parseAbi } from "viem";
import { http } from "wagmi";
import { getDefaultConfig } from "@rainbow-me/rainbowkit";

/* =====================================================================
 * SECTION 1 — CHAIN / NETWORK CONSTANTS
 * ===================================================================== */
export const RPC_URL = "https://liteforge.rpc.caldera.xyz/http";
export const EXPLORER_URL = "https://liteforge.explorer.caldera.xyz";
export const LITVM_CHAIN_ID = 4441;

export const litvmChain = defineChain({
  id: LITVM_CHAIN_ID,
  name: "LitVM LiteForge",
  nativeCurrency: { name: "zkLTC", symbol: "zkLTC", decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_URL] },
    public: { http: [RPC_URL] },
  },
  blockExplorers: {
    default: { name: "LiteForge", url: EXPLORER_URL },
  },
  testnet: true,
});

// Sepolia (for cross-chain bridge)
export const SEPOLIA_CHAIN_ID = 11155111;
export const SEPOLIA_RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";
export const SEPOLIA_EXPLORER_URL = "https://sepolia.etherscan.io";
export const sepoliaChain = defineChain({
  id: SEPOLIA_CHAIN_ID,
  name: "Sepolia",
  nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [SEPOLIA_RPC_URL] },
    public: { http: [SEPOLIA_RPC_URL] },
  },
  blockExplorers: {
    default: { name: "Etherscan", url: SEPOLIA_EXPLORER_URL },
  },
  testnet: true,
});

/** Shared read-only provider (use this for all view calls). */
export const readProvider = new JsonRpcProvider(RPC_URL);
export const sepoliaReadProvider = new JsonRpcProvider(SEPOLIA_RPC_URL);

/* =====================================================================
 * SECTION 2 — CONTRACT ADDRESSES
 * ===================================================================== */

// ── AMM ─────────────────────────────────────────────────────────────────
export const NATIVE_SENTINEL = "NATIVE";
export const LITESWAP_FACTORY = "0xb923f1481384386D447C51051907F8CadAFF5f3E";
export const LITESWAP_ROUTER  = "0xFa1f665C6ee5167f78454d85bc56D263D5da4576";
export const OMNIFUN_ROUTER   = "0xe351c47c3b96844F46e9808a7D5bBa8101BfFB57";
export const DEFAULT_FACTORY  = LITESWAP_FACTORY;
export const DEFAULT_ROUTER   = LITESWAP_ROUTER;
export const WZKLTC_ADDR      = "0x60A84eBC3483fEFB251B76Aea5B8458026Ef4bea";

// ── Token Factories ─────────────────────────────────────────────────────
/** Newer deployer used for points-earning token deploys (5 pts each). */
export const LITDEX_DEPLOYER_ADDRESS = "0x953124243647F043b6D7Eb924e2a89179cBb78da";
/** Legacy/general token factory (full feature set: mintable/burnable/pausable). */
export const TOKEN_FACTORY_ADDRESS   = "0xafb82a10118544E22596F5eF335B648ea1eBbE7a";
/** Multi-type contract factory (ERC20 / NFT / Staking / Vesting). */
export const LITVM_FACTORY_ADDRESS   = "0xdd56517bFfDf6915918DbEDf1124b5F21D26f684";

// ── Points / Check-in / NFT ─────────────────────────────────────────────
export const POINTS_SYSTEM_ADDRESS  = "0x526B0629C81d3314929dB8166372F792F3da3419";
export const DAILY_CHECKIN_ADDRESS  = "0xBFcdf8b8bb7e779E382c65ca171fa1ee603E9BEa";
export const LITDEX_NFT_ADDRESS     = "0xF14caf1937177814441f53c83046570aee5B3d5B";
export const MESSENGER_CONTRACT     = "0x9624FBBD6931b9D75961994E13604c1DC2c56225";
export const NFT_POINTS_ADDRESS      = "0xF14caf1937177814441f53c83046570aee5B3d5B";

// ── Reward / utility tokens ─────────────────────────────────────────────
export const LDEX_TOKEN_ADDRESS = "0xBAaba603e6298fbb76325a6B0d47Cd57154ca641";
export const USDC_TOKEN_ADDRESS = "0x60DD65bAd8a73Dfd8DF029C4e3b372d575B03BC2";

// ── Misc constants ──────────────────────────────────────────────────────
export const POINTS_OWNER_ADDRESS = "0x3BC6348E1E569E97Bd8247b093475A4aC22B9fD4";
export const DAILY_POINTS_CAP = 100;
export const SWAP_DEADLINE_SEC = 1200; // 20 min
/** Display-only base count added to on-chain totalDeployed(). */
export const DEPLOY_COUNT_BASE = 596;

/* =====================================================================
 * SECTION 3 — CONTRACT ABIs
 * ===================================================================== */

// ── Router (LiteSwap V2 — uses ZKLTC names; OmniFun also accepts ETH names) ──
export const ROUTER_ABI = [
  "function WZKLTC() view returns (address)",
  "function WETH() view returns (address)",
  "function factory() view returns (address)",
  "function getAmountsOut(uint amountIn, address[] path) view returns (uint[] amounts)",

  // Swaps — ZKLTC variant
  "function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] path, address to, uint deadline) returns (uint[] amounts)",
  "function swapExactZKLTCForTokens(uint amountOutMin, address[] path, address to, uint deadline) payable returns (uint[] amounts)",
  "function swapExactTokensForZKLTC(uint amountIn, uint amountOutMin, address[] path, address to, uint deadline) returns (uint[] amounts)",
  // Swaps — ETH variant (OmniFun)
  "function swapExactETHForTokens(uint amountOutMin, address[] path, address to, uint deadline) payable returns (uint[] amounts)",
  "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] path, address to, uint deadline) returns (uint[] amounts)",

  // Liquidity
  "function addLiquidity(address tokenA, address tokenB, uint amountADesired, uint amountBDesired, uint amountAMin, uint amountBMin, address to, uint deadline) returns (uint amountA, uint amountB, uint liquidity)",
  "function addLiquidityZKLTC(address token, uint amountTokenDesired, uint amountTokenMin, uint amountZKLTCMin, address to, uint deadline) payable returns (uint amountToken, uint amountZKLTC, uint liquidity)",
  "function removeLiquidity(address tokenA, address tokenB, uint liquidity, uint amountAMin, uint amountBMin, address to, uint deadline) returns (uint amountA, uint amountB)",
  "function removeLiquidityZKLTC(address token, uint liquidity, uint amountTokenMin, uint amountZKLTCMin, address to, uint deadline) returns (uint amountToken, uint amountZKLTC)",
] as const;

export const FACTORY_ABI = [
  "function getPair(address tokenA, address tokenB) view returns (address pair)",
  "function allPairsLength() view returns (uint)",
  "function allPairs(uint256) view returns (address)",
] as const;

export const PAIR_ABI = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
] as const;

export const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
] as const;

export const WZKLTC_ABI = [
  "function deposit() payable",
  "function withdraw(uint256 wad)",
  "function balanceOf(address owner) view returns (uint256)",
  "function approve(address guy, uint256 wad) returns (bool)",
  "function allowance(address src, address guy) view returns (uint256)",
] as const;

// ── LitDeX Deployer (points-earning, no fee) ────────────────────────────
export const LITDEX_DEPLOYER_ABI = [
  "function deployToken(string _name, string _symbol, uint256 _supply) returns (address)",
  "function totalDeployed() view returns (uint256)",
  "event TokenDeployed(address indexed deployer, address indexed token, string symbol)",
] as const;

// ── Legacy TokenFactory (full ERC20 features) ───────────────────────────
export const TOKEN_FACTORY_ABI = [
  "function deployFee() view returns (uint256)",
  "function deployToken(string name_, string symbol_, uint8 decimals_, uint256 totalSupply_, bool mintable_, bool burnable_, bool pausable_) payable returns (address)",
  "function getAllTokens() view returns (address[])",
  "function getTokensByCreator(address creator_) view returns (address[])",
  "function getTokenInfo(address tokenAddr_) view returns (tuple(address contractAddress, address creator, string name, string symbol, uint256 totalSupply, uint8 decimals, bool mintable, bool burnable, bool pausable, uint256 deployedAt))",
  "function getTotalDeployed() view returns (uint256)",
  "event TokenDeployed(address indexed contractAddress, address indexed creator, string name, string symbol, uint256 totalSupply, uint8 decimals, bool mintable, bool burnable, bool pausable)",
] as const;

export const CUSTOM_TOKEN_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function owner() view returns (address)",
  "function isMintable() view returns (bool)",
  "function isBurnable() view returns (bool)",
  "function isPausable() view returns (bool)",
  "function paused() view returns (bool)",
  "function mint(address to, uint256 amount)",
  "function burn(uint256 amount)",
  "function pause()",
  "function unpause()",
  "function transfer(address to, uint256 amount) returns (bool)",
] as const;

// ── Multi-contract factory (ERC20 / NFT / Staking / Vesting) ───────────
export enum FactoryContractType { ERC20 = 0, NFT = 1, STAKING = 2, VESTING = 3 }
export const LITVM_FACTORY_ABI = parseAbi([
  "function deployFee() view returns (uint256)",
  "function deployERC20(string name_, string symbol_, uint8 decimals_, uint256 totalSupply_, bool mintable_, bool burnable_, bool pausable_) payable returns (address)",
  "function deployNFT(string name_, string symbol_, string baseURI_, uint256 maxSupply_, uint256 mintPrice_, bool publicMint_) payable returns (address)",
  "function deployStaking(address stakingToken_, address rewardToken_, uint256 rewardRatePerDay_, uint256 lockPeriodDays_, string label_) payable returns (address)",
  "function deployVesting(address token_, address beneficiary_, uint256 totalAmount_, uint256 cliffDays_, uint256 durationDays_, bool revocable_, string label_) payable returns (address)",
  "function getAllContracts() view returns (address[])",
  "function getContractsByCreator(address creator_) view returns (address[])",
  "function getContractInfo(address addr_) view returns ((address contractAddress, address creator, uint8 contractType, string label, uint256 deployedAt))",
  "function getTotalDeployed() view returns (uint256)",
  "event ContractDeployed(address indexed contractAddress, address indexed creator, uint8 contractType, string label, uint256 deployedAt)",
]);

// ── Points System V7 ────────────────────────────────────────────────────
export const POINTS_SYSTEM_ABI = [
  {"inputs":[{"name":"user","type":"address"}],"name":"getPoints","outputs":[{"name":"total","type":"uint256"},{"name":"deployDaily","type":"uint256"},{"name":"msgDaily","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"name":"user","type":"address"}],"name":"hasCheckedInToday","outputs":[{"name":"","type":"bool"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"name":"user","type":"address"},{"name":"amount","type":"uint256"}],"name":"spendPoints","outputs":[],"stateMutability":"nonpayable","type":"function"}
] as const;

// ── Daily Check-in V2 ──────────────────────────────────────────────────
export const DAILY_CHECKIN_ABI = [
  { inputs: [], name: "checkin", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "user", type: "address" }], name: "getCheckinInfo", outputs: [
    { name: "streak", type: "uint256" },
    { name: "lastDay", type: "uint256" },
    { name: "totalCheckins", type: "uint256" },
    { name: "nextLDEX", type: "uint256" },
  ], stateMutability: "view", type: "function" },
  { inputs: [], name: "getCurrentDay", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
] as const;

// ── LitDeX NFT (v2) ───────────────────────────────────────────────────
export const LITDEX_NFT_ABI = [
  {"inputs":[{"name":"user","type":"address"},{"name":"pts","type":"uint256"}],"name":"setUserPoints","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"name":"nftType","type":"uint8"}],"name":"mintNFT","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"name":"user","type":"address"}],"name":"getUserNFTs","outputs":[{"components":[{"name":"nftType","type":"uint8"},{"name":"lastClaimDay","type":"uint256"}],"name":"","type":"tuple[]"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"name":"","type":"address"}],"name":"userPoints","outputs":[{"name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  { inputs: [], name: "claimRewards", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "", type: "uint8" }], name: "totalMinted", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "nftType", type: "uint8" }], name: "claimRewardsByType", outputs: [], stateMutability: "nonpayable", type: "function" },
  { inputs: [{ name: "user", type: "address" }, { name: "nftType", type: "uint8" }], name: "getPendingRewardsByType", outputs: [{ name: "zkltc", type: "uint256" }, { name: "usdc", type: "uint256" }, { name: "ldex", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "user", type: "address" }], name: "getPendingRewards", outputs: [{ name: "zkltc", type: "uint256" }, { name: "usdc", type: "uint256" }, { name: "ldex", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [{ name: "user", type: "address" }, { name: "nftType", type: "uint8" }], name: "getLastClaimDay", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "getCurrentDay", outputs: [{ name: "", type: "uint256" }], stateMutability: "view", type: "function" },
] as const;

export const NFT_POINTS_ABI = [
  {"inputs":[{"name":"","type":"address"}],"name":"userPoints","outputs":[{"name":"","type":"uint256"}],"stateMutability":"view","type":"function"}
] as const;

export const MESSENGER_ABI = [
  {"inputs":[{"name":"content","type":"string"}],"name":"sendPublic","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"name":"recipient","type":"address"},{"name":"content","type":"string"}],"name":"sendDirect","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"name":"user","type":"address"}],"name":"getSentIds","outputs":[{"type":"uint256[]"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"name":"user","type":"address"}],"name":"getReceivedIds","outputs":[{"type":"uint256[]"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"name":"msgId","type":"uint256"}],"name":"getMessage","outputs":[{"name":"sender","type":"address"},{"name":"recipient","type":"address"},{"name":"content","type":"string"},{"name":"timestamp","type":"uint256"},{"name":"isPublic","type":"bool"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"name":"user","type":"address"}],"name":"getStats","outputs":[{"name":"sent","type":"uint256"},{"name":"received","type":"uint256"},{"name":"total","type":"uint256"}],"stateMutability":"view","type":"function"}
] as const;

/* =====================================================================
 * SECTION 4 — TOKEN LISTS / ROUTING
 * ===================================================================== */
export type Token = { address: string; symbol: string; image?: string };
export type RouterKey = "liteswap" | "omnifun";

export const ROUTERS: Record<RouterKey, { address: string; label: string; factory?: string }> = {
  liteswap: { address: LITESWAP_ROUTER, label: "LitDeX", factory: LITESWAP_FACTORY },
  omnifun:  { address: OMNIFUN_ROUTER,  label: "OmniFun" },
};

const COIN_LOGO_BASE = "https://raw.githubusercontent.com/zorodas/friendly-greetings/main/public/coins";

export const POPULAR_TOKENS: Token[] = [
  { address: "0xFC43ABE529CDC61B7F0aa2e677451AFd83d2B304", symbol: "USDC",    image: `${COIN_LOGO_BASE}/usdc.jpg` },
  { address: "0x6858790e164a8761a711BAD1178220C5AebcF7eC", symbol: "PEPE",    image: `${COIN_LOGO_BASE}/pepe.jpg` },
  { address: "0xa38c318a0B755154b25f28cAD7b2312747B073C6", symbol: "USDT",    image: `${COIN_LOGO_BASE}/usdt.jpg` },
  { address: "0xFC73cdB75F37B0da829c4e54511f410D525B76b2", symbol: "Lester",  image: `${COIN_LOGO_BASE}/lester.jpg` },
  { address: "0x68Bf11e64cfD939fE1761012862FBFE47048118e", symbol: "WETH",    image: `${COIN_LOGO_BASE}/weth.jpg` },
  { address: "0xcFe6BE457D366329CCdeE7fBC48aBf1d6FFeB9C0", symbol: "WBTC",    image: `${COIN_LOGO_BASE}/wbtc.jpg` },
  { address: "0xBAaba603e6298fbb76325a6B0d47Cd57154ca641", symbol: "LDEX",    image: "" /* Handled specially */ },
  { address: "0x314522DD1B3f74Dd1DdE03E5B5a628C28134b25d", symbol: "zkPEPE",  image: `${COIN_LOGO_BASE}/zkpepe.jpg` },
  { address: "0xaf9F497007342Dd025Ff696964A736Ec9584c3dd", symbol: "zkETH",   image: `${COIN_LOGO_BASE}/zketh.jpg` },
  { address: "0xF425553A84e579BE353a6180F7d53d8101bfb3E4", symbol: "LDTOAD",  image: `${COIN_LOGO_BASE}/litoad.jpg` },
  { address: "0x60DD65bAd8a73Dfd8DF029C4e3b372d575B03BC2", symbol: "USDC.t",  image: `${COIN_LOGO_BASE}/usdclegacy.jpg` },
  { address: "0xd8C4e6dBe48472d6C563eB1cc330207d020D4c8f", symbol: "YURI",    image: `${COIN_LOGO_BASE}/yuri.jpg` },
  { address: "0x05149f41AFE7ca712D6A42390e8047E0f2887284", symbol: "CHAWLEE", image: `${COIN_LOGO_BASE}/chawlee.jpg` },
];

export const SWAP_TOKENS: Token[] = [
  { address: NATIVE_SENTINEL, symbol: "zkLTC", image: `${COIN_LOGO_BASE}/zkltc.jpg` },
  ...POPULAR_TOKENS,
];

const LITESWAP_TOKENS = new Set<string>([
  "0xFC43ABE529CDC61B7F0aa2e677451AFd83d2B304",
  "0x314522DD1B3f74Dd1DdE03E5B5a628C28134b25d",
  "0xaf9F497007342Dd025Ff696964A736Ec9584c3dd",
  "0xBAaba603e6298fbb76325a6B0d47Cd57154ca641",
  "0xF425553A84e579BE353a6180F7d53d8101bfb3E4",
  "0x60DD65bAd8a73Dfd8DF029C4e3b372d575B03BC2",
  "0xa38c318a0B755154b25f28cAD7b2312747B073C6",
  "0x68Bf11e64cfD939fE1761012862FBFE47048118e",
  "0xcFe6BE457D366329CCdeE7fBC48aBf1d6FFeB9C0",
  "0xd8C4e6dBe48472d6C563eB1cc330207d020D4c8f",
  "0x05149f41AFE7ca712D6A42390e8047E0f2887284",
].map((a) => a.toLowerCase()));
const OMNIFUN_TOKENS = new Set<string>([
  "0xFC73cdB75F37B0da829c4e54511f410D525B76b2",
  "0x6858790e164a8761a711BAD1178220C5AebcF7eC",
].map((a) => a.toLowerCase()));

/** Pick the appropriate router for a token pair. */
export function pickRouter(tokenInAddr?: string, tokenOutAddr?: string): RouterKey {
  const a = (tokenInAddr || "").toLowerCase();
  const b = (tokenOutAddr || "").toLowerCase();
  if (LITESWAP_TOKENS.has(a) || LITESWAP_TOKENS.has(b)) return "liteswap";
  if (OMNIFUN_TOKENS.has(a) || OMNIFUN_TOKENS.has(b)) return "omnifun";
  return "liteswap";
}

/* =====================================================================
 * SECTION 5 — UTILITY HELPERS
 * ===================================================================== */
export function isNativeAddr(a?: string) {
  return !a || a === NATIVE_SENTINEL || a === "0x0000000000000000000000000000000000000000";
}
export function shortAddr(a?: string) {
  if (!a) return "—";
  return a.slice(0, 6) + "…" + a.slice(-4);
}
export function errMsg(e: unknown): string {
  const x = e as { shortMessage?: string; reason?: string; message?: string };
  return x?.shortMessage ?? x?.reason ?? x?.message ?? String(e).slice(0, 200);
}

/** Build a swap path, substituting WZKLTC for native sentinels. */
export function buildSwapPath(
  tokenInAddr: string,
  tokenOutAddr: string,
  wrappedNative: string,
): string[] {
  const inA  = isNativeAddr(tokenInAddr)  ? wrappedNative : tokenInAddr;
  const outA = isNativeAddr(tokenOutAddr) ? wrappedNative : tokenOutAddr;
  return [inA, outA];
}

async function getSigner() {
  const eth = (window as unknown as { ethereum?: unknown }).ethereum;
  if (!eth) throw new Error("No wallet detected");
  const provider = new BrowserProvider(eth as never);
  // Ensure correct chain
  try {
    const net = await provider.getNetwork();
    if (Number(net.chainId) !== LITVM_CHAIN_ID) {
      await (eth as { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> }).request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0x" + LITVM_CHAIN_ID.toString(16) }],
      }).catch(() => undefined);
    }
  } catch { /* ignore */ }
  return provider.getSigner();
}

async function getSignerContract(addr: string, abi: readonly unknown[]) {
  const signer = await getSigner();
  return new Contract(addr, abi as never, signer);
}

/* =====================================================================
 * SECTION 6 — WAGMI / RAINBOWKIT CONFIG
 * ===================================================================== */
export const wagmiConfig = getDefaultConfig({
  appName: "LitVM Explorer",
  projectId: "litvm-explorer-public",
  chains: [litvmChain, sepoliaChain],
  transports: {
    [litvmChain.id]: http(RPC_URL),
    [sepoliaChain.id]: http(SEPOLIA_RPC_URL),
  },
  ssr: false,
});

/* =====================================================================
 * SECTION 7 — SWAP LOGIC
 * Core flow:
 *   1. resolve wrapped-native via router.WZKLTC() / WETH() (fallback WZKLTC_ADDR)
 *   2. quote: router.getAmountsOut(inWei, path)
 *   3. approve token (skip if native)
 *   4. call swapExact{...}For{...} variant matching the pair direction
 * ===================================================================== */

/** Resolve wrapped-native address from router (WZKLTC then WETH then fallback). */
export async function resolveWrappedNative(routerAddr: string): Promise<string> {
  const r = new Contract(routerAddr, ROUTER_ABI, readProvider);
  try { return String(await r.WZKLTC()); } catch { /* try WETH */ }
  try { return String(await r.WETH()); } catch { /* fallback */ }
  return WZKLTC_ADDR;
}

/** Quote `amountIn` (wei) for swap path. Returns final output amount (wei). */
export async function quoteSwap(
  routerAddr: string,
  amountInWei: bigint,
  path: string[],
): Promise<bigint> {
  const router = new Contract(routerAddr, ROUTER_ABI, readProvider);
  const amounts = (await router.getAmountsOut(amountInWei, path)) as bigint[];
  return amounts[amounts.length - 1];
}

/** Approve `tokenAddr` for `spender` (returns tx hash). */
export async function approveToken(
  tokenAddr: string,
  spender: string,
  amountWei: bigint,
): Promise<string> {
  const c = await getSignerContract(tokenAddr, ERC20_ABI);
  const tx = await c.approve(spender, amountWei);
  await tx.wait();
  return tx.hash as string;
}

/** Get allowance for a token. */
export async function getAllowance(
  tokenAddr: string,
  owner: string,
  spender: string,
): Promise<bigint> {
  if (isNativeAddr(tokenAddr)) return parseEther("1000000000"); // Infinite for native
  const c = new Contract(tokenAddr, ERC20_ABI, readProvider);
  return BigInt(await c.allowance(owner, spender));
}

/**
 * Execute a swap. Caller passes wei-denominated amounts.
 * Returns the receipt's tx hash.
 */
export async function swap(opts: {
  routerKey: RouterKey;
  routerAddr: string;
  tokenInAddr: string;       // NATIVE_SENTINEL for native
  tokenOutAddr: string;      // NATIVE_SENTINEL for native
  amountInWei: bigint;
  amountOutMinWei: bigint;
  recipient: string;
  path: string[];            // already resolved (use buildSwapPath)
  deadlineSec?: number;      // default = SWAP_DEADLINE_SEC from now
}): Promise<string> {
  const router = await getSignerContract(opts.routerAddr, ROUTER_ABI);
  const deadline = Math.floor(Date.now() / 1000) + (opts.deadlineSec ?? SWAP_DEADLINE_SEC);

  const isOmni = opts.routerKey === "omnifun";
  const fnNativeIn  = isOmni ? "swapExactETHForTokens"  : "swapExactZKLTCForTokens";
  const fnNativeOut = isOmni ? "swapExactTokensForETH"  : "swapExactTokensForZKLTC";

  let tx;
  if (isNativeAddr(opts.tokenInAddr)) {
    tx = await router[fnNativeIn](opts.amountOutMinWei, opts.path, opts.recipient, deadline, { value: opts.amountInWei });
  } else if (isNativeAddr(opts.tokenOutAddr)) {
    tx = await router[fnNativeOut](opts.amountInWei, opts.amountOutMinWei, opts.path, opts.recipient, deadline);
  } else {
    tx = await router.swapExactTokensForTokens(opts.amountInWei, opts.amountOutMinWei, opts.path, opts.recipient, deadline);
  }
  const receipt = await tx.wait();
  return (receipt?.hash ?? tx.hash) as string;
}

/* =====================================================================
 * SECTION 8 — POOL / LIQUIDITY LOGIC
 * ===================================================================== */
export type PairState = {
  pairAddress: string;       // "" if not yet deployed
  token0: string;
  token1: string;
  reserves: [bigint, bigint];
  totalSupply: bigint;
  userBalance: bigint;
  userAllowance: bigint;     // for router (LP token allowance)
};

/** Resolve and read full state for a pair. */
export async function loadPair(
  tokenAAddr: string,
  tokenBAddr: string,
  walletAddr?: string,
): Promise<PairState> {
  const a0 = isNativeAddr(tokenAAddr) ? WZKLTC_ADDR : tokenAAddr;
  const b0 = isNativeAddr(tokenBAddr) ? WZKLTC_ADDR : tokenBAddr;
  const f = new Contract(DEFAULT_FACTORY, FACTORY_ABI, readProvider);
  const p = String(await f.getPair(a0, b0));
  if (p === "0x0000000000000000000000000000000000000000") {
    return { pairAddress: "", token0: "", token1: "", reserves: [0n, 0n], totalSupply: 0n, userBalance: 0n, userAllowance: 0n };
  }
  const pair = new Contract(p, PAIR_ABI, readProvider);
  const [t0, t1, reserves, ts, bal, allow] = await Promise.all([
    pair.token0() as Promise<string>,
    pair.token1() as Promise<string>,
    pair.getReserves() as Promise<[bigint, bigint, number]>,
    pair.totalSupply() as Promise<bigint>,
    walletAddr ? (pair.balanceOf(walletAddr) as Promise<bigint>) : Promise.resolve(0n),
    walletAddr ? (pair.allowance(walletAddr, DEFAULT_ROUTER) as Promise<bigint>) : Promise.resolve(0n),
  ]);
  return {
    pairAddress: p,
    token0: t0,
    token1: t1,
    reserves: [reserves[0], reserves[1]],
    totalSupply: ts,
    userBalance: bal,
    userAllowance: allow,
  };
}

/** Add liquidity. Pass wei amounts. */
export async function addLiquidity(opts: {
  tokenAAddr: string;
  tokenBAddr: string;
  amountAWei: bigint;
  amountBWei: bigint;
  recipient: string;
  slippageBps?: bigint;     // default 1000 (10%) — used to compute amountMin
  deadlineSec?: number;
}): Promise<string> {
  const router = await getSignerContract(DEFAULT_ROUTER, ROUTER_ABI);
  const deadline = Math.floor(Date.now() / 1000) + (opts.deadlineSec ?? SWAP_DEADLINE_SEC);

  let tx;
  if (isNativeAddr(opts.tokenAAddr) && !isNativeAddr(opts.tokenBAddr)) {
    tx = await router.addLiquidityZKLTC(opts.tokenBAddr, opts.amountBWei, 0n, 0n, opts.recipient, deadline, { value: opts.amountAWei });
  } else if (isNativeAddr(opts.tokenBAddr) && !isNativeAddr(opts.tokenAAddr)) {
    tx = await router.addLiquidityZKLTC(opts.tokenAAddr, opts.amountAWei, 0n, 0n, opts.recipient, deadline, { value: opts.amountBWei });
  } else if (!isNativeAddr(opts.tokenAAddr) && !isNativeAddr(opts.tokenBAddr)) {
    tx = await router.addLiquidity(opts.tokenAAddr, opts.tokenBAddr, opts.amountAWei, opts.amountBWei, 0n, 0n, opts.recipient, deadline);
  } else {
    throw new Error("Cannot add zkLTC + zkLTC");
  }
  const receipt = await tx.wait();
  return (receipt?.hash ?? tx.hash) as string;
}

/** Remove liquidity. `lpWei` is the LP-token amount to burn.
 *  Always resolves the LP token address via Factory.getPair(),
 *  then approves the router for that exact LP token before removing.
 */
export async function removeLiquidity(opts: {
  tokenAAddr: string;
  tokenBAddr: string;
  lpWei: bigint;
  recipient: string;
  deadlineSec?: number;
}): Promise<string> {
  const router = await getSignerContract(DEFAULT_ROUTER, ROUTER_ABI);
  const deadline = Math.floor(Date.now() / 1000) + (opts.deadlineSec ?? SWAP_DEADLINE_SEC);

  const aIsNative = isNativeAddr(opts.tokenAAddr) || opts.tokenAAddr.toLowerCase() === WZKLTC_ADDR.toLowerCase();
  const bIsNative = isNativeAddr(opts.tokenBAddr) || opts.tokenBAddr.toLowerCase() === WZKLTC_ADDR.toLowerCase();

  // Resolve actual ERC20 addresses (wrap native sentinel to WZKLTC for Factory lookup)
  const tokenAResolved = isNativeAddr(opts.tokenAAddr) ? WZKLTC_ADDR : opts.tokenAAddr;
  const tokenBResolved = isNativeAddr(opts.tokenBAddr) ? WZKLTC_ADDR : opts.tokenBAddr;

  // Always look up LP token via Factory.getPair()
  const factory = new Contract(DEFAULT_FACTORY, FACTORY_ABI, readProvider);
  const pairAddr = String(await factory.getPair(tokenAResolved, tokenBResolved));
  if (!pairAddr || pairAddr === "0x0000000000000000000000000000000000000000") {
    throw new Error("Pair not found for selected tokens");
  }

  // Approve router to spend the LP token
  const lpToken = await getSignerContract(pairAddr, ERC20_ABI);
  const approveTx = await lpToken.approve(DEFAULT_ROUTER, opts.lpWei);
  await approveTx.wait();

  let tx;
  if (aIsNative && !bIsNative) {
    tx = await router.removeLiquidityZKLTC(tokenBResolved, opts.lpWei, 0, 0, opts.recipient, deadline);
  } else if (bIsNative && !aIsNative) {
    tx = await router.removeLiquidityZKLTC(tokenAResolved, opts.lpWei, 0, 0, opts.recipient, deadline);
  } else {
    tx = await router.removeLiquidity(tokenAResolved, tokenBResolved, opts.lpWei, 0, 0, opts.recipient, deadline);
  }
  const receipt = await tx.wait();
  return (receipt?.hash ?? tx.hash) as string;
}

export type LPPosition = {
  pairAddress: string;
  token0: string;
  token1: string;
  lpBalance: bigint;
  reserve0: bigint;
  reserve1: bigint;
  totalSupply: bigint;
  share: bigint; // basis points (10000 = 100%)
};

/** Fetch all LP positions for a user with parallel execution. */
export async function getUserLPPositions(walletAddress: string): Promise<LPPosition[]> {
  const factory = new Contract(DEFAULT_FACTORY, FACTORY_ABI, readProvider);
  const totalPairsCount = await factory.allPairsLength();
  const totalPairs = Number(totalPairsCount);
  const positions: LPPosition[] = [];

  // Limit pairs to avoid RPC overhead, but fetch in parallel
  const limit = Math.min(totalPairs, 50);
  const pairIndices = Array.from({ length: limit }, (_, i) => i);

  const pairAddresses = await Promise.all(
    pairIndices.map(i => factory.allPairs(i).catch(() => null))
  );

  const results = await Promise.all(
    pairAddresses.map(async (addr) => {
      if (!addr || addr === "0x0000000000000000000000000000000000000000") return null;
      try {
        const pair = new Contract(addr, PAIR_ABI, readProvider);
        const lpBalance = await pair.balanceOf(walletAddress);
        if (BigInt(lpBalance) === 0n) return null;

        const [token0, token1, reserves, totalSupply] = await Promise.all([
          pair.token0(),
          pair.token1(),
          pair.getReserves(),
          pair.totalSupply(),
        ]);

        return {
          pairAddress: addr as string,
          token0: token0 as string,
          token1: token1 as string,
          lpBalance: BigInt(lpBalance),
          reserve0: BigInt(reserves[0]),
          reserve1: BigInt(reserves[1]),
          totalSupply: BigInt(totalSupply),
          share: totalSupply > 0n ? (BigInt(lpBalance) * 10000n / BigInt(totalSupply)) : 0n,
        };
      } catch (e) {
        return null;
      }
    })
  );

  return results.filter((r): r is LPPosition => r !== null);
}

/* =====================================================================
 * SECTION 9 — DEPLOY TOKEN LOGIC (LitDeXDeployer)
 * Backend relayer auto-credits +5 points per deploy on PointsSystemV5.
 * Note: NO value passed — deploys run gasless of fee.
 * ===================================================================== */
export type DeployedTokenResult = {
  txHash: string;
  tokenAddress?: string;
};

/** Deploy a basic ERC-20 via LitDeXDeployer (point-earning path). */
export async function deployTokenLitDeX(opts: {
  name: string;
  symbol: string;
  /** Whole units (contract multiplies by 1e18 internally). */
  totalSupply: string | bigint;
}): Promise<DeployedTokenResult> {
  const deployer = await getSignerContract(LITDEX_DEPLOYER_ADDRESS, LITDEX_DEPLOYER_ABI);
  const supplyBigInt = typeof opts.totalSupply === "bigint"
    ? opts.totalSupply
    : parseUnits(String(opts.totalSupply), 18);
  const tx = await deployer.deployToken(
    opts.name.trim(),
    opts.symbol.trim(),
    supplyBigInt
  );
  const receipt = await tx.wait();
  let tokenAddress: string | undefined;
  try {
    for (const log of receipt?.logs ?? []) {
      try {
        const parsed = deployer.interface.parseLog(log);
        if (parsed?.name === "TokenDeployed") {
          tokenAddress = parsed.args[1] as string;
          break;
        }
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
  return { txHash: (receipt?.hash ?? tx.hash) as string, tokenAddress };
}

/** Read total deployed count (display = on-chain + DEPLOY_COUNT_BASE). */
export async function readTotalDeployed(): Promise<number> {
  const c = new Contract(LITDEX_DEPLOYER_ADDRESS, LITDEX_DEPLOYER_ABI, readProvider);
  const n = await c.totalDeployed();
  return Number(n) + DEPLOY_COUNT_BASE;
}

/** Per-token actions (mint/burn/pause/unpause). Token must be from full TokenFactory. */
export async function tokenAction(
  tokenAddr: string,
  action: "pause" | "unpause" | "burn" | "mint",
  recipient: string,
  arg?: string,
): Promise<string> {
  const token = await getSignerContract(tokenAddr, CUSTOM_TOKEN_ABI);
  let tx;
  if (action === "pause") tx = await token.pause();
  else if (action === "unpause") tx = await token.unpause();
  else if (action === "burn") {
    const decimals = (await token.decimals()) as number;
    tx = await token.burn(BigInt(arg ?? "0") * (10n ** BigInt(decimals)));
  } else {
    const decimals = (await token.decimals()) as number;
    tx = await token.mint(recipient, BigInt(arg ?? "0") * (10n ** BigInt(decimals)));
  }
  await tx.wait();
  return tx.hash as string;
}

/* =====================================================================
 * SECTION 10 — POINTS SYSTEM (PointsSystemV5)
 * recordSwap / recordLP earn 0 in V5; only deploy (5) + checkin earn points.
 * ===================================================================== */
export const POINTS_PER_ACTION: Record<"swap" | "lp" | "deploy", number> = {
  swap: 0, lp: 0, deploy: 5,
};

export type UserPointsData = {
  totalPoints: bigint;
  dailyPoints: bigint;
  lastDayReset: bigint;
  referrer: string;
  pendingReferralPoints: bigint;
};

export async function recordAction(kind: "swap" | "lp" | "deploy"): Promise<string> {
  const c = await getSignerContract(POINTS_SYSTEM_ADDRESS, POINTS_SYSTEM_ABI as never);
  const fn = kind === "swap" ? "recordSwap" : kind === "lp" ? "recordLP" : "recordDeploy";
  const tx = await c[fn]();
  await tx.wait();
  return tx.hash as string;
}
export async function autoRecord(kind: "swap" | "lp" | "deploy"): Promise<string | undefined> {
  try { return await recordAction(kind); } catch { return undefined; }
}

export async function readPoints(user: string): Promise<{ total: bigint; deployDaily: bigint; msgDaily: bigint; hasCheckedIn: boolean }> {
  try {
    const c = new Contract(POINTS_SYSTEM_ADDRESS, POINTS_SYSTEM_ABI as never, readProvider);
    const res = await c.getPoints(user);
    const hasCheckedIn = await c.hasCheckedInToday(user).catch(() => false);
    return { 
      total: BigInt(res[0] ?? res.total ?? 0), 
      deployDaily: BigInt(res[1] ?? res.deployDaily ?? 0), 
      msgDaily: BigInt(res[2] ?? res.msgDaily ?? 0),
      hasCheckedIn: Boolean(hasCheckedIn)
    };
  } catch (err) {
    console.error("readPoints error:", err);
    return { total: 0n, deployDaily: 0n, msgDaily: 0n, hasCheckedIn: false };
  }
}

export async function readUserData(user: string): Promise<UserPointsData> {
  const c = new Contract(POINTS_SYSTEM_ADDRESS, POINTS_SYSTEM_ABI as never, readProvider);
  const [totalPoints, dailyPoints, lastDayReset, referrer, pendingReferralPoints] = await c.users(user);
  return {
    totalPoints: BigInt(totalPoints),
    dailyPoints: BigInt(dailyPoints),
    lastDayReset: BigInt(lastDayReset),
    referrer: referrer as string,
    pendingReferralPoints: BigInt(pendingReferralPoints),
  };
}

export async function readPendingReferral(user: string): Promise<bigint> {
  const c = new Contract(POINTS_SYSTEM_ADDRESS, POINTS_SYSTEM_ABI as never, readProvider);
  return BigInt(await c.getPendingReferralPoints(user));
}
export async function readReferrals(user: string): Promise<string[]> {
  const c = new Contract(POINTS_SYSTEM_ADDRESS, POINTS_SYSTEM_ABI as never, readProvider);
  return (await c.getReferrals(user)) as string[];
}
export async function claimReferralPoints(): Promise<string> {
  const c = await getSignerContract(POINTS_SYSTEM_ADDRESS, POINTS_SYSTEM_ABI as never);
  const tx = await c.claimReferralPoints();
  await tx.wait();
  return tx.hash as string;
}
export async function registerReferral(referrer: string): Promise<string> {
  const c = await getSignerContract(POINTS_SYSTEM_ADDRESS, POINTS_SYSTEM_ABI as never);
  const tx = await c.registerReferral(referrer);
  await tx.wait();
  return tx.hash as string;
}

/** Auto-register a `?ref=` param once per wallet (idempotent + silent). */
export async function autoRegisterReferralIfNeeded(addr: string): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const sp = new URLSearchParams(window.location.search);
    const ref = sp.get("ref");
    if (!ref || ref.toLowerCase() === addr.toLowerCase()) return;
    const key = `litdex_ref_registered_${addr.toLowerCase()}`;
    if (window.localStorage.getItem(key)) return;
    await registerReferral(ref);
    window.localStorage.setItem(key, "1");
  } catch { /* silent */ }
}

export function isPointsOwner(addr?: string | null): boolean {
  return !!addr && addr.toLowerCase() === POINTS_OWNER_ADDRESS.toLowerCase();
}

/* =====================================================================
 * SECTION 11 — DAILY CHECK-IN (DailyCheckinV2)
 * ===================================================================== */
export type CheckinInfo = {
  streak: bigint;
  lastDay: bigint;
  totalCheckins: bigint;
  nextLDEX: bigint;
};

export async function checkinToday(): Promise<string> {
  const c = await getSignerContract(DAILY_CHECKIN_ADDRESS, DAILY_CHECKIN_ABI as never);
  const tx = await c.checkin();
  await tx.wait();
  return tx.hash as string;
}

export async function readCheckinInfo(user: string): Promise<CheckinInfo> {
  const c = new Contract(DAILY_CHECKIN_ADDRESS, DAILY_CHECKIN_ABI as never, readProvider);
  const [streak, lastDay, totalCheckins, nextLDEX] = await c.getCheckinInfo(user);
  return {
    streak: BigInt(streak),
    lastDay: BigInt(lastDay),
    totalCheckins: BigInt(totalCheckins),
    nextLDEX: BigInt(nextLDEX),
  };
}

export async function readCurrentDay(): Promise<bigint> {
  const c = new Contract(DAILY_CHECKIN_ADDRESS, DAILY_CHECKIN_ABI as never, readProvider);
  return BigInt(await c.getCurrentDay());
}

/* =====================================================================
 * SECTION 12 — LITDEX NFT (3 tiers)
 * ===================================================================== */
export type NftTierId = 1 | 2 | 3;
export type NFTInfo = { nftType: number; lastClaimDay: bigint };

export const NFT_MAX_SUPPLY: Record<NftTierId, number> = { 1: 9999, 2: 4999, 3: 999 };

export const NFT_TIERS = [
  { id: 1 as const, name: "LitShard", cost: 1000,  rewards: { zkltc: "0.0001", usdc: "10",  ldex: "2"  }, maxSupply: 9999 },
  { id: 2 as const, name: "LitCore",  cost: 5000,  rewards: { zkltc: "0.0005", usdc: "50",  ldex: "10" }, maxSupply: 4999 },
  { id: 3 as const, name: "LitGod",   cost: 10000, rewards: { zkltc: "0.001",  usdc: "100", ldex: "20" }, maxSupply: 999  },
];

export async function mintRewardNFT(nftType: NftTierId): Promise<string> {
  const c = await getSignerContract(LITDEX_NFT_ADDRESS, LITDEX_NFT_ABI as never);
  const tx = await c.mintNFT(nftType);
  await tx.wait();
  return tx.hash as string;
}

export async function claimNFTRewards(): Promise<string> {
  const c = await getSignerContract(LITDEX_NFT_ADDRESS, LITDEX_NFT_ABI as never);
  const tx = await c.claimRewards();
  await tx.wait();
  return tx.hash as string;
}

export async function claimNFTRewardsByType(nftType: number): Promise<string> {
  const c = await getSignerContract(LITDEX_NFT_ADDRESS, LITDEX_NFT_ABI as never);
  const tx = await c.claimRewardsByType(nftType);
  await tx.wait();
  return tx.hash as string;
}

export async function readUserNFTs(user: string): Promise<NFTInfo[]> {
  try {
    const c = new Contract(LITDEX_NFT_ADDRESS, LITDEX_NFT_ABI as never, readProvider);
    const arr = await c.getUserNFTs(user);
    if (!arr) return [];
    return Array.from(arr).map((n: any) => ({ 
      nftType: Number(n.nftType ?? n[0]), 
      lastClaimDay: BigInt(n.lastClaimDay ?? n[1]) 
    }));
  } catch (err) {
    console.error("readUserNFTs error:", err);
    return [];
  }
}

export async function readNFTPending(user: string): Promise<{ zkltc: bigint; usdc: bigint; ldex: bigint }> {
  try {
    const c = new Contract(LITDEX_NFT_ADDRESS, LITDEX_NFT_ABI as never, readProvider);
    const [zkltc, usdc, ldex] = await c.getPendingRewards(user);
    return { zkltc: BigInt(zkltc), usdc: BigInt(usdc), ldex: BigInt(ldex) };
  } catch {
    return { zkltc: 0n, usdc: 0n, ldex: 0n };
  }
}

export async function readNFTPendingByType(user: string, nftType: number): Promise<{ zkltc: bigint; usdc: bigint; ldex: bigint }> {
  try {
    const c = new Contract(LITDEX_NFT_ADDRESS, LITDEX_NFT_ABI as never, readProvider);
    const [zkltc, usdc, ldex] = await c.getPendingRewardsByType(user, nftType);
    return { zkltc: BigInt(zkltc), usdc: BigInt(usdc), ldex: BigInt(ldex) };
  } catch {
    return { zkltc: 0n, usdc: 0n, ldex: 0n };
  }
}

export async function readNFTAvailablePoints(user: string): Promise<bigint> {
  const c = new Contract(POINTS_SYSTEM_ADDRESS, POINTS_SYSTEM_ABI as never, readProvider);
  const result = await c.getPoints(user);
  return result[0]; // r[0] is BigInt directly from ethers v6
}

export async function syncUserPoints(user: string, points: bigint): Promise<string> {
  const c = await getSignerContract(LITDEX_NFT_ADDRESS, LITDEX_NFT_ABI as never);
  const tx = await c.setUserPoints(user, points);
  await tx.wait();
  return tx.hash as string;
}

export async function spendUserPoints(user: string, amount: bigint): Promise<string> {
  const c = await getSignerContract(POINTS_SYSTEM_ADDRESS, POINTS_SYSTEM_ABI as never);
  const tx = await c.spendPoints(user, amount);
  await tx.wait();
  return tx.hash as string;
}

export async function readNFTTotalMinted(nftType: NftTierId): Promise<number> {
  const c = new Contract(LITDEX_NFT_ADDRESS, LITDEX_NFT_ABI as never, readProvider);
  return Number(await c.totalMinted(nftType));
}

export async function readNFTLastClaimDay(user: string, nftType: number): Promise<bigint> {
  try {
    const c = new Contract(LITDEX_NFT_ADDRESS, LITDEX_NFT_ABI as never, readProvider);
    return BigInt(await c.getLastClaimDay(user, nftType));
  } catch {
    return 0n;
  }
}

export async function readNFTCurrentDay(): Promise<bigint> {
  try {
    const c = new Contract(LITDEX_NFT_ADDRESS, LITDEX_NFT_ABI as never, readProvider);
    return BigInt(await c.getCurrentDay());
  } catch {
    return 0n;
  }
}

/* =====================================================================
 * SECTION 13 — GAME API  (https://game.test-hub.xyz)
 * Endpoints used:
 *   GET  /gf/:address                  → GfInfo
 *   GET  /user/:address                → UserGameBalances
 *   GET  /stats/gf                     → { totalClaimed, totalUsers }
 *   POST /gf/claim          { walletAddress }
 *   POST /claim/rewards     { walletAddress, token: "zkltc" }
 *   POST /game/coin-catch/start  { walletAddress } → { success, sessionId, gfRemaining, reason? }
 *   POST /game/coin-catch/end    { walletAddress, sessionId, bombed, caught: { zkltc, ldex, usdc } }
 *                                → { rewards: { zkltc, ldex, usdc } }
 * Game unlock requires >= 200 on-chain points (read via readPoints()).
 * ===================================================================== */
export const GAME_API = "https://game.test-hub.xyz";

export type GfInfo = { balance: number; maxGF: number; canClaim: boolean; timeLeft: number };
export type UserGameBalances = {
  zkltc_balance: number;
  ldex_balance: number;
  usdc_balance: number;
  gf_balance: number;
};
export type GameRewards = { zkltc: number; ldex: number; usdc: number };

async function jpost<T = unknown>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return r.json().catch(() => ({} as T));
}
async function jget<T = unknown>(url: string): Promise<T> {
  const r = await fetch(url, { headers: { "Content-Type": "application/json" } });
  return r.json().catch(() => ({} as T));
}

export const gameApi = {
  getGf: (address: string) =>
    jget<Partial<GfInfo>>(`${GAME_API}/gf/${address}`).then((d) => ({
      balance: Number(d?.balance ?? 0),
      maxGF: Number(d?.maxGF ?? 20),
      canClaim: Boolean(d?.canClaim),
      timeLeft: Number(d?.timeLeft ?? 0),
    } as GfInfo)),
  getUser: (address: string) =>
    jget<Partial<UserGameBalances>>(`${GAME_API}/user/${address}`).then((d) => ({
      zkltc_balance: Number(d?.zkltc_balance ?? 0),
      ldex_balance: Number(d?.ldex_balance ?? 0),
      usdc_balance: Number(d?.usdc_balance ?? 0),
      gf_balance: Number(d?.gf_balance ?? 0),
    } as UserGameBalances)),
  getGfStats: () =>
    jget<{ totalClaimed?: number; totalUsers?: number }>(`${GAME_API}/stats/gf`).then((d) => ({
      totalClaimed: Number(d?.totalClaimed ?? 0),
      totalUsers: Number(d?.totalUsers ?? 0),
    })),
  claimGf: (walletAddress: string) =>
    jpost(`${GAME_API}/gf/claim`, { walletAddress }),
  claimReward: (walletAddress: string, token: "zkltc" | "ldex" | "usdc" = "zkltc") =>
    jpost<{ txHash?: string; tx_hash?: string; hash?: string }>(`${GAME_API}/claim/rewards`, { walletAddress, token }),
  startCoinCatch: (walletAddress: string) =>
    jpost<{ success: boolean; sessionId?: string; gfRemaining?: number; reason?: string }>(
      `${GAME_API}/game/coin-catch/start`,
      { walletAddress },
    ),
  endCoinCatch: (body: {
    walletAddress: string;
    sessionId: string;
    bombed: boolean;
    caught: GameRewards;
  }) => jpost<{ rewards?: GameRewards }>(`${GAME_API}/game/coin-catch/end`, body),
};

/* =====================================================================
 * SECTION 14 — TWITTER / SOCIAL QUEST API  (https://api.test-hub.xyz)
 * Endpoints:
 *   GET  /quest/status/:address         → { completed: string[] | Record<string, boolean> }
 *   POST /quest/complete  { wallet, questId }
 * ===================================================================== */
export const QUEST_API = "https://api.test-hub.xyz";

export type Quest = {
  id: string;
  title: string;
  url: string;
  pts: number;
  icon: "x" | "tg";
  group: "follow" | "like" | "tg";
};

export const QUESTS: Quest[] = [
  // Follows
  { id: "follow_litdex",   title: "Follow @LitDeXApp on X",        url: "https://x.com/LitDeXApp",        pts: 100, icon: "x",  group: "follow" },
  { id: "follow_litvm",    title: "Follow @LitecoinVM on X",       url: "https://x.com/LitecoinVM",       pts: 100, icon: "x",  group: "follow" },
  { id: "follow_personal", title: "Follow @cryptobhartiyax on X",  url: "https://x.com/cryptobhartiyax",  pts: 50,  icon: "x",  group: "follow" },
  // Like & RT
  { id: "like_rt_1", title: "Like & RT post #1", url: "https://x.com/LitDeXApp/status/2050573145330127087", pts: 10, icon: "x", group: "like" },
  { id: "like_rt_2", title: "Like & RT post #2", url: "https://x.com/LitDeXApp/status/2050652776951414908", pts: 10, icon: "x", group: "like" },
  { id: "like_rt_3", title: "Like & RT post #3", url: "https://x.com/LoockLite/status/2050588261152702692", pts: 10, icon: "x", group: "like" },
  { id: "like_rt_4", title: "Like & RT post #4", url: "https://x.com/LitDeXApp/status/2050586518709047591", pts: 10, icon: "x", group: "like" },
  { id: "like_rt_5", title: "Like & RT post #5", url: "https://x.com/LitDeXApp/status/2050479665979265098", pts: 10, icon: "x", group: "like" },
  { id: "like_rt_6", title: "Like & RT post #6", url: "https://x.com/LitDeXApp/status/2049925513452679259", pts: 10, icon: "x", group: "like" },
  { id: "like_rt_7", title: "Like & RT post #7", url: "https://x.com/LitDeXApp/status/2049925659766706361", pts: 10, icon: "x", group: "like" },
  { id: "like_rt_8", title: "Like & RT post #8", url: "https://x.com/LitDeXApp/status/2048850659819376794", pts: 10, icon: "x", group: "like" },
  // Telegram
  { id: "tg_group",   title: "Join LitDeX Group",   url: "https://t.me/litdex_discussion", pts: 50, icon: "tg", group: "tg" },
  { id: "tg_channel", title: "Join LitDeX Channel", url: "https://t.me/litdex_app",        pts: 50, icon: "tg", group: "tg" },
];

export const questApi = {
  getStatus: async (address: string): Promise<Record<string, boolean>> => {
    const res = await fetch(`${QUEST_API}/quest/status/${address}`);
    if (!res.ok) return {};
    const data = await res.json().catch(() => ({}));
    const map: Record<string, boolean> = {};
    QUESTS.forEach((q) => { map[q.id] = false; });
    const c = data?.completed ?? data;
    if (Array.isArray(c)) c.forEach((id: string) => { if (id in map) map[id] = true; });
    else if (c && typeof c === "object") {
      Object.keys(c).forEach((k) => { if (k in map) map[k] = !!c[k]; });
    }
    return map;
  },
  complete: (wallet: string, questId: string) =>
    jpost(`${QUEST_API}/quest/complete`, { wallet, questId }),
};

/* =====================================================================
 * SECTION 15 — FAUCET API  (https://api.test-hub.xyz)
 * Endpoints:
 *   GET  /faucet/status/:address         → FaucetStatus
 *   POST /faucet/claim   { wallet }      → { success, reason?, message? }
 *
 * Claim cooldown: 7 days. Reasons: "no_external" (need $1+ BNB/USDC on BSC),
 * "has_enough" (already topped up).
 * ===================================================================== */
export const FAUCET_API = "https://api.test-hub.xyz";
export const FAUCET_CLAIM_AMOUNT_ZKLTC = "0.001";
export const FAUCET_COOLDOWN_SEC = 7 * 24 * 60 * 60;

export type FaucetStatus = {
  canClaim: boolean;
  hasEnoughZkLTC: boolean;
  zkLTCBalance: string | number;
  nextClaimIn: number; // seconds
  faucetBalance: string | number;
};

export const faucetApi = {
  getStatus: async (address: string): Promise<FaucetStatus | null> => {
    try {
      const r = await fetch(`${FAUCET_API}/faucet/status/${address}`);
      return (await r.json()) as FaucetStatus;
    } catch { return null; }
  },
  claim: async (wallet: string): Promise<{ ok: boolean; reason?: string; message?: string; status: number; txHash?: string; explorerUrl?: string; nextClaimIn?: number }> => {
    const r = await fetch(`${FAUCET_API}/faucet/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet }),
    });
    const j = await r.json().catch(() => ({} as any));
    return {
      ok: r.ok && j?.success !== false,
      reason: j?.reason,
      message: j?.message,
      status: r.status,
      txHash: j?.txHash || j?.tx_hash,
      explorerUrl: j?.explorerUrl || j?.explorer_url || (j?.txHash ? `https://explorer.litprotocol.network/tx/${j.txHash}` : undefined),
      nextClaimIn: j?.nextClaimIn,
    };
  },
};

/* =====================================================================
 * SECTION 16 — SHARED TYPES (re-exports for convenience)
 * ===================================================================== */
export type FactoryDeployedInfo = {
  contractAddress: `0x${string}`;
  creator: `0x${string}`;
  contractType: number;
  label: string;
  deployedAt: bigint;
};

export type TokenInfo = {
  contractAddress: string;
  creator: string;
  name: string;
  symbol: string;
  totalSupply: bigint;
  decimals: number;
  mintable: boolean;
  burnable: boolean;
  pausable: boolean;
  deployedAt: bigint;
};

/** Get on-chain swap quote using routers. */
export async function getSwapQuote(
  tokenIn: string,   // "NATIVE" for zkLTC
  tokenOut: string,  // token address
  amountIn: string   // human readable amount e.g. "1"
): Promise<{ amountOut: string, router: string, routerKey: RouterKey, path: string[] }> {
  // Build path
  const tokenInAddr = tokenIn === "NATIVE" ? WZKLTC_ADDR : tokenIn;
  const tokenOutAddr = tokenOut === "NATIVE" ? WZKLTC_ADDR : tokenOut;
  
  if (tokenInAddr.toLowerCase() === tokenOutAddr.toLowerCase()) {
    return { amountOut: amountIn, router: "Direct", routerKey: "liteswap", path: [tokenInAddr] };
  }

  const path = [tokenInAddr, tokenOutAddr];
  const amountInWei = parseEther(amountIn || "0");
  if (amountInWei === 0n) return { amountOut: "0", router: "--", routerKey: "liteswap", path };

  // Try LitDeX first
  try {
    const router = new Contract(LITESWAP_ROUTER, ROUTER_ABI, readProvider);
    const amounts = await router.getAmountsOut(amountInWei, path);
    return { amountOut: formatEther(amounts[amounts.length - 1]), router: "LitDeX", routerKey: "liteswap", path };
  } catch (e) {
    // Try OmniFun router
    try {
      const router = new Contract(OMNIFUN_ROUTER, ROUTER_ABI, readProvider);
      const amounts = await router.getAmountsOut(amountInWei, path);
      return { amountOut: formatEther(amounts[amounts.length - 1]), router: "OmniFun", routerKey: "omnifun", path };
    } catch (e2) {
      // Try multi-hop via WZKLTC on LiteSwap
      try {
        const router = new Contract(LITESWAP_ROUTER, ROUTER_ABI, readProvider);
        const multiPath = [tokenInAddr, WZKLTC_ADDR, tokenOutAddr];
        const amounts = await router.getAmountsOut(amountInWei, multiPath);
        return { amountOut: formatEther(amounts[amounts.length - 1]), router: "LiteSwap (Hop)", routerKey: "liteswap", path: multiPath };
      } catch (e3) {
        throw new Error("No liquidity found for this pair");
      }
    }
  }
}

// --- Section 17: Additional Helpers for App Integration ---

/** Read all deployments for a user across factories. */
export async function readDeployments(user: string): Promise<FactoryDeployedInfo[]> {
  const factory = new Contract(LITVM_FACTORY_ADDRESS, LITVM_FACTORY_ABI, readProvider);
  try {
    const addresses = await factory.getContractsByCreator(user);
    const details = await Promise.all(addresses.map(async (addr: string) => {
      const info = await factory.getContractInfo(addr);
      return {
        contractAddress: info.contractAddress,
        creator: info.creator,
        contractType: Number(info.contractType),
        label: info.label,
        deployedAt: BigInt(info.deployedAt),
      };
    }));
    return details;
  } catch (err) {
    console.error("Error reading deployments:", err);
    return [];
  }
}

/** Deployment wrapper for ERC20. */
export async function deployERC20(name: string, symbol: string, supply: string): Promise<string> {
  const factory = await getSignerContract(LITVM_FACTORY_ADDRESS, LITVM_FACTORY_ABI);
  const fee = await factory.deployFee();
  const tx = await factory.deployERC20(name, symbol, 18, BigInt(supply) * (10n ** 18n), true, true, true, { value: fee });
  await tx.wait();
  return tx.hash;
}

/** Deployment wrapper for NFT. */
export async function deployNFT(name: string, symbol: string): Promise<string> {
  const factory = await getSignerContract(LITVM_FACTORY_ADDRESS, LITVM_FACTORY_ABI);
  const fee = await factory.deployFee();
  const tx = await factory.deployNFT(name, symbol, "ipfs://", 10000n, 0n, true, { value: fee });
  await tx.wait();
  return tx.hash;
}

/** Enhanced NFT Deployment via LitVM Factory. */
export async function deployNFTLitDeX(opts: {
  name: string;
  symbol: string;
  maxSupply: number;
  mintPrice: bigint;
  baseURI: string;
}): Promise<DeployedTokenResult> {
  const factory = await getSignerContract(LITVM_FACTORY_ADDRESS, LITVM_FACTORY_ABI);
  const fee = await factory.deployFee();
  
  const tx = await factory.deployNFT(
    opts.name,
    opts.symbol,
    opts.baseURI,
    BigInt(opts.maxSupply),
    opts.mintPrice,
    true, // publicMint
    { value: fee }
  );
  
  const receipt = await tx.wait();
  let tokenAddress: string | undefined;
  
  // Parse ContractDeployed event
  try {
    for (const log of receipt?.logs ?? []) {
      try {
        const parsed = factory.interface.parseLog(log);
        if (parsed?.name === "ContractDeployed") {
          tokenAddress = parsed.args[0] as string;
          break;
        }
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
  
  return { txHash: (receipt?.hash ?? tx.hash) as string, tokenAddress };
}

/** Deployment wrapper for Staking. */
export async function deployStaking(
  stakingToken: string,
  rewardToken: string,
  rewardRatePerDay: bigint,
  lockPeriodDays: bigint,
  label: string
): Promise<{ txHash: string; contractAddress?: string }> {
  const factory = await getSignerContract(LITVM_FACTORY_ADDRESS, LITVM_FACTORY_ABI);
  const fee = await factory.deployFee();
  const tx = await factory.deployStaking(
    stakingToken,
    rewardToken,
    rewardRatePerDay,
    lockPeriodDays,
    label,
    { value: fee }
  );
  const receipt = await tx.wait();
  let contractAddress: string | undefined;
  try {
    for (const log of receipt?.logs ?? []) {
      try {
        const parsed = factory.interface.parseLog(log);
        if (parsed?.name === "ContractDeployed") {
          contractAddress = parsed.args[0] as string;
          break;
        }
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
  return { txHash: (receipt?.hash ?? tx.hash) as string, contractAddress };
}

/** Read deployment fee for the multi-factory. */
export async function readDeployFee(): Promise<bigint> {
  const factory = new Contract(LITVM_FACTORY_ADDRESS, LITVM_FACTORY_ABI, readProvider);
  return await factory.deployFee();
}

/** Deployment wrapper for Vesting. */
export async function deployVesting(
  token: string,
  beneficiary: string,
  totalAmount: bigint,
  cliffDays: bigint,
  durationDays: bigint,
  revocable: boolean,
  label: string
): Promise<{ txHash: string; contractAddress?: string }> {
  const factory = await getSignerContract(LITVM_FACTORY_ADDRESS, LITVM_FACTORY_ABI);
  const fee = await factory.deployFee();
  const tx = await factory.deployVesting(
    token,
    beneficiary,
    totalAmount,
    cliffDays,
    durationDays,
    revocable,
    label,
    { value: fee }
  );
  const receipt = await tx.wait();
  let contractAddress: string | undefined;
  try {
    for (const log of receipt?.logs ?? []) {
      try {
        const parsed = factory.interface.parseLog(log);
        if (parsed?.name === "ContractDeployed") {
          contractAddress = parsed.args[0] as string;
          break;
        }
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
  return { txHash: (receipt?.hash ?? tx.hash) as string, contractAddress };
}

/** Deployment wrapper for Token Factory (Shared Legacy Factory at afb82a10...). */
export async function deployTokenLegacy(opts: {
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: bigint;
  mintable: boolean;
  burnable: boolean;
  pausable: boolean;
}): Promise<{ txHash: string; tokenAddress?: string }> {
  const factory = await getSignerContract(TOKEN_FACTORY_ADDRESS, TOKEN_FACTORY_ABI);
  const fee = await factory.deployFee();
  const tx = await factory.deployToken(
    opts.name,
    opts.symbol,
    opts.decimals,
    opts.totalSupply,
    opts.mintable,
    opts.burnable,
    opts.pausable,
    { value: fee }
  );
  const receipt = await tx.wait();
  let tokenAddress: string | undefined;
  try {
    for (const log of receipt?.logs ?? []) {
      try {
        const parsed = factory.interface.parseLog(log);
        if (parsed?.name === "TokenDeployed") {
          tokenAddress = parsed.args[0] as string;
          break;
        }
      } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
  return { txHash: (receipt?.hash ?? tx.hash) as string, tokenAddress };
}

export async function readLegacyDeployFee(): Promise<bigint> {
  const factory = new Contract(TOKEN_FACTORY_ADDRESS, TOKEN_FACTORY_ABI, readProvider);
  return await factory.deployFee();
}

export async function getLegacyTokensByCreator(creator: string): Promise<string[]> {
  const factory = new Contract(TOKEN_FACTORY_ADDRESS, TOKEN_FACTORY_ABI, readProvider);
  return await factory.getTokensByCreator(creator);
}

export async function getLegacyTokenInfo(tokenAddr: string) {
  const factory = new Contract(TOKEN_FACTORY_ADDRESS, TOKEN_FACTORY_ABI, readProvider);
  return await factory.getTokenInfo(tokenAddr);
}

export async function getLegacyTotalDeployedDisplay(): Promise<number> {
  const factory = new Contract(TOKEN_FACTORY_ADDRESS, TOKEN_FACTORY_ABI, readProvider);
  const n = await factory.getTotalDeployed();
  return Number(n) + DEPLOY_COUNT_BASE;
}

/** Wrapper for Quests. */
export async function readQuests(address: string) {
  const status = await questApi.getStatus(address);
  return QUESTS.map(q => ({
    id: q.id,
    name: q.title,
    points: BigInt(q.pts),
    completed: !!status[q.id],
    type: q.group === 'tg' ? 'social' : 'social', // normalized
  }));
}

export async function verifyQuest(questId: string) {
  const eth = (window as any).ethereum;
  if (!eth?.selectedAddress) throw new Error("Wallet not connected");
  const res = await questApi.complete(eth.selectedAddress, questId);
  return res;
}

/** Wrapper for Gaming Fuel. */
export async function readGF(address: string): Promise<bigint> {
  const info = await gameApi.getGf(address);
  return BigInt(info.balance);
}

export async function claimGF() {
  const eth = (window as any).ethereum;
  if (!eth?.selectedAddress) throw new Error("Wallet not connected");
  return await gameApi.claimGf(eth.selectedAddress);
}

export async function startGame(gameId: string) {
    const eth = (window as any).ethereum;
    if (!eth?.selectedAddress) throw new Error("Wallet not connected");
    const res = await gameApi.startCoinCatch(eth.selectedAddress);
    if(!res.success) throw new Error(res.reason || "Failed to start game");
    return res;
}

/** Real Messenger Logic using LitDeXMessenger contract. */
export async function getMessengerStats(address: string) {
  try {
    const contract = new Contract(MESSENGER_CONTRACT, MESSENGER_ABI, readProvider);
    const stats = await contract.getStats(address);
    return {
      sent: Number(stats.sent),
      received: Number(stats.received),
      total: Number(stats.total)
    };
  } catch (error) {
    console.error("Error reading messenger stats:", error);
    return { sent: 0, received: 0, total: 0 };
  }
}

async function getMessagesByIds(ids: any[]) {
  if (ids.length === 0) return [];
  try {
    const contract = new Contract(MESSENGER_CONTRACT, MESSENGER_ABI, readProvider);
    const messagePromises = ids.map(id => contract.getMessage(id));
    const rawMessages = await Promise.all(messagePromises);
    return rawMessages.map((m: any) => ({
      sender: m.sender,
      recipient: m.recipient,
      content: m.content,
      timestamp: Number(m.timestamp),
      isPublic: m.isPublic
    })).sort((a, b) => b.timestamp - a.timestamp);
  } catch (error) {
    console.error("Error fetching messages by IDs:", error);
    return [];
  }
}

export async function getSentMessages(address: string) {
  const contract = new Contract(MESSENGER_CONTRACT, MESSENGER_ABI, readProvider);
  const ids = await contract.getSentIds(address);
  return getMessagesByIds(ids);
}

export async function getReceivedMessages(address: string) {
  const contract = new Contract(MESSENGER_CONTRACT, MESSENGER_ABI, readProvider);
  const ids = await contract.getReceivedIds(address);
  return getMessagesByIds(ids);
}

export async function readMessages(address: string): Promise<any[]> {
  try {
    const contract = new Contract(MESSENGER_CONTRACT, MESSENGER_ABI, readProvider);
    
    // Fetch sent and received message IDs
    const [sentIds, receivedIds] = await Promise.all([
      contract.getSentIds(address),
      contract.getReceivedIds(address)
    ]);

    // Combine and deduplicate IDs
    const allIds = Array.from(new Set([...sentIds, ...receivedIds]));
    return getMessagesByIds(allIds);
  } catch (error) {
    console.error("Error reading messages:", error);
    return [];
  }
}

export type SendMessageResult = {
  hash: string;
  success?: boolean;
  msgsToday?: number;
  reason?: string;
};

export async function sendMessage(to: string, content: string): Promise<SendMessageResult> {
  const eth = (window as any).ethereum;
  if (!eth) throw new Error("Wallet not found");
  const provider = new BrowserProvider(eth);
  const signer = await provider.getSigner();
  const contract = new Contract(MESSENGER_CONTRACT, MESSENGER_ABI, signer);

  let tx;
  if (!to || to.trim() === "" || to.toLowerCase() === "public") {
    tx = await contract.sendPublic(content);
  } else {
    tx = await contract.sendDirect(to, content);
  }

  const receipt = await tx.wait();

  let success: boolean | undefined;
  let msgsToday: number | undefined;
  let reason: string | undefined;

  // POST https://api.test-hub.xyz/msg/sent
  try {
    const address = await signer.getAddress();
    const r = await fetch("https://api.test-hub.xyz/msg/sent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wallet: address })
    });
    try {
      const j = await r.json();
      success = j?.success;
      msgsToday = typeof j?.msgsToday === "number" ? j.msgsToday : undefined;
      reason = j?.reason;
    } catch { /* ignore parse errors */ }
  } catch (e) {
    console.warn("Telemetry failed:", e);
  }

  return { hash: receipt.hash, success, msgsToday, reason };
}
