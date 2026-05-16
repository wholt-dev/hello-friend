import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { BrowserProvider, Contract, JsonRpcProvider, parseEther, formatEther } from "ethers";
import { ChevronDown, ExternalLink, X, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  LITVM_CHAIN_ID,
  SEPOLIA_CHAIN_ID,
  RPC_URL,
  SEPOLIA_RPC_URL,
  EXPLORER_URL,
  SEPOLIA_EXPLORER_URL,
} from "@/lib/litdex-core-logic";

// ============== Constants ==============
const LIT_BRIDGE = "0x8F154dA71735869559D326306056430Db51e7233";
const SEPOLIA_BRIDGE = "0xc4807A6547339aE1c38EE1Cc4A27c5A7acb9c38C";
const WZKLTC_SEPOLIA = "0xBE9C63907d0Bfaa55EF8729907f37B9c60863fc7";
const LDEX_LITVM = "0xBAaba603e6298fbb76325a6B0d47Cd57154ca641";
const LDEX_SEPOLIA = "0x688dB3dbd582D9E394bdE138ad1d1dD162b18A07";

const LIT_BRIDGE_ABI = [
  "function lockZKLTC() payable",
  "function lockLDEX(uint256 amount)",
];
const SEPOLIA_BRIDGE_ABI = [
  "function lockETH() payable",
  "function lockWZKLTC(uint256 amount)",
  "function lockLDEX(uint256 amount)",
];
const ERC20_ABI = [
  "function approve(address,uint256) returns(bool)",
  "function allowance(address,address) view returns(uint256)",
  "function balanceOf(address) view returns(uint256)",
];

const ZKLTC_LOGO = "https://raw.githubusercontent.com/zorodas/friendly-greetings/main/public/coins/zkltc.jpg";
const ETH_LOGO = "https://raw.githubusercontent.com/mmrdasachin/your-daily-hello/main/public/coins/sepolia_eth_logo.png";

type ChainKey = "litvm" | "sepolia";
type BridgeToken = {
  id: string;
  symbol: string;
  display: string;
  address: string | null; // null = native
  decimals: 18;
  destSymbol: string;
  max: number;
  logo: "zkltc" | "eth" | "ldex" | "wzkltc";
};

const TOKENS: Record<ChainKey, BridgeToken[]> = {
  litvm: [
    { id: "litvm-zkltc", symbol: "zkLTC", display: "zkLTC", address: null, decimals: 18, destSymbol: "WZKLTC", max: 1, logo: "zkltc" },
    { id: "litvm-ldex", symbol: "LDEX", display: "LDEX", address: LDEX_LITVM, decimals: 18, destSymbol: "LDEX", max: 1, logo: "ldex" },
  ],
  sepolia: [
    { id: "sep-eth", symbol: "ETH", display: "ETH", address: null, decimals: 18, destSymbol: "zkLTC", max: 1, logo: "eth" },
    { id: "sep-wzkltc", symbol: "WZKLTC", display: "WZKLTC", address: WZKLTC_SEPOLIA, decimals: 18, destSymbol: "zkLTC", max: 1, logo: "wzkltc" },
    { id: "sep-ldex", symbol: "LDEX", display: "LDEX", address: LDEX_SEPOLIA, decimals: 18, destSymbol: "LDEX", max: 1, logo: "ldex" },
  ],
};

const CHAIN_INFO: Record<ChainKey, { id: number; name: string; explorer: string; rpc: string; nativeSymbol: string; nativeName: string }> = {
  litvm: { id: LITVM_CHAIN_ID, name: "LitVM", explorer: EXPLORER_URL, rpc: RPC_URL, nativeSymbol: "zkLTC", nativeName: "zkLTC" },
  sepolia: { id: SEPOLIA_CHAIN_ID, name: "Sepolia", explorer: SEPOLIA_EXPLORER_URL, rpc: SEPOLIA_RPC_URL, nativeSymbol: "ETH", nativeName: "Sepolia ETH" },
};

const litvmProv = new JsonRpcProvider(RPC_URL);
const sepProv = new JsonRpcProvider(SEPOLIA_RPC_URL);

