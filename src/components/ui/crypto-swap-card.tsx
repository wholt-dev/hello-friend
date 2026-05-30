import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { useAccount, useBalance } from "wagmi"
import { parseEther, formatEther, Contract } from "ethers"
import { 
  SWAP_TOKENS, 
  NATIVE_SENTINEL, 
  getSwapQuote, 
  swap, 
  pickRouter, 
  ROUTERS, 
  resolveWrappedNative, 
  buildSwapPath, 
  approveToken,
  getAllowance,
  litvmChain,
  ERC20_ABI,
  isNativeAddr,
  errMsg,
  loadPair,
  addLiquidity,
  removeLiquidity,
  DEFAULT_ROUTER,
  getUserLPPositions,
  LPPosition,
  readProvider
} from "@/lib/litdex-core-logic"
import type { RouterKey } from "@/lib/litdex-core-logic"
import { ChevronDown } from "lucide-react"
import { addNotif } from "@/lib/notifications"
import { showSuccess, showError, refreshPoints, awardActivity } from "@/lib/feedback"

type Coin = {
  address: string
  symbol: string
  image?: string
}

const LOCAL_COINS = SWAP_TOKENS;

export type SwapCardProps = {
  defaultFromId?: string
  defaultToId?: string
  className?: string
  mode?: "swap" | "pool"
}