const BORDER = "1px solid #2a2a2a";

// ============== Token logo ==============
const LogoLD = ({ size = 14 }: { size?: number }) => (
  <div className="flex items-center justify-center font-black italic tracking-tighter" style={{ width: size, height: size }}>
    <span style={{ fontSize: size }} className="text-black leading-none">L</span>
    <span style={{ fontSize: size }} className="text-black leading-none -ml-[0.1em]">D</span>
  </div>
);

const TokenLogo = ({ logo, size = 24 }: { logo: BridgeToken["logo"]; size?: number }) => {
  if (logo === "ldex") {
    return (
      <div className="rounded-full bg-white flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
        <LogoLD size={size * 0.7} />
      </div>
    );
  }
  if (logo === "wzkltc") {
    return (
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <img src={ZKLTC_LOGO} alt="WZKLTC" className="w-full h-full rounded-full object-cover" style={{ border: BORDER }} crossOrigin="anonymous" referrerPolicy="no-referrer" />
        <div
          className="absolute -bottom-0.5 -right-0.5 bg-white text-black text-[8px] font-black rounded-full flex items-center justify-center"
          style={{ width: size * 0.45, height: size * 0.45, border: "1px solid #000" }}
        >W</div>
      </div>
    );
  }
  const src = logo === "eth" ? ETH_LOGO : ZKLTC_LOGO;
  return (
    <div className="shrink-0" style={{ width: size, height: size }}>
      <img src={src} alt={logo} className="w-full h-full rounded-full object-cover" style={{ border: BORDER }} crossOrigin="anonymous" referrerPolicy="no-referrer" />
    </div>
  );
};

// ============== Helpers ==============
async function readBalance(chain: ChainKey, token: BridgeToken, addr: string): Promise<bigint> {
  const prov = chain === "litvm" ? litvmProv : sepProv;
  if (token.address === null) return await prov.getBalance(addr);
  const c = new Contract(token.address, ERC20_ABI, prov);
  return (await c.balanceOf(addr)) as bigint;
}

const fmt4 = (b: bigint | null): string => {
  if (b === null) return "...";
  try { return Number(formatEther(b)).toFixed(4); } catch { return "0.0000"; }
};

async function ensureChain(chainId: number) {
  const eth = (window as any).ethereum;
  if (!eth) throw new Error("No wallet detected");
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x" + chainId.toString(16) }] });
  } catch (e: any) {
    if (e?.code === 4902 || /Unrecognized chain/i.test(e?.message || "")) {
      const info = chainId === SEPOLIA_CHAIN_ID ? CHAIN_INFO.sepolia : CHAIN_INFO.litvm;
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: "0x" + chainId.toString(16),
          chainName: info.name,
          nativeCurrency: { name: info.nativeName, symbol: info.nativeSymbol, decimals: 18 },
          rpcUrls: [info.rpc],
          blockExplorerUrls: [info.explorer],
        }],
      });
    } else {
      throw e;
    }
  }
}

// ============== Token dropdown ==============
const TokenDropdown = ({
  chain,
  tokens,
  selected,
  onSelect,
  walletAddress,
}: {
  chain: ChainKey;
  tokens: BridgeToken[];
  selected: BridgeToken;
  onSelect: (t: BridgeToken) => void;
  walletAddress?: string;
}) => {
  const [open, setOpen] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [bals, setBals] = React.useState<Record<string, bigint | null>>({});

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Load balances for every token in this chain whenever opened or chain/address changes
  React.useEffect(() => {
    let alive = true;
    if (!walletAddress) { setBals({}); return; }
    // mark loading
    setBals((prev) => {
      const next: Record<string, bigint | null> = { ...prev };
      tokens.forEach((t) => { if (next[t.id] === undefined) next[t.id] = null; });
      return next;
    });
    (async () => {
      for (const t of tokens) {
        try {
          const b = await readBalance(chain, t, walletAddress);
          if (!alive) return;
          setBals((p) => ({ ...p, [t.id]: b }));
        } catch {
          if (!alive) return;
          setBals((p) => ({ ...p, [t.id]: 0n }));
        }
      }
    })();
    return () => { alive = false; };
  }, [chain, walletAddress, tokens]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-md text-left transition-all bg-black"
        style={{ border: BORDER }}
        onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 0 0 1px rgba(255,255,255,0.1)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.boxShadow = ""; }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <TokenLogo logo={selected.logo} size={24} />
          <div className="min-w-0">
            <div className="text-sm font-bold text-white truncate font-mono">{selected.symbol}</div>
            <div className="text-[9px] text-white/50 uppercase tracking-wider truncate font-mono">→ {selected.destSymbol}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-white/60 font-mono tabular-nums">{fmt4(bals[selected.id] ?? null)}</span>
          <ChevronDown size={14} className={cn("text-white/60 transition-transform", open && "rotate-180")} />
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16 }}
            className="absolute left-0 right-0 mt-2 rounded-md overflow-hidden bg-black"
            style={{ zIndex: 9999, maxHeight: 240, overflowY: "auto", border: BORDER }}
          >
            {tokens.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  onSelect(t);
                  setOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors",
                  t.id === selected.id ? "bg-white/10" : "hover:bg-white/5"
                )}
              >
                <TokenLogo logo={t.logo} size={24} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-white font-mono">{t.symbol}</div>
                  <div className="text-[9px] text-white/50 uppercase tracking-wider font-mono">→ {t.destSymbol} on {t.destSymbol === "zkLTC" || t.destSymbol === "LDEX" && chain === "sepolia" ? "LitVM" : chain === "litvm" ? "Sepolia" : "LitVM"}</div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-white font-mono tabular-nums">{fmt4(bals[t.id] ?? null)}</div>
                  <div className="text-[8px] text-white/40 uppercase tracking-wider font-mono">max {t.max}</div>
                </div>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ============== Chain pill ==============
const ChainPill = ({ chain }: { chain: ChainKey }) => {
  const info = CHAIN_INFO[chain];
  return (
    <div className="flex items-center gap-2 min-w-0">
      <TokenLogo logo={chain === "litvm" ? "zkltc" : "eth"} size={20} />
      <div className="min-w-0">
        <div className="text-sm font-bold text-white truncate font-mono">{info.name}</div>
        <div className="text-[9px] text-white/40 uppercase tracking-wider font-mono">Chain {info.id}</div>
      </div>
    </div>
  );
};

// ============== Progress Modal ==============
type StepState = "pending" | "active" | "complete";
type ProgressState = {
  open: boolean;
  steps: { key: string; label: string }[];
  current: number;
  done: boolean;
  failed: boolean;
  txHash: string | null;
  fromChain: ChainKey;
  destChain: ChainKey;
  amount: string;
  destSymbol: string;
};

const Stepper = ({ steps, current, done }: { steps: { key: string; label: string }[]; current: number; done: boolean }) => (
  <div className="flex items-center justify-between w-full px-1">
    {steps.map((s, i) => {
      const state: StepState = done || i < current ? "complete" : i === current ? "active" : "pending";
      return (
        <React.Fragment key={s.key}>
          <div className="flex flex-col items-center gap-2 shrink-0">
            <div
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center transition-all",
                state === "active" && "animate-pulse"
              )}
              style={{
                border: state === "pending" ? "1px solid #333" : "1px solid #fff",
                background: state === "complete" || state === "active" ? "#fff" : "transparent",
                color: state === "complete" || state === "active" ? "#000" : "#666",
              }}
            >
              {state === "complete" ? <Check size={14} strokeWidth={3} /> : state === "active" ? <Loader2 size={14} className="animate-spin" /> : <div className="w-1.5 h-1.5 rounded-full bg-white/20" />}
            </div>
            <div
              className={cn("text-[8px] font-bold uppercase tracking-[0.15em] text-center max-w-[60px] leading-tight font-mono",
                state === "pending" ? "text-white/30" : "text-white")}
            >
              {s.label}
            </div>
          </div>
          {i < steps.length - 1 && (
            <div className="flex-1 h-px mx-1 transition-all" style={{ background: done || i < current ? "#fff" : "#2a2a2a" }} />
          )}
        </React.Fragment>
      );
    })}
  </div>
);