export default function SwapCard({
  defaultFromId = NATIVE_SENTINEL,
  defaultToId = "0xFC43ABE529CDC61B7F0aa2e677451AFd83d2B304",
  className = "",
  mode = "swap",
}: SwapCardProps) {
  const { address: walletAddress, isConnected } = useAccount();
  const data = LOCAL_COINS;

  const [fromAddr, setFromAddr] = React.useState<string>(defaultFromId)
  const [toAddr, setToAddr] = React.useState<string>(defaultToId)
  const [fromAmount, setFromAmount] = React.useState<string>("1")
  const [toAmount, setToAmount] = React.useState<string>("0")
  const [isLoadingQuote, setIsLoadingQuote] = React.useState(false)
  const [isSwapping, setIsSwapping] = React.useState(false)
  const [subMode, setSubMode] = React.useState<"add" | "remove">("add")
  const [activeRouter, setActiveRouter] = React.useState<string>("")
  const [activeRouterKey, setActiveRouterKey] = React.useState<RouterKey>("liteswap")
  const [activePath, setActivePath] = React.useState<string[]>([])
  const [lpPositions, setLpPositions] = React.useState<LPPosition[]>([])
  const [loadingPositions, setLoadingPositions] = React.useState(false)
  const [poolShare, setPoolShare] = React.useState<string>("0")
  const [selectedLp, setSelectedLp] = React.useState<LPPosition | null>(null)
  const [removePercent, setRemovePercent] = React.useState<number>(100)
  const [needsApprovalFrom, setNeedsApprovalFrom] = React.useState(false)
  const [needsApprovalTo, setNeedsApprovalTo] = React.useState(false)
  const [isApproving, setIsApproving] = React.useState(false)
  const [txHash, setTxHash] = React.useState<string | null>(null)
  const [txStatus, setTxStatus] = React.useState<"success" | "failed" | null>(null)

  const [poolAction, setPoolAction] = React.useState<"add" | "remove">("remove")
  const [isPositionsExpanded, setIsPositionsExpanded] = React.useState(false)
  const [isSelectPositionExpanded, setIsSelectPositionExpanded] = React.useState(false)

  // Daily activity counter (swap or pool, depending on this card's mode).
  const [dailyUsed, setDailyUsed] = React.useState<number>(0)
  const DAILY_BUCKET = mode === "pool" ? "pool" : "swap"
  const DAILY_CAP = 100
  const fetchDailyCounts = React.useCallback(async () => {
    if (!walletAddress) { setDailyUsed(0); return; }
    try {
      const r = await fetch(`https://api.test-hub.xyz/activity/counts/${walletAddress.toLowerCase()}`);
      if (r.ok) {
        const d = await r.json();
        setDailyUsed(Number(d?.[DAILY_BUCKET]?.used ?? 0));
      }
    } catch { /* ignore */ }
  }, [walletAddress, DAILY_BUCKET]);
  React.useEffect(() => {
    fetchDailyCounts();
    const h = () => fetchDailyCounts();
    window.addEventListener("litdex:activity-refresh", h);
    return () => window.removeEventListener("litdex:activity-refresh", h);
  }, [fetchDailyCounts]);

  const { data: fromBalance } = useBalance({
    address: walletAddress,
    token: isNativeAddr(fromAddr) ? undefined : fromAddr as `0x${string}`,
    chainId: litvmChain.id,
  });

  const { data: toBalance } = useBalance({
    address: walletAddress,
    token: isNativeAddr(toAddr) ? undefined : toAddr as `0x${string}`,
    chainId: litvmChain.id,
  });

  const checkAllowances = React.useCallback(async () => {
    if (!walletAddress || !fromAddr || (!toAddr && subMode !== "remove")) return;

    try {
      const routerAddr = mode === "swap" ? ROUTERS[activeRouterKey]?.address : DEFAULT_ROUTER;
      if (!routerAddr) return;

      const [allowFrom, allowTo] = await Promise.all([
        (subMode === "remove" && poolAction === "remove" && selectedLp) 
          ? getAllowance(selectedLp.pairAddress, walletAddress, routerAddr)
          : getAllowance(fromAddr, walletAddress, routerAddr),
        (mode === "pool" && (subMode === "add" || (subMode === "remove" && poolAction === "add"))) 
          ? getAllowance(toAddr, walletAddress, routerAddr) 
          : Promise.resolve(parseEther("1000000000"))
      ]);

      const amountInWei = (mode === "pool" && subMode === "remove" && poolAction === "remove" && selectedLp)
        ? (selectedLp.lpBalance * BigInt(Math.floor(removePercent))) / 100n
        : parseEther(fromAmount || "0");
      const amountOutWei = parseEther(toAmount || "0");

      setNeedsApprovalFrom(
        (mode === "pool" && subMode === "remove" && poolAction === "remove" && selectedLp) 
          ? allowFrom < amountInWei 
          : (!isNativeAddr(fromAddr) && allowFrom < amountInWei)
      );
      setNeedsApprovalTo(
        (mode === "pool" && (subMode === "add" || (subMode === "remove" && poolAction === "add"))) 
          ? (!isNativeAddr(toAddr) && allowTo < amountOutWei)
          : false
      );
    } catch (err) {
      console.error("Allowance check error:", err);
    }
  }, [walletAddress, fromAddr, toAddr, fromAmount, toAmount, mode, subMode, activeRouterKey]);

  React.useEffect(() => {
    checkAllowances();
  }, [checkAllowances]);

  React.useEffect(() => {
    setTxStatus(null);
    setTxHash(null);
  }, [fromAddr, toAddr, fromAmount, toAmount, mode, subMode]);

  const coinMap = React.useMemo(() => {
    const map = new Map<string, Coin>()
    data.forEach((c) => map.set(c.address, c))
    return map
  }, [data])

  const fetchPositions = React.useCallback(async () => {
    if (!walletAddress) return;
    setLoadingPositions(true);
    try {
      const p = await getUserLPPositions(walletAddress);
      setLpPositions(p);
    } catch (err) {
      console.error("Fetch positions error:", err);
    } finally {
      setLoadingPositions(false);
    }
  }, [walletAddress]);

  React.useEffect(() => {
    if (isConnected && walletAddress) {
      fetchPositions();
    }
  }, [isConnected, walletAddress, fetchPositions]);

  // Pool ratio / Share logic
  React.useEffect(() => {
    const updatePoolState = async () => {
      if (mode !== "pool" || subMode !== "add") return;
      if (!fromAddr || !toAddr || fromAddr === toAddr || !fromAmount || isNaN(Number(fromAmount)) || Number(fromAmount) <= 0) {
        setPoolShare("0");
        return;
      }

      try {
        const state = await loadPair(fromAddr, toAddr, walletAddress || undefined);
        if (state.pairAddress && state.totalSupply > 0n) {
          // Token0 vs Token1 reserves
          const r0 = state.reserves[0];
          const r1 = state.reserves[1];
          
          const resolvedFrom = isNativeAddr(fromAddr) ? "0x60A84eBC3483fEFB251B76Aea5B8458026Ef4bea" : fromAddr; // WZKLTC_ADDR
          const fromIsToken0 = resolvedFrom.toLowerCase() === state.token0.toLowerCase();
          
          // amountB = amountA * reserveB / reserveA
          const amtA = parseEther(fromAmount);
          let amtB = 0n;
          if (fromIsToken0) {
            amtB = (amtA * r1) / r0;
          } else {
            amtB = (amtA * r0) / r1;
          }
          setToAmount(formatEther(amtB));

          // Est. Share: (amtA / (rA + amtA)) * 100
          const shareBps = (amtA * 10000n) / (fromIsToken0 ? r0 + amtA : r1 + amtA);
          setPoolShare((Number(shareBps) / 100).toFixed(2));
        } else {
          setPoolShare("100"); // Initial provider
        }
      } catch (err) {
        console.error("Pool ratio error:", err);
      }
    };

    updatePoolState();
  }, [fromAmount, fromAddr, toAddr, mode, subMode, walletAddress]);

  // Quote logic
  React.useEffect(() => {
    const fetchQuote = async () => {
      if (mode === "pool") return; 
      if (!fromAmount || isNaN(Number(fromAmount)) || Number(fromAmount) <= 0 || !fromAddr || !toAddr || fromAddr === toAddr) {
        setToAmount("0");
        return;
      }

      setIsLoadingQuote(true);
      try {
        const { amountOut, router, routerKey, path } = await getSwapQuote(
          fromAddr === NATIVE_SENTINEL ? "NATIVE" : fromAddr,
          toAddr === NATIVE_SENTINEL ? "NATIVE" : toAddr,
          fromAmount
        );
        setToAmount(amountOut);
        setActiveRouter(router);
        setActiveRouterKey(routerKey);
        setActivePath(path);
      } catch (err) {
        console.error("Quote error:", err);
        setToAmount("0");
        setActiveRouter("Error");
      } finally {
        setIsLoadingQuote(false);
      }
    };

    const timer = setTimeout(fetchQuote, 500);
    return () => clearTimeout(timer);
  }, [fromAmount, fromAddr, toAddr, mode]);

  const [rotation, setRotation] = React.useState(0)

  function swapSides() {
    setFromAddr(toAddr)
    setToAddr(fromAddr)
    setRotation(r => r + 360)
  }

  const handleApprove = async (side: "from" | "to") => {
    if (!isConnected || !walletAddress) return;
    const routerAddr = mode === "swap" ? ROUTERS[activeRouterKey]?.address : DEFAULT_ROUTER;

    // LP token approve when removing liquidity
    const isLpApprove = mode === "pool" && subMode === "remove" && poolAction === "remove" && !!selectedLp && side === "from";

    let addr: string;
    let amountWei: bigint;
    if (isLpApprove && selectedLp) {
      addr = selectedLp.pairAddress;
      // approve full LP balance to avoid future re-approvals
      amountWei = selectedLp.lpBalance;
    } else {
      addr = side === "from" ? fromAddr : toAddr;
      const amount = side === "from" ? fromAmount : toAmount;
      amountWei = parseEther(amount || "0");
    }

    setIsApproving(true);
    setTxStatus(null);
    setTxHash(null);
    try {
      const hash = await approveToken(addr, routerAddr, amountWei);
      setTxHash(hash);
      setTxStatus("success");
      const explorerUrl = `${litvmChain.blockExplorers.default.url}/tx/${hash}`;
      const shortHash = `${hash.slice(0, 6)}...${hash.slice(-4)}`;
      if (isLpApprove) {
        showSuccess({
          title: "APPROVE CONFIRMED",
          subtitle: "LP TOKEN APPROVED",
          rows: [
            { label: "TRANSACTION", value: shortHash, href: explorerUrl },
            { label: "STATUS", value: "READY TO PROCEED" },
          ],
        });
      } else {
        showSuccess({
          title: "APPROVE CONFIRMED",
          subtitle: "TOKEN APPROVED FOR PROTOCOL",
          rows: [
            { label: "TRANSACTION", value: shortHash, href: explorerUrl },
            { label: "STATUS", value: "READY TO PROCEED" },
          ],
        });
      }
      await checkAllowances();
    } catch (err) {
      console.error("Approval error:", err);
      setTxStatus("failed");
    } finally {
      setIsApproving(false);
    }
  }

  const handleAction = async () => {
    if (!isConnected || !walletAddress) {
      showError("Please connect your wallet first.");
      return;
    }
    setIsSwapping(true);
    setTxStatus(null);
    setTxHash(null);
    try {
      if (mode === "swap") {
        const rKey: RouterKey = activeRouterKey;
        const rAddr = ROUTERS[rKey].address;
        const amountInWei = parseEther(fromAmount);
        const path = activePath;
        
        const hash = await swap({
          routerKey: rKey,
          routerAddr: rAddr,
          tokenInAddr: fromAddr,
          tokenOutAddr: toAddr,
          amountInWei,
          amountOutMinWei: 0n, 
          recipient: walletAddress,
          path
        });
        setTxHash(hash);
        setTxStatus("success");
        const ti = coinMap.get(fromAddr)?.symbol ?? "?";
        const to = coinMap.get(toAddr)?.symbol ?? "?";
        try {
          if (walletAddress) addNotif(walletAddress, {
            type: "swap",
            title: "Swap Successful",
            message: `Swapped ${fromAmount} ${ti} → ${toAmount} ${to}`,
          });
        } catch { /* ignore */ }
        showSuccess({
          title: "SWAP CONFIRMED",
          subtitle: "PROTOCOL VERIFICATION COMPLETE",
          rows: [
            { label: "BASE POINTS", value: dailyUsed >= DAILY_CAP ? "+0 PTS (DAILY CAP)" : "+5 PTS" },
            { label: "SENT", value: `${fromAmount} ${ti}` },
            { label: "RECEIVED", value: `${toAmount} ${to}` },
            { label: "ROUTER", value: ROUTERS[rKey].label || "LitDEX" },
          ],
        });
        refreshPoints();
        awardActivity({ wallet: walletAddress, action: "swap", txHash: hash });
      } else {
        if (subMode === "add" || (subMode === "remove" && poolAction === "add")) {
          const rKey = "liteswap";
          const amtA = parseEther(fromAmount);
          const amtB = parseEther(toAmount);

          const hash = await addLiquidity({
            tokenAAddr: fromAddr,
            tokenBAddr: toAddr,
            amountAWei: amtA,
            amountBWei: amtB,
            recipient: walletAddress
          });
          setTxHash(hash);
          setTxStatus("success");
          const ta = coinMap.get(fromAddr)?.symbol ?? "?";
          const tb = coinMap.get(toAddr)?.symbol ?? "?";
          try {
            if (walletAddress) addNotif(walletAddress, {
              type: "lp",
              title: "Liquidity Added",
              message: `Added liquidity to ${ta} / ${tb} pool`,
            });
          } catch { /* ignore */ }
          showSuccess({
            title: "LIQUIDITY ADDED",
            subtitle: "PROTOCOL VERIFICATION COMPLETE",
            rows: [
              { label: "BASE POINTS", value: dailyUsed >= DAILY_CAP ? "+0 PTS (DAILY CAP)" : "+5 PTS" },
              { label: "PAIR", value: `${ta} / ${tb}` },
              { label: "STATUS", value: "POOL UPDATED" },
            ],
          });
          refreshPoints();
          awardActivity({ wallet: walletAddress, action: "pool", txHash: hash });
          fetchPositions();
        } else {
          if (!selectedLp) {
            showError("Please select a liquidity position first.");
            return;
          }
          const lpToRemove = (selectedLp.lpBalance * BigInt(Math.floor(removePercent))) / 100n;
          
          const hash = await removeLiquidity({
            tokenAAddr: selectedLp.token0,
            tokenBAddr: selectedLp.token1,
            lpWei: lpToRemove,
            recipient: walletAddress
          });
          setTxHash(hash);
          setTxStatus("success");
          const ta = coinMap.get(selectedLp.token0)?.symbol ?? "?";
          const tb = coinMap.get(selectedLp.token1)?.symbol ?? "?";
          try {
            if (walletAddress) addNotif(walletAddress, {
              type: "lp",
              title: "Liquidity Removed",
              message: `Removed liquidity from ${ta} / ${tb} pool`,
            });
          } catch { /* ignore */ }
          showSuccess({
            title: "LIQUIDITY REMOVED",
            subtitle: "PROTOCOL VERIFICATION COMPLETE",
            rows: [
              { label: "BASE POINTS", value: dailyUsed >= DAILY_CAP ? "+0 PTS (DAILY CAP)" : "+5 PTS" },
              { label: "PAIR", value: `${ta} / ${tb}` },
              { label: "STATUS", value: "POSITION CLOSED" }
            ],
          });
          refreshPoints();
          awardActivity({ wallet: walletAddress, action: "pool", txHash: hash });
          fetchPositions();
          setSelectedLp(null);
        }
      }
    } catch (err: any) {
      console.error("Action error:", err);
      setTxStatus("failed");
      showError(errMsg(err));
    } finally {
      setIsSwapping(false);
    }
  }

  const formatTokenDisplay = (n: string | number) => {
    const val = typeof n === "string" ? parseFloat(n) : n;
    return val.toLocaleString(undefined, { maximumFractionDigits: 6 });
  }

  return (
    <motion.section
      role="region"
      aria-label="Crypto swap"
      className={[
        "w-full max-w-md sm:max-w-lg",
        "rounded-lg border border-brand-border bg-brand-surface text-brand-text-primary",
        "shadow-sm p-4 sm:p-6 md:p-8",
        "flex flex-col gap-4 sm:gap-6",
        className,
      ].join(" ")}
      whileHover={{ y: -2 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
      <header className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-pretty text-lg sm:text-xl font-semibold">
            {mode === "pool" ? (subMode === "add" ? "Add Pool" : "Your Pools") : "Swap"}
          </h2>
          <p className="text-sm text-brand-text-muted">
            {mode === "pool" 
              ? (subMode === "add" ? "Provide liquidity and earn fees" : "Manage your liquidity positions")
              : `Trading on ${ROUTERS[pickRouter(fromAddr, toAddr)].label}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isConnected && (
            <span
              title={`${mode === "pool" ? "Pool" : "Swap"} points today (+5 each, resets daily)`}
              className="italic text-[11px] font-medium text-white/70 tabular-nums px-2.5 py-1 rounded-full border border-white/10 bg-white/5"
            >
              {Math.min(dailyUsed, DAILY_CAP)}/{DAILY_CAP}
            </span>
          )}
          {mode === "pool" && (
            <div className="flex bg-brand-surface-2 rounded-lg p-1 border border-brand-border mr-2">
              <button
                onClick={() => setSubMode("add")}
                className={cn(
                  "px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all",
                  subMode === "add" ? "bg-white text-black" : "text-brand-text-muted hover:text-white"
                )}
              >
                Add
              </button>
              <button
                onClick={() => {
                  setSubMode("remove");
                  // Optional: refresh positions when clicking Your Pools
                  fetchPositions();
                }}
                className={cn(
                  "px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all",
                  subMode === "remove" ? "bg-white text-black" : "text-brand-text-muted hover:text-white"
                )}
              >
                Your Pools
              </button>
            </div>
          )}
        </div>
      </header>

      {mode === "pool" && subMode === "remove" ? (
        <div className="flex flex-col gap-4">
          <div className="flex justify-between items-center px-1">
             <span className="text-[10px] uppercase font-bold text-brand-text-muted tracking-[0.2em]">Active Positions</span>
             <span className="text-[9px] font-mono text-brand-text-muted">({lpPositions.length})</span>
          </div>
          <div className="flex flex-col gap-2 no-scrollbar">
            {lpPositions.length === 0 ? (
              <div className="p-10 border border-brand-border rounded-2xl text-center bg-brand-surface-2/50 backdrop-blur-sm">
                 <p className="text-[10px] text-brand-text-muted uppercase font-bold tracking-[0.2em] mb-4">No active positions</p>
                 <button onClick={() => setSubMode("add")} className="px-4 py-2 bg-white text-black text-[10px] font-bold uppercase rounded-lg hover:opacity-90 transition-all">Add Liquidity</button>
              </div>
            ) : (
              <>
              {(isPositionsExpanded ? lpPositions : lpPositions.slice(0, 2)).map((pos) => {
                const t0 = coinMap.get(pos.token0);
                const t1 = coinMap.get(pos.token1);
                const isSelected = selectedLp?.pairAddress === pos.pairAddress;
                return (
                  <button
                    key={pos.pairAddress}
                    onClick={() => {
                        setSelectedLp(pos);
                        // Pre-fill tokens
                        setFromAddr(pos.token0);
                        setToAddr(pos.token1);
                    }}
                    className={cn(
                      "flex items-center justify-between p-4 rounded-xl border transition-all relative overflow-hidden",
                      isSelected 
                        ? "bg-white/10 border-white/20 shadow-[0_0_20px_rgba(255,255,255,0.03)]" 
                        : "bg-brand-surface-2 border-brand-border hover:border-white/10 hover:bg-white/[0.02]"
                    )}
                  >
                    {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-white" />}
                    <div className="flex items-center gap-3">
                       <div className="flex -space-x-2">
                          <img src={t0?.image} className="w-5 h-5 rounded-full border border-black" alt="" />
                          <img src={t1?.image} className="w-5 h-5 rounded-full border border-black" alt="" />
                       </div>
                       <span className={cn("font-bold text-xs", isSelected ? "text-white" : "text-brand-text-muted")}>
                         {t0?.symbol} / {t1?.symbol}
                       </span>
                    </div>
                    <div className="text-right">
                       <div className="text-[10px] font-bold text-white tracking-widest">{(Number(pos.share)/100).toFixed(2)}% SHARE</div>
                       <div className="text-[9px] text-brand-text-muted font-mono">{formatTokenDisplay(formatEther(pos.lpBalance))} LP</div>
                    </div>
                  </button>
                );
              })}
              {lpPositions.length > 2 && (
                <div className="flex justify-center -mt-1 pb-1">
                  <button 
                    onClick={() => setIsPositionsExpanded(!isPositionsExpanded)}
                    className="group flex flex-col items-center gap-1 p-2 transition-all"
                  >
                    <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-brand-text-muted group-hover:text-white transition-colors">
                      {isPositionsExpanded ? "Show Less" : "Show More"}
                    </span>
                    <motion.div 
                      animate={{ 
                        rotate: isPositionsExpanded ? 180 : 0,
                        y: isPositionsExpanded ? 1 : 0
                      }}
                      transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    >
                      <ChevronDown className="w-4 h-4 text-brand-text-muted group-hover:text-white transition-colors" />
                    </motion.div>
                  </button>
                </div>
              )}
              </>
            )}
          </div>
          
          {selectedLp && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 p-5 rounded-2xl bg-brand-surface-2 border border-brand-border space-y-6"
            >
               <div className="flex bg-black/40 rounded-xl p-1 border border-white/5">
                  <button 
                    onClick={() => setPoolAction("remove")}
                    className={cn(
                      "flex-1 py-2 text-[10px] font-bold uppercase tracking-[0.15em] rounded-lg transition-all",
                      poolAction === "remove" ? "bg-white text-black" : "text-brand-text-muted hover:text-white"
                    )}
                  >
                    Remove
                  </button>
                  <button 
                    onClick={() => setPoolAction("add")}
                    className={cn(
                      "flex-1 py-2 text-[10px] font-bold uppercase tracking-[0.15em] rounded-lg transition-all",
                      poolAction === "add" ? "bg-white text-black" : "text-brand-text-muted hover:text-white"
                    )}
                  >
                    Add
                  </button>
               </div>

               {poolAction === "remove" ? (
                 <div className="space-y-6">
                    <div className="flex justify-between items-end">
                       <div>
                          <span className="text-[10px] font-bold text-brand-text-muted uppercase tracking-[0.2em] block mb-1">Amount to Remove</span>
                          <span className="text-2xl font-mono font-bold text-white tracking-tighter">{removePercent}%</span>
                       </div>
                       <div className="text-right">
                          <span className="text-[8px] font-bold text-brand-text-muted uppercase tracking-widest block">Est. Withdrawal</span>
                          <span className="text-[10px] font-mono text-white/60">
                             {formatTokenDisplay((Number(formatEther(selectedLp.lpBalance)) * removePercent / 100).toString())} LP
                          </span>
                       </div>
                    </div>
                    <div className="px-1 space-y-4">
                    <input 
                      type="range" 
                      min="1" max="100" 
                      value={removePercent} 
                      onChange={(e) => setRemovePercent(parseInt(e.target.value))}
                      className="w-full accent-[var(--slider-fill)] h-1.5 appearance-none bg-brand-bg rounded-full cursor-pointer transition-all"
                      style={{
                        background: `linear-gradient(to right, var(--slider-fill) ${removePercent}%, var(--slider-track) ${removePercent}%)`
                      }}
                     />
                     <div className="flex justify-between gap-2">
                        {[25, 50, 75, 100].map(pct => (
                          <button 
                            key={pct} 
                            onClick={() => setRemovePercent(pct)} 
                            className={cn(
                                "flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all border",
                                removePercent === pct ? "bg-white/10 border-white/20 text-white" : "bg-black/20 border-white/5 text-brand-text-muted hover:text-white"
                            )}
                          >
                             {pct}%
                          </button>
                        ))}
                     </div>
                  </div>
                 </div>
               ) : (
                 <div className="space-y-5 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="space-y-4">
                 <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-brand-text-muted">
                       <span>{coinMap.get(selectedLp.token0)?.symbol} Amount</span>
                       <span>Bal: {fromBalance ? formatTokenDisplay(formatEther(fromBalance.value)) : "0.00"}</span>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 bg-black/40 border border-white/5 p-3 rounded-xl focus-within:border-white/20 transition-colors">
                         <input
                           type="number"
                           placeholder="0.00"
                           className="flex-1 bg-transparent outline-none text-right font-mono text-xl"
                           value={fromAmount}
                           onChange={(e) => setFromAmount(e.target.value)}
                         />
                         <button onClick={() => fromBalance && setFromAmount(formatEther(fromBalance.value))} className="px-2 py-1 text-[9px] font-bold bg-white text-black rounded uppercase hover:opacity-90 transition-colors">Max</button>
                      </div>
                      <div className="px-1">
                        <input 
                          type="range" 
                          min="0" max="100" 
                          value={fromBalance && Number(formatEther(fromBalance.value)) > 0 ? (Number(fromAmount) / Number(formatEther(fromBalance.value)) * 100) : 0} 
                          onChange={(e) => {
                            if (fromBalance) {
                              const pct = parseInt(e.target.value)
                              const amt = (Number(formatEther(fromBalance.value)) * pct) / 100
                              setFromAmount(amt.toFixed(6))
                            }
                          }}
                          className="w-full accent-[var(--slider-fill)] h-1.5 appearance-none bg-black/40 border border-white/5 rounded-full cursor-pointer transition-all"
                          style={{
                            background: `linear-gradient(to right, var(--slider-fill) ${fromBalance && Number(formatEther(fromBalance.value)) > 0 ? (Number(fromAmount) / Number(formatEther(fromBalance.value)) * 100) : 0}%, var(--slider-track) ${fromBalance && Number(formatEther(fromBalance.value)) > 0 ? (Number(fromAmount) / Number(formatEther(fromBalance.value)) * 100) : 0}%)`
                          }}
                        />
                      </div>
                    </div>
                 </div>

                 <div className="flex flex-col gap-2">
                    <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-brand-text-muted">
                       <span>{coinMap.get(selectedLp.token1)?.symbol} Amount</span>
                       <span>Bal: {toBalance ? formatTokenDisplay(formatEther(toBalance.value)) : "0.00"}</span>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 bg-black/40 border border-white/5 p-3 rounded-xl focus-within:border-white/20 transition-colors">
                         <input
                           type="number"
                           placeholder="0.00"
                           className="flex-1 bg-transparent outline-none text-right font-mono text-xl"
                           value={toAmount}
                           onChange={(e) => setToAmount(e.target.value)}
                         />
                         <button onClick={() => toBalance && setToAmount(formatEther(toBalance.value))} className="px-2 py-1 text-[9px] font-bold bg-white text-black rounded uppercase hover:opacity-90 transition-colors">Max</button>
                      </div>
                      <div className="px-1">
                        <input 
                          type="range" 
                          min="0" max="100" 
                          value={toBalance && Number(formatEther(toBalance.value)) > 0 ? (Number(toAmount) / Number(formatEther(toBalance.value)) * 100) : 0} 
                          onChange={(e) => {
                            if (toBalance) {
                              const pct = parseInt(e.target.value)
                              const amt = (Number(formatEther(toBalance.value)) * pct) / 100
                              setToAmount(amt.toFixed(6))
                            }
                          }}
                          className="w-full accent-[var(--slider-fill)] h-1.5 appearance-none bg-black/40 border border-white/5 rounded-full cursor-pointer transition-all"
                          style={{
                            background: `linear-gradient(to right, var(--slider-fill) ${toBalance && Number(formatEther(toBalance.value)) > 0 ? (Number(toAmount) / Number(formatEther(toBalance.value)) * 100) : 0}%, var(--slider-track) ${toBalance && Number(formatEther(toBalance.value)) > 0 ? (Number(toAmount) / Number(formatEther(toBalance.value)) * 100) : 0}%)`
                          }}
                        />
                      </div>
                    </div>
                 </div>
              </div>
                    <div className="flex items-center justify-between px-1 text-[10px] font-bold text-brand-text-muted uppercase tracking-widest">
                       <span>Est. Pool Share</span>
                       <span className="text-white">{poolShare}%</span>
                    </div>
                 </div>
               )}
            </motion.div>
          )}
        </div>
      ) : (
        <>
      {/* From */}
      <div className="grid grid-cols-1 gap-3 sm:gap-4 items-end">
        <div className="flex flex-col gap-2">
          <label htmlFor="from-amount" className="text-xs uppercase font-bold text-brand-text-muted tracking-widest">
            {mode === "pool" ? "Token A Amount" : "You pay"}
          </label>
          <div
            className={[
              "flex items-center gap-3 rounded-md border border-brand-border bg-brand-bg px-3 py-2.5",
              "focus-within:ring-1 focus-within:ring-white",
            ].join(" ")}
          >
            <TokenSelector
              coins={data}
              selectedId={fromAddr}
              onSelect={(addr) => {
                if (addr === toAddr) setToAddr(fromAddr)
                setFromAddr(addr)
              }}
              side="from"
            />
            <button
              onClick={() => {
                if (fromBalance) {
                  setFromAmount(formatEther(fromBalance.value))
                }
              }}
              className="px-2 py-1 text-[9px] font-bold bg-white text-black rounded uppercase hover:opacity-90 transition-all font-sans"
            >
              MAX
            </button>
            <input
              id="from-amount"
              inputMode="decimal"
              pattern="^[0-9]*[.,]?[0-9]*$"
              placeholder="0.00"
              className="flex-1 min-w-0 bg-transparent outline-none text-right text-lg sm:text-xl placeholder:text-brand-text-muted font-mono"
              value={fromAmount}
              onChange={(e) => {
                const v = e.target.value.replace(",", ".")
                if (v === "" || /^[0-9]*\.?[0-9]*$/.test(v)) setFromAmount(v)
              }}
            />
          </div>
          {/* From Percentage Slider */}
          <div className="px-1 space-y-2 mt-1">
            <input 
              type="range" 
              min="0" max="100" 
              value={fromBalance && Number(formatEther(fromBalance.value)) > 0 ? (Number(fromAmount) / Number(formatEther(fromBalance.value)) * 100) : 0} 
              onChange={(e) => {
                if (fromBalance) {
                  const pct = parseInt(e.target.value)
                  const amt = (Number(formatEther(fromBalance.value)) * pct) / 100
                  setFromAmount(amt.toFixed(6))
                }
              }}
              className="w-full accent-[var(--slider-fill)] h-1.5 appearance-none bg-brand-surface-2 rounded-full cursor-pointer transition-all"
              style={{
                background: `linear-gradient(to right, var(--slider-fill) ${fromBalance && Number(formatEther(fromBalance.value)) > 0 ? (Number(fromAmount) / Number(formatEther(fromBalance.value)) * 100) : 0}%, var(--slider-track) ${fromBalance && Number(formatEther(fromBalance.value)) > 0 ? (Number(fromAmount) / Number(formatEther(fromBalance.value)) * 100) : 0}%)`
              }}
            />
            <div className="flex justify-between text-[8px] font-bold text-brand-text-muted uppercase tracking-widest px-1">
              {[25, 50, 75, 100].map(pct => (
                <button 
                  key={pct}
                  onClick={() => {
                    if (fromBalance) {
                      const amt = (Number(formatEther(fromBalance.value)) * pct) / 100
                      setFromAmount(amt.toFixed(6))
                    }
                  }}
                  className="hover:text-white transition-colors"
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center">
        <motion.button
          type="button"
          onClick={swapSides}
          className={[
            "rounded-full border border-brand-border bg-brand-surface-2 hover:bg-white/10 px-4 py-2 text-xs font-bold uppercase",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white",
          ].join(" ")}
          animate={{ rotate: rotation }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          whileTap={{ scale: 0.96 }}
        >
          {mode === "swap" ? "⇅ Swap" : "⇅"}
        </motion.button>
      </div>

      {/* To */}
      <div className="grid grid-cols-1 gap-3 sm:gap-4 items-end">
        <div className="flex flex-col gap-2">
          <label htmlFor="to-amount" className="text-xs uppercase font-bold text-brand-text-muted tracking-widest">
            {mode === "pool" ? "Token B Amount" : "You receive"}
          </label>
          <div
            className={[
              "flex items-center gap-3 rounded-md border border-brand-border bg-brand-bg px-3 py-2.5",
              "focus-within:ring-1 focus-within:ring-white",
            ].join(" ")}
          >
            <TokenSelector
              coins={data}
              selectedId={toAddr}
              onSelect={(addr) => {
                if (addr === fromAddr) setFromAddr(toAddr)
                setToAddr(addr)
              }}
              side="to"
            />
            {mode === "pool" ? (
               <>
                <button
                  onClick={() => {
                    if (toBalance) {
                      setToAmount(formatEther(toBalance.value))
                    }
                  }}
                  className="px-2 py-1 text-[9px] font-bold bg-white text-black rounded uppercase hover:opacity-90 transition-all font-sans"
                >
                  MAX
                </button>
                <input
                  id="to-amount"
                  inputMode="decimal"
                  pattern="^[0-9]*[.,]?[0-9]*$"
                  placeholder="0.00"
                  className="flex-1 min-w-0 bg-transparent outline-none text-right text-lg sm:text-xl placeholder:text-brand-text-muted font-mono"
                  value={toAmount}
                  onChange={(e) => {
                    const v = e.target.value.replace(",", ".")
                    if (v === "" || /^[0-9]*\.?[0-9]*$/.test(v)) setToAmount(v)
                  }}
                />
              </>
            ) : (
              <output
                id="to-amount"
                className={cn(
                  "flex-1 min-w-0 text-right text-lg sm:text-xl font-mono overflow-hidden truncate",
                  isLoadingQuote && "animate-pulse opacity-50"
                )}
              >
                {isLoadingQuote ? "..." : formatTokenDisplay(toAmount)}
              </output>
            )}
          </div>
          {/* To Percentage Slider (Add Pool only) */}
          {mode === "pool" && subMode === "add" && (
            <div className="px-1 space-y-2 mt-1">
              <input 
                type="range" 
                min="0" max="100" 
                value={toBalance && Number(formatEther(toBalance.value)) > 0 ? (Number(toAmount) / Number(formatEther(toBalance.value)) * 100) : 0} 
                onChange={(e) => {
                  if (toBalance) {
                    const pct = parseInt(e.target.value)
                    const amt = (Number(formatEther(toBalance.value)) * pct) / 100
                    setToAmount(amt.toFixed(6))
                  }
                }}
                className="w-full accent-[var(--slider-fill)] h-1.5 appearance-none bg-brand-surface-2 rounded-full cursor-pointer transition-all"
                style={{
                  background: `linear-gradient(to right, var(--slider-fill) ${toBalance && Number(formatEther(toBalance.value)) > 0 ? (Number(toAmount) / Number(formatEther(toBalance.value)) * 100) : 0}%, var(--slider-track) ${toBalance && Number(formatEther(toBalance.value)) > 0 ? (Number(toAmount) / Number(formatEther(toBalance.value)) * 100) : 0}%)`
                }}
              />
              <div className="flex justify-between text-[8px] font-bold text-brand-text-muted uppercase tracking-widest px-1">
                {[25, 50, 75, 100].map(pct => (
                  <button 
                    key={pct}
                    onClick={() => {
                      if (toBalance) {
                        const amt = (Number(formatEther(toBalance.value)) * pct) / 100
                        setToAmount(amt.toFixed(6))
                      }
                    }}
                    className="hover:text-white transition-colors"
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      </>
      )}

      {mode === "pool" && subMode === "add" && (
        <div className="flex items-center justify-between px-1">
           <span className="text-[10px] font-bold text-brand-text-muted uppercase tracking-widest">Pool Share</span>
           <span className="text-xs font-bold text-white">{poolShare}%</span>
        </div>
      )}

          {txStatus && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }} 
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "p-3 rounded-xl border text-[10px] font-bold uppercase tracking-widest text-center",
            txStatus === "success" 
              ? "bg-white/5 border-white/10 text-white shadow-[0_0_20px_rgba(255,255,255,0.05)]" 
              : "bg-white/[0.02] border-white/5 text-white/40"
          )}
        >
          {txStatus === "success" ? "Transaction Success" : "Transaction Failed"}
          {txHash && (
            <a 
              href={`${litvmChain.blockExplorers.default.url}/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
              className="block mt-1 underline opacity-50 hover:opacity-100 transition-opacity"
            >
              View on Explorer
            </a>
          )}
        </motion.div>
      )}

      <motion.button
        type="button"
        disabled={!isConnected || isSwapping || isApproving || (mode === "swap" && parseFloat(fromAmount) <= 0)}
        className={[
          "w-full rounded-xl px-4 py-4 text-sm font-bold uppercase tracking-widest transition-all",
          "bg-white text-black hover:opacity-90",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white shadow-[0_0_24px_rgba(255,255,255,0.1)]",
        ].join(" ")}
        whileTap={{ scale: 0.98 }}
        onClick={() => {
          if (needsApprovalFrom) handleApprove("from");
          else if (needsApprovalTo) handleApprove("to");
          else handleAction();
        }}
      >
        {!isConnected 
          ? "Connect Wallet" 
          : isSwapping || isApproving
            ? "Processing..." 
            : needsApprovalFrom 
              ? `Approve ${subMode === "remove" && poolAction === "remove" ? "LP" : coinMap.get(fromAddr)?.symbol}` 
              : needsApprovalTo 
                ? `Approve ${coinMap.get(toAddr)?.symbol}` 
                : mode === "pool" 
                  ? ((subMode === "add" || (subMode === "remove" && poolAction === "add")) ? "Confirm Add Liquidity" : "Confirm Remove Liquidity") 
                  : "Confirm Swap"}
      </motion.button>

      <footer className="flex items-center justify-between text-[9px] text-brand-text-muted font-bold uppercase tracking-[0.2em]">
        <div className="flex flex-col gap-1">
          <span>Powered by LitDEX</span>
          {activeRouter && mode === "swap" && (
            <span className="text-white opacity-60">Routed via {activeRouter}</span>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <span>Real-time quotes</span>
        </div>
      </footer>

      {mode === "pool" && lpPositions.length > 0 && (
         <div className="mt-8 pt-8 border-t border-white/5">
            <div className="flex justify-between items-center mb-4">
             <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] mb-4">Select Position</h3>
               <button onClick={fetchPositions} className="text-[8px] font-bold text-brand-text-muted hover:text-white uppercase tracking-widest">Refresh</button>
            </div>
            <div className="space-y-2">
               {(isSelectPositionExpanded ? lpPositions : lpPositions.slice(0, 2)).map(pos => {
                   const t0 = coinMap.get(pos.token0);
                   const t1 = coinMap.get(pos.token1);
                   return (
                       <button 
                        key={pos.pairAddress} 
                        onClick={() => {
                          setSubMode("remove");
                          setSelectedLp(pos);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="w-full flex justify-between items-center p-3 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all cursor-pointer group text-left"
                       >
                          <div className="flex items-center gap-2">
                             <span className="font-bold text-[10px] text-white underline decoration-white/20 underline-offset-4 group-hover:text-brand-teal transition-colors">{t0?.symbol} / {t1?.symbol}</span>
                          </div>
                          <div className="text-right">
                             <div className="text-[9px] font-bold text-white">{(Number(pos.share)/100).toFixed(2)}% SHARE</div>
                             <div className="text-[8px] text-brand-text-muted">{formatTokenDisplay(formatEther(pos.lpBalance))} LP</div>
                          </div>
                       </button>
                   )
               })}
               {lpPositions.length > 2 && (
                 <div className="flex justify-center pt-1">
                   <button
                     onClick={() => setIsSelectPositionExpanded(!isSelectPositionExpanded)}
                     className="group flex flex-col items-center gap-1 p-2 transition-all"
                   >
                     <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-brand-text-muted group-hover:text-white transition-colors">
                       {isSelectPositionExpanded ? "Show Less" : "Show More"}
                     </span>
                     <motion.div
                       animate={{
                         rotate: isSelectPositionExpanded ? 180 : 0,
                         y: isSelectPositionExpanded ? 1 : 0
                       }}
                       transition={{ type: "spring", stiffness: 300, damping: 20 }}
                     >
                       <ChevronDown className="w-4 h-4 text-brand-text-muted group-hover:text-white transition-colors" />
                     </motion.div>
                   </button>
                 </div>
               )}
            </div>
         </div>
      )}

    </motion.section>
  )
}

const LogoLD = ({ className = "", size = 16 }: { className?: string; size?: number }) => (
  <div className={cn("relative flex items-center justify-center font-black italic tracking-tighter cursor-default filter drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]", className)}>
    <span style={{ fontSize: size }} className="text-black leading-none select-none">L</span>
    <span style={{ fontSize: size }} className="text-black leading-none -ml-[0.1em] select-none">D</span>
  </div>
);

function TokenSelector({
  coins,
  selectedId,
  onSelect,
  side,
}: {
  coins: Coin[]
  selectedId: string
  onSelect: (addr: string) => void
  side: "from" | "to"
}) {
  const { address: walletAddress, isConnected } = useAccount();
  const selected = coins.find((c) => c.address === selectedId) ?? coins[0]
  const [balances, setBalances] = React.useState<Record<string, string>>({});

  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [activeIndex, setActiveIndex] = React.useState(0)
  const buttonRef = React.useRef<HTMLButtonElement | null>(null)
  const listRef = React.useRef<HTMLDivElement | null>(null)
  const inputRef = React.useRef<HTMLInputElement | null>(null)
  const containerRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)

    // Fetch balances when popover opens
    const fetchBalances = async () => {
      if (!isConnected || !walletAddress) return;
      const newBalances: Record<string, string> = {};
      await Promise.all(coins.map(async (coin) => {
        try {
          if (isNativeAddr(coin.address)) {
            const balance = await readProvider.getBalance(walletAddress);
            newBalances[coin.address] = parseFloat(formatEther(balance)).toLocaleString(undefined, { maximumFractionDigits: 4 });
          } else {
            const token = new Contract(coin.address, ERC20_ABI, readProvider);
            const [bal, dec] = await Promise.all([
                token.balanceOf(walletAddress),
                token.decimals()
            ]);
            newBalances[coin.address] = (Number(bal) / 10 ** Number(dec)).toLocaleString(undefined, { maximumFractionDigits: 4 });
          }
        } catch (e) {
          newBalances[coin.address] = "0";
        }
      }));
      setBalances(newBalances);
    };
    fetchBalances();

    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [open, coins, isConnected, walletAddress])

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return coins
    return coins.filter(
      (c) =>
        c.symbol.toLowerCase().includes(q) ||
        c.address.toLowerCase().includes(q)
    )
  }, [coins, query])

  React.useEffect(() => {
    if (!open) return
    setActiveIndex(0)
    const t = setTimeout(() => inputRef.current?.focus(), 10)
    return () => clearTimeout(t)
  }, [open])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) return
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)))
      scrollActiveIntoView()
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
      scrollActiveIntoView()
    } else if (e.key === "Enter") {
      e.preventDefault()
      const item = filtered[activeIndex]
      if (item) {
        onSelect(item.address)
        setOpen(false)
        buttonRef.current?.focus()
      }
    } else if (e.key === "Escape") {
      e.preventDefault()
      setOpen(false)
      buttonRef.current?.focus()
    }
  }

  function scrollActiveIntoView() {
    const list = listRef.current
    if (!list) return
    const el = list.querySelector<HTMLButtonElement>('[data-active="true"]')
    if (el) {
      el.scrollIntoView({ block: "nearest" })
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`token-popover-${side}`}
        onClick={() => setOpen((o) => !o)}
        className={[
          "inline-flex items-center gap-2 rounded-md",
          "border border-brand-border bg-brand-surface-2 hover:bg-white/5",
          "px-2.5 py-1.5 text-xs font-bold transition-all",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white",
        ].join(" ")}
        title="Choose token"
      >
        {selected?.symbol === "LDEX" ? (
          <div className="size-5 rounded-full bg-white flex items-center justify-center token-logo-wrapper">
             <LogoLD size={14} />
          </div>
        ) : (
          <div className="size-5 rounded-full token-logo-wrapper">
            <img
              src={selected?.image || "/placeholder.svg"}
              alt={`${selected?.symbol} logo`}
              className="size-full rounded-full border border-brand-border object-cover"
              crossOrigin="anonymous"
              referrerPolicy="no-referrer"
            />
          </div>
        )}
        <span className="font-bold">{selected?.symbol?.toUpperCase()}</span>
        <span aria-hidden="true" className="ml-1 text-[8px]">▼</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            id={`token-popover-${side}`}
            role="listbox"
            aria-label="Select token"
            initial={{ opacity: 0, y: side === "to" ? -6 : 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: side === "to" ? -6 : 6, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className={[
              "absolute z-[100] w-[min(82vw,22rem)] sm:w-[22rem]",
              side === "to" ? "bottom-full mb-2" : "mt-2",
              "rounded-xl border border-brand-border bg-brand-surface text-brand-text-primary",
              "shadow-2xl overflow-hidden backdrop-blur-xl",
            ].join(" ")}
            onKeyDown={handleKeyDown}
          >
            <div className="p-3 border-b border-brand-border">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, symbol, rank…"
                className={[
                  "w-full rounded-lg bg-brand-bg px-3 py-2 text-sm outline-none font-medium",
                  "border border-brand-border focus:border-white transition-colors",
                ].join(" ")}
                aria-label="Search tokens"
              />
            </div>

            <div
              ref={listRef}
              className="max-h-72 overflow-auto p-1 custom-scrollbar"
              tabIndex={-1}
            >
              {filtered.length === 0 && (
                <div className="px-3 py-4 text-xs text-brand-text-muted font-bold uppercase text-center">
                  No results
                </div>
              )}
              {filtered.map((c, idx) => {
                const active = idx === activeIndex
                const isLD = c.symbol === "LDEX"

                return (
                  <button
                    key={c.address}
                    role="option"
                    aria-selected={c.address === selectedId}
                    data-active={active ? "true" : undefined}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => {
                      onSelect(c.address)
                      setOpen(false)
                      setQuery("")
                      buttonRef.current?.focus()
                    }}
                    className={[
                      "w-full flex items-center gap-3 rounded-lg px-2.5 py-3 text-left transition-all",
                      c.address === selectedId
                        ? "bg-white/10"
                        : active
                        ? "bg-white/5"
                        : "hover:bg-white/5",
                    ].join(" ")}
                  >
                    {isLD ? (
                      <div className="size-6 rounded-full bg-white flex items-center justify-center shrink-0 token-logo-wrapper">
                         <LogoLD size={16} />
                      </div>
                    ) : (
                      <div className="size-6 rounded-full shrink-0 token-logo-wrapper">
                        <img
                          src={c.image || "/placeholder.svg"}
                          alt=""
                          className="size-full rounded-full border border-brand-border object-cover"
                          crossOrigin="anonymous"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold truncate">
                          {c.symbol.toUpperCase()}
                        </span>
                        <span className="text-[10px] text-brand-text-muted truncate font-mono opacity-50">
                          {c.address.slice(0, 6)}...{c.address.slice(-4)}
                        </span>
                      </div>
                    </div>

                    {isConnected && (
                      <div className="text-right flex-shrink-0">
                        <div className="text-[10px] font-bold text-white">
                          {balances[c.address] || "0.00"}
                        </div>
                        <div className="text-[8px] text-brand-text-muted uppercase tracking-tighter opacity-70">
                          Balance
                        </div>
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