const ProgressModal = ({ state, onClose, onBridgeAgain }: { state: ProgressState; onClose: () => void; onBridgeAgain: () => void }) => {
  const sourceExplorer = state.fromChain === "sepolia" ? SEPOLIA_EXPLORER_URL : EXPLORER_URL;
  return (
    <AnimatePresence>
      {state.open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[10001] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => { if (state.done || state.failed) onClose(); }}
        >
          <motion.div
            initial={{ y: 200 }}
            animate={{ y: 0 }}
            exit={{ y: 200 }}
            transition={{ type: "spring", damping: 28, stiffness: 280 }}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
            className="w-full sm:max-w-md mx-auto p-6 sm:p-7"
            style={{ background: "#0a0a0a", border: BORDER, borderRadius: 16 }}
          >
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="text-[9px] font-bold uppercase tracking-[0.25em] text-white/50 font-mono">Cross-Chain Bridge</div>
                <div className="text-base font-black text-white mt-0.5 font-mono">
                  {state.done ? "Bridge Complete" : state.failed ? "Bridge Failed" : "Bridging…"}
                </div>
              </div>
              {(state.done || state.failed) && (
                <button onClick={onClose} className="w-8 h-8 rounded-md flex items-center justify-center text-white/60 hover:text-white" style={{ border: BORDER }}>
                  <X size={14} />
                </button>
              )}
            </div>

            {/* From → To header */}
            <div className="flex items-center justify-center gap-3 mb-2 font-mono">
              <div className="flex items-center gap-2">
                <TokenLogo logo={state.fromChain === "litvm" ? "zkltc" : "eth"} size={20} />
                <span className="text-xs font-bold text-white">{CHAIN_INFO[state.fromChain].name}</span>
              </div>
              <span className="text-white/40">→</span>
              <div className="flex items-center gap-2">
                <TokenLogo logo={state.destChain === "litvm" ? "zkltc" : "eth"} size={20} />
                <span className="text-xs font-bold text-white">{CHAIN_INFO[state.destChain].name}</span>
              </div>
            </div>
            <div className="text-center text-sm font-bold text-white mb-5 font-mono tabular-nums">
              {state.amount} {state.destSymbol}
            </div>

            <div className="py-2">
              <Stepper steps={state.steps} current={state.current} done={state.done} />
            </div>

            {state.done && (
              <div className="mt-5 text-center text-sm font-bold text-white font-mono">
                ✓ {state.amount} {state.destSymbol} arrived on {CHAIN_INFO[state.destChain].name}
              </div>
            )}

            {state.failed && (
              <div className="mt-5 text-center text-sm font-bold text-white font-mono">
                Bridge transaction failed. Please try again.
              </div>
            )}

            {state.txHash && (
              <a
                href={`${sourceExplorer}/tx/${state.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 flex items-center justify-center gap-2 w-full py-2.5 rounded-md text-xs font-bold uppercase tracking-wider text-white transition-all font-mono"
                style={{ border: BORDER }}
                onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 0 0 1px rgba(255,255,255,0.1)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.boxShadow = ""; }}
              >
                View on Explorer <ExternalLink size={12} />
              </a>
            )}

            {(state.done || state.failed) && (
              <button
                onClick={onBridgeAgain}
                className="mt-3 w-full py-4 rounded-xl bg-white text-black text-sm font-bold uppercase tracking-widest hover:opacity-90 transition-all"
              >
                Bridge Again
              </button>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ============== Main Bridge Card ==============
export default function BridgeCard({ className = "" }: { className?: string }) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();

  const [fromChain, setFromChain] = React.useState<ChainKey>("litvm");
  const toChain: ChainKey = fromChain === "litvm" ? "sepolia" : "litvm";
  const [tokenId, setTokenId] = React.useState<string>(TOKENS.litvm[0].id);
  const [amount, setAmount] = React.useState<string>("");
  const [balance, setBalance] = React.useState<bigint>(0n);
  const [isBridging, setIsBridging] = React.useState(false);

  const tokens = TOKENS[fromChain];
  const selected = tokens.find((t) => t.id === tokenId) || tokens[0];

  React.useEffect(() => {
    setTokenId(TOKENS[fromChain][0].id);
    setAmount("");
  }, [fromChain]);

  React.useEffect(() => {
    let alive = true;
    if (!address) { setBalance(0n); return; }
    (async () => {
      try {
        const b = await readBalance(fromChain, selected, address);
        if (alive) setBalance(b);
      } catch {
        if (alive) setBalance(0n);
      }
    })();
    return () => { alive = false; };
  }, [address, fromChain, selected.id, isBridging]);

  const balanceStr = React.useMemo(() => {
    try { return Number(formatEther(balance)).toFixed(4); } catch { return "0.0000"; }
  }, [balance]);

  const swapChains = () => setFromChain((c) => (c === "litvm" ? "sepolia" : "litvm"));

  const setMax = () => {
    const maxN = Math.min(selected.max, Number(formatEther(balance)));
    setAmount(maxN > 0 ? maxN.toFixed(6).replace(/\.?0+$/, "") : "0");
  };

  const setPct = (pct: number) => {
    const maxN = Math.min(selected.max, Number(formatEther(balance)));
    const v = (maxN * pct) / 100;
    setAmount(v > 0 ? v.toFixed(6).replace(/\.?0+$/, "") : "0");
  };

  const [progress, setProgress] = React.useState<ProgressState>({
    open: false,
    steps: [],
    current: 0,
    done: false,
    failed: false,
    txHash: null,
    fromChain: "litvm",
    destChain: "sepolia",
    amount: "0",
    destSymbol: "",
  });

  const closeProgress = () => setProgress((p) => ({ ...p, open: false }));
  const bridgeAgain = () => { closeProgress(); setAmount(""); };

  const handleBridge = async () => {
    if (!isConnected || !address) return;
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return;
    if (amt > selected.max) {
      alert(`Max bridge amount is ${selected.max} ${selected.symbol}`);
      return;
    }

    const needsApproval = selected.address !== null;

    // Build labeled steps per direction
    const baseSteps = fromChain === "litvm"
      ? [
          { key: "litvm", label: "LitVM" },
          { key: "approve", label: "Approve" },
          { key: "confirm", label: "Confirm" },
          { key: "bridging", label: "Bridging" },
          { key: "sepolia", label: "Sepolia" },
        ]
      : [
          { key: "sepolia", label: "Sepolia" },
          { key: "approve", label: "Approve" },
          { key: "confirm", label: "Confirm" },
          { key: "bridging", label: "Bridging" },
          { key: "litvm", label: "LitVM" },
        ];

    const steps = needsApproval ? baseSteps : baseSteps.filter((s) => s.key !== "approve");

    setProgress({
      open: true,
      steps,
      current: 0,
      done: false,
      failed: false,
      txHash: null,
      fromChain,
      destChain: toChain,
      amount,
      destSymbol: selected.destSymbol,
    });
    setIsBridging(true);

    try {
      const targetChainId = CHAIN_INFO[fromChain].id;
      await ensureChain(targetChainId);
      try { await switchChainAsync({ chainId: targetChainId }); } catch { /* ignore */ }

      const eth = (window as any).ethereum;
      const provider = new BrowserProvider(eth);
      const signer = await provider.getSigner();
      const amountWei = parseEther(amount);

      const bridgeAddr = fromChain === "litvm" ? LIT_BRIDGE : SEPOLIA_BRIDGE;

      if (needsApproval && selected.address) {
        setProgress((p) => ({ ...p, current: 1 }));
        const erc = new Contract(selected.address, ERC20_ABI, signer);
        const cur = (await erc.allowance(address, bridgeAddr)) as bigint;
        if (cur < amountWei) {
          const tx = await erc.approve(bridgeAddr, amountWei);
          await tx.wait();
        }
      }

      setProgress((p) => ({ ...p, current: needsApproval ? 2 : 1 }));
      let tx: any;
      if (fromChain === "litvm") {
        const bridge = new Contract(LIT_BRIDGE, LIT_BRIDGE_ABI, signer);
        if (selected.symbol === "zkLTC") tx = await bridge.lockZKLTC({ value: amountWei });
        else if (selected.symbol === "LDEX") tx = await bridge.lockLDEX(amountWei);
      } else {
        const bridge = new Contract(SEPOLIA_BRIDGE, SEPOLIA_BRIDGE_ABI, signer);
        if (selected.symbol === "ETH") tx = await bridge.lockETH({ value: amountWei });
        else if (selected.symbol === "WZKLTC") tx = await bridge.lockWZKLTC(amountWei);
        else if (selected.symbol === "LDEX") tx = await bridge.lockLDEX(amountWei);
      }
      if (!tx) throw new Error("Unsupported token");

      setProgress((p) => ({ ...p, current: needsApproval ? 3 : 2, txHash: tx.hash }));
      await tx.wait();

      setProgress((p) => ({ ...p, current: needsApproval ? 4 : 3, done: true }));
    } catch (err: any) {
      console.error(err);
      setProgress((p) => ({ ...p, failed: true }));
    } finally {
      setIsBridging(false);
    }
  };

  const canBridge = isConnected && !!amount && parseFloat(amount) > 0 && !isBridging;
  const wrongChain = isConnected && chainId !== CHAIN_INFO[fromChain].id;
  const pctVal = Math.min(selected.max, Number(formatEther(balance))) > 0
    ? Math.min(100, (Number(amount || 0) / Math.min(selected.max, Number(formatEther(balance)))) * 100)
    : 0;

  return (
    <div className={cn("w-full max-w-md sm:max-w-lg mx-auto", className)}>
      <section
        className="rounded-lg bg-black text-white p-4 sm:p-6 md:p-8 flex flex-col gap-4 sm:gap-6 transition-all"
        style={{ border: BORDER }}
        onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 0 0 1px rgba(255,255,255,0.1)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.boxShadow = ""; }}
      >
        <header className="flex items-center justify-between">
          <div className="space-y-1">
            <h2 className="text-pretty text-lg sm:text-xl font-semibold font-mono">Bridge</h2>
            <p className="text-sm text-white/60 font-mono">Cross-chain transfer</p>
          </div>
        </header>

        {/* FROM NETWORK */}
        <div className="flex flex-col gap-2">
          <label className="text-xs uppercase font-bold text-white/60 tracking-widest font-mono">From Network</label>
          <div className="flex items-center justify-between gap-3 rounded-md bg-black px-3 py-2.5" style={{ border: BORDER }}>
            <ChainPill chain={fromChain} />
          </div>
        </div>

        {/* Swap chains */}
        <div className="flex items-center justify-center">
          <motion.button
            type="button"
            onClick={swapChains}
            className="rounded-full bg-black px-4 py-2 text-xs font-bold uppercase font-mono"
            style={{ border: BORDER }}
            whileTap={{ scale: 0.96 }}
            whileHover={{ boxShadow: "0 0 0 1px rgba(255,255,255,0.1)" }}
          >
            ⇄ Swap
          </motion.button>
        </div>

        {/* TO NETWORK */}
        <div className="flex flex-col gap-2">
          <label className="text-xs uppercase font-bold text-white/60 tracking-widest font-mono">To Network</label>
          <div className="flex items-center justify-between gap-3 rounded-md bg-black px-3 py-2.5" style={{ border: BORDER }}>
            <ChainPill chain={toChain} />
            <span className="text-[10px] text-white/40 uppercase tracking-wider font-mono">auto</span>
          </div>
        </div>

        {/* TOKEN */}
        <div className="flex flex-col gap-2">
          <label className="text-xs uppercase font-bold text-white/60 tracking-widest font-mono">Token</label>
          <TokenDropdown chain={fromChain} tokens={tokens} selected={selected} onSelect={(t) => setTokenId(t.id)} walletAddress={address} />
        </div>

        {/* AMOUNT (You pay) */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-xs uppercase font-bold text-white/60 tracking-widest font-mono">You pay</label>
            <span className="text-[10px] text-white/60 font-mono">
              Balance: <span className="text-white tabular-nums">{balanceStr}</span> {selected.symbol}
            </span>
          </div>
          <div className="flex items-center gap-3 rounded-md bg-black px-3 py-2.5" style={{ border: BORDER }}>
            <TokenLogo logo={selected.logo} size={24} />
            <span className="text-sm font-bold text-white font-mono">{selected.symbol}</span>
            <button
              onClick={setMax}
              className="px-2 py-1 text-[9px] font-bold bg-white text-black rounded uppercase hover:opacity-90 transition-all font-sans"
            >
              MAX
            </button>
            <input
              inputMode="decimal"
              placeholder="0.00"
              className="flex-1 min-w-0 bg-transparent outline-none text-right text-lg sm:text-xl placeholder:text-white/30 font-mono tabular-nums"
              value={amount}
              onChange={(e) => {
                const v = e.target.value.replace(",", ".");
                if (v === "" || /^[0-9]*\.?[0-9]*$/.test(v)) setAmount(v);
              }}
            />
          </div>

          {/* Slider */}
          <div className="px-1 space-y-2 mt-1">
            <input
              type="range"
              min="0"
              max="100"
              value={pctVal}
              onChange={(e) => setPct(parseInt(e.target.value))}
              className="w-full accent-[var(--slider-fill)] h-1.5 appearance-none rounded-full cursor-pointer transition-all"
              style={{
                background: `linear-gradient(to right, var(--slider-fill) ${pctVal}%, var(--slider-track) ${pctVal}%)`
              }}
            />
            <div className="flex justify-between text-[8px] font-bold text-white/60 uppercase tracking-widest px-1 font-mono">
              {[25, 50, 75, 100].map(pct => (
                <button key={pct} onClick={() => setPct(pct)} className="hover:text-white transition-colors">
                  {pct}%
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* YOU RECEIVE */}
        <div className="flex flex-col gap-2">
          <label className="text-xs uppercase font-bold text-white/60 tracking-widest font-mono">You receive</label>
          <div className="flex items-center gap-3 rounded-md bg-black px-3 py-2.5" style={{ border: BORDER }}>
            <TokenLogo logo={selected.destSymbol === "WZKLTC" ? "wzkltc" : selected.destSymbol === "LDEX" ? "ldex" : "zkltc"} size={24} />
            <span className="text-sm font-bold text-white font-mono">{selected.destSymbol}</span>
            <div className="flex-1 min-w-0 text-right text-lg sm:text-xl font-mono overflow-hidden truncate tabular-nums">
              {amount || "0"}
            </div>
          </div>
          <div className="flex items-center justify-between px-1 text-[10px] text-white/50 font-mono">
            <span>Rate</span>
            <span className="text-white">1 {selected.symbol} = 1 {selected.destSymbol}</span>
          </div>
        </div>

        {/* Bridge button */}
        <motion.button
          type="button"
          onClick={handleBridge}
          disabled={!canBridge}
          whileTap={{ scale: 0.98 }}
          className={cn(
            "w-full rounded-xl px-4 py-4 text-sm font-bold uppercase tracking-widest transition-all",
            "bg-white text-black hover:opacity-90",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white shadow-[0_0_24px_rgba(255,255,255,0.1)]"
          )}
        >
          {!isConnected ? "Connect Wallet" : isBridging ? "Bridging…" : `Confirm Bridge`}
        </motion.button>

        {wrongChain && (
          <p className="text-center text-[10px] text-white/60 font-mono">
            Wallet on wrong network — will switch to {CHAIN_INFO[fromChain].name} on bridge
          </p>
        )}

        <footer className="flex items-center justify-between text-[9px] text-white/50 font-bold uppercase tracking-[0.2em] font-mono">
          <span>Powered by LitDeX</span>
          <span>Real-time bridge</span>
        </footer>
      </section>

      <ProgressModal state={progress} onClose={closeProgress} onBridgeAgain={bridgeAgain} />
    </div>
  );
}
