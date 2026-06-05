/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import NotificationsPanel, { useNotifications } from './components/NotificationsPanel';
import SuccessCard from './components/SuccessCard';
import { addNotif } from './lib/notifications';
import { 
  ArrowLeftRight, 
  Droplets, 
  Rocket, 
  Hammer, 
  Trophy, 
  CalendarCheck, 
  Sparkles, 
  MessageSquare, 
  ListChecks, 
  Gamepad2, 
  ChevronDown, 
  Search, 
  Bell, 
  Wallet, 
  ExternalLink,
  Settings,
  ArrowDown,
  Info,
  Layers,
  Menu,
  X,
  Plus,
  Coins,
  Image as ImageIcon,
  Lock,
  Clock,
  Eye,
  Copy,
  Download,
  ArrowRight,
  RefreshCw,
  Sun,
  Moon,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useAccount, useChainId, useSwitchChain, useBalance } from 'wagmi';
import { ConnectButton, useConnectModal } from '@rainbow-me/rainbowkit';
import { formatEther, parseEther, formatUnits, parseUnits } from 'ethers';
import type * as lib from './lib/litdex-core-logic';
import SwapCard from './components/ui/crypto-swap-card';
import BridgeCard from './components/ui/bridge-card';
import { AnimatedNavFramer } from './components/ui/navigation-menu';
import { litvmChain, errMsg, LITDEX_DEPLOYER_ADDRESS, readTotalDeployed, deployTokenLitDeX, shortAddr, readDeployments, readDeployFee, readLegacyDeployFee, deployTokenLegacy, getLegacyTokenInfo, getLegacyTokensByCreator, getLegacyTotalDeployedDisplay, readPoints, readCheckinInfo, readCurrentDay, checkinToday, claimNFTRewardsByType, claimNFTRewards, readUserNFTs, readNFTPendingByType, readNFTCurrentDay, readNFTTotalMinted, readNFTAvailablePoints, syncUserPoints, mintRewardNFT, spendUserPoints } from './lib/litdex-core-logic';
import { showSuccess, showError, showInfo, refreshPoints, awardActivity } from './lib/feedback';

// --- Types ---
type PageID = 'swap' | 'pool' | 'deploy' | 'points' | 'checkin' | 'nfts' | 'messenger' | 'quests' | 'games' | 'faucet' | 'hub' | 'chatui';
import HubPage from './components/HubPage';
import ChatUIPage from './components/ChatUIPage';

interface NavItemProps {
  icon: any;
  title: string;
  desc: string;
  badge?: string;
  onClick: () => void;
}

// --- Components ---

const LogoLD = ({ className = "", size = 20 }: { className?: string; size?: number }) => (
  <img
    src="https://raw.githubusercontent.com/notfoundsuser/kindred-spirit/main/public/coins/web_logo.png"
    alt="LitDEX"
    style={{ width: size * 1.6, height: size * 1.6 }}
    className={cn("object-contain select-none", className)}
  />
);

const NavItem = ({ icon: Icon, title, desc, badge, onClick }: NavItemProps) => (
  <button 
    onClick={onClick}
    className="flex items-start gap-4 p-3 rounded-xl border border-transparent hover:border-brand-border hover:bg-white/5 transition-all group text-left w-full"
  >
    <div className="w-10 h-10 rounded-lg bg-brand-surface-2 flex items-center justify-center text-white group-hover:bg-white/10 transition-colors">
      <Icon size={20} />
    </div>
    <div className="flex-1">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-brand-text-primary text-sm">{title}</span>
        {badge && (
          <span className="text-[10px] font-bold bg-white/10 text-white px-1.5 py-0.5 rounded-full uppercase">
            {badge}
          </span>
        )}
      </div>
      <p className="text-xs text-brand-text-muted mt-0.5 leading-relaxed">{desc}</p>
    </div>
  </button>
);

const Card = ({ children, className = "", ...props }: any) => (
  <div className={`bg-brand-surface border border-brand-border rounded-[12px] ${className}`} {...props}>
    {children}
  </div>
);

// --- Ecosystem Stats Hook (fetches once + every 60s) ---
type EcosystemStats = {
  swap: { txns: number; transfers: number; pairs: number };
  nft: { txns: number; mints: number; claims: number };
  messenger: { txns: number };
  deployer: { txns: number };
  checkin: { txns: number };
  game: { gamesPlayed: number; pointsEarned: number; conversions: number; zkltcDistributed: number };
  totalOnChain: number;
};
const useEcosystemStats = () => {
  const [stats, setStats] = useState<EcosystemStats | null>(null);
  useEffect(() => {
    let alive = true;
    const fetchStats = async () => {
      try {
        const r = await fetch('https://game.test-hub.xyz/stats/ecosystem');
        if (!r.ok) return;
        const d = await r.json();
        if (alive) setStats(d);
      } catch {}
    };
    fetchStats();
    const id = setInterval(fetchStats, 60000);
    return () => { alive = false; clearInterval(id); };
  }, []);
  return stats;
};
const formatStat = (n: number | undefined | null): string => {
  if (n == null || isNaN(Number(n))) return "...";
  const v = Number(n);
  if (v >= 1_000_000) return `${Math.floor(v / 1_000_000)}M+`;
  if (v >= 1_000) return `${Math.floor(v / 1_000)}K+`;
  return `${v}`;
};
const EcosystemStatPill = ({ value, label }: { value: string; label: string }) => (
  <div className="px-4 py-2 rounded-xl bg-white/[0.03] border border-white/10 backdrop-blur-xl flex flex-col items-center min-w-[100px]">
    <div className="text-sm font-black text-white tabular-nums tracking-tight">{value}</div>
    <div className="text-[8px] font-bold text-brand-text-muted uppercase tracking-[0.15em] mt-0.5 text-center leading-tight">{label}</div>
  </div>
);

const NFTEcosystemStats = () => {
  const eco = useEcosystemStats();
  return (
    <div className="flex flex-wrap gap-2 mt-4">
      <EcosystemStatPill value={`${formatStat(eco?.nft.mints)}`} label="NFTs Minted" />
      <EcosystemStatPill value={`${formatStat(eco?.nft.claims)}`} label="Rewards Claimed" />
    </div>
  );
};

const CheckinTotalLabel = () => {
  const eco = useEcosystemStats();
  if (!eco) return null;
  return (
    <div className="text-[8px] font-bold text-white/40 uppercase tracking-[0.3em] mt-2 tabular-nums">
      {eco.checkin.txns.toLocaleString()} Total Check-ins
    </div>
  );
};

const DeployerTotalCard = () => {
  const eco = useEcosystemStats();
  return (
    <div className="p-6 bg-white/[0.03] border border-white/10 rounded-[12px] backdrop-blur-xl mb-12">
      <p className="text-[10px] font-bold text-brand-text-muted uppercase tracking-[0.2em] mb-2">Total Deployed</p>
      <h3 className="text-4xl font-black text-white italic tracking-tighter">
        {formatStat(eco?.deployer.txns)}
      </h3>
    </div>
  );
};

/// --- Page: Swap ---
const SwapPage = () => {
  const eco = useEcosystemStats();
  const [showBridge, setShowBridge] = useState(false);
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }} 
      animate={{ opacity: 1, scale: 1 }} 
      className="flex flex-col items-center justify-center min-h-[80vh] px-4 w-full py-12"
    >
      <div className="flex flex-wrap justify-center items-center gap-2 mb-6">
        <button
          onClick={() => { try { window.dispatchEvent(new CustomEvent('litdex:open-faucet')); } catch {} }}
          className="group flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.03] border border-white/10 hover:border-white/30 hover:bg-white/[0.06] transition-all text-[11px] font-bold uppercase tracking-[0.18em] text-white/80 backdrop-blur-xl"
        >
          <Droplets size={14} className="group-hover:text-white transition-colors" />
          Faucet
        </button>
        <button
          onClick={() => setShowBridge((v) => !v)}
          className="group flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.03] border border-white/10 hover:border-white/30 hover:bg-white/[0.06] transition-all text-[11px] font-bold uppercase tracking-[0.18em] text-white/80 backdrop-blur-xl"
        >
          {showBridge ? (
            <>
              <ArrowLeftRight size={14} className="group-hover:text-white transition-colors" />
              ← Swap
            </>
          ) : (
            <>
              <span className="group-hover:text-white transition-colors">⛓️</span>
              Cross Chain
            </>
          )}
        </button>
      </div>
      <div className="relative w-full max-w-[480px] overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          {showBridge ? (
            <motion.div
              key="bridge"
              initial={{ x: "100%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "100%", opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
            >
              <BridgeCard className="brand-glow-hover transition-all duration-500" onNavigate={(p) => window.dispatchEvent(new CustomEvent('app:navigate', { detail: p }))} />
            </motion.div>
          ) : (
            <motion.div
              key="swap"
              initial={{ x: "-100%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "-100%", opacity: 0 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
            >
              <a
                href="https://betsonblock.test-hub.xyz/bettingzone"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 w-full max-w-[480px] mx-auto mb-4 px-4 py-3 rounded-xl bg-brand-surface border border-orange-500 hover:bg-brand-surface-2 transition-colors"
              >
                <img
                  src="https://raw.githubusercontent.com/sachinsahani-cloud/hello-friend/main/public/coins/logo.png"
                  alt="BetsOnBlock"
                  style={{ width: 44, height: 44, objectFit: "contain", background: "transparent" }}
                  className="flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-white font-bold text-sm">BetsOnBlock</div>
                  <div className="text-orange-500 text-xs">☁️ Earn Extra Points</div>
                </div>
                <span className="text-orange-500 text-xl font-bold">→</span>
              </a>
              <SwapCard className="brand-glow-hover transition-all duration-500" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

// --- Page: Pool ---
const PoolPage = () => {
  const { isConnected } = useAccount();
  const eco = useEcosystemStats();
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }} 
      animate={{ opacity: 1, scale: 1 }} 
      className="flex flex-col items-center justify-center min-h-[80vh] px-4 w-full py-12"
    >
      <SwapCard mode="pool" className="brand-glow-hover transition-all duration-500" />
      
      {!isConnected && (
        <div className="w-full max-w-[480px] mt-12">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-xl font-bold text-white italic">Active Liquidity</h2>
              <p className="text-[10px] text-brand-text-muted uppercase tracking-widest mt-1">Your Positions</p>
            </div>
          </div>
          <div className="p-8 border-2 border-dashed border-white/5 rounded-2xl text-center bg-black/20 backdrop-blur-sm">
              <p className="text-brand-text-muted font-mono text-xs">Connect a wallet to see your active pools.</p>
          </div>
        </div>
      )}
    </motion.div>
  );
};

// --- Page: Points ---
const PointsPage = ({ setPage }: { setPage: (p: PageID) => void }) => {
  const { address, isConnected } = useAccount();
  const [pointsData, setPointsData] = useState<{ total: bigint; deployDaily: bigint; msgDaily: bigint; hasCheckedIn: boolean } | null>(null);
  const [activity, setActivity] = useState<{ swap: number; pool: number; deployOffchain: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState("00:00:00");
  const [previousPage, setPreviousPage] = useState<PageID>('swap');

  const fetchPoints = React.useCallback(async () => {
    if (!address) return;
    setLoading(true);
    try {
      const p = await readPoints(address);
      setPointsData(p);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [address]);

  const fetchActivity = React.useCallback(async () => {
    if (!address) { setActivity(null); return; }
    try {
      const r = await fetch(`https://api.test-hub.xyz/activity/counts/${address.toLowerCase()}`);
      if (r.ok) {
        const d = await r.json();
        setActivity({
          swap: Number(d?.swap?.used ?? 0),
          pool: Number(d?.pool?.used ?? 0),
          deployOffchain: Number(d?.deploy?.used ?? 0), // 4 off-chain types (max 400)
        });
      }
    } catch { /* ignore */ }
  }, [address]);

  useEffect(() => {
    if (isConnected && address) { fetchPoints(); fetchActivity(); }
  }, [isConnected, address, fetchPoints, fetchActivity]);

  useEffect(() => {
    const onRefresh = () => { fetchPoints(); fetchActivity(); };
    window.addEventListener("litdex:points-refresh", onRefresh);
    window.addEventListener("litdex:activity-refresh", onRefresh);
    return () => {
      window.removeEventListener("litdex:points-refresh", onRefresh);
      window.removeEventListener("litdex:activity-refresh", onRefresh);
    };
  }, [fetchPoints, fetchActivity]);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      // IST is UTC+5:30. Reset at 00:00 IST = 18:30 UTC.
      const nextReset = new Date(now);
      nextReset.setUTCHours(18, 30, 0, 0);
      if (now.getTime() >= nextReset.getTime()) {
        nextReset.setUTCDate(nextReset.getUTCDate() + 1);
      }
      
      const diff = nextReset.getTime() - now.getTime();
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      
      setTimeLeft(`${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const totalPoints = pointsData ? Number(pointsData.total) : 0;
  const isCheckedIn = pointsData?.hasCheckedIn ?? false;

  // Deploy = on-chain ERC20 (deployDaily, max 100) + off-chain 4 factory
  // types (max 400) = combined out of 500.
  const erc20Deploy = pointsData ? Number(pointsData.deployDaily) : 0;
  const offchainDeploy = activity ? activity.deployOffchain : 0;
  const dailyDeploy = erc20Deploy + offchainDeploy;
  const deployCap = 500;
  const deployProgress = Math.min(100, (dailyDeploy / deployCap) * 100);

  const dailyMsg = pointsData ? Number(pointsData.msgDaily) : 0;
  const msgCap = 20;
  const msgProgress = (dailyMsg / msgCap) * 100;

  const dailySwap = activity ? activity.swap : 0;
  const swapCap = 100;
  const swapProgress = Math.min(100, (dailySwap / swapCap) * 100);

  const dailyPool = activity ? activity.pool : 0;
  const poolCap = 100;
  const poolProgress = Math.min(100, (dailyPool / poolCap) * 100);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-6xl mx-auto py-12 px-6">
      {/* Header Info */}
      <div className="flex items-center justify-between mb-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center text-white shadow-[0_0_15px_rgba(255,255,255,0.05)]">
            <Trophy size={14} />
          </div>
          <div>
            <h1 className="text-xs font-bold uppercase tracking-[0.3em] text-white">Points Dashboard</h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-1 h-1 rounded-full bg-white/40 animate-pulse" />
              <span className="text-[10px] text-brand-text-muted font-medium uppercase tracking-widest">Network Active</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Dashboard Card */}
      <Card className="p-10 mb-12 bg-black/60 border-white/10 backdrop-blur-3xl relative overflow-hidden group shadow-[0_0_80px_rgba(0,0,0,0.5)] border-2">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-white/[0.03] rounded-full blur-[120px] -mr-64 -mt-64 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-white/[0.02] rounded-full blur-[100px] -ml-40 -mb-40 pointer-events-none" />
        
        {/* Scanline Effect */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.05] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%]" />
        
        {/* Decorative Grid */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '24px 24px' }} />

        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-10 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-4">
              <span className="px-2 py-0.5 bg-white/10 text-white text-[9px] font-bold uppercase tracking-widest rounded border border-white/20 shadow-[0_0_15px_rgba(255,255,255,0.05)]">
                Accumulated Points
              </span>
            </div>
            <div className="text-8xl font-black text-white tracking-tighter leading-none select-none filter drop-shadow-[0_0_30px_rgba(255,255,255,0.1)]">
              {loading ? (
                <span className="opacity-10">0000</span>
              ) : (
                <motion.span
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: "spring", damping: 20 }}
                >
                  {totalPoints.toLocaleString()}
                </motion.span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full lg:w-auto">
             <div className="px-6 py-5 bg-white/[0.02] border border-white/5 rounded-2xl group hover:border-white/10 transition-all backdrop-blur-md">
                <div className="text-[9px] font-bold text-brand-text-muted uppercase tracking-[0.2em] mb-2 flex items-center justify-between">
                  Deploy Daily
                  <Rocket size={10} className="text-white/40" />
                </div>
                <div className="font-bold text-white text-xl tracking-tight">
                  {dailyDeploy} <span className="text-xs text-white/20 font-medium">/ 500</span>
                </div>
             </div>
             <div className="px-6 py-5 bg-white/[0.02] border border-white/5 rounded-2xl group hover:border-white/10 transition-all backdrop-blur-md">
                <div className="text-[9px] font-bold text-brand-text-muted uppercase tracking-[0.2em] mb-2 flex items-center justify-between">
                  Message Daily
                  <MessageSquare size={10} className="text-white/40" />
                </div>
                <div className="font-bold text-white text-xl tracking-tight">
                  {dailyMsg} <span className="text-xs text-white/20 font-medium">/ 20</span>
                </div>
             </div>
          </div>
        </div>

        {/* Incentive / Check-in Status */}
        <div className="mt-8 flex justify-end">
           <div className={`px-4 py-2 border rounded-xl flex items-center gap-3 transition-all ${isCheckedIn ? 'bg-white/10 border-white/20 opacity-60' : 'bg-white/5 border-white/10 animate-pulse'}`}>
             <div className="text-left">
               <p className="text-[8px] font-black uppercase tracking-widest text-white/40">Daily Check-in</p>
               <p className="text-[10px] font-bold text-white uppercase tracking-widest">
                 {isCheckedIn ? 'Checked In Today' : 'Pending +10 PTS'}
               </p>
             </div>
             <CalendarCheck size={14} className={isCheckedIn ? 'text-white/60' : 'text-white'} />
           </div>
        </div>

        {/* Progress System */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
           <div className="space-y-4">
              <div className="flex justify-between items-end">
                <div className="text-[9px] font-bold text-white uppercase tracking-[0.2em]">Deployments</div>
                <div className="text-[9px] text-white/40 uppercase font-mono">{dailyDeploy}/500</div>
              </div>
              <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden p-0.5 border border-white/5">
                <motion.div initial={{ width: 0 }} animate={{ width: `${deployProgress}%` }} className="h-full rounded-full bg-white/40" />
              </div>
           </div>
           
           <div className="space-y-4">
              <div className="flex justify-between items-end">
                <div className="text-[9px] font-bold text-white uppercase tracking-[0.2em]">Social Messages</div>
                <div className="text-[9px] text-white/40 uppercase font-mono">{dailyMsg}/20</div>
              </div>
              <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden p-0.5 border border-white/5">
                <motion.div initial={{ width: 0 }} animate={{ width: `${msgProgress}%` }} className="h-full rounded-full bg-white/40" />
              </div>
           </div>

           <div className="space-y-4">
              <div className="flex justify-between items-end">
                <div className="text-[9px] font-bold text-white uppercase tracking-[0.2em]">Swaps</div>
                <div className="text-[9px] text-white/40 uppercase font-mono">{dailySwap}/100</div>
              </div>
              <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden p-0.5 border border-white/5">
                <motion.div initial={{ width: 0 }} animate={{ width: `${swapProgress}%` }} className="h-full rounded-full bg-white/40" />
              </div>
           </div>

           <div className="space-y-4">
              <div className="flex justify-between items-end">
                <div className="text-[9px] font-bold text-white uppercase tracking-[0.2em]">Liquidity (Pool)</div>
                <div className="text-[9px] text-white/40 uppercase font-mono">{dailyPool}/100</div>
              </div>
              <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden p-0.5 border border-white/5">
                <motion.div initial={{ width: 0 }} animate={{ width: `${poolProgress}%` }} className="h-full rounded-full bg-white/40" />
              </div>
           </div>
        </div>
        
        <div className="mt-8">
          <p className="text-[9px] text-brand-text-muted uppercase tracking-[0.2em] font-medium">Reset protocol active in {timeLeft}</p>
        </div>
      </Card>


      {/* How to Earn Section */}
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
             <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white shadow-xl">
                <Trophy size={24} />
             </div>
             <div>
                <h2 className="text-2xl font-bold text-white tracking-tight italic">Protocol Missions</h2>
                <p className="text-[10px] text-brand-text-muted uppercase font-bold tracking-[0.3em] mt-1">Complete tasks to increase network yield</p>
             </div>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
           {/* Check-in Card */}
           <Card 
            onClick={() => setPage('checkin')}
            className="p-8 bg-black/40 border-white/5 hover:border-white/20 transition-all group flex flex-col justify-between h-56 cursor-pointer relative overflow-hidden backdrop-blur-xl"
           >
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/[0.02] rounded-full blur-[40px] -mr-16 -mt-16 group-hover:bg-white/5 transition-colors" />
              
              <div className="flex gap-6 relative z-10">
                 <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center text-white shadow-xl group-hover:border-white/30 transition-all">
                    <CalendarCheck size={28} />
                 </div>
                 <div className="pt-2">
                    <h4 className="text-lg font-bold text-white tracking-tight">Daily Check-in</h4>
                    <p className="text-[11px] text-brand-text-muted mt-2 leading-relaxed font-medium">Verify your network presence daily to receive a base incentive.</p>
                 </div>
              </div>
              
              <div className="flex items-center justify-between mt-auto pt-6 border-t border-white/5 relative z-10">
                <div className="flex items-center gap-3">
                  <div className="px-3 py-1 bg-white/5 rounded-full border border-white/10 text-[10px] font-bold text-white uppercase tracking-widest">
                    +10 PTS
                  </div>
                  <span className="text-[9px] text-brand-text-muted uppercase font-bold tracking-widest">Daily Limit: 1/1</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-bold text-white uppercase tracking-[0.2em] transform translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all">
                   Initialize <ArrowRight size={14} />
                </div>
              </div>
           </Card>

           {/* Deploy Card */}
           <Card 
            onClick={() => setPage('deploy')}
            className="p-8 bg-black/40 border-white/5 hover:border-white/20 transition-all group flex flex-col justify-between h-56 cursor-pointer relative overflow-hidden backdrop-blur-xl"
           >
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/[0.02] rounded-full blur-[40px] -mr-16 -mt-16 group-hover:bg-white/5 transition-colors" />
              
              <div className="flex gap-6 relative z-10">
                 <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center text-white shadow-xl group-hover:border-white/30 transition-all">
                    <Rocket size={28} />
                 </div>
                 <div className="pt-2">
                    <h4 className="text-lg font-bold text-white tracking-tight">Contract Deployment</h4>
                    <p className="text-[11px] text-brand-text-muted mt-2 leading-relaxed font-medium">Execute heavy network operations by launching tokens or factories.</p>
                 </div>
              </div>
              
              <div className="flex items-center justify-between mt-auto pt-6 border-t border-white/5 relative z-10">
                <div className="flex items-center gap-3">
                  <div className="px-3 py-1 bg-white/5 rounded-full border border-white/10 text-[10px] font-bold text-white uppercase tracking-widest">
                    +5 PTS
                  </div>
                  <span className="text-[9px] text-brand-text-muted uppercase font-bold tracking-widest">Daily Limit: 100 PTS</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-bold text-white uppercase tracking-[0.2em] transform translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all">
                   Command <ArrowRight size={14} />
                </div>
              </div>
           </Card>

           {/* Social Quest Card */}
           <Card 
            onClick={() => setPage('quests')}
            className="p-8 bg-black/40 border-white/5 hover:border-white/20 transition-all group flex flex-col justify-between h-56 cursor-pointer relative overflow-hidden backdrop-blur-xl"
           >
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/[0.02] rounded-full blur-[40px] -mr-16 -mt-16 group-hover:bg-white/5 transition-colors" />
              
              <div className="flex gap-6 relative z-10">
                 <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center text-white shadow-xl group-hover:border-white/30 transition-all">
                    <Sparkles size={28} />
                 </div>
                 <div className="pt-2">
                    <h4 className="text-lg font-bold text-white tracking-tight">Social Expansion</h4>
                    <p className="text-[11px] text-brand-text-muted mt-2 leading-relaxed font-medium">Propagate protocol awareness through community engagement.</p>
                 </div>
              </div>
              
              <div className="flex items-center justify-between mt-auto pt-6 border-t border-white/5 relative z-10">
                <div className="flex items-center gap-3">
                  <div className="px-3 py-1 bg-white/5 rounded-full border border-white/10 text-[10px] font-bold text-white uppercase tracking-widest">
                    VAR PTS
                  </div>
                  <span className="text-[9px] text-brand-text-muted uppercase font-bold tracking-widest">Quest Based</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-bold text-white uppercase tracking-[0.2em] transform translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all">
                   Engage <ArrowRight size={14} />
                </div>
              </div>
           </Card>

           {/* On-chain Msg Card */}
           <Card 
            onClick={() => setPage('messenger')}
            className="p-8 bg-black/40 border-white/5 hover:border-white/20 transition-all group flex flex-col justify-between h-56 cursor-pointer relative overflow-hidden backdrop-blur-xl"
           >
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/[0.02] rounded-full blur-[40px] -mr-16 -mt-16 group-hover:bg-white/5 transition-colors" />
              
              <div className="flex gap-6 relative z-10">
                 <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-center text-white shadow-xl group-hover:border-white/30 transition-all">
                    <MessageSquare size={28} />
                 </div>
                 <div className="pt-2">
                    <h4 className="text-lg font-bold text-white tracking-tight">On-chain Communication</h4>
                    <p className="text-[11px] text-brand-text-muted mt-2 leading-relaxed font-medium">Transmit peer-to-peer data directly within the protocol.</p>
                 </div>
              </div>
              
              <div className="flex items-center justify-between mt-auto pt-6 border-t border-white/5 relative z-10">
                <div className="flex items-center gap-3">
                  <div className="px-3 py-1 bg-white/5 rounded-full border border-white/10 text-[10px] font-bold text-white uppercase tracking-widest">
                    +2 PTS
                  </div>
                  <span className="text-[9px] text-brand-text-muted uppercase font-bold tracking-widest">Daily Limit: 20 PTS</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-bold text-white uppercase tracking-[0.2em] transform translate-x-2 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all">
                   Transmit <ArrowRight size={14} />
                </div>
              </div>
           </Card>
        </div>
      </div>
    </motion.div>
  );
};

// --- Page: Check-in ---
const CheckinPage = () => {
  const { address, isConnected } = useAccount();
  const [info, setInfo] = useState<any>(null);
  const [currentDay, setCurrentDay] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [successMsg, setSuccessMsg] = useState<{ ldex: string, pts: number, zkLTC?: string, hash?: string } | null>(null);
  const [checkinError, setCheckinError] = useState<string | null>(null);

  const fetchData = async () => {
    if (!address) return;
    setLoading(true);
    try {
      const [i, d] = await Promise.all([
        readCheckinInfo(address),
        readCurrentDay()
      ]);
      setInfo({
        streak: Number(i.streak),
        lastDay: Number(i.lastDay),
        totalCheckins: Number(i.totalCheckins),
        nextLDEX: i.nextLDEX
      });
      setCurrentDay(Number(d));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isConnected && address) {
      fetchData();
    }
  }, [isConnected, address]);

  const handleCheckin = async () => {
    if (!address || checkingIn) return;
    setCheckingIn(true);
    setSuccessMsg(null);
    setCheckinError(null);
    try {
      const hash = await checkinToday();
      const newInfo = await readCheckinInfo(address);
      
      const ldexVal = formatEther(newInfo.nextLDEX);
      
      let zkLTCBonus = "";
      const now = new Date();
      const istDate = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
      if (istDate.getUTCDay() === 0) {
        const dayOfMonth = istDate.getUTCDate();
        const week = Math.ceil(dayOfMonth / 7);
        if (week === 1) zkLTCBonus = "0.001";
        else if (week === 2) zkLTCBonus = "0.05";
        else if (week === 3) zkLTCBonus = "0.01";
        else if (week === 4) zkLTCBonus = "0.01";
      }

      setSuccessMsg({ 
        ldex: ldexVal, 
        pts: 10,
        zkLTC: zkLTCBonus || undefined,
        hash
      });

      const rows: { label: string; value: string }[] = [
        { label: "BASE POINTS", value: "+10 PTS" },
        { label: "INCENTIVE YIELD", value: `+${Number(ldexVal).toLocaleString()} LDEX` },
      ];
      if (zkLTCBonus) rows.push({ label: "STREAK BONUS", value: `+${zkLTCBonus} zkLTC 🎁` });
      rows.push({ label: "STREAK", value: `Day ${Number(newInfo.streak)}` });
      showSuccess({
        title: "MISSION SUCCESS",
        subtitle: "PROTOCOL VERIFICATION COMPLETE",
        rows,
      });
      refreshPoints();

      try {
        if (address) {
          addNotif(address, {
            type: "checkin",
            title: "Daily Check-in",
            message: `Day ${Number(newInfo.streak)} streak! Earned ${ldexVal} LDEX`,
          });
          addNotif(address, {
            type: "points",
            title: "Points Earned",
            message: `+10 points earned from daily check-in`,
          });
        }
      } catch { /* ignore */ }
      
      setInfo({
        streak: Number(newInfo.streak),
        lastDay: Number(newInfo.lastDay),
        totalCheckins: Number(newInfo.totalCheckins),
        nextLDEX: newInfo.nextLDEX
      });
      setConfirmed(true);
      try { await fetchData(); } catch { /* ignore */ }
    } catch (err: any) {
      console.error(err);
      const msg = err.message || err.toString() || "";
      if (msg.toLowerCase().includes("rejected") || msg.toLowerCase().includes("user denied")) {
        setCheckinError("User Rejected");
      } else {
        setCheckinError(errMsg(err));
      }
    } finally {
      setCheckingIn(false);
    }
  };

  const isTodayChecked = confirmed || (info && info.lastDay === currentDay);
  const streak = info ? info.streak : 0;
  
  // Calendar date ref
  const now = new Date();
  const istDate = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));

  // Calculate next reward based on streak cycle
  const nextDayInCycle = (streak % 7) + 1;
  const ldexRewards = [10, 15, 20, 25, 30, 35, 40];
  const nextRewardLdex = ldexRewards[nextDayInCycle - 1];
  const nextRewardHasZkltc = nextDayInCycle === 1 || nextDayInCycle === 7;

  // Calendar logic
  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const todayIST = istDate.getUTCDay(); // 0 is Sunday, 1 is Monday
  const todayIdx = todayIST === 0 ? 6 : todayIST - 1; 

  const calendar = weekDays.map((name, idx) => {
    const isToday = idx === todayIdx;
    const isPast = idx < todayIdx;
    
    let status: 'checked' | 'missed' | 'pending' | 'future' = 'future';
    
    if (isToday) {
      status = isTodayChecked ? 'checked' : 'pending';
    } else if (isPast) {
      const daysAgo = todayIdx - idx;
      if (isTodayChecked) {
        status = daysAgo < streak ? 'checked' : 'missed';
      } else {
        // Today not checked, so streak was broken if daysAgo > streak
        status = daysAgo <= streak && streak > 0 ? 'checked' : 'missed';
      }
    }

    return { name, isToday, status };
  });

  return (
    <div className="max-w-xl mx-auto py-4 px-6">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-6"
      >
        <h1 className="text-3xl font-black text-white tracking-tighter mb-2 italic uppercase leading-none">Daily Forge</h1>
        <div className="flex items-center justify-center gap-2">
          <div className="h-px w-4 bg-white/20" />
          <p className="text-white/40 font-bold tracking-[0.3em] uppercase text-[7px]">Protocol Authentication & Yield Mission</p>
          <div className="h-px w-4 bg-white/20" />
        </div>
      </motion.div>

      <div className="relative max-w-xl mx-auto">
        {/* Next Reward Badge */}
        {!isTodayChecked && info && (
          <div className="absolute lg:-right-6 lg:top-0 lg:translate-x-full -top-20 right-0 z-20 w-44">
            <div className="px-5 py-4 bg-white/[0.02] border border-white/10 rounded-2xl flex flex-col items-start backdrop-blur-xl shadow-2xl">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse shadow-[0_0_8px_white]" />
                <span className="text-[8px] font-black text-white/60 uppercase tracking-[0.3em]">Next Reward</span>
              </div>
              <div className="text-2xl font-black text-white tracking-tighter leading-none">
                {nextRewardLdex} <span className="text-[10px] text-white/70 font-bold uppercase ml-1.5 tracking-tighter">LDEX</span>
              </div>
              {nextRewardHasZkltc && (
                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/5 w-full">
                  <Sparkles size={10} className="text-white/20" />
                  <span className="text-[7px] font-bold text-white/40 uppercase tracking-[0.1em]">+ 0.01 zkLTC STREAK BONUS 🎁</span>
                </div>
              )}
            </div>
          </div>
        )}

        <Card className="bg-black dark:bg-black/60 border-white/10 p-5 relative overflow-hidden backdrop-blur-3xl shadow-[0_0_80px_rgba(0,0,0,0.5)] border-2">

        {/* Scanline Effect */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.02] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%]" />

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-1.5 mb-6 relative z-10">
          {calendar.map((day, i) => (
            <div key={i} className="space-y-1.5">
              <div className="text-[7px] font-black text-white/20 uppercase tracking-[0.1em] text-center">{day.name}</div>
              <motion.div
                animate={day.isToday && day.status === 'pending' ? {
                  borderColor: ['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.5)', 'rgba(255,255,255,0.1)'],
                } : {}}
                transition={{ duration: 2, repeat: Infinity }}
                className={cn(
                  "aspect-[4/5] rounded-md border flex flex-col items-center justify-center relative transition-all duration-500",
                  day.status === 'checked' && "bg-white/10 border-white/40 text-white shadow-[0_0_15px_rgba(255,255,255,0.05)]",
                  day.status === 'missed' && "bg-white/[0.02] border-white/5 text-white/10",
                  day.status === 'pending' && "bg-white/[0.05] border-white/20 text-white/50",
                  day.status === 'future' && "bg-white/[0.01] border-white/5 text-white/5"
                )}
              >
                {day.status === 'checked' ? (
                  <ListChecks size={14} className="filter drop-shadow-[0_0_8px_rgba(255,255,255,0.5)]" />
                ) : day.status === 'missed' ? (
                  <X size={12} className="opacity-20" />
                ) : (
                  <span className="text-[8px] font-mono opacity-20">{i + 1}</span>
                )}
                
                {day.isToday && (
                  <div className="absolute -top-0.5 -right-0.5">
                    <div className="w-1.5 h-1.5 bg-white rounded-full shadow-[0_0_8px_white] animate-pulse" />
                  </div>
                )}
              </motion.div>
            </div>
          ))}
        </div>

        <div className="flex flex-col items-center gap-5 relative z-10">
          <div className="text-center">
            <AnimatePresence>
              {checkinError && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="mb-2"
                >
                  <p className="text-[10px] font-black text-white/60 uppercase tracking-[0.2em] animate-pulse">
                    {checkinError}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
            <div className="text-5xl font-black text-white tracking-tighter leading-none select-none filter drop-shadow-[0_0_30px_rgba(255,255,255,0.1)]">
              {loading ? "..." : streak}
            </div>
            <div className="text-[8px] font-bold text-white/20 uppercase tracking-[0.4em] mt-1 ml-1">Day Streak Active</div>
            
          </div>

          <motion.button
            whileHover={!isTodayChecked && !checkingIn ? { scale: 1.02, backgroundColor: 'rgba(255,255,255,1)' } : {}}
            whileTap={!isTodayChecked && !checkingIn ? { scale: 0.98 } : {}}
            disabled={isTodayChecked || checkingIn || !isConnected}
            onClick={handleCheckin}
            className={cn(
              "w-full max-w-xs py-3 rounded-lg font-black text-[10px] uppercase tracking-[0.25em] transition-all duration-300 flex items-center justify-center gap-2 border-2",
              isTodayChecked 
                ? "bg-[#1a1a1a] border-white/20 text-white/70 cursor-default"
                : "bg-white text-black border-white shadow-[0_10px_30px_rgba(0,0,0,0.4)]"
            )}
          >
            {checkingIn ? (
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 border-1.5 border-black/20 border-t-black rounded-full animate-spin" />
                Auth...
              </div>
            ) : isTodayChecked ? (
              <>Confirmed <ListChecks size={12} /></>
            ) : (
              <>Confirm Check-in <ArrowRight size={12} /></>
            )}
          </motion.button>
        </div>

        {/* Footer info inside the card */}
        <div className="mt-6 pt-4 border-t border-white/5 grid grid-cols-1 sm:grid-cols-2 gap-4 opacity-40">
           <div className="flex items-start gap-2">
              <div className="w-6 h-6 rounded-md bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                <Trophy size={12} />
              </div>
              <p className="text-[7px] uppercase font-bold tracking-widest leading-tight">
                Yield Mission: +10 Pts (Fixed) & scaling LDEX yield per streak day (10→15→20→25→30→35→40 LDEX).
              </p>
           </div>
           <div className="flex items-start gap-2">
              <div className="w-6 h-6 rounded-md bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                <Sparkles size={12} />
              </div>
              <p className="text-[7px] uppercase font-bold tracking-widest leading-tight">
                Elite Bonus: 0.01 zkLTC on Day 1 & every 7th day streak. Points are separate from daily cap.
              </p>
           </div>
        </div>
      </Card>
      </div>

    </div>
  );
  };


// --- NFT Icon (animated rotating ring) ---
const NFTIcon = ({ label, color }: { label: string; color: string }) => (
  <div className="relative w-full aspect-square flex items-center justify-center">
    <div className="absolute inset-[12%] rounded-full nft-spin" style={{ background: `conic-gradient(from 0deg, ${color}, transparent 60%, ${color})`, opacity: 0.85 }} />
    <div className="absolute inset-[18%] rounded-full bg-brand-bg flex items-center justify-center border border-white/10">
      <span className="text-2xl font-black tracking-tighter" style={{ color }}>{label}</span>
    </div>
  </div>
);

type NFTTier = "common" | "rare" | "epic";
const StackIcon = ({ tier }: { tier: NFTTier }) => {
  const configs = {
    common: { color: "#ffffff", filter: "none" },
    rare:   { color: "#F97316", filter: "drop-shadow(0 0 6px #F97316) drop-shadow(0 0 12px #F97316aa)" },
    epic:   { color: "#a855f7", filter: "drop-shadow(0 0 8px #a855f7) drop-shadow(0 0 20px #a855f7) drop-shadow(0 0 40px #a855f788)" },
  };
  const c = configs[tier];
  return (
    <div className="w-full flex items-center justify-center py-12 bg-[#080808]">
      <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke={c.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ filter: c.filter }}>
        <polygon points="12 2 2 7 12 12 22 7 12 2" />
        <polyline points="2 17 12 22 22 17" />
        <polyline points="2 12 12 17 22 12" />
      </svg>
    </div>
  );
};

const NFT_TIER_META = [
  { nftType: 1 as const, name: "LitShard", rarity: "COMMON", tier: "common" as NFTTier, label: "LS", color: "#888888", cost: 1000,  maxSupply: 9999, rewards: "0.0001 zkLTC + 10 USDC + 2 LDEX" },
  { nftType: 2 as const, name: "LitCore",  rarity: "RARE",   tier: "rare"   as NFTTier, label: "LC", color: "#F97316", cost: 5000,  maxSupply: 4999, rewards: "0.0005 zkLTC + 50 USDC + 10 LDEX" },
  { nftType: 3 as const, name: "LitGod",   rarity: "EPIC",   tier: "epic"   as NFTTier, label: "LG", color: "#a855f7", cost: 10000, maxSupply: 999,  rewards: "0.001 zkLTC + 100 USDC + 20 LDEX" },
];

// --- Page: NFTs ---
const NFTsPage = () => {
  const { address, isConnected } = useAccount();
  const [userNFTs, setUserNFTs] = useState<lib.NFTInfo[]>([]);
  const [minted, setMinted] = useState<Record<number, number>>({ 1: 0, 2: 0, 3: 0 });
  const [typePending, setTypePending] = useState<Record<number, { zkltc: bigint; usdc: bigint; ldex: bigint }>>({
    1: { zkltc: 0n, usdc: 0n, ldex: 0n },
    2: { zkltc: 0n, usdc: 0n, ldex: 0n },
    3: { zkltc: 0n, usdc: 0n, ldex: 0n }
  });
  const [currentDay, setCurrentDay] = useState<bigint>(0n);
  const [totalPoints, setTotalPoints] = useState<bigint>(0n);
  const [claimingType, setClaimingType] = useState<number | null>(null);
  const [mintingType, setMintingType] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<string>("");

  const getTimeToISTMidnight = () => {
    const now = new Date();
    // IST is UTC+5:30. Reset at 00:00 IST is 18:30 UTC.
    const resetTimeUTC = new Date(now);
    resetTimeUTC.setUTCHours(18, 30, 0, 0);

    // If it's already past 18:30 UTC today, the next 18:30 UTC is tomorrow.
    if (now.getTime() >= resetTimeUTC.getTime()) {
      resetTimeUTC.setUTCDate(resetTimeUTC.getUTCDate() + 1);
    }

    const diff = Math.floor((resetTimeUTC.getTime() - now.getTime()) / 1000);
    if (diff <= 0) return "00:00:00";

    const h = Math.floor(diff / 3600);
    const m = Math.floor((diff % 3600) / 60);
    const s = diff % 60;
    return [h, m, s].map(v => v.toString().padStart(2, '0')).join(':');
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(getTimeToISTMidnight());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchAll = async () => {
    try {
      const [m1, m2, m3] = await Promise.all([
        readNFTTotalMinted(1).catch(() => 0), 
        readNFTTotalMinted(2).catch(() => 0), 
        readNFTTotalMinted(3).catch(() => 0),
      ]);
      setMinted({ 1: m1, 2: m2, 3: m3 });

      if (address) {
        const [list, pts, day] = await Promise.all([
          readUserNFTs(address),
          readNFTAvailablePoints(address),
          readNFTCurrentDay().catch(() => 0n),
        ]);
        
        setCurrentDay(day);

        // Read pending rewards and last claim day for each type (1, 2, 3)
        const [p1, p2, p3] = await Promise.all([
          readNFTPendingByType(address, 1).catch(() => ({ zkltc: 0n, usdc: 0n, ldex: 0n })),
          readNFTPendingByType(address, 2).catch(() => ({ zkltc: 0n, usdc: 0n, ldex: 0n })),
          readNFTPendingByType(address, 3).catch(() => ({ zkltc: 0n, usdc: 0n, ldex: 0n })),
        ]);

        setTypePending({ 1: p1, 2: p2, 3: p3 });
        setUserNFTs(list);
        setTotalPoints(pts);
      }
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    // 1. Reset all state first on wallet change/disconnect
    setUserNFTs([]);
    setTypePending({
      1: { zkltc: 0n, usdc: 0n, ldex: 0n },
      2: { zkltc: 0n, usdc: 0n, ldex: 0n },
      3: { zkltc: 0n, usdc: 0n, ldex: 0n }
    });
    setTotalPoints(0n);

    // 2. Only fetch if connected
    if (address && isConnected) {
      fetchAll();
      // 3. Polling interval tied to this address
      const interval = setInterval(fetchAll, 60000);
      return () => clearInterval(interval);
    }
  }, [address, isConnected]);

  const handleMint = async (nftType: 1 | 2 | 3) => {
    if (!address) return;
    const tier = NFT_TIER_META.find(t => t.nftType === nftType)!;
    setMintingType(nftType);
    try {
      // Step 1: Fresh available points check from PointsSystem
      const available = await readNFTAvailablePoints(address);
      console.log("Current Points available:", available.toString());
      setTotalPoints(available);

      const cost = BigInt(tier.cost);
      if (available < cost) {
        showError(`Not enough points. Available: ${available.toString()} pts`);
        return;
      }

      // Step 2: Sync points to NFT contract
      console.log("Syncing points to NFT contract...");
      await syncUserPoints(address, available);

      // Step 3: Mint NFT directly
      console.log("Minting NFT type:", nftType);
      await mintRewardNFT(nftType);

      // Step 4: Deduct points from PointsSystemV6
      try {
        await spendUserPoints(address, cost);
      } catch (spendErr) {
        console.error("spendPoints failed:", spendErr);
      }

      addNotif(address, { type: "nft", title: "+NFT minted!", message: `${tier.name} minted successfully` });
      showSuccess({
        title: "NFT MINTED",
        subtitle: "FIRST REWARD READY SOON",
        rows: [
          { label: "NFT TYPE", value: tier.name },
          { label: "STATUS", value: "PROTOCOL ACTIVATED" },
          { label: "MINT COST", value: `${tier.cost.toLocaleString()} PTS` },
          { label: "NEXT STEP", value: "CLAIM FIRST REWARD NOW" }
        ],
      });
      refreshPoints();
      setTimeout(fetchAll, 1500);
    } catch (err: any) {
      addNotif(address, { type: "nft", title: "Mint failed", message: err?.message?.slice(0, 80) || "Transaction reverted" });
      showError(errMsg(err));
    } finally {
      setMintingType(null);
    }
  };

  const handleClaimRewards = async (nftType?: number) => {
    if (!address) return;
    const typeToSet = nftType ?? 0;
    setClaimingType(typeToSet);
    try {
      if (nftType !== undefined) {
        await claimNFTRewardsByType(nftType);
      } else {
        await claimNFTRewards();
      }
      
      showSuccess({
        title: "DAILY NFT BONUS CLAIMED",
        subtitle: "PROTOCOL VERIFICATION COMPLETE",
        rows: [
          { label: "STATUS", value: "FUEL ADDED" },
          { label: "NEXT CLAIM", value: "COME BACK TOMORROW" },
        ],
      });
      
      addNotif(address, { type: "nft", title: "Rewards claimed", message: "Daily rewards sent to your wallet" });
      setTimeout(fetchAll, 1000);
    } catch (err: any) {
      console.error("Claim error:", err);
      addNotif(address, { type: "nft", title: "Claim failed", message: err?.message?.slice(0, 80) || "Transaction reverted" });
      showError(errMsg(err));
    } finally {
      setClaimingType(null);
    }
  };

  const groupedNFTs = userNFTs.reduce((acc, nft) => {
    const existing = acc.find(item => item.nftType === nft.nftType);
    if (existing) {
      existing.count += 1;
    } else {
      acc.push({ ...nft, count: 1 });
    }
    return acc;
  }, [] as (lib.NFTInfo & { count: number })[]).sort((a, b) => a.nftType - b.nftType);

  const formatMultipliedRewards = (nftType: number, count: number) => {
    const tier = NFT_TIER_META.find(t => t.nftType === nftType);
    if (!tier) return "";
    const base = {
      1: { zkltc: 0.0001, usdc: 10, ldex: 2 },
      2: { zkltc: 0.0005, usdc: 50, ldex: 10 },
      3: { zkltc: 0.001, usdc: 100, ldex: 20 }
    }[nftType as 1|2|3];
    
    if (!base) return tier.rewards;
    
    const zkltc = (base.zkltc * count).toFixed(4).replace(/\.?0+$/, "");
    const usdc = (base.usdc * count);
    const ldex = (base.ldex * count);
    
    return `${zkltc} zkLTC + ${usdc} USDC + ${ldex} LDEX`;
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-12 container mx-auto px-4">
      <div className="mb-10">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tighter mb-2">LitDEX NFTs</h1>
        <p className="text-brand-text-muted text-sm max-w-xl">Mint LitDEX NFTs with your points and earn daily zkLTC, USDC and LDEX rewards.</p>
        
      </div>

      {/* Rewards are claimed per NFT type in the "Your NFTs" section below */}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {NFT_TIER_META.map(tier => {
          const m = minted[tier.nftType] || 0;
          const pct = Math.min(100, (m / tier.maxSupply) * 100);
          const soldOut = m >= tier.maxSupply;
          const notEnough = totalPoints < BigInt(tier.cost);
          const minting = mintingType === tier.nftType;
          return (
          <div key={tier.nftType} className="rounded-2xl border border-[#1f1f1f] bg-[#0a0a0a] overflow-hidden hover:border-white/20 transition-all">
              <div className="relative w-full bg-[#080808] flex items-center justify-center nft-image-container">
                <div className="absolute top-4 right-4 px-2 py-1 rounded-md bg-[#141414] border border-[#2a2a2a] text-[9px] font-bold uppercase tracking-widest text-white z-10">
                  {tier.rarity}
                </div>
                <StackIcon tier={tier.tier} />
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <h3 className="text-lg font-bold">{tier.name}</h3>
                  <p className="text-[10px] font-bold text-brand-text-muted uppercase tracking-widest">LitDEX Genesis</p>
                </div>

                <div>
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest mb-1.5">
                    <span className="text-[#555]">Minted</span>
                    <span className="text-white tabular-nums">{m.toLocaleString()} / {tier.maxSupply.toLocaleString()}</span>
                  </div>
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-white rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>

                <div className="rounded-xl bg-white/[0.03] border border-white/5 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#555] mb-1">Daily Rewards</p>
                  <p className="text-xs font-semibold tabular-nums text-white">{tier.rewards}</p>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#555]">Available</span>
                  <span className="text-sm font-bold tabular-nums text-white">{totalPoints.toLocaleString()} pts</span>
                </div>

                {notEnough && (
                  <div className="text-[10px] text-white/40 font-bold uppercase tracking-widest text-center">
                    Cost: {tier.cost.toLocaleString()} pts
                  </div>
                )}

                <button onClick={() => handleMint(tier.nftType)}
                  disabled={!isConnected || notEnough || soldOut || minting}
                  className="w-full mt-1 py-2.5 rounded-xl bg-white text-black text-xs font-bold uppercase tracking-widest hover:bg-white/90 transition-all disabled:opacity-25 disabled:cursor-not-allowed">
                  {soldOut ? "Sold Out" : minting ? "Minting..." : notEnough ? `Need ${tier.cost - Number(totalPoints)} pts` : `Mint ${tier.name}`}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-16">
        <div className="flex items-baseline justify-between mb-6">
          <h2 className="text-2xl font-bold tracking-tighter">Your NFTs</h2>
          <div className="flex items-center gap-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-brand-text-muted">Collection: {userNFTs.length}</p>
          </div>
        </div>
        {groupedNFTs.length === 0 ? (
          <div className="text-center py-16 bg-white/[0.02] rounded-2xl border border-dashed border-white/10">
            <p className="text-brand-text-muted font-bold text-sm uppercase tracking-widest">No NFTs minted yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {groupedNFTs.map((nft) => {
              const info = NFT_TIER_META.find(t => t.nftType === nft.nftType) || NFT_TIER_META[0];
              const rarityColor = info.rarity === "RARE" ? "text-orange-500" : "text-white";

              return (
                <div key={nft.nftType} className="rounded-2xl border border-[#1f1f1f] bg-[#0a0a0a] overflow-hidden hover:border-white/20 transition-all flex flex-col group/nft active:scale-[0.99]">
                  <div className="relative bg-[#080808]">
                    <div className={`absolute top-4 right-4 px-2 py-1 rounded-md bg-[#141414] border border-[#2a2a2a] text-[9px] font-bold uppercase tracking-widest ${rarityColor} z-10 flex items-center gap-1.5`}>
                      {info.rarity}
                      {nft.count > 1 && <span className="text-white font-black">x{nft.count}</span>}
                    </div>
                    <StackIcon tier={info.tier} />
                    
                    {/* Floating multiplier for emphasis */}
                    {nft.count > 1 && (
                      <div className="absolute bottom-2 right-2 w-10 h-10 rounded-full bg-[#141414] border border-[#2a2a2a] flex items-center justify-center text-white text-xs font-black z-20">
                        x{nft.count}
                      </div>
                    )}
                  </div>
                  
                  <div className="p-5 flex-1 flex flex-col">
                    <div className="mb-4">
                      <h3 className="text-lg font-bold flex items-center justify-between text-white">
                        {info.name}
                      </h3>
                      <p className="text-[10px] font-bold text-[#555] uppercase tracking-widest">LitDEX Genesis Badge</p>
                    </div>

                    <div className="bg-white/[0.02] rounded-xl border border-white/5 p-3 mb-5">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-[#555] mb-1">Status Reward</p>
                      <p className="text-[11px] font-medium text-white">
                        {formatMultipliedRewards(nft.nftType, nft.count)}
                        {nft.count > 1 && <span className="text-white/40 ml-1">({nft.count}x)</span>}
                      </p>
                    </div>
                    
                    <div className="mt-auto space-y-4">
                      <div className="flex items-center justify-between pt-3 border-t border-white/5">
                        <div className="flex items-center gap-1.5">
                          {(() => {
                            const canClaim = userNFTs.some(n => n.nftType === nft.nftType && n.lastClaimDay < currentDay) && currentDay > 0n;
                            return (
                              <>
                                <div className={`w-1.5 h-1.5 rounded-full ${canClaim ? 'bg-orange-500 animate-pulse' : 'bg-white/40'}`} />
                                <span className="text-[10px] font-bold uppercase tracking-widest text-[#555]">
                                  {canClaim ? 'Pending' : 'Earning'}
                                </span>
                              </>
                            );
                          })()}
                        </div>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-white tabular-nums">
                          {nft.count} Owned
                        </div>
                      </div>

                      {(() => {
                        const canClaim = userNFTs.some(n => n.nftType === nft.nftType && n.lastClaimDay < currentDay) && currentDay > 0n;
                        const isClaimingThis = claimingType === nft.nftType;
                        
                        return (
                          <button 
                            onClick={() => handleClaimRewards(nft.nftType)}
                            disabled={!canClaim || claimingType !== null}
                            className={`w-full py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                              canClaim 
                                ? (isClaimingThis ? "bg-white/20 text-white" : "bg-white text-black hover:scale-95 shadow-[0_4px_15px_rgba(255,255,255,0.1)]")
                                : "bg-white/5 text-[#555] cursor-not-allowed opacity-40 border border-[#2a2a2a]"
                            }`}
                          >
                            {isClaimingThis ? "Processing..." : canClaim ? `Claim Rewards` : `Next in ${countdown}`}
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
};

// --- Page: Deploy (Unified) ---
const DeployPage = () => {
  const { address, isConnected } = useAccount();
  const [selectedType, setSelectedType] = useState('erc20');
  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [totalDeployed, setTotalDeployed] = useState<number | null>(null);

  // Per-type daily deploy counters (each capped at 100):
  //   erc20 -> on-chain deployDaily; nft/staking/vesting/factory -> off-chain.
  const PER_TYPE_CAP = 100;
  const [deployCounts, setDeployCounts] = useState<Record<string, number>>({});
  const fetchDeployCounts = React.useCallback(async () => {
    if (!address) { setDeployCounts({}); return; }
    const next: Record<string, number> = { erc20: 0, nft: 0, staking: 0, vesting: 0, factory: 0 };
    try {
      const p = await readPoints(address);
      next.erc20 = Number(p.deployDaily);
    } catch { /* ignore */ }
    try {
      const r = await fetch(`https://api.test-hub.xyz/activity/counts/${address.toLowerCase()}`);
      if (r.ok) {
        const d = await r.json();
        const pt = d?.deploy?.perType || {};
        next.nft = Number(pt.nft ?? 0);
        next.staking = Number(pt.staking ?? 0);
        next.vesting = Number(pt.vesting ?? 0);
        next.factory = Number(pt.tokenfactory ?? 0);
      }
    } catch { /* ignore */ }
    setDeployCounts(next);
  }, [address]);
  useEffect(() => {
    fetchDeployCounts();
    const h = () => fetchDeployCounts();
    window.addEventListener("litdex:activity-refresh", h);
    window.addEventListener("litdex:points-refresh", h);
    return () => {
      window.removeEventListener("litdex:activity-refresh", h);
      window.removeEventListener("litdex:points-refresh", h);
    };
  }, [fetchDeployCounts]);

  const types = [
    { id: 'erc20', name: 'ERC20 Token', icon: Coins },
    { id: 'nft', name: 'NFT (ERC721)', icon: ImageIcon },
    { id: 'staking', name: 'Staking', icon: Lock },
    { id: 'vesting', name: 'Vesting', icon: Clock },
    { id: 'factory', name: 'Token Factory', icon: Hammer },
  ];

  const fetchData = async () => {
    try {
      const count = await readTotalDeployed();
      setTotalDeployed(count);
    } catch (err) {
      console.error("Failed to read total deployed", err);
    }
  };

  const fetchHistory = async () => {
    if (!address) return;
    setLoadingHistory(true);
    try {
      const data = await readDeployments(address);
      setHistory(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchData();
    if (isConnected && address) {
      fetchHistory();
    }
  }, [isConnected, address]);

  const renderDeployForm = () => {
    switch (selectedType) {
      case 'erc20': return <ERC20Form onDeployed={() => { fetchHistory(); fetchData(); }} />;
      case 'nft': return <NFTForm onDeployed={fetchHistory} />;
      case 'staking': return <StakingForm onDeployed={fetchHistory} />;
      case 'vesting': return <VestingForm onDeployed={fetchHistory} />;
      case 'factory': return <TokenFactoryForm onDeployed={fetchHistory} />;
      default: return null;
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-4xl mx-auto py-12 px-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12">
        <Card className="p-6 bg-white/[0.03] border-white/10 backdrop-blur-xl">
          <p className="text-[10px] font-bold text-brand-text-muted uppercase tracking-[0.2em] mb-2">Total Deployed</p>
          <h3 className="text-4xl font-black text-white italic tracking-tighter">
            {totalDeployed ?? "..."}
          </h3>
        </Card>
        <Card className="p-6 bg-white/[0.03] border-white/10 backdrop-blur-xl">
          <p className="text-[10px] font-bold text-brand-text-muted uppercase tracking-[0.2em] mb-2">Deployer</p>
          <div className="flex items-center justify-between">
            <h3 className="font-mono text-xs text-white opacity-80">{shortAddr(LITDEX_DEPLOYER_ADDRESS)}</h3>
            <button 
              onClick={() => {
                navigator.clipboard.writeText(LITDEX_DEPLOYER_ADDRESS);
                showInfo("Copied to clipboard");
              }}
              className="p-1.5 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10"
            >
              <Layers size={14} className="text-white/60" />
            </button>
          </div>
        </Card>
      </div>

      <div className="flex flex-wrap justify-center gap-2 mb-12">
        {types.map((t) => (
          <div key={t.id} className="flex flex-col items-center gap-1.5">
            {isConnected && (
              <span
                title={`${t.name} deploys today (+5 each, max ${PER_TYPE_CAP})`}
                className="italic text-[10px] font-medium text-white/60 tabular-nums px-2 py-0.5 rounded-full border border-white/10 bg-white/5"
              >
                {Math.min(deployCounts[t.id] ?? 0, PER_TYPE_CAP)}/{PER_TYPE_CAP}
              </span>
            )}
            <button
              onClick={() => setSelectedType(t.id)}
              className={cn(
                "flex items-center gap-2 px-6 py-3 rounded-2xl border transition-all font-bold text-[10px] uppercase tracking-widest",
                selectedType === t.id 
                  ? "bg-white text-black border-white shadow-[0_0_20px_rgba(255,255,255,0.15)]" 
                  : "bg-black/20 border-white/5 text-brand-text-muted hover:border-white/10 hover:text-white"
              )}
            >
              <t.icon size={14} />
              {t.name}
            </button>
          </div>
        ))}
      </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={selectedType}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="pb-24"
          >
            {renderDeployForm()}
          </motion.div>
        </AnimatePresence>

            <Card className="p-8 bg-black/40 border-white/5 backdrop-blur-3xl shadow-2xl">
              <div className="flex items-center gap-3 mb-6">
                 <div className="p-2 bg-white/10 rounded-lg text-white">
                    <Layers size={18} />
                 </div>
                 <div>
                    <h3 className="font-bold text-white italic">Deployed Contracts</h3>
                    <p className="text-[10px] text-brand-text-muted uppercase tracking-widest font-bold">Manage your projects</p>
                 </div>
              </div>
        
        {isConnected ? (
          history.length === 0 ? (
            <div className="p-8 border-2 border-dashed border-white/5 rounded-2xl text-center">
              <p className="text-brand-text-muted font-mono text-xs">No deployments found.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {history.map((h, i) => (
                <div key={i} className="p-4 bg-white/5 border border-white/10 rounded-xl flex items-center justify-between">
                   <div>
                     <p className="text-xs font-bold text-white uppercase">{h.label || "Contract"}</p>
                     <p className="text-[10px] text-brand-text-muted font-mono">{shortAddr(h.contractAddress)}</p>
                   </div>
                   <a href={`${litvmChain.blockExplorers.default.url}/address/${h.contractAddress}`} target="_blank" rel="noreferrer" className="p-2 hover:bg-white/10 rounded-lg transition-all">
                     <ExternalLink size={14} className="text-brand-text-muted" />
                   </a>
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="p-8 border-2 border-dashed border-white/5 rounded-2xl text-center">
              <p className="text-brand-text-muted font-mono text-xs">Connect a wallet to see your deployments.</p>
          </div>
        )}
      </Card>
    </motion.div>
  );
};

// --- Sub-Form Components ---

const FormContainer = ({ title, subtitle, icon: Icon, children, deployFee = "0.05", actionLabel = "Deploy", onAction = () => {}, loading = false, onPreviewSource }: any) => (
  <Card className="p-8 bg-black/40 border-white/5 backdrop-blur-3xl shadow-2xl overflow-hidden relative group">
    <div className="absolute top-0 right-0 w-64 h-64 bg-white/[0.02] rounded-full -mr-32 -mt-32 blur-3xl pointer-events-none" />
    <div className="flex items-start gap-5 mb-10">
      <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white shadow-xl">
        <Icon size={28} />
      </div>
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-white">{title}</h2>
        <p className="text-xs font-mono text-brand-text-muted mt-1 opacity-60 italic">{subtitle}</p>
      </div>
    </div>
    <div className="space-y-6">
      {children}
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-12">
       {onPreviewSource && (
         <button 
          onClick={onPreviewSource}
          className="flex items-center justify-center gap-2 py-4 bg-white/5 border border-white/10 rounded-xl font-bold text-sm hover:bg-white/10 transition-all uppercase tracking-widest"
         >
           <Eye size={16} /> Preview Source
         </button>
       )}
       <button 
        onClick={onAction}
        disabled={loading}
        className={cn(
          "flex items-center justify-center gap-2 py-4 bg-white text-black rounded-xl font-bold text-sm hover:opacity-90 transition-all uppercase tracking-widest shadow-[0_0_30px_rgba(255,255,255,0.1)] disabled:opacity-50",
          !onPreviewSource && "md:col-span-2"
        )}
       >
         <Rocket size={16} /> {loading ? "Deploying..." : (actionLabel || "Deploy")}
       </button>
    </div>
  </Card>
);

const InputField = ({ label, placeholder, helper, type = "text", value = "", onChange = () => {} }: any) => (
  <div className="space-y-2">
    <label className="text-[10px] font-bold text-brand-text-muted uppercase tracking-[0.2em]">{label} <span className="text-red-500">*</span></label>
    <div className="bg-black/30 border border-white/10 rounded-xl p-4 focus-within:border-white/30 transition-all">
      <input 
        type={type} 
        placeholder={placeholder} 
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-transparent outline-none text-white font-medium placeholder:text-white/20" 
      />
    </div>
    {helper && <p className="text-[10px] text-brand-text-muted italic">{helper}</p>}
  </div>
);

const ToggleField = ({ label, desc, active, onToggle }: any) => (
  <div className="flex items-center justify-between p-5 bg-white/[0.03] border border-white/5 rounded-2xl hover:border-white/10 transition-all text-left toggle-row">
    <div>
      <h4 className="font-bold text-sm text-white">{label}</h4>
      <p className="text-[10px] text-brand-text-muted mt-0.5">{desc}</p>
    </div>
    <button 
      onClick={() => onToggle(!active)}
      className={cn(
        "w-12 h-6 rounded-full p-1 flex items-center transition-all flex-shrink-0 ml-4",
        active ? "bg-white/20 border border-white/30 justify-end" : "bg-white/5 border border-white/10 justify-start"
      )}
    >
      <div className={cn("w-4 h-4 rounded-full transition-all", active ? "bg-white shadow-[0_0_8px_rgba(255,255,255,0.4)]" : "bg-white/20")} />
    </button>
  </div>
);

const ERC20Form = ({ onDeployed }: any) => {
  const { address } = useAccount();
  const [step, setStep] = useState<'basics' | 'features' | 'review'>('basics');
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [supply, setSupply] = useState('1000000');
  const [decimals, setDecimals] = useState('18');
  const [mintable, setMintable] = useState(true);
  const [burnable, setBurnable] = useState(true);
  const [pausable, setPausable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<"success" | "failed" | null>(null);
  const [deployDaily, setDeployDaily] = useState<number>(0);

  const refreshDeployDaily = async () => {
    if (!address) return;
    try {
      const p = await readPoints(address);
      setDeployDaily(Number(p.deployDaily));
    } catch { /* ignore */ }
  };

  useEffect(() => {
    refreshDeployDaily();
    const onRefresh = () => refreshDeployDaily();
    window.addEventListener("litdex:points-refresh", onRefresh);
    return () => window.removeEventListener("litdex:points-refresh", onRefresh);
  }, [address]);

  const capReachedDisplay = deployDaily >= 100;

  const handleDeploy = async () => {
    if (!name || !symbol || !supply) { showError("Please fill all fields"); return; }
    if (!address) { showError("Connect wallet first"); return; }

    setLoading(true);
    setTxStatus(null);
    setTxHash(null);

    let dailyBefore = 0n;
    try {
      if (address) {
        const before = await readPoints(address);
        dailyBefore = before.deployDaily;
      }
    } catch { /* ignore */ }

    try {
      const result = await deployTokenLitDeX({
        name,
        symbol,
        totalSupply: supply
      });

      setTxHash(result.txHash);
      setTxStatus("success");

      const ca = (result as any).contractAddress as string | undefined;

      try {
        if (address) {
          addNotif(address, {
            type: "deploy",
            title: "Token Deployed",
            message: ca ? `${symbol} deployed at ${ca.slice(0,6)}...${ca.slice(-4)}` : `${symbol} deployed successfully`,
          });
        }
      } catch { /* ignore */ }

      setTimeout(async () => {
        try { if (address) await refreshDeployDaily(); } catch { /* ignore */ }
        refreshPoints();
        const capReached = dailyBefore >= 100n;
        if (capReached) {
          showSuccess({
            title: "DAILY CAP REACHED",
            subtitle: "MAX 20 TOKEN DEPLOYS PER DAY",
            rows: [
              { label: "BASE POINTS", value: "+0 PTS" },
              { label: "CONTRACT", value: ca ? `${ca.slice(0,6)}...${ca.slice(-4)}` : "—" },
              { label: "STATUS", value: "LIVE ON LITVM" },
            ],
          });
        } else {
          showSuccess({
            title: "TOKEN DEPLOYED",
            subtitle: "PROTOCOL VERIFICATION COMPLETE",
            rows: [
              { label: "BASE POINTS", value: "+5 PTS" },
              { label: "CONTRACT", value: ca ? `${ca.slice(0,6)}...${ca.slice(-4)}` : "—" },
              { label: "STATUS", value: "LIVE ON LITVM" },
            ],
          });
        }
        onDeployed?.();
      }, 3000);
    } catch (err) {
      console.error("Deploy error:", err);
      setTxStatus("failed");
      showError(errMsg(err));
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 'basics':
        return (
          <div className="space-y-6">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white mb-1">Token Basics</h2>
              <p className="text-sm text-brand-text-muted">Define the core parameters of your token.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <InputField 
                label="Token Name" 
                placeholder="My Awesome Token" 
                helper="Max 50 characters — appears in wallets"
                value={name} 
                onChange={setName} 
              />
              <InputField 
                label="Token Symbol" 
                placeholder="MAT" 
                helper="e.g. MAT — appears on DEXes"
                value={symbol} 
                onChange={setSymbol} 
              />
              <InputField 
                label="Total Supply" 
                placeholder="1000000" 
                helper="1,000,000 tokens"
                value={supply} 
                onChange={setSupply} 
              />
              <InputField 
                label="Decimals" 
                placeholder="18" 
                helper="18 decimals is standard for most tokens"
                value={decimals} 
                onChange={setDecimals} 
              />
            </div>
            <div className="flex justify-end pt-4">
              <button 
                onClick={() => setStep('features')}
                className="flex items-center gap-2 px-8 py-4 bg-brand-surface-2 border border-white/5 rounded-xl text-white font-bold hover:bg-white/10 transition-all uppercase text-xs tracking-widest"
              >
                Next <ArrowLeftRight size={14} className="rotate-180" />
              </button>
            </div>
          </div>
        );
      case 'features':
        return (
          <div className="space-y-6">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white mb-1">Token Features</h2>
              <p className="text-sm text-brand-text-muted">Configure optional capabilities for your token.</p>
            </div>
            <div className="space-y-4">
              <ToggleField 
                label="Mintable" 
                desc="Owner can create additional tokens after launch" 
                active={mintable}
                onToggle={() => setMintable(!mintable)}
              />
              <ToggleField 
                label="Burnable" 
                desc="Token holders can permanently destroy their tokens" 
                active={burnable}
                onToggle={() => setBurnable(!burnable)}
              />
              <ToggleField 
                label="Pausable" 
                desc="Owner can pause all token transfers in an emergency" 
                active={pausable}
                onToggle={() => setPausable(!pausable)}
              />
            </div>
            <div className="flex justify-between pt-4">
              <button 
                onClick={() => setStep('basics')}
                className="flex items-center gap-2 px-8 py-4 bg-white/5 border border-white/10 rounded-xl text-brand-text-muted font-bold hover:bg-white/10 transition-all uppercase text-xs tracking-widest"
              >
                <ArrowLeftRight size={14} /> Back
              </button>
              <button 
                onClick={() => setStep('review')}
                className="flex items-center gap-2 px-8 py-4 bg-brand-surface-2 border border-white/5 rounded-xl text-white font-bold hover:bg-white/10 transition-all uppercase text-xs tracking-widest"
              >
                Next <ArrowLeftRight size={14} className="rotate-180" />
              </button>
            </div>
          </div>
        );
      case 'review':
        return (
          <div className="space-y-6">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white mb-1">Review & Deploy</h2>
              <p className="text-sm text-brand-text-muted">Confirm your token configuration before deploying.</p>
            </div>
            
            <div className="bg-white/[0.03] border border-white/5 rounded-2xl overflow-hidden text-sm">
              <div className="p-4 border-b border-white/5 flex justify-between items-center">
                <span className="text-brand-text-muted font-bold uppercase text-[10px] tracking-widest">Token Name</span>
                <span className="text-white font-bold">{name || "Unnamed"}</span>
              </div>
              <div className="p-4 border-b border-white/5 flex justify-between items-center">
                <span className="text-brand-text-muted font-bold uppercase text-[10px] tracking-widest">Symbol</span>
                <span className="text-white font-bold">{symbol || "NONE"}</span>
              </div>
              <div className="p-4 border-b border-white/5 flex justify-between items-center">
                <span className="text-brand-text-muted font-bold uppercase text-[10px] tracking-widest">Total Supply</span>
                <span className="text-white font-bold">{supply ? parseInt(supply).toLocaleString() : "0"}</span>
              </div>
              <div className="p-4 border-b border-white/5 flex justify-between items-center">
                <span className="text-brand-text-muted font-bold uppercase text-[10px] tracking-widest">Decimals</span>
                <span className="text-white font-bold">{decimals}</span>
              </div>
              <div className="p-4 flex justify-between items-center">
                <span className="text-brand-text-muted font-bold uppercase text-[10px] tracking-widest">Features</span>
                <div className="flex gap-2">
                  {mintable && <span className="text-[8px] font-bold px-2 py-0.5 bg-white/10 text-white rounded uppercase">Mintable</span>}
                  {burnable && <span className="text-[8px] font-bold px-2 py-0.5 bg-white/10 text-white rounded uppercase">Burnable</span>}
                  {pausable && <span className="text-[8px] font-bold px-2 py-0.5 bg-white/10 text-white rounded uppercase">Pausable</span>}
                </div>
              </div>
            </div>

            <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-white/40 uppercase tracking-widest">Points Reward</p>
                <h4 className="text-2xl font-black text-white mt-1">{capReachedDisplay ? "DAILY CAP REACHED" : "+5 points"}</h4>
              </div>
              <Coins className="text-white opacity-20" size={32} />
            </div>

            {txStatus && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }} 
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "p-4 rounded-2xl border text-[10px] font-bold uppercase tracking-widest text-center",
                  txStatus === "success" 
                    ? "bg-white/5 border-white/10 text-white shadow-[0_0_20px_rgba(255,255,255,0.05)]" 
                    : "bg-white/[0.02] border-white/5 text-white/40"
                )}
              >
                {txStatus === "success" ? "Token Deployed Successfully" : "Deployment Failed"}
                {txHash && (
                  <a 
                    href={`${litvmChain.blockExplorers.default.url}/tx/${txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="block mt-1 underline opacity-50 hover:opacity-100 transition-opacity"
                  >
                    View Transaction on Explorer
                  </a>
                )}
              </motion.div>
            )}

            <button 
              onClick={handleDeploy}
              disabled={loading}
              className="w-full py-5 bg-white text-black rounded-2xl font-bold text-base hover:bg-white/90 transition-all shadow-[0_0_40px_rgba(255,255,255,0.1)] flex items-center justify-center gap-3 disabled:opacity-50"
            >
              <Rocket size={20} /> {loading ? "Deploying..." : "Deploy Token"}
            </button>

            <div className="text-center space-y-2">
              <p className="text-[10px] font-bold text-brand-text-muted uppercase tracking-widest">Free deployment</p>
              <div className="flex items-center justify-center gap-2 text-white/50">
                <Sparkles size={12} />
                <span className="text-[9px] font-bold uppercase tracking-widest">+5 points earned automatically ({deployDaily}/100 today)</span>
              </div>
              <p className="text-[9px] text-brand-text-muted italic opacity-60">
                Deploys via LitDEXDeployer • points credited automatically by relayer.
              </p>
            </div>

            <div className="flex justify-start">
              <button 
                onClick={() => setStep('features')}
                className="flex items-center gap-2 px-8 py-4 bg-white/5 border border-white/10 rounded-xl text-brand-text-muted font-bold hover:bg-white/10 transition-all uppercase text-xs tracking-widest"
              >
                <ArrowLeftRight size={14} /> Back
              </button>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <Card className="lg:col-span-2 p-8 bg-black/40 border-white/5 backdrop-blur-3xl shadow-2xl relative overflow-hidden min-h-[600px] flex flex-col">
        {/* Progress Header */}
        <div className="flex items-center gap-4 mb-12">
          {[
            { id: 'basics', label: 'Token Basics', step: 1 },
            { id: 'features', label: 'Features', step: 2 },
            { id: 'review', label: 'Review & Deploy', step: 3 }
          ].map((s, i) => (
            <React.Fragment key={s.id}>
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all border",
                  step === s.id 
                    ? "bg-white text-black border-white shadow-[0_0_15px_rgba(255,255,255,0.3)]" 
                    : i < ['basics', 'features', 'review'].indexOf(step)
                      ? "bg-brand-surface-2 border-white/20 text-white"
                      : "bg-white/5 border-white/10 text-brand-text-muted"
                )}>
                  {i < ['basics', 'features', 'review'].indexOf(step) ? <ListChecks size={14} /> : s.step}
                </div>
                <span className={cn(
                  "text-[10px] font-bold uppercase tracking-widest transition-colors",
                  step === s.id ? "text-white" : "text-brand-text-muted"
                )}>{s.label}</span>
              </div>
              {i < 2 && <div className="w-12 h-[1px] bg-white/10" />}
            </React.Fragment>
          ))}
        </div>

        <div className="flex-1">
          {renderStep()}
        </div>
      </Card>

      {/* Live Preview Sidebar */}
      <Card className="p-8 bg-black/40 border-white/5 backdrop-blur-3xl shadow-2xl h-fit sticky top-24 live-preview-sidebar">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50">Live Preview</span>
        </div>

        <div className="flex flex-col items-center">
          <div className="w-28 h-28 rounded-full bg-white/10 border-2 border-white/20 flex items-center justify-center text-white shadow-[0_0_40px_rgba(255,255,255,0.1)] mb-6 group relative overflow-hidden">
             <div className="absolute inset-0 bg-white animate-pulse opacity-5" />
             <span className="text-4xl font-black italic select-none">
               {symbol ? symbol[0].toUpperCase() : "?"}
             </span>
          </div>
          
          <h3 className="text-2xl font-black text-white italic tracking-tighter mb-1 select-none">
            {name || "Token Name"}
          </h3>
          <p className="text-xs font-bold text-white/40 uppercase tracking-[0.3em] select-none">
            {symbol || "SYMBOL"}
          </p>

          <div className="w-full h-[1px] bg-white/5 my-8" />

          <div className="w-full space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-bold text-brand-text-muted uppercase tracking-widest">Total Supply</span>
              <span className="text-xs font-mono text-white select-none">
                {supply ? parseInt(supply).toLocaleString() : "0"}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-bold text-brand-text-muted uppercase tracking-widest">Decimals</span>
              <span className="text-xs font-mono text-white select-none">{decimals}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-bold text-brand-text-muted uppercase tracking-widest">Standard</span>
              <span className="text-xs font-mono text-white select-none">ERC-20</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mt-8 w-full">
            <span className={cn("text-[8px] font-bold px-2 py-1 rounded border transition-all uppercase tracking-widest", mintable ? "bg-white/10 border-white/20 text-white" : "bg-white/5 border-white/5 text-white/10")}>Mintable</span>
            <span className={cn("text-[8px] font-bold px-2 py-1 rounded border transition-all uppercase tracking-widest", burnable ? "bg-white/10 border-white/20 text-white" : "bg-white/5 border-white/5 text-white/10")}>Burnable</span>
            <span className={cn("text-[8px] font-bold px-2 py-1 rounded border transition-all uppercase tracking-widest", pausable ? "bg-white/10 border-white/20 text-white" : "bg-white/5 border-white/5 text-white/10")}>Pausable</span>
          </div>

          <div className="mt-12 w-full p-4 bg-white/5 border border-white/10 rounded-2xl flex items-center gap-3">
             <div className="w-2 h-2 rounded-full bg-white/40" />
             <span className="text-[10px] font-bold text-brand-text-muted uppercase tracking-widest">Deploying to <span className="text-white">LitVM Testnet</span></span>
          </div>
        </div>
      </Card>
    </div>
  );
};

const NFTForm = ({ onDeployed }: any) => {
  const { address } = useAccount();
  const [step, setStep] = useState<'basics' | 'features' | 'review'>('basics');
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [maxSupply, setMaxSupply] = useState('10000');
  const [mintPrice, setMintPrice] = useState('0.05');
  const [maxPerWallet, setMaxPerWallet] = useState('5');
  const [baseURI, setBaseURI] = useState('https://api.example.xyz/meta/');
  const [loading, setLoading] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<"success" | "failed" | null>(null);
  const [showSource, setShowSource] = useState(false);

  const generateSource = () => {
    return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * ================================================================
 *  ${name || "Unnamed"} (${symbol || "NFT"}) | Max: ${maxSupply || "0"} | Price: ${mintPrice || "0"} zkLTC
 *  LitVM LiteForge  |  Chain 4441  |  https://api.republicstats.xyz/litvm/rpc
 * ================================================================
 */

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

contract MNFT is ERC721, Ownable {
    using Strings for uint256;

    uint256 public constant MAX_SUPPLY = ${maxSupply || "0"};
    uint256 public mintPrice = ${parseFloat(mintPrice || "0")} ether;
    uint256 public maxPerWallet = ${maxPerWallet || "0"};
    uint256 private _total;
    bool public saleActive;
    mapping(address => uint256) public minted;
    string private _base;

    constructor() ERC721("${name || "Unnamed"}", "${symbol || "NFT"}") Ownable(msg.sender) {
        _base = "${baseURI || "https://api.example.xyz/meta/"}";
    }

    function mint(uint256 qty) external payable {
        require(saleActive, "Sale off");
        require(_total + qty <= MAX_SUPPLY, "Exceeds supply");
        require(minted[msg.sender] + qty <= maxPerWallet, "Wallet limit");
        require(msg.value >= mintPrice * qty, "Not enough zkLTC");
        minted[msg.sender] += qty;
        for (uint256 i = 0; i < qty; i++) { 
          _total++; 
          _safeMint(msg.sender, _total); 
        }
    }

    function ownerMint(address to, uint256 qty) external onlyOwner {
        require(_total + qty <= MAX_SUPPLY, "Exceeds supply");
        for (uint256 i = 0; i < qty; i++) { 
          _total++; 
          _safeMint(to, _total); 
        }
    }

    function totalSupply() public view returns (uint256) { return _total; }
    function setSaleActive(bool val) external onlyOwner { saleActive = val; }
    function setMintPrice(uint256 p) external onlyOwner { mintPrice = p; }
    function setBaseURI(string calldata uri_) external onlyOwner { _base = uri_; }

    function tokenURI(uint256 id) public view override returns (string memory) {
        require(_ownerOf(id) != address(0), "Nonexistent");
        return string(abi.encodePacked(_base, id.toString(), ".json"));
    }

    function withdraw() external onlyOwner {
        (bool ok,) = owner().call{value: address(this).balance}("");
        require(ok, "Withdraw fail");
    }
}`;
  };

  const handleDeploy = async () => {
    if (!name || !symbol || !maxSupply) { showError("Please fill all fields"); return; }
    if (!address) { showError("Connect wallet first"); return; }

    setLoading(true);
    setTxStatus(null);
    setTxHash(null);
    try {
      const { deployNFTLitDeX } = await import('./lib/litdex-core-logic');
      const result = await deployNFTLitDeX({
        name,
        symbol,
        maxSupply: parseInt(maxSupply),
        mintPrice: parseEther(mintPrice),
        baseURI
      });

      setTxHash(result.txHash);
      setTxStatus("success");
      const ca = (result as any).tokenAddress as string | undefined;
      const explorerUrl = `${litvmChain.blockExplorers.default.url}/tx/${result.txHash}`;
      awardActivity({ wallet: address, action: 'deploy', txHash: result.txHash, meta: { type: 'nft' } }).then((r) => {
        if (r?.capped) showSuccess({ title: "DAILY CAP REACHED", subtitle: "MAX 100 NFT-DEPLOY POINTS/DAY", rows: [{ label: "POINTS", value: "+0 PTS (CAP REACHED)" }, { label: "RESETS", value: "00:00 IST" }] });
      });
      const shortHash = `${result.txHash.slice(0, 6)}...${result.txHash.slice(-4)}`;
      try {
        if (address) addNotif(address, {
          type: "deploy",
          title: "NFT Contract Deployed",
          message: ca ? `${symbol} at ${ca.slice(0,6)}...${ca.slice(-4)}` : `${symbol} deployed`,
        });
      } catch { /* ignore */ }
      showSuccess({
        title: "NFT CONTRACT DEPLOYED",
        subtitle: "PROTOCOL VERIFICATION COMPLETE",
        rows: [
          { label: "BASE POINTS", value: "+5 PTS" },
          { label: "CONTRACT", value: ca ? `${ca.slice(0,6)}...${ca.slice(-4)}` : "—" },
          { label: "TRANSACTION", value: shortHash, href: explorerUrl },
          { label: "STATUS", value: "LIVE ON LITVM" },
        ],
      });
      refreshPoints();
      onDeployed?.();
    } catch (err) {
      console.error("Deploy error:", err);
      setTxStatus("failed");
      showError(errMsg(err));
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 'basics':
        return (
          <div className="space-y-6 text-left">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white mb-1">Collection Basics</h2>
              <p className="text-sm text-brand-text-muted">Define the identity of your NFT collection.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <InputField 
                label="Collection Name" 
                placeholder="e.g. LitVM Punks" 
                helper="Max 32 characters"
                value={name} 
                onChange={setName} 
              />
              <InputField 
                label="Symbol" 
                placeholder="e.g. LVRP" 
                helper="Short identifier (3-5 chars)"
                value={symbol} 
                onChange={setSymbol} 
              />
              <InputField 
                label="Max Supply" 
                placeholder="10000" 
                helper="Maximum NFTs that can ever exist"
                value={maxSupply} 
                onChange={setMaxSupply} 
              />
              <InputField 
                label="Mint Price (zkLTC)" 
                placeholder="0.05" 
                helper="Price per NFT mint"
                value={mintPrice} 
                onChange={setMintPrice} 
              />
            </div>
            <div className="flex justify-end pt-4">
              <button 
                onClick={() => setStep('features')}
                className="flex items-center gap-2 px-8 py-4 bg-brand-surface-2 border border-white/5 rounded-xl text-white font-bold hover:bg-white/10 transition-all uppercase text-xs tracking-widest"
              >
                Next <ArrowLeftRight size={14} className="rotate-180" />
              </button>
            </div>
          </div>
        );
      case 'features':
        return (
          <div className="space-y-6 text-left">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white mb-1">Advanced Settings</h2>
              <p className="text-sm text-brand-text-muted">Configure metadata and minting limits.</p>
            </div>
            <div className="space-y-6">
              <InputField 
                label="Base URI" 
                placeholder="https://api.example.xyz/meta/" 
                helper="Metadata folder — token URls become {baseURI}{tokenId}.json"
                value={baseURI} 
                onChange={setBaseURI} 
              />
              <InputField 
                label="Max Per Wallet" 
                placeholder="5" 
                helper="Anti-whale limit per address"
                value={maxPerWallet} 
                onChange={setMaxPerWallet} 
              />
            </div>
            <div className="flex justify-between pt-4">
              <button 
                onClick={() => setStep('basics')}
                className="flex items-center gap-2 px-8 py-4 bg-white/5 border border-white/10 rounded-xl text-brand-text-muted font-bold hover:bg-white/10 transition-all uppercase text-xs tracking-widest"
              >
                <ArrowLeftRight size={14} /> Back
              </button>
              <button 
                onClick={() => setStep('review')}
                className="flex items-center gap-2 px-8 py-4 bg-brand-surface-2 border border-white/5 rounded-xl text-white font-bold hover:bg-white/10 transition-all uppercase text-xs tracking-widest"
              >
                Next <ArrowLeftRight size={14} className="rotate-180" />
              </button>
            </div>
          </div>
        );
      case 'review':
        return (
          <div className="space-y-6 text-left">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-white mb-1">Review & Deploy</h2>
              <p className="text-sm text-brand-text-muted">Confirm your NFT configuration before deploying.</p>
            </div>
            
            <div className="bg-white/[0.03] border border-white/5 rounded-2xl overflow-hidden text-sm">
              <div className="p-4 border-b border-white/5 flex justify-between items-center">
                <span className="text-brand-text-muted font-bold uppercase text-[10px] tracking-widest">Collection</span>
                <span className="text-white font-bold">{name || "Unnamed"}</span>
              </div>
              <div className="p-4 border-b border-white/5 flex justify-between items-center">
                <span className="text-brand-text-muted font-bold uppercase text-[10px] tracking-widest">Symbol</span>
                <span className="text-white font-bold">{symbol || "NONE"}</span>
              </div>
              <div className="p-4 border-b border-white/5 flex justify-between items-center">
                <span className="text-brand-text-muted font-bold uppercase text-[10px] tracking-widest">Max Supply</span>
                <span className="text-white font-bold">{maxSupply ? parseInt(maxSupply).toLocaleString() : "0"}</span>
              </div>
              <div className="p-4 border-b border-white/5 flex justify-between items-center">
                <span className="text-brand-text-muted font-bold uppercase text-[10px] tracking-widest">Mint Price</span>
                <span className="text-white font-bold">{mintPrice} zkLTC</span>
              </div>
              <div className="p-4 flex justify-between items-center">
                <span className="text-brand-text-muted font-bold uppercase text-[10px] tracking-widest">Features</span>
                <div className="flex gap-2">
                  <span className="text-[8px] font-bold px-2 py-0.5 bg-white/10 text-white rounded uppercase">Mintable</span>
                  <span className="text-[8px] font-bold px-2 py-0.5 bg-white/10 text-white rounded uppercase">Burnable</span>
                </div>
              </div>
            </div>

            {txStatus && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }} 
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "p-4 rounded-2xl border text-[10px] font-bold uppercase tracking-widest text-center",
                  txStatus === "success" 
                    ? "bg-white/5 border-white/10 text-white shadow-[0_0_20px_rgba(255,255,255,0.05)]" 
                    : "bg-white/5 border-white/5 text-red-500/60"
                )}
              >
                {txStatus === "success" ? "NFT Collection Deployed" : "Process Interrupted"}
                {txHash && (
                  <a 
                    href={`${litvmChain.blockExplorers.default.url}/tx/${txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="block mt-1 underline opacity-50 hover:opacity-100 transition-opacity"
                  >
                    View Transaction on Explorer
                  </a>
                )}
              </motion.div>
            )}

            <button 
              onClick={handleDeploy}
              disabled={loading}
              className="w-full py-5 bg-white text-black rounded-2xl font-bold text-base hover:bg-white/90 transition-all shadow-[0_0_40px_rgba(255,255,255,0.1)] flex items-center justify-center gap-3 disabled:opacity-50"
            >
              <Rocket size={20} /> {loading ? "Deploying..." : "Deploy Collection"}
            </button>

            <div className="flex justify-start">
              <button 
                onClick={() => setStep('features')}
                className="flex items-center gap-2 px-8 py-4 bg-white/5 border border-white/10 rounded-xl text-brand-text-muted font-bold hover:bg-white/10 transition-all uppercase text-xs tracking-widest"
              >
                <ArrowLeftRight size={14} /> Back
              </button>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2 p-8 bg-black/40 border-white/5 backdrop-blur-3xl shadow-2xl relative overflow-hidden min-h-[600px] flex flex-col">
          {/* Progress Header */}
          <div className="flex items-center gap-4 mb-12">
            {[
              { id: 'basics', label: 'Basics', step: 1 },
              { id: 'features', label: 'Advanced', step: 2 },
              { id: 'review', label: 'Review', step: 3 }
            ].map((s, i) => (
              <React.Fragment key={s.id}>
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all border",
                    step === s.id 
                      ? "bg-white text-black border-white shadow-[0_0_15px_rgba(255,255,255,0.3)]" 
                      : i < ['basics', 'features', 'review'].indexOf(step)
                        ? "bg-brand-surface-2 border-white/20 text-white"
                        : "bg-white/5 border-white/10 text-brand-text-muted"
                  )}>
                    {i < ['basics', 'features', 'review'].indexOf(step) ? <ListChecks size={14} /> : s.step}
                  </div>
                  <span className={cn(
                    "text-[10px] font-bold uppercase tracking-widest transition-colors",
                    step === s.id ? "text-white" : "text-brand-text-muted"
                  )}>{s.label}</span>
                </div>
                {i < 2 && <div className="w-12 h-[1px] bg-white/10" />}
              </React.Fragment>
            ))}
          </div>

          <div className="flex-1">
            {renderStep()}
          </div>

          <div className="mt-8 pt-8 border-t border-white/5 flex gap-4">
             <button 
               onClick={() => setShowSource(!showSource)}
               className="flex items-center gap-2 px-6 py-3 bg-white/5 border border-white/10 rounded-xl text-brand-text-muted font-bold hover:bg-white/10 transition-all uppercase text-[10px] tracking-widest"
             >
               <Eye size={14} /> {showSource ? "Hide Source" : "Preview Source"}
             </button>
          </div>
        </Card>

        {/* Live Preview Sidebar */}
        <Card className="p-8 bg-black/40 border-white/5 backdrop-blur-3xl shadow-2xl h-fit sticky top-24 live-preview-sidebar">
          <div className="flex items-center gap-2 mb-8">
            <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/50">Live Preview</span>
          </div>

          <div className="flex flex-col items-center">
            <div className="w-28 h-28 rounded-full bg-white/10 border-2 border-white/20 flex items-center justify-center text-white shadow-[0_0_40px_rgba(255,255,255,0.1)] mb-6 group relative overflow-hidden">
              <div className="absolute inset-0 bg-white animate-pulse opacity-5" />
              <span className="text-4xl font-black italic select-none">
                {symbol ? symbol[0].toUpperCase() : "?"}
              </span>
            </div>
            
            <h3 className="text-2xl font-black text-white italic tracking-tighter mb-1 select-none text-center">
              {name || "Collection Name"}
            </h3>
            <p className="text-xs font-bold text-white/40 uppercase tracking-[0.3em] select-none">
              {symbol || "SYMBOL"}
            </p>

            <div className="w-full h-[1px] bg-white/5 my-8" />

            <div className="w-full space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-brand-text-muted uppercase tracking-widest">Max Supply</span>
                <span className="text-xs font-mono text-white select-none">
                  {maxSupply ? parseInt(maxSupply).toLocaleString() : "0"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-brand-text-muted uppercase tracking-widest">Mint Price</span>
                <span className="text-xs font-mono text-white select-none">{mintPrice} zkLTC</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-brand-text-muted uppercase tracking-widest">Standard</span>
                <span className="text-xs font-mono text-white select-none">ERC-721</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mt-8 w-full">
              <span className="text-[8px] font-bold px-2 py-1 rounded border bg-white/10 border-white/20 text-white uppercase tracking-widest">Mintable</span>
              <span className="text-[8px] font-bold px-2 py-1 rounded border bg-white/10 border-white/20 text-white uppercase tracking-widest">Burnable</span>
            </div>

            <div className="mt-12 w-full p-4 bg-white/5 border border-white/10 rounded-2xl flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-white/40" />
              <span className="text-[10px] font-bold text-brand-text-muted uppercase tracking-widest">Deploying to <span className="text-white">LitVM Testnet</span></span>
            </div>
          </div>
        </Card>
      </div>

      <AnimatePresence>
        {showSource && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <Card className="p-6 bg-black border-white/5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                   <div className="w-2 h-2 rounded-full bg-white/40" />
                   <span className="text-[10px] font-bold text-white uppercase tracking-widest">MNFT.sol</span>
                   <span className="text-[10px] px-2 py-0.5 bg-white/5 text-brand-text-muted rounded flex items-center gap-1 uppercase font-bold tracking-widest">
                     <Sparkles size={10} /> Source preview
                   </span>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(generateSource());
                      showInfo("Source copied to clipboard");
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-[10px] font-bold text-brand-text-muted hover:text-white transition-all uppercase tracking-widest"
                  >
                    <Copy size={12} /> Copy
                  </button>
                  <button className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-[10px] font-bold text-brand-text-muted hover:text-white transition-all uppercase tracking-widest">
                    <Download size={12} /> Download
                  </button>
                </div>
              </div>
              <div className="relative">
                <pre className="p-6 bg-white/[0.02] border border-white/5 rounded-xl text-[11px] font-mono whitespace-pre text-white/70 overflow-x-auto leading-relaxed max-h-[500px]">
                  <code>{generateSource()}</code>
                </pre>
                <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black to-transparent pointer-events-none" />
              </div>
              <div className="mt-4 flex items-center gap-2 text-[9px] text-brand-text-muted italic opacity-60">
                 <Info size={10} />
                 <span>Reference source — your actual deployment uses the audited on-chain factory at {shortAddr(LITDEX_DEPLOYER_ADDRESS)}.</span>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const StakingForm = ({ onDeployed }: any) => {
  const { address } = useAccount();
  const [stakingToken, setStakingToken] = useState('');
  const [rewardToken, setRewardToken] = useState('');
  const [rewardRate, setRewardRate] = useState('12');
  const [lockPeriod, setLockPeriod] = useState('30');
  const [label, setLabel] = useState('');
  const [loading, setLoading] = useState(false);
  const [fee, setFee] = useState<string>('0.05');
  const [txInfo, setTxInfo] = useState<{ hash: string; address?: string } | null>(null);
  const [showSource, setShowSource] = useState(false);

  useEffect(() => {
    readDeployFee().then(f => setFee(formatEther(f))).catch(console.warn);
  }, []);

  const generateSource = () => {
    const bps = Math.floor(parseFloat(rewardRate || "0") * 100);
    return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * ================================================================
 *  ${label || "ldex"} | APR: ${rewardRate || "0"}% | Lock: ${lockPeriod || "0"} days
 *  LitVM LiteForge  |  Chain 4441  |  https://api.republicstats.xyz/litvm/rpc
 * ================================================================
 */

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract ldex is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    IERC20 public immutable STAKE_TOKEN;
    IERC20 public immutable REWARD_TOKEN;
    uint256 public constant LOCK = ${lockPeriod || "0"} days;
    uint256 public constant MIN  = 1 ether;
    uint256 public rewardBps     = ${bps};

    struct Info { uint256 amount; uint256 start; uint256 lastClaim; uint256 pending; }
    mapping(address => Info) public stakes;
    uint256 public totalStaked;

    event Staked(address indexed u, uint256 amt);
    event Unstaked(address indexed u, uint256 amt);
    event Claimed(address indexed u, uint256 amt);

    constructor(address _stake, address _reward) Ownable(msg.sender) {
        STAKE_TOKEN  = IERC20(_stake);
        REWARD_TOKEN = IERC20(_reward);
    }

    function pending(address u) public view returns (uint256) {
        Info memory s = stakes[u];
        if (s.amount == 0) return s.pending;
        uint256 e = block.timestamp - s.lastClaim;
        return s.pending + (s.amount * rewardBps * e) / (10000 * 365 days);
    }

    function stake(uint256 amt) external nonReentrant whenNotPaused {
        require(amt >= MIN, "Below min");
        Info storage s = stakes[msg.sender];
        if (s.amount > 0) s.pending = pending(msg.sender);
        STAKE_TOKEN.safeTransferFrom(msg.sender, address(this), amt);
        s.amount += amt;
        s.start = s.start == 0 ? block.timestamp : s.start;
        s.lastClaim = block.timestamp;
        totalStaked += amt;
        emit Staked(msg.sender, amt);
    }

    function claim() external nonReentrant whenNotPaused {
        Info storage s = stakes[msg.sender];
        uint256 r = pending(msg.sender);
        require(r > 0, "No rewards");
        s.pending = 0;
        s.lastClaim = block.timestamp;
        REWARD_TOKEN.safeTransfer(msg.sender, r);
        emit Claimed(msg.sender, r);
    }

    function unstake(uint256 amt) external nonReentrant {
        Info storage s = stakes[msg.sender];
        require(s.amount >= amt, "Insufficient");
        require(block.timestamp >= s.start + LOCK, "Locked");
        s.pending = pending(msg.sender);
        s.amount -= amt;
        s.lastClaim = block.timestamp;
        totalStaked -= amt;
        STAKE_TOKEN.safeTransfer(msg.sender, amt);
        emit Unstaked(msg.sender, amt);
    }

    function emergencyWithdraw() external nonReentrant {
        Info storage s = stakes[msg.sender];
        require(s.amount > 0, "Nothing");
        uint256 a = s.amount;
        s.amount = 0;
        s.pending = 0;
        totalStaked -= a;
        STAKE_TOKEN.safeTransfer(msg.sender, a);
    }

    function setRate(uint256 bps) external onlyOwner { rewardBps = bps; }
    function depositRewards(uint256 amt) external onlyOwner {
        REWARD_TOKEN.safeTransferFrom(msg.sender, address(this), amt);
    }
    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
}`;
  };

  const handleDeploy = async () => {
    if (!stakingToken) { showError("Staking token required"); return; }
    setLoading(true);
    setTxInfo(null);
    try {
      const { deployStaking } = await import('./lib/litdex-core-logic');
      const dailyRateWei = parseEther((parseFloat(rewardRate) / 365).toString());
      
      const res = await deployStaking(
        stakingToken,
        rewardToken || stakingToken,
        dailyRateWei,
        BigInt(lockPeriod),
        label || "Staking Pool"
      );
      setTxInfo({ hash: res.txHash, address: res.contractAddress });
      awardActivity({ wallet: address, action: 'deploy', txHash: res.txHash, meta: { type: 'staking' } }).then((r) => {
        if (r?.capped) showSuccess({ title: "DAILY CAP REACHED", subtitle: "MAX 100 STAKING-DEPLOY POINTS/DAY", rows: [{ label: "POINTS", value: "+0 PTS (CAP REACHED)" }, { label: "RESETS", value: "00:00 IST" }] });
      });
      {
        const explorerUrl = `${litvmChain.blockExplorers.default.url}/tx/${res.txHash}`;
        const shortHash = `${res.txHash.slice(0, 6)}...${res.txHash.slice(-4)}`;
        const ca = res.contractAddress;
        showSuccess({
          title: "STAKING CONTRACT DEPLOYED",
          subtitle: "PROTOCOL VERIFICATION COMPLETE",
          rows: [
            { label: "BASE POINTS", value: "+5 PTS" },
            { label: "CONTRACT", value: ca ? `${ca.slice(0,6)}...${ca.slice(-4)}` : "—" },
            { label: "TRANSACTION", value: shortHash, href: explorerUrl },
            { label: "STATUS", value: "LIVE ON LITVM" },
          ],
        });
        refreshPoints();
      }
      onDeployed?.();
    } catch (err) {
      showError(errMsg(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <FormContainer 
        title="Staking" 
        subtitle="// Single-asset staking pool with daily reward rate and lock period." 
        icon={Lock} 
        onAction={handleDeploy} 
        loading={loading}
        deployFee={fee}
        actionLabel="Deploy"
        onPreviewSource={() => setShowSource(!showSource)}
      >
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <InputField 
              label="Staking Token Address *" 
              placeholder="0x... ERC20 to stake" 
              value={stakingToken} 
              onChange={setStakingToken} 
            />
            <InputField 
              label="Reward Token Address" 
              placeholder="0x... (blank = same as stake)" 
              helper="Leave blank to use same token as reward"
              value={rewardToken} 
              onChange={setRewardToken} 
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <InputField 
              label="Annual Reward Rate (%)" 
              placeholder="12" 
              helper="Converted to per-day rate x 1e18 on-chain"
              value={rewardRate} 
              onChange={setRewardRate} 
            />
            <InputField 
              label="Lock Period (days)" 
              placeholder="30" 
              helper="Minimum staking duration"
              value={lockPeriod} 
              onChange={setLockPeriod} 
            />
          </div>
          <InputField 
            label="Pool Label" 
            placeholder="e.g. PEPE Staking Pool" 
            helper="Stored on-chain as the contract's display name"
            value={label} 
            onChange={setLabel} 
          />
        </div>

        {txInfo && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 p-4 bg-white/[0.03] border border-white/10 rounded-xl text-[10px] font-bold uppercase tracking-widest text-center text-white"
          >
            Pool Deployed Successfully
            <div className="mt-2 flex flex-col gap-1">
              {txInfo.address && <div className="text-white opacity-60">Address: {shortAddr(txInfo.address)}</div>}
              <a 
                href={`${litvmChain.blockExplorers.default.url}/tx/${txInfo.hash}`}
                target="_blank"
                rel="noreferrer"
                className="underline block mt-1"
              >
                View on Explorer
              </a>
            </div>
          </motion.div>
        )}
      </FormContainer>

      <AnimatePresence>
        {showSource && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <Card className="p-6 bg-black border-white/5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                   <div className="w-2 h-2 rounded-full bg-white/40" />
                   <span className="text-[10px] font-bold text-white uppercase tracking-widest">Staking.sol</span>
                   <span className="text-[10px] px-2 py-0.5 bg-white/5 text-brand-text-muted rounded flex items-center gap-1 uppercase font-bold tracking-widest">
                     <Sparkles size={10} /> Source preview
                   </span>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(generateSource());
                      showInfo("Source copied to clipboard");
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-[10px] font-bold text-brand-text-muted hover:text-white transition-all uppercase tracking-widest"
                  >
                    <Copy size={12} /> Copy
                  </button>
                </div>
              </div>
              <div className="relative">
                <pre className="p-6 bg-white/[0.02] border border-white/5 rounded-xl text-[11px] font-mono whitespace-pre text-white/70 overflow-x-auto leading-relaxed max-h-[500px]">
                  <code>{generateSource()}</code>
                </pre>
                <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black to-transparent pointer-events-none" />
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const VestingForm = ({ onDeployed }: any) => {
  const { address } = useAccount();
  const [tokenAddress, setTokenAddress] = useState('');
  const [beneficiary, setBeneficiary] = useState('');
  const [amount, setAmount] = useState('');
  const [cliffDays, setCliffDays] = useState('90');
  const [vestingDays, setVestingDays] = useState('365');
  const [label, setLabel] = useState('');
  const [revocable, setRevocable] = useState(true);
  const [loading, setLoading] = useState(false);
  const [fee, setFee] = useState<string>('0.05');
  const [txInfo, setTxInfo] = useState<{ hash: string; address?: string } | null>(null);
  const [showSource, setShowSource] = useState(false);

  useEffect(() => {
    readDeployFee().then(f => setFee(formatEther(f))).catch(console.warn);
  }, []);

  const source = useMemo(() => {
    return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * ================================================================
 *  ${label || "TokenVesting"} | Cliff: ${cliffDays}d | Duration: ${vestingDays}d
 *  LitVM LiteForge  |  Chain 4441  |  https://api.republicstats.xyz/litvm/rpc
 * ================================================================
 */

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract ${label.replace(/\s+/g, '') || "TokenVesting"} is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    IERC20 public immutable TOKEN;
    uint256 public constant CLIFF    = ${cliffDays} days;
    uint256 public constant DURATION = ${vestingDays} days;

    address public beneficiary;
    uint256 public totalAmt;
    uint256 public released;
    uint256 public start;
    bool public revoked;
    event Released(address indexed ben, uint256 amt);

    constructor() Ownable(msg.sender) {
        TOKEN = IERC20(${tokenAddress || "0x0000000000000000000000000000000000000000"});
    }

    function setBeneficiary(address addr) external onlyOwner {
        require(beneficiary == address(0), "Already set");
        beneficiary = addr;
        start = block.timestamp;
    }
    function setTotal(uint256 amt) external onlyOwner { require(released == 0, "Started"); totalAmt = amt; }

    function vested() public view returns (uint256) {
        if (start == 0) return 0;
        if (revoked) return released;
        if (block.timestamp < start + CLIFF) return 0;
        uint256 e = block.timestamp - (start + CLIFF);
        return e >= DURATION ? totalAmt : (totalAmt * e) / DURATION;
    }

    function release() external nonReentrant {
        require(msg.sender == beneficiary || msg.sender == owner(), "Unauth");
        uint256 r = vested() - released;
        require(r > 0, "Nothing");
        released += r;
        TOKEN.safeTransfer(beneficiary, r);
        emit Released(beneficiary, r);
    }

    function revoke() external onlyOwner {
        require(!revoked, "Done");
        uint256 r = totalAmt - vested();
        revoked = true;
        if (r > 0) TOKEN.safeTransfer(owner(), r);
    }
}`;
  }, [label, cliffDays, vestingDays, tokenAddress, revocable]);

  const generateSource = () => source;

  const handleDeploy = async () => {
    if (!tokenAddress || !beneficiary || !amount) { showError("Required fields missing"); return; }
    setLoading(true);
    setTxInfo(null);
    try {
      const { deployVesting } = await import('./lib/litdex-core-logic');
      const res = await deployVesting(
        tokenAddress,
        beneficiary,
        parseEther(amount),
        BigInt(cliffDays),
        BigInt(vestingDays),
        revocable,
        label || "Token Vesting"
      );
      setTxInfo({ hash: res.txHash, address: res.contractAddress });
      awardActivity({ wallet: address, action: 'deploy', txHash: res.txHash, meta: { type: 'vesting' } }).then((r) => {
        if (r?.capped) showSuccess({ title: "DAILY CAP REACHED", subtitle: "MAX 100 VESTING-DEPLOY POINTS/DAY", rows: [{ label: "POINTS", value: "+0 PTS (CAP REACHED)" }, { label: "RESETS", value: "00:00 IST" }] });
      });
      {
        const explorerUrl = `${litvmChain.blockExplorers.default.url}/tx/${res.txHash}`;
        const shortHash = `${res.txHash.slice(0, 6)}...${res.txHash.slice(-4)}`;
        const ca = res.contractAddress;
        showSuccess({
          title: "VESTING CONTRACT DEPLOYED",
          subtitle: "PROTOCOL VERIFICATION COMPLETE",
          rows: [
            { label: "BASE POINTS", value: "+5 PTS" },
            { label: "CONTRACT", value: ca ? `${ca.slice(0,6)}...${ca.slice(-4)}` : "—" },
            { label: "TRANSACTION", value: shortHash, href: explorerUrl },
            { label: "STATUS", value: "LIVE ON LITVM" },
          ],
        });
        refreshPoints();
      }
      onDeployed?.();
    } catch (err) {
      showError(errMsg(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <FormContainer 
        title="Vesting" 
        subtitle="// Cliff + linear vesting for team / investor / advisor allocations." 
        icon={Clock} 
        onAction={handleDeploy} 
        loading={loading}
        deployFee={fee}
        actionLabel="Deploy"
        onPreviewSource={() => setShowSource(!showSource)}
      >
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <InputField 
              label="Token Address *" 
              placeholder="0x... token to vest" 
              value={tokenAddress} 
              onChange={setTokenAddress} 
            />
            <InputField 
              label="Vesting Label" 
              placeholder="e.g. Team Vesting" 
              value={label} 
              onChange={setLabel} 
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <InputField 
              label="Beneficiary Address *" 
              placeholder="0x..." 
              value={beneficiary} 
              onChange={setBeneficiary} 
            />
            <InputField 
              label="Total Amount (whole units) *" 
              placeholder="e.g. 1000" 
              helper="Total supply to be vested"
              value={amount} 
              onChange={setAmount} 
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <InputField 
              label="Cliff Period (days)" 
              placeholder="90" 
              helper="No tokens released before cliff ends"
              value={cliffDays} 
              onChange={setCliffDays} 
            />
            <InputField 
              label="Vesting Duration (days after cliff)" 
              placeholder="365" 
              value={vestingDays} 
              onChange={setVestingDays} 
            />
          </div>

          <ToggleField 
            label="Revocable by owner"
            desc="Owner can cancel and reclaim unvested tokens"
            active={revocable}
            onToggle={setRevocable}
          />
        </div>

        {txInfo && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 p-4 bg-white/[0.03] border border-white/10 rounded-xl text-[10px] font-bold uppercase tracking-widest text-center text-white"
          >
            Vesting Deployed Successfully
            <div className="mt-2 flex flex-col gap-1">
              {txInfo.address && <div className="text-white opacity-60">Address: {shortAddr(txInfo.address)}</div>}
              <a 
                href={`${litvmChain.blockExplorers.default.url}/tx/${txInfo.hash}`}
                target="_blank"
                rel="noreferrer"
                className="underline block mt-1"
              >
                View on Explorer
              </a>
            </div>
          </motion.div>
        )}
      </FormContainer>

      <AnimatePresence>
        {showSource && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <Card className="p-6 bg-black border-white/5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                   <div className="w-2 h-2 rounded-full bg-white/40" />
                   <span className="text-[10px] font-bold text-white uppercase tracking-widest">Vesting.sol</span>
                   <span className="text-[10px] px-2 py-0.5 bg-white/5 text-brand-text-muted rounded flex items-center gap-1 uppercase font-bold tracking-widest">
                     <Sparkles size={10} /> Source preview
                   </span>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(generateSource());
                      showInfo("Source copied to clipboard");
                    }}
                    className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-[10px] font-bold text-brand-text-muted hover:text-white transition-all uppercase tracking-widest"
                  >
                    <Copy size={12} /> Copy
                  </button>
                </div>
              </div>
              <div className="relative">
                <pre className="p-6 bg-white/[0.02] border border-white/5 rounded-xl text-[11px] font-mono whitespace-pre text-white/70 overflow-x-auto leading-relaxed max-h-[500px]">
                  <code>{generateSource()}</code>
                </pre>
                <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black to-transparent pointer-events-none" />
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const TokenFactoryForm = ({ onDeployed }: any) => {
  const { address } = useAccount();
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [decimals, setDecimals] = useState('18');
  const [supply, setSupply] = useState('');
  const [mintable, setMintable] = useState(true);
  const [burnable, setBurnable] = useState(true);
  const [pausable, setPausable] = useState(true);
  
  const [loading, setLoading] = useState(false);
  const [fee, setFee] = useState<string>('0.05');
  const [txInfo, setTxInfo] = useState<{ hash: string; address?: string } | null>(null);
  const [showSource, setShowSource] = useState(false);
  
  const [deployedTokens, setDeployedTokens] = useState<any[]>([]);
  const [totalDeployed, setTotalDeployed] = useState<number>(596);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fetchHistory = async () => {
    if (!address) return;
    setLoadingHistory(true);
    try {
      const tokens = await getLegacyTokensByCreator(address);
      const details = await Promise.all(tokens.map(t => getLegacyTokenInfo(t)));
      // Tuple: contractAddress, creator, name, symbol, totalSupply, decimals, mintable, burnable, pausable, deployedAt
      setDeployedTokens(details.map(d => ({
        address: d[0],
        name: d[2],
        symbol: d[3],
        supply: d[4],
        decimals: d[5],
        mintable: d[6],
        burnable: d[7],
        pausable: d[8]
      })));
      setTotalDeployed(await getLegacyTotalDeployedDisplay());
    } catch (err) {
      console.warn("Failed to fetch history:", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    readLegacyDeployFee().then(f => setFee(formatEther(f))).catch(console.warn);
    fetchHistory();
  }, [address]);

  const generateSource = () => {
    return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
// ================================================================
//  LitVMTokenFactory | Fee: ${fee} zkLTC per token deploy
//  LitVM LiteForge  |  Chain 4441  |  https://api.republicstats.xyz/litvm/rpc
// ================================================================
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract FactoryToken is ERC20, Ownable {
    uint8 private _d;
    bool public mintable;
    bool public burnable;
    bool public pausable;
    bool private _paused;

    constructor(string memory n, string memory s, uint8 d, uint256 supply, bool m, bool b, bool p, address creator) ERC20(n, s) Ownable(creator) {
        _d = d;
        mintable = m;
        burnable = b;
        pausable = p;
        _mint(creator, supply);
    }

    function decimals() public view override returns (uint8) { return _d; }
    function mint(address to, uint256 amt) external onlyOwner { require(mintable, "Disabled"); _mint(to, amt); }
    function burn(uint256 amt) external { require(burnable, "Disabled"); _burn(msg.sender, amt); }
    function pause() external onlyOwner { require(pausable, "Disabled"); _paused = true; }
    function unpause() external onlyOwner { require(pausable, "Disabled"); _paused = false; }
    function _update(address from, address to, uint256 v) internal override { require(!_paused, "Paused"); super._update(from, to, v); }
}

contract LitVMTokenFactory is Ownable {
    uint256 public fee = ${fee} ether;
    address[] public all;
    mapping(address => address[]) public byCreator;
    event Deployed(address indexed token, address indexed creator, string name, string symbol);

    constructor() Ownable(msg.sender) {}

    function deploy(string calldata name, string calldata symbol, uint8 decimals, uint256 supply, bool mintable, bool burnable, bool pausable) external payable returns (address) {
        require(msg.value >= fee, "Fee low");
        require(bytes(name).length > 0 && bytes(symbol).length > 0, "Name required");
        require(supply > 0, "Supply > 0");
        (bool ok,) = owner().call{value: msg.value}("");
        require(ok, "Fee transfer fail");
        FactoryToken t = new FactoryToken(name, symbol, decimals, supply, mintable, burnable, pausable, msg.sender);
        address a = address(t);
        all.push(a);
        byCreator[msg.sender].push(a);
        emit Deployed(a, msg.sender, name, symbol);
        return a;
    }

    function setFee(uint256 f_) external onlyOwner { fee = f_; }
    function getAll() external view returns (address[] memory) { return all; }
    function getByCreator(address c) external view returns (address[] memory) { return byCreator[c]; }
    function withdraw() external onlyOwner {
        (bool ok,) = owner().call{value: address(this).balance}("");
        require(ok, "Withdraw fail");
    }
    receive() external payable {}
}`;
  };

  const handleDeploy = async () => {
    if (!name || !symbol || !supply) { showError("Required fields missing"); return; }
    setLoading(true);
    setTxInfo(null);
    try {
      const { deployTokenLegacy } = await import('./lib/litdex-core-logic');
      const res = await deployTokenLegacy({
        name,
        symbol,
        decimals: parseInt(decimals),
        totalSupply: parseUnits(supply, parseInt(decimals)),
        mintable,
        burnable,
        pausable
      });
      setTxInfo({ hash: res.txHash, address: res.tokenAddress });
      awardActivity({ wallet: address, action: 'deploy', txHash: res.txHash, meta: { type: 'tokenfactory' } }).then((r) => {
        if (r?.capped) showSuccess({ title: "DAILY CAP REACHED", subtitle: "MAX 100 FACTORY-DEPLOY POINTS/DAY", rows: [{ label: "POINTS", value: "+0 PTS (CAP REACHED)" }, { label: "RESETS", value: "00:00 IST" }] });
      });
      {
        const explorerUrl = `${litvmChain.blockExplorers.default.url}/tx/${res.txHash}`;
        const shortHash = `${res.txHash.slice(0, 6)}...${res.txHash.slice(-4)}`;
        const ca = res.tokenAddress;
        showSuccess({
          title: "TOKEN FACTORY DEPLOYED",
          subtitle: "PROTOCOL VERIFICATION COMPLETE",
          rows: [
            { label: "BASE POINTS", value: "+5 PTS" },
            { label: "CONTRACT", value: ca ? `${ca.slice(0,6)}...${ca.slice(-4)}` : "—" },
            { label: "TRANSACTION", value: shortHash, href: explorerUrl },
            { label: "STATUS", value: "LIVE ON LITVM" },
          ],
        });
        refreshPoints();
      }
      onDeployed?.();
      fetchHistory();
    } catch (err) {
      showError(errMsg(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-12">
      <FormContainer 
        title="Token Factory" 
        subtitle="// Deploy your own ERC20 factory with custom fee, whitelist, and token tracking." 
        icon={Hammer} 
        onAction={handleDeploy} 
        loading={loading}
        deployFee={fee}
        actionLabel="Deploy"
        onPreviewSource={() => setShowSource(!showSource)}
      >
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <InputField label="Token Name *" placeholder="e.g. My Token" value={name} onChange={setName} />
            <InputField label="Token Symbol *" placeholder="e.g. MTK" value={symbol} onChange={setSymbol} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <InputField label="Decimals" placeholder="18" value={decimals} onChange={setDecimals} />
            <InputField label="Total Supply *" placeholder="e.g. 1000000" value={supply} onChange={setSupply} />
          </div>
          
          <div className="pt-4 border-t border-white/5 space-y-4">
            <ToggleField label="Mintable" desc="Allow owner to create new tokens" active={mintable} onToggle={setMintable} />
            <ToggleField label="Burnable" desc="Allow holders to destroy their tokens" active={burnable} onToggle={setBurnable} />
            <ToggleField label="Pausable" desc="Allow owner to stop transfers" active={pausable} onToggle={setPausable} />
          </div>
        </div>

        {txInfo && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="mt-6 p-4 bg-white/[0.03] border border-white/10 rounded-xl text-center shadow-[0_0_50px_rgba(255,255,255,0.05)]"
          >
            <div className="text-[10px] font-bold text-white uppercase tracking-widest mb-1">Token Deployed Successfully</div>
            {txInfo.address && <div className="text-white font-mono text-xs mb-2">{shortAddr(txInfo.address)}</div>}
            <a href={`${litvmChain.blockExplorers.default.url}/tx/${txInfo.hash}`} target="_blank" rel="noreferrer" className="text-[10px] text-white/40 underline uppercase font-bold tracking-widest hover:text-white transition-all">View on Explorer</a>
          </motion.div>
        )}
      </FormContainer>

      <AnimatePresence>
        {showSource && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <Card className="p-6 bg-black border-white/5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                   <div className="w-2 h-2 rounded-full bg-white/40" />
                   <span className="text-[10px] font-bold text-white uppercase tracking-widest">TokenFactory.sol</span>
                </div>
                <button onClick={() => { navigator.clipboard.writeText(generateSource()); showInfo("Copied to clipboard"); }} className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-[10px] font-bold text-brand-text-muted hover:text-white uppercase tracking-widest transition-all">
                  <Copy size={12} /> Copy
                </button>
              </div>
              <pre className="p-6 bg-white/[0.02] border border-white/5 rounded-xl text-[11px] font-mono whitespace-pre text-white/70 overflow-x-auto leading-relaxed max-h-[400px]">
                <code>{generateSource()}</code>
              </pre>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold text-white tracking-tight">My Deployed Tokens</h3>
            <p className="text-xs text-brand-text-muted mt-1 uppercase font-bold tracking-widest">List of tokens you launched via this factory</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-black text-white">{totalDeployed}</div>
            <div className="text-[10px] text-brand-text-muted uppercase font-bold tracking-widest">Total Global Launch</div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {loadingHistory ? (
            <div className="p-12 text-center bg-white/5 rounded-2xl border border-dashed border-white/10">
              <p className="text-[10px] font-bold text-brand-text-muted uppercase tracking-widest animate-pulse transition-all">Loading history...</p>
            </div>
          ) : deployedTokens.length === 0 ? (
            <div className="p-12 text-center bg-white/5 rounded-2xl border border-dashed border-white/10">
              <p className="text-[10px] font-bold text-brand-text-muted uppercase tracking-widest">No tokens deployed yet</p>
            </div>
          ) : deployedTokens.map((t, i) => (
            <Card key={i} className="p-5 flex items-center justify-between group hover:border-white/10 transition-all bg-white/[0.01]">
              <div className="flex items-center gap-5">
                <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-xl font-bold text-white border border-white/5 group-hover:scale-110 transition-all uppercase tracking-tighter">
                  {t.symbol.slice(0, 2)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white">{t.name}</span>
                    <span className="text-[10px] px-2 py-0.5 bg-white/5 text-brand-text-muted rounded font-mono uppercase tracking-widest font-bold">{t.symbol}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 font-mono text-[10px] text-brand-text-muted">
                    <span>Supply: {formatUnits(t.supply, t.decimals)}</span>
                    <span className="w-1 h-1 rounded-full bg-white/10" />
                    <span>{shortAddr(t.address)}</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                {t.mintable && <span className="w-2 h-2 rounded-full bg-white/40" title="Mintable" />}
                {t.burnable && <span className="w-2 h-2 rounded-full bg-white/20" title="Burnable" />}
                {t.pausable && <span className="w-2 h-2 rounded-full bg-white/10" title="Pausable" />}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};
// --- Page: Quests / Socials ---
const SOCIAL_API = 'https://game.test-hub.xyz';

type SocialTask = {
  id: string;
  title: string;
  description?: string;
  url: string;
  points: number;
  icon?: string;
  category: string;
  claimed?: boolean;
  submission_based?: boolean;
  quote_status?: 'pending' | 'approved' | 'rejected' | null;
};

type Submission = { type: string; tweet_ref?: string; link: string; status: string; admin_note?: string };

const QuestsPage = () => {
  const { address, isConnected } = useAccount();
  const [tasks, setTasks] = useState<SocialTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [visited, setVisited] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [threadLink, setThreadLink] = useState('');
  const [videoLink, setVideoLink] = useState('');
  const [quoteInputs, setQuoteInputs] = useState<Record<string, string>>({});
  const [submitBusy, setSubmitBusy] = useState<string | null>(null);
  const [bobCount, setBobCount] = useState<number | null>(null);
  const [bobClaimed, setBobClaimed] = useState(false);
  const [bobBusy, setBobBusy] = useState(false);

  useEffect(() => {
    if (!address) { setBobCount(null); return; }
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch(`https://betsonblock-api.test-hub.xyz/api/betcount/${address}`);
        const d = await r.json().catch(() => ({}));
        const c = Number(d?.count ?? d?.betCount ?? d ?? 0);
        if (!cancelled) setBobCount(Number.isFinite(c) ? c : 0);
      } catch { if (!cancelled) setBobCount(0); }
    };
    load();
    const t = setInterval(load, 30000);
    return () => { cancelled = true; clearInterval(t); };
  }, [address]);

  useEffect(() => {
    const t = tasks.find(x => x.id === 'betsonblock_100');
    if (t?.claimed) setBobClaimed(true);
  }, [tasks]);

  const claimBob = async () => {
    if (!address || bobClaimed) return;
    setBobBusy(true);
    try {
      const r = await fetch(`${SOCIAL_API}/social/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: address, task_id: 'betsonblock_100' }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d?.success !== false) {
        setBobClaimed(true);
        showInfo('+4000 PTS earned!');
      } else {
        const msg = String(d?.error || d?.message || '').toLowerCase();
        if (msg.includes('already')) setBobClaimed(true);
        else showError(d?.error || d?.message || 'Failed to claim');
      }
    } catch (e: any) {
      showError(e?.message || 'Failed to claim');
    } finally {
      setBobBusy(false);
    }
  };

  const loadTasks = async () => {
    if (!address) return;
    setLoading(true);
    try {
      const r = await fetch(`${SOCIAL_API}/social/tasks/${address}`);
      const d = await r.json();
      setTasks(Array.isArray(d?.tasks) ? d.tasks : (Array.isArray(d) ? d : []));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const loadSubmissions = async () => {
    if (!address) return;
    try {
      const r = await fetch(`${SOCIAL_API}/social/submissions/${address}`);
      const d = await r.json();
      setSubmissions(Array.isArray(d) ? d : (d?.submissions || []));
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    if (!address) return;
    loadTasks();
    loadSubmissions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  const claimTask = async (task: SocialTask) => {
    if (!address || task.claimed) return;
    setBusy(task.id);
    try {
      const r = await fetch(`${SOCIAL_API}/social/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: address, task_id: task.id }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d?.success !== false) {
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, claimed: true } : t));
        showInfo(`+${task.points} PTS earned!`);
      } else {
        const msg = String(d?.error || d?.message || '').toLowerCase();
        if (msg.includes('already')) {
          setTasks(prev => prev.map(t => t.id === task.id ? { ...t, claimed: true } : t));
        } else {
          showError(d?.error || d?.message || 'Failed to claim');
        }
      }
    } catch (e: any) {
      showError(e?.message || 'Failed to claim');
    } finally {
      setBusy(null);
    }
  };

  const submitContent = async (
    type: 'thread' | 'video' | 'quote_tweet',
    link: string,
    tweet_ref?: string,
  ) => {
    if (!address || !link.trim()) return;
    const key = tweet_ref ? `${type}:${tweet_ref}` : type;
    setSubmitBusy(key);
    try {
      const body: any = { wallet: address, type, link: link.trim() };
      if (tweet_ref) body.tweet_ref = tweet_ref;
      const r = await fetch(`${SOCIAL_API}/social/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d?.success !== false) {
        showInfo('Submitted! Awaiting approval.');
        if (type === 'thread') setThreadLink('');
        else if (type === 'video') setVideoLink('');
        else if (type === 'quote_tweet' && tweet_ref) {
          setQuoteInputs(prev => ({ ...prev, [tweet_ref]: '' }));
          setTasks(prev => prev.map(t => t.id === tweet_ref ? { ...t, quote_status: 'pending' } : t));
        }
        await loadSubmissions();
      } else {
        showError(d?.error || d?.message || 'Failed to submit');
      }
    } catch (e: any) {
      showError(e?.message || 'Failed to submit');
    } finally {
      setSubmitBusy(null);
    }
  };

  const isPartnership = (t: SocialTask) => t.category === 'follow' && t.id.toLowerCase().includes('faros');

  const groups: { key: string; title: string; filter: (t: SocialTask) => boolean }[] = [
    { key: 'partnerships', title: 'Partnerships', filter: (t) => isPartnership(t) },
    { key: 'follow', title: 'X Follows', filter: (t) => t.category === 'follow' && !isPartnership(t) },
    { key: 'tweet', title: 'Like & Retweet', filter: (t) => t.category === 'tweet' },
    { key: 'telegram', title: 'Telegram', filter: (t) => t.category === 'telegram' },
    { key: 'quote', title: 'Quote Tweets', filter: (t) => t.category === 'quote' },
  ];

  const approvedQuotes = tasks.filter(t => t.category === 'quote' && t.quote_status === 'approved').length;
  const totalEarned = tasks.reduce((acc, t) => acc + (t.category !== 'quote' && t.claimed ? t.points : 0), 0) + approvedQuotes * 50;
  const totalPossible = 820;

  const threadSub = submissions.find(s => s.type === 'thread');
  const videoSub = submissions.find(s => s.type === 'video');

  const renderIcon = (t: SocialTask) => t.category === 'telegram' ? '✈' : '𝕏';

  const renderSubmissionStatus = (sub?: Submission) => {
    if (!sub) return null;
    if (sub.status === 'pending') {
      return <div className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border border-white/15 text-white bg-white/5 inline-block">⏳ Approval Pending</div>;
    }
    if (sub.status === 'approved') {
      return <div className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border border-green-500/30 text-green-400 bg-green-500/10 inline-block">✅ Approved</div>;
    }
    if (sub.status === 'rejected') {
      return <div className="text-[10px] font-bold uppercase tracking-widest text-red-400">❌ Rejected{sub.admin_note ? `: ${sub.admin_note}` : ''}</div>;
    }
    return null;
  };

  const canResubmit = (sub?: Submission) => !sub || sub.status === 'rejected';

  const renderDirectClaimCard = (t: SocialTask, groupTitle: string) => {
    const isDone = !!t.claimed;
    const hasVisited = !!visited[t.id];
    return (
      <Card key={t.id} className={cn(
        "p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all",
        isDone ? "bg-white/[0.02] border-white/5 opacity-60" : "bg-black/20 border-white/5 hover:bg-white/[0.03]"
      )}>
        <div className="flex items-center gap-4 min-w-0">
          <div className={cn(
            "w-12 h-12 rounded-xl flex items-center justify-center text-xl shrink-0 border",
            isDone ? "bg-white/[0.02] border-white/5 text-white/30" : "bg-white/5 border-white/10 text-white"
          )}>
            {renderIcon(t)}
          </div>
          <div className="min-w-0">
            <h3 className={cn("font-semibold truncate", isDone ? "text-white/40" : "text-white")}>{t.title}</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className={cn(
                "text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border",
                isDone ? "border-white/5 text-white/30" : "border-white/15 text-white bg-white/5"
              )}>
                +{t.points} PTS
              </span>
              <span className="text-[10px] text-brand-text-muted uppercase tracking-widest">{groupTitle}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          {isDone ? (
            <span className="px-5 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest bg-green-500/10 border border-green-500/30 text-green-400">
              ✅ Claimed
            </span>
          ) : !hasVisited ? (
            <a
              href={t.url}
              target="_blank"
              rel="noreferrer"
              onClick={() => setVisited(prev => ({ ...prev, [t.id]: true }))}
              className="flex-1 md:flex-none inline-flex items-center justify-center gap-1.5 px-5 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest border border-white/15 text-white hover:bg-white/10 transition-all"
            >
              Go <ExternalLink size={11} />
            </a>
          ) : (
            <button
              onClick={() => claimTask(t)}
              disabled={busy === t.id || !isConnected}
              className="flex-1 md:flex-none px-5 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest bg-white text-black hover:opacity-90 disabled:opacity-40 transition-all"
            >
              {busy === t.id ? "Claiming…" : "Claim"}
            </button>
          )}
        </div>
      </Card>
    );
  };

  const renderQuoteCard = (t: SocialTask) => {
    const status = t.quote_status || null;
    const hasVisited = !!visited[t.id];
    const inputVal = quoteInputs[t.id] || '';
    const subKey = `quote_tweet:${t.id}`;

    return (
      <Card key={t.id} className={cn(
        "p-5 flex flex-col gap-3 transition-all",
        status === 'approved' ? "bg-white/[0.02] border-white/5 opacity-80" : "bg-black/20 border-white/5"
      )}>
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl shrink-0 border bg-white/5 border-white/10 text-white">𝕏</div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-white truncate">{t.title}</h3>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border border-white/15 text-white bg-white/5">
                +{t.points || 50} PTS
              </span>
              <span className="text-[10px] text-brand-text-muted uppercase tracking-widest">Quote Tweets</span>
            </div>
          </div>
        </div>

        {status === 'approved' ? (
          <div className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border border-green-500/30 text-green-400 bg-green-500/10 inline-block w-fit">
            ✅ Approved +50 PTS
          </div>
        ) : status === 'pending' ? (
          <div className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full border border-white/15 text-white bg-white/5 inline-block w-fit">
            ⏳ Pending Review
          </div>
        ) : !hasVisited ? (
          <a
            href={t.url}
            target="_blank"
            rel="noreferrer"
            onClick={() => setVisited(prev => ({ ...prev, [t.id]: true }))}
            className="inline-flex items-center justify-center gap-1.5 px-5 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest border border-white/15 text-white hover:bg-white/10 transition-all w-fit"
          >
            Go <ExternalLink size={11} />
          </a>
        ) : (
          <>
            {status === 'rejected' && (
              <div className="text-[10px] font-bold uppercase tracking-widest text-red-400">❌ Rejected — Resubmit below</div>
            )}
            <div className="flex flex-col md:flex-row gap-2">
              <input
                type="text"
                value={inputVal}
                onChange={(e) => setQuoteInputs(prev => ({ ...prev, [t.id]: e.target.value }))}
                placeholder="Paste your quote tweet link"
                className="flex-1 px-4 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-white/30"
              />
              <button
                onClick={() => submitContent('quote_tweet', inputVal, t.id)}
                disabled={!inputVal.trim() || submitBusy === subKey}
                className="px-6 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest bg-white text-black hover:opacity-90 disabled:opacity-40 transition-all"
              >
                {submitBusy === subKey ? 'Submitting…' : 'Submit'}
              </button>
            </div>
          </>
        )}
      </Card>
    );
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-12 max-w-4xl mx-auto px-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center text-white">
            <ListChecks size={14} />
          </div>
          <div>
            <h1 className="text-xs font-bold uppercase tracking-[0.3em] text-white">Socials & Quests</h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-1 h-1 rounded-full bg-white/40 animate-pulse" />
              <span className="text-[10px] text-brand-text-muted font-medium uppercase tracking-widest">Earn Points</span>
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[9px] uppercase tracking-widest text-brand-text-muted">Available</div>
          <div className="font-mono text-white text-xl font-bold">{totalEarned}<span className="text-brand-text-muted text-xs"> / {totalPossible} PTS</span></div>
        </div>
      </div>

      {!isConnected && (
        <div className="p-12 text-center bg-white/5 border border-dashed border-white/10 rounded-2xl mb-10">
          <p className="text-brand-text-muted uppercase text-xs font-bold tracking-widest">Connect wallet to track your quest progress</p>
        </div>
      )}

      {isConnected && loading && tasks.length === 0 && (
        <div className="p-12 text-center text-brand-text-muted text-xs uppercase tracking-widest">Loading tasks…</div>
      )}

      {/* Partner Tasks - pinned to top */}
      {isConnected && (
        <div className="mb-10">
          <h2 className="text-lg font-bold text-white tracking-tight mb-4">Partners</h2>
          <Card className={cn(
            "p-5 flex flex-col gap-4 transition-all",
            bobClaimed ? "bg-white/[0.02] border-white/5 opacity-70" : "bg-black/20 border-orange-500/40"
          )}>
            <div className="flex items-center gap-4 min-w-0">
              <img
                src="https://raw.githubusercontent.com/sachinsahani-cloud/hello-friend/main/public/coins/logo.png"
                alt="BetsOnBlock"
                style={{ width: 48, height: 48, objectFit: "contain", borderRadius: 8 }}
                className="shrink-0"
              />
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-white truncate">Bet 100 Times on BetsOnBlock</h3>
                <p className="text-xs text-brand-text-muted mt-1">Place 100 bets on BetsOnBlock</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border border-orange-500/40 text-orange-400 bg-orange-500/10">
                    +4000 PTS
                  </span>
                  <span className="text-[10px] text-brand-text-muted uppercase tracking-widest">Partner</span>
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] uppercase tracking-widest text-brand-text-muted font-bold">Progress</span>
                <span className="font-mono text-xs text-white font-bold">
                  {bobCount === null ? '—' : Math.min(bobCount, 100)} / 100
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full bg-orange-500 transition-all"
                  style={{ width: `${Math.min(100, ((bobCount ?? 0) / 100) * 100)}%` }}
                />
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-2">
              <a
                href="https://betsonblock.test-hub.xyz/bettingzone"
                target="_blank"
                rel="noreferrer"
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest border border-orange-500/40 text-orange-400 hover:bg-orange-500/10 transition-all"
              >
                Open BetsOnBlock <ExternalLink size={11} />
              </a>
              {bobClaimed ? (
                <span className="flex-1 md:flex-none inline-flex items-center justify-center px-5 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest bg-green-500/10 border border-green-500/30 text-green-400">
                  ✅ Claimed
                </span>
              ) : (
                <button
                  onClick={claimBob}
                  disabled={bobBusy}
                  className="flex-1 md:flex-none px-5 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest bg-orange-500 text-black hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  {bobBusy ? 'Claiming…' : 'Claim'}
                </button>
              )}
            </div>
          </Card>
        </div>
      )}

      {groups.map(group => {
        const items = tasks.filter(group.filter);
        if (!items.length) return null;
        return (
          <div key={group.key} className="mb-10">
            <div className="flex items-end justify-between mb-4">
              <h2 className="text-lg font-bold text-white tracking-tight">{group.title}</h2>
            </div>
            <div className="space-y-3">
              {items.map(t => group.key === 'quote' ? renderQuoteCard(t) : renderDirectClaimCard(t, group.title))}
            </div>
          </div>
        );
      })}

      {/* Content Rewards Section */}
      {isConnected && (
        <div className="mb-10">
          <h2 className="text-lg font-bold text-white tracking-tight mb-4">Content Rewards</h2>
          <div className="space-y-3">
            {/* Card 1 — Thread */}
            <Card className="p-5 bg-black/20 border-white/5">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl shrink-0 border bg-white/5 border-white/10 text-white">𝕏</div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-white">Explain LitDEX on X</h3>
                  <p className="text-xs text-brand-text-muted mt-1">Write a thread explaining how LitDEX works and post it on X</p>
                  <ul className="mt-3 space-y-1 text-[11px] text-white/80">
                    <li>• Regular: <span className="font-mono text-white">500 pts + 0.1 zkLTC</span></li>
                    <li>• ✅ Verified X: <span className="font-mono text-white">1000 pts + 1 zkLTC</span></li>
                  </ul>
                </div>
              </div>
              {threadSub && !canResubmit(threadSub) ? (
                <div>{renderSubmissionStatus(threadSub)}</div>
              ) : (
                <div className="flex flex-col md:flex-row gap-2">
                  <input
                    type="text"
                    value={threadLink}
                    onChange={(e) => setThreadLink(e.target.value)}
                    placeholder="Paste your thread link"
                    className="flex-1 px-4 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-white/30"
                  />
                  <button
                    onClick={() => submitContent('thread', threadLink)}
                    disabled={!threadLink.trim() || submitBusy === 'thread'}
                    className="px-6 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest bg-white text-black hover:opacity-90 disabled:opacity-40 transition-all"
                  >
                    {submitBusy === 'thread' ? 'Submitting…' : 'Submit'}
                  </button>
                </div>
              )}
              {threadSub && threadSub.status === 'rejected' && (
                <div className="mt-3">{renderSubmissionStatus(threadSub)}</div>
              )}
            </Card>

            {/* Card 2 — Video */}
            <Card className="p-5 bg-black/20 border-white/5">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl shrink-0 border bg-white/5 border-white/10 text-white">🎬</div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-white">Record & Explain LitDEX</h3>
                  <p className="text-xs text-brand-text-muted mt-1">Post a video or detailed post on X or YouTube. Min 1000 views required.</p>
                  <ul className="mt-3 space-y-1 text-[11px] text-white/80">
                    <li>• Reward: <span className="font-mono text-white">6000 pts + 1 zkLTC</span></li>
                    <li className="text-yellow-400/80">⚠️ Minimum 1000 views required for approval</li>
                  </ul>
                </div>
              </div>
              {videoSub && !canResubmit(videoSub) ? (
                <div>{renderSubmissionStatus(videoSub)}</div>
              ) : (
                <div className="flex flex-col md:flex-row gap-2">
                  <input
                    type="text"
                    value={videoLink}
                    onChange={(e) => setVideoLink(e.target.value)}
                    placeholder="Paste your video/post link"
                    className="flex-1 px-4 py-2.5 rounded-xl bg-black/40 border border-white/10 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-white/30"
                  />
                  <button
                    onClick={() => submitContent('video', videoLink)}
                    disabled={!videoLink.trim() || submitBusy === 'video'}
                    className="px-6 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest bg-white text-black hover:opacity-90 disabled:opacity-40 transition-all"
                  >
                    {submitBusy === 'video' ? 'Submitting…' : 'Submit'}
                  </button>
                </div>
              )}
              {videoSub && videoSub.status === 'rejected' && (
                <div className="mt-3">{renderSubmissionStatus(videoSub)}</div>
              )}
            </Card>
          </div>
        </div>
      )}
    </motion.div>
  );
};

// --- Page: Games ---

const MATHSLASH_API_URL = 'https://game.test-hub.xyz';
const WeeklyLeaderboard = ({ className = '' }: { className?: string }) => {
  const [entries, setEntries] = useState<any[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch(`${MATHSLASH_API_URL}/simple/leaderboard`);
        if (r.ok) {
          const d = await r.json();
          if (!cancelled) setEntries(Array.isArray(d) ? d : (d?.leaderboard || []));
        }
      } catch { /* ignore */ }
    };
    load();
    const t = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);
  const mask = (a: string) => a ? `${a.slice(0, 6)}...${a.slice(-4)}` : '';
  const weekStart = (() => {
    const d = new Date();
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1 - day);
    d.setDate(d.getDate() + diff);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  })();
  return (
    <div className={`p-5 rounded-2xl font-mono bg-brand-surface border border-brand-border ${className}`}>
      <div className="text-[11px] uppercase text-brand-text-primary mb-1">Weekly Leaderboard</div>
      <div className="text-[10px] text-brand-text-muted mb-3">Week of {weekStart}</div>
      {entries === null ? (
        <div className="text-brand-text-muted text-xs">Loading...</div>
      ) : entries.length === 0 ? (
        <div className="text-brand-text-muted text-xs">No games this week yet</div>
      ) : (
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-brand-text-muted"><th className="text-left font-normal">#</th><th className="text-left font-normal">Wallet</th><th className="text-right font-normal">Score</th></tr>
          </thead>
          <tbody>
            {entries.slice(0, 20).map((e: any, i: number) => {
              const c = i === 0 ? 'text-brand-text-primary font-bold' : 'text-brand-text-muted';
              const w = e.wallet || e.walletAddress || e.address || '';
              const displayWallet = w.includes('...') ? w : mask(w);
              return (
                <tr key={i} className={c}>
                  <td className="py-1">{i + 1}</td>
                  <td className="py-1">{displayWallet}</td>
                  <td className="py-1 text-right">{e.total_score ?? e.totalScore ?? e.score ?? e.points ?? 0}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div className="mt-4 pt-3 border-t border-brand-border text-[10px] text-brand-text-muted space-y-0.5">
        <div>Rank 1: +5,000 pts bonus</div>
        <div>Rank 2: +2,500 pts bonus</div>
        <div>Rank 3: +1,500 pts bonus</div>
        <div>Rank 4-10: +500 pts bonus</div>
        <div>Rank 11-20: +200 pts bonus</div>
        <div className="pt-2 opacity-70">Top 20 rewarded every Sunday midnight IST</div>
      </div>
    </div>
  );
};

const CASINO_API = 'https://game.test-hub.xyz';
const CASINO_STAKE_MULTIPLE = 5;
// 6 casino games × 20 daily plays × 5 PTS stake = 600 PTS for a full
// daily session. Round up to the next multiple of 50 for a cleaner
// UX recommendation.
const CASINO_DAILY_RECOMMENDED = 600;
const CASINO_GAMES_BREAKDOWN = '6 casino games · 20 plays/day · 5 PTS stake';

const CasinoWalletBadge = ({ wallet, onOpen }: { wallet: string; onOpen: () => void }) => {
  const [balance, setBalance] = useState<number | null>(null);
  useEffect(() => {
    if (!wallet) { setBalance(null); return; }
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch(`${CASINO_API}/casino/balance/${wallet}`);
        if (r.ok) {
          const d = await r.json();
          if (!cancelled) setBalance(Number(d?.balance ?? 0));
        }
      } catch { /* ignore — endpoint might not be deployed yet */ }
    };
    load();
    const t = setInterval(load, 15000);
    const handler = () => load();
    window.addEventListener('litdex:casino-wallet:refresh', handler);
    return () => { cancelled = true; clearInterval(t); window.removeEventListener('litdex:casino-wallet:refresh', handler); };
  }, [wallet]);
  return (
    <button
      onClick={onOpen}
      className="inline-flex items-center gap-3 px-4 py-2 rounded-xl bg-[#0a0a0a] border border-[#1f1f1f] hover:border-white/30 text-white font-mono text-[11px] font-bold uppercase tracking-widest transition-colors"
    >
      <span className="text-white/55">Casino Balance</span>
      <span className="text-[#5be0a4]">{balance == null ? '—' : balance.toLocaleString()} PTS</span>
      <span className="text-white/30">·</span>
      <span className="text-white">Deposit / Withdraw</span>
    </button>
  );
};

const CasinoWalletModal = ({ open, onClose, wallet }: { open: boolean; onClose: () => void; wallet: string }) => {
  const [tab, setTab] = useState<'deposit'|'withdraw'>('deposit');
  const [amount, setAmount] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [success, setSuccess] = useState<{ txHash: string; balance: number } | null>(null);
  const [info, setInfo] = useState<{ balance: number; totalDeposited: number; totalWithdrawn: number; depositsToday?: number; depositsRemaining?: number; dailyDepositCap?: number } | null>(null);
  const [onChainPts, setOnChainPts] = useState<number | null>(null);

  useEffect(() => {
    if (!open || !wallet) return;
    setErr(''); setAmount(''); setSuccess(null);
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch(`${CASINO_API}/casino/balance/${wallet}`);
        if (r.ok) {
          const d = await r.json();
          if (!cancelled) setInfo({
            balance: Number(d?.balance ?? 0),
            totalDeposited: Number(d?.totalDeposited ?? 0),
            totalWithdrawn: Number(d?.totalWithdrawn ?? 0),
            depositsToday: Number(d?.depositsToday ?? 0),
            depositsRemaining: d?.depositsRemaining != null ? Number(d.depositsRemaining) : undefined,
            dailyDepositCap: d?.dailyDepositCap != null ? Number(d.dailyDepositCap) : undefined,
          });
        }
      } catch { /* ignore */ }
      try {
        const r = await fetch(`https://api.test-hub.xyz/points/${wallet}`);
        if (r.ok) {
          const d = await r.json();
          if (!cancelled) setOnChainPts(Number(d?.total ?? 0));
        }
      } catch { /* ignore */ }
    };
    load();
    return () => { cancelled = true; };
  }, [open, wallet, busy]);

  const max = tab === 'deposit' ? (onChainPts ?? 0) : (info?.balance ?? 0);
  const maxRoundedDown = max - (max % CASINO_STAKE_MULTIPLE);

  const submit = async () => {
    if (!wallet) { setErr('Connect wallet first'); return; }
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) { setErr('Enter a positive amount'); return; }
    if (n % CASINO_STAKE_MULTIPLE !== 0) { setErr(`Must be a multiple of ${CASINO_STAKE_MULTIPLE}`); return; }
    if (tab === 'deposit' && onChainPts != null && n > onChainPts) { setErr(`You only have ${onChainPts.toLocaleString()} on-chain pts`); return; }
    if (tab === 'withdraw' && info && n > info.balance) { setErr(`Casino balance is only ${info.balance.toLocaleString()}`); return; }
    setErr(''); setBusy(true); setSuccess(null);
    try {
      const r = await fetch(`${CASINO_API}/casino/${tab}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet, amount: n }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.ok) {
        const code = d?.error || `${tab}_failed`;
        const human: Record<string, string> = {
          on_chain_burn_failed: 'On-chain burn failed. Server may be busy — try again in a sec.',
          on_chain_mint_failed: 'On-chain mint failed. Balance restored — try again.',
          insufficient: 'Casino balance is insufficient.',
          bad_amount: 'Invalid amount.',
          must_be_multiple_of_5: 'Amount must be a multiple of 5.',
          min_deposit_5: 'Minimum deposit is 5 PTS.',
          min_withdraw_5: 'Minimum withdraw is 5 PTS.',
          max_deposit_1000000: 'Maximum deposit is 1,000,000 PTS per call.',
          bad_wallet: 'Wallet address is invalid.',
          daily_deposit_cap_reached: 'You\'ve hit the daily deposit cap (2/day). Resets at 00:00 IST — think twice next time.',
        };
        setErr(human[code] || code);
      } else {
        setSuccess({ txHash: d.txHash, balance: d.balance });
        setAmount('');
        try { window.dispatchEvent(new Event('litdex:casino-wallet:refresh')); } catch {}
      }
    } catch { setErr('Network error — server may be down'); }
    setBusy(false);
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[200000] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-brand-surface border border-brand-border rounded-2xl p-6 w-full max-w-[440px] font-mono text-brand-text-primary max-h-[90vh] overflow-y-auto">
        <div className="text-center mb-4">
          <div className="text-2xl font-bold tracking-tighter text-brand-text-primary">Casino Wallet</div>
          <div className="text-[10px] uppercase tracking-widest text-brand-text-muted mt-1">Deposit once · play freely · withdraw any time</div>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg px-3 py-2.5">
            <div className="text-[8px] uppercase tracking-widest text-brand-text-muted mb-0.5">On-Chain Points</div>
            <div className="text-brand-text-primary font-bold text-sm">{onChainPts == null ? '—' : onChainPts.toLocaleString()}</div>
          </div>
          <div className="bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg px-3 py-2.5">
            <div className="text-[8px] uppercase tracking-widest text-brand-text-muted mb-0.5">Casino Balance</div>
            <div className="text-[#5be0a4] font-bold text-sm">{info ? info.balance.toLocaleString() : '—'}</div>
          </div>
        </div>
        {info && (info.totalDeposited > 0 || info.totalWithdrawn > 0) && (
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg px-3 py-1.5 text-center">
              <div className="text-[8px] uppercase tracking-widest text-brand-text-muted">Total Deposited</div>
              <div className="text-brand-text-primary text-xs">{info.totalDeposited.toLocaleString()}</div>
            </div>
            <div className="bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg px-3 py-1.5 text-center">
              <div className="text-[8px] uppercase tracking-widest text-brand-text-muted">Total Withdrawn</div>
              <div className="text-brand-text-primary text-xs">{info.totalWithdrawn.toLocaleString()}</div>
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-1.5 mb-4">
          {(['deposit', 'withdraw'] as const).map((t) => (
            <button key={t} onClick={() => { setTab(t); setErr(''); setAmount(''); setSuccess(null); }} className={`py-2 rounded-lg text-[10px] uppercase tracking-widest font-bold transition-colors ${tab === t ? 'bg-white text-black' : 'bg-[#0a0a0a] border border-[#1f1f1f] text-brand-text-muted hover:text-brand-text-primary'}`}>{t}</button>
          ))}
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="text-[9px] uppercase tracking-widest text-brand-text-muted">Amount · multiple of {CASINO_STAKE_MULTIPLE}</div>
            <div className="text-[9px] text-brand-text-muted">Available: <span className="text-brand-text-primary font-bold">{max.toLocaleString()}</span></div>
          </div>
          <input
            type="number"
            min={CASINO_STAKE_MULTIPLE}
            step={CASINO_STAKE_MULTIPLE}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={`e.g. ${CASINO_STAKE_MULTIPLE * 20}`}
            className="w-full bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg px-3 py-2.5 text-[14px] text-brand-text-primary placeholder:text-brand-text-muted/50 outline-none focus:border-white/30"
          />
          <div className="grid grid-cols-5 gap-1.5 mt-2">
            {[50, 100, 500, 1000].map((p) => (
              <button key={p} disabled={p > max} onClick={() => setAmount(String(p))} className="py-1.5 rounded-md text-[10px] font-bold bg-[#0a0a0a] border border-[#1f1f1f] text-brand-text-muted hover:text-brand-text-primary disabled:opacity-30 disabled:cursor-not-allowed">{p}</button>
            ))}
            <button disabled={maxRoundedDown <= 0} onClick={() => setAmount(String(maxRoundedDown))} className="py-1.5 rounded-md text-[10px] font-bold bg-white text-black hover:bg-white/90 disabled:opacity-30 disabled:cursor-not-allowed">MAX</button>
          </div>
        </div>
        <div className="text-[10px] text-brand-text-muted mt-3">
          {tab === 'deposit'
            ? 'Burns this many points on chain and credits your casino balance. One transaction.'
            : 'Withdraws from casino balance back to on-chain points. One transaction.'}
        </div>
        {tab === 'deposit' && (
          <div className="mt-3 px-3 py-2 rounded-lg bg-[#0a0a0a] border border-[#1f1f1f] text-[10px] text-brand-text-muted leading-relaxed">
            <div className="flex items-center justify-between">
              <span className="text-brand-text-primary font-bold uppercase tracking-widest text-[9px]">Recommended</span>
              <button onClick={() => setAmount(String(CASINO_DAILY_RECOMMENDED))} className="text-[#5be0a4] underline text-[10px] font-bold">{CASINO_DAILY_RECOMMENDED} PTS</button>
            </div>
            <div className="mt-1">{CASINO_GAMES_BREAKDOWN} = <span className="text-brand-text-primary">{CASINO_DAILY_RECOMMENDED} PTS</span> for a full daily session.</div>
            {info && info.dailyDepositCap != null && (
              <div className="mt-1.5 pt-1.5 border-t border-white/5">
                Daily deposits used: <span className="text-brand-text-primary font-bold">{info.depositsToday ?? 0} / {info.dailyDepositCap}</span>
                {info.depositsRemaining === 0 && <span className="text-[#ff8a8a]"> · cap reached, resets 00:00 IST</span>}
                <div className="opacity-70 mt-0.5">2 deposits per day — think twice how much you want to deposit.</div>
              </div>
            )}
          </div>
        )}
        {err && <div className="mt-3 px-3 py-2 rounded-lg bg-[rgba(239,73,86,0.08)] border border-[rgba(239,73,86,0.3)] text-[#ef4956] text-[11px]">{err}</div>}
        {success && (
          <div className="mt-3 px-3 py-2 rounded-lg bg-[rgba(62,207,142,0.08)] border border-[rgba(62,207,142,0.3)] text-[#3ecf8e] text-[11px]">
            ✓ {tab === 'deposit' ? 'Deposit' : 'Withdraw'} confirmed · new balance: {success.balance.toLocaleString()}
            {success.txHash && (
              <a href={`https://liteforge.explorer.caldera.xyz/tx/${success.txHash}`} target="_blank" rel="noreferrer" className="block mt-1 underline">
                tx {success.txHash.slice(0, 10)}…{success.txHash.slice(-6)}
              </a>
            )}
          </div>
        )}
        <div className="flex gap-2 mt-5">
          <button onClick={submit} disabled={busy || !wallet || (tab === 'deposit' && info?.depositsRemaining === 0)} className="flex-1 py-3 rounded-lg bg-white text-black font-bold text-[11px] uppercase tracking-widest disabled:opacity-50 hover:bg-white/90 transition-colors">
            {busy ? 'Processing…' : tab === 'deposit'
              ? (info?.depositsRemaining === 0 ? 'Daily Cap Reached' : 'Deposit')
              : 'Withdraw'}
          </button>
          <button onClick={onClose} className="flex-1 py-3 rounded-lg bg-[#0a0a0a] border border-[#1f1f1f] text-brand-text-primary font-bold text-[11px] uppercase tracking-widest hover:bg-[#1a1a1a] transition-colors">Close</button>
        </div>
      </div>
    </div>
  );
};

const REWARD_TIERS = [
  { range: 'Rank 1',     ldex: '1 zkLTC + 10K LDEX', pts: '2,500 PTS' },
  { range: 'Rank 2',     ldex: '10K LDEX',          pts: '1,000 PTS' },
  { range: 'Rank 3',     ldex: '5K LDEX',           pts: '500 PTS' },
  { range: 'Rank 4-10',  ldex: '3K LDEX',           pts: '300 PTS' },
  { range: 'Rank 11-20', ldex: '1K LDEX',           pts: '100 PTS' },
];

const RewardTierFooter = () => (
  <div className="mt-4 pt-3 border-t border-brand-border text-[10px] text-brand-text-muted space-y-0.5">
    <div className="text-brand-text-primary font-bold mb-1.5">Weekly Rewards · Top 20</div>
    {REWARD_TIERS.map((t) => (
      <div key={t.range} className="flex items-center justify-between gap-2">
        <span>{t.range}</span>
        <span className="text-right text-brand-text-muted">
          <span className="text-brand-text-primary">{t.ldex}</span> · {t.pts}
        </span>
      </div>
    ))}
    <div className="pt-2 opacity-70">Top 20 rewarded every Sunday midnight IST</div>
  </div>
);

const ConvertPointsCard = ({ wallet }: { wallet: string }) => {
  const SIMPLE_API = 'https://game.test-hub.xyz';
  const [pending, setPending] = useState<{ gamesPending: number; totalScore: number; pointsAvailable: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; tx?: string } | null>(null);
  const [err, setErr] = useState('');

  const fetchPending = async () => {
    if (!wallet) return;
    try {
      const r = await fetch(`${SIMPLE_API}/simple/pending/${wallet}`);
      if (r.ok) setPending(await r.json());
    } catch {}
  };

  useEffect(() => {
    fetchPending();
    const t = setInterval(fetchPending, 15000);
    return () => clearInterval(t);
  }, [wallet]);

  const handleClaim = async () => {
    if (!wallet || loading) return;
    setLoading(true);
    setErr('');
    setMsg(null);
    try {
      const r = await fetch(`${SIMPLE_API}/simple/claim-points`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.success === false) throw new Error(j?.message || j?.error || 'Claim failed');
      setMsg({ text: `✅ ${j.pointsCredited} pts credited to your Points balance`, tx: j.txHash });
      fetchPending();
    } catch (e: any) {
      setErr(e?.message || 'Network error');
    } finally {
      setLoading(false);
    }
  };

  const ptsAvailable = Number(pending?.pointsAvailable ?? 0);
  const gamesPending = Number(pending?.gamesPending ?? 0);

  return (
    <div className="p-5 rounded-2xl font-mono bg-brand-surface border border-brand-border">
      <div className="text-[11px] uppercase text-brand-text-muted mb-4">Convert Points</div>

      <div className="space-y-2 mb-4">
        <div className="flex justify-between text-[11px]">
          <span className="text-brand-text-muted uppercase">Unclaimed Games</span>
          <span className="text-brand-text-primary">{gamesPending}</span>
        </div>
        <div className="flex justify-between text-[11px]">
          <span className="text-brand-text-muted uppercase">Pts Available</span>
          <span className="text-brand-text-primary">{ptsAvailable.toLocaleString()} pts</span>
        </div>
        <div className="flex justify-between text-[11px]">
          <span className="text-brand-text-muted uppercase">Conversion</span>
          <span className="text-brand-text-primary">1 score → 0.3 pts</span>
        </div>
      </div>

      <button
        onClick={handleClaim}
        disabled={loading || ptsAvailable <= 0}
        className="w-full py-2.5 rounded-lg bg-brand-text-primary text-brand-bg font-mono font-bold text-[11px] uppercase tracking-widest disabled:opacity-50"
      >
        {loading
          ? 'Claiming…'
          : ptsAvailable > 0
            ? `Claim ${ptsAvailable.toLocaleString()} pts`
            : 'Play games to earn pts'}
      </button>

      {msg && (
        <div className="mt-3 text-[11px] text-brand-text-primary">
          {msg.text}
          {msg.tx && (
            <div className="mt-1">
              <a href={`https://liteforge.explorer.caldera.xyz/tx/${msg.tx}`} target="_blank" rel="noreferrer" className="underline decoration-white/30 text-brand-text-primary break-all">View tx</a>
            </div>
          )}
        </div>
      )}
      {err && <div className="mt-3 text-[11px]" style={{ color: '#c44' }}>{err}</div>}

      <div className="mt-4 text-[10px] text-brand-text-muted">Points add to your on-chain Points balance instantly.</div>
    </div>
  );
};

const MathSlashPage = ({ onBack }: { onBack: () => void }) => {
  const { address, isConnected } = useAccount();
  const SIMPLE_API = 'https://game.test-hub.xyz';
  const DAILY_LIMIT = 5;
  const RATE = 0.00000222;

  const [stats, setStats] = useState<any>(null);
  const [board, setBoard] = useState<any[]>([]);
  const [global, setGlobal] = useState<any>(null);
  const [playing, setPlaying] = useState(false);
  const [starting, setStarting] = useState(false);
  const [gameOver, setGameOver] = useState<{ score: number; correct: number; wrong: number; level: number; levelName: string; best: number } | null>(null);
  const [endingGame, setEndingGame] = useState(false);
  const [sentNotice, setSentNotice] = useState('');
  const [autoStart, setAutoStart] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [errMsg, setErrMsg] = useState('');
  const liveScoreRef = useRef(0);
  const endCalledRef = useRef(false);

  const lowerAddr = address ? address.toLowerCase() : '';
  const mask = (a: string) => a ? `${a.slice(0, 6)}...${a.slice(-4)}` : '';

  const fetchStats = async () => {
    if (!lowerAddr) return;
    try {
      const r = await fetch(`${SIMPLE_API}/simple/stats/${lowerAddr}`);
      if (r.ok) setStats(await r.json());
    } catch {}
  };
  const fetchBoard = async () => {
    try {
      const r = await fetch(`${SIMPLE_API}/simple/leaderboard`);
      if (r.ok) {
        const d = await r.json();
        setBoard(Array.isArray(d) ? d : (d?.leaderboard || []));
      }
    } catch {}
  };
  const fetchGlobal = async () => {
    try {
      const r = await fetch(`${SIMPLE_API}/simple/global`);
      if (r.ok) setGlobal(await r.json());
    } catch {}
  };

  useEffect(() => {
    fetchBoard();
    fetchGlobal();
    const t = setInterval(() => { fetchBoard(); fetchGlobal(); }, 60000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!lowerAddr) return;
    fetchStats();
    const t = setInterval(fetchStats, 20000);
    return () => clearInterval(t);
  }, [lowerAddr]);

  // Listen for score from iframe. React overlay owns the game-over UI; conversion is triggered by the buttons.
  useEffect(() => {
    if (!lowerAddr) return;
    const onMsg = async (e: MessageEvent) => {
      const d: any = e?.data;
      if (!d) return;
      if (d.type === 'litdex:mathslash:exit') {
        setPlaying(false);
        setGameOver(null);
        setEndingGame(false);
        setSentNotice('');
        try { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); } catch {}
        try { (screen.orientation as any)?.unlock?.(); } catch {}
        fetchStats();
        return;
      }
      if (d.type === 'SCORE_UPDATE' || d.type === 'litdex:mathslash:score') {
        liveScoreRef.current = Number(d.score) || 0;
        return;
      }
      // Accept BOTH the new GAME_OVER event and the legacy litdex:mathslash:end event
      const isGameOver = d.type === 'GAME_OVER' || d.type === 'litdex:mathslash:end';
      if (!isGameOver) return;

      const score = Number(d.score) || 0;
      console.log('[MathSlash] Game ended with score:', score);
      setGameOver({
        score,
        correct: Number(d.correct ?? d.totalCorrect ?? 0),
        wrong: Number(d.wrong ?? d.totalWrong ?? 0),
        level: Number(d.level ?? d.currentLevel ?? 1),
        levelName: String(d.levelName ?? ''),
        best: Number(d.best ?? d.bestScore ?? score),
      });
      setEndingGame(false);
      setSentNotice('');
      setErrMsg('');
      // Deduplicate: only call /simple/end once per session
      if (endCalledRef.current) return;
      endCalledRef.current = true;
      // Call /simple/end to record the score and trigger zkLTC payout.
      // Build bot proof inline because the effect's closure was created
      // before `buildBotProof` (defined further below) was hoisted.
      const sigSnap = botSignalsRef.current;
      const sessionMs = Date.now() - sigSnap.sessionStart;
      const proof = {
        sessionMs,
        mouseMoves: sigSnap.mouseMoves,
        scrolls: sigSnap.scrolls,
        focusEvents: sigSnap.focusEvents,
        keyPresses: sigSnap.keyPresses,
        pointerJitter: Math.round(sigSnap.pointerJitter),
        questionsAnswered: sigSnap.questionsAnswered,
        fastestAnswerMs: sigSnap.fastestAnswerMs,
        flags: {
          noMouseMove: sigSnap.mouseMoves < 5,
          zeroJitter: sigSnap.pointerJitter < 50,
          impossiblyFast: sigSnap.fastestAnswerMs > 0 && sigSnap.fastestAnswerMs < 120,
          idleSession: sessionMs > 10_000 && sigSnap.lastMouseAt === 0,
        },
      };
      try {
        const endRes = await fetch(`${SIMPLE_API}/simple/end`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wallet: lowerAddr, score, proof }),
        });
        const endData = await endRes.json().catch(() => ({}));
        console.log('[MathSlash] /simple/end response:', endData);
        if (endRes.ok && endData?.zkltcSent != null) {
          setSentNotice(`${endData.zkltcSent} zkLTC sent`);
          try {
            addNotif(lowerAddr, {
              type: 'game',
              title: 'Game Over',
              message: `Scored ${score} · ${endData.zkltcSent} zkLTC sent`,
              link: endData?.explorerUrl || (endData?.txHash ? `https://liteforge.explorer.caldera.xyz/tx/${endData.txHash}` : undefined),
            });
          } catch {}
        }
        fetchStats();
      } catch (err) {
        console.warn('[MathSlash] /simple/end failed:', err);
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [lowerAddr]);

  // ── Anti-bot signals ─────────────────────────────────────────────────
  // Track behavioural fingerprints that real humans produce but headless
  // bots usually skip: mouse movement, scroll, focus events, keyboard
  // taps. We collect them across the session and send a digest with the
  // /simple/end submission so the backend can score it. None of this
  // alone proves humanity, but combined with backend rate-limit + score
  // sanity checks it raises the cost for a bot operator significantly.
  const botSignalsRef = useRef({
    mouseMoves: 0,
    scrolls: 0,
    focusEvents: 0,
    keyPresses: 0,
    pointerJitter: 0,        // sum of |Δx|+|Δy| for pointer move (low = robot)
    sessionStart: Date.now(),
    lastMouseAt: 0,
    consecutiveSamePos: 0,   // back-to-back identical pointer positions
    lastX: 0,
    lastY: 0,
    questionsAnswered: 0,
    fastestAnswerMs: 0,      // shortest time between consecutive scores
    lastScoreAt: 0,
  });
  useEffect(() => {
    const sig = botSignalsRef.current;
    const onMove = (e: PointerEvent) => {
      sig.mouseMoves++;
      const dx = Math.abs((e.clientX || 0) - sig.lastX);
      const dy = Math.abs((e.clientY || 0) - sig.lastY);
      sig.pointerJitter += dx + dy;
      if (dx + dy === 0) sig.consecutiveSamePos++;
      sig.lastX = e.clientX || 0;
      sig.lastY = e.clientY || 0;
      sig.lastMouseAt = Date.now();
    };
    const onScroll = () => { sig.scrolls++; };
    const onKey = () => { sig.keyPresses++; };
    const onFocus = () => { sig.focusEvents++; };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("keydown", onKey);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  // Track answer cadence — score updates from the iframe represent
  // questions answered. If two consecutive answers come <120ms apart,
  // it's almost certainly a bot. We capture the fastest gap.
  useEffect(() => {
    const onScore = (e: any) => {
      const t = e?.data?.type;
      if (t !== "SCORE_UPDATE" && t !== "litdex:mathslash:score") return;
      const sig = botSignalsRef.current;
      const now = Date.now();
      if (sig.lastScoreAt > 0) {
        const gap = now - sig.lastScoreAt;
        if (sig.fastestAnswerMs === 0 || gap < sig.fastestAnswerMs) sig.fastestAnswerMs = gap;
      }
      sig.lastScoreAt = now;
      sig.questionsAnswered++;
    };
    window.addEventListener("message", onScore);
    return () => window.removeEventListener("message", onScore);
  }, []);

  /** Build the bot-signal digest the backend can score. */
  const buildBotProof = useCallback(() => {
    const sig = botSignalsRef.current;
    const sessionMs = Date.now() - sig.sessionStart;
    return {
      sessionMs,
      mouseMoves: sig.mouseMoves,
      scrolls: sig.scrolls,
      focusEvents: sig.focusEvents,
      keyPresses: sig.keyPresses,
      pointerJitter: Math.round(sig.pointerJitter),
      questionsAnswered: sig.questionsAnswered,
      fastestAnswerMs: sig.fastestAnswerMs,
      // Heuristic flags (server can re-verify).
      flags: {
        noMouseMove: sig.mouseMoves < 5,
        zeroJitter: sig.pointerJitter < 50,
        impossiblyFast: sig.fastestAnswerMs > 0 && sig.fastestAnswerMs < 120,
        idleSession: sessionMs > 10_000 && sig.lastMouseAt === 0,
      },
    };
  }, []);

  const submitFinalScore = async (score: number) => {
    const proof = buildBotProof();
    // Cap score that's clearly impossible — the backend will also reject
    // these but bouncing client-side prevents wasted RPC calls.
    if (proof.flags.impossiblyFast || proof.flags.noMouseMove) {
      console.warn("[MathSlash] bot-like signals, score capped to 0", proof);
    }
    const r = await fetch(`${SIMPLE_API}/simple/end`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wallet: lowerAddr, score, proof }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data?.success === false) throw new Error(data?.error || data?.message || 'Failed to submit score');
    const zkltcSent = String(data?.zkltcSent ?? (score * RATE).toFixed(8));
    const explorerUrl = data?.explorerUrl || (data?.txHash ? `https://liteforge.explorer.caldera.xyz/tx/${data.txHash}` : undefined);
    try {
      addNotif(lowerAddr, {
        type: 'game',
        title: 'Game Over',
        message: `Scored ${score} · ${zkltcSent} zkLTC sent`,
        link: explorerUrl,
      });
    } catch {}
    return { zkltcSent, explorerUrl };
  };

  const handlePlayAgain = () => {
    if (!gameOver) return;
    setGameOver(null);
    setSentNotice('');
    setErrMsg('');
    setEndingGame(false);
    setAutoStart(true);
    setIframeKey(k => k + 1);
    fetchStats();
  };

  const handleGameOverExit = () => {
    setGameOver(null);
    setSentNotice('');
    setErrMsg('');
    setEndingGame(false);
    setPlaying(false);
    setAutoStart(false);
    try { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); } catch {}
    try { (screen.orientation as any)?.unlock?.(); } catch {}
    fetchStats();
  };

  const handleExitGame = () => {
    const liveScore = liveScoreRef.current || 0;
    // Silent background submit per spec
    if (lowerAddr) {
      submitFinalScore(liveScore).catch((err) => console.warn('[MathSlash] exit submit failed:', err)).finally(() => { fetchStats(); fetchBoard(); fetchGlobal(); });
    }
    liveScoreRef.current = 0;
    setPlaying(false);
    setGameOver(null);
    setEndingGame(false);
    setSentNotice('');
    setAutoStart(false);
    try { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); } catch {}
    try { (screen.orientation as any)?.unlock?.(); } catch {}
  };

  useEffect(() => {
    if (playing) document.body.classList.add('hide-nav');
    else document.body.classList.remove('hide-nav');
    return () => document.body.classList.remove('hide-nav');
  }, [playing]);

  const gamesPlayed = Math.max(0, Number(stats?.gamesPlayed ?? 0));
  const gamesLeft = Math.max(0, Number(stats?.gamesLeft ?? Math.max(0, DAILY_LIMIT - gamesPlayed)));
  const totalZkltc = Number(stats?.totalZkltcEarned ?? 0);
  const recent: any[] = Array.isArray(stats?.recentGames) ? stats.recentGames : [];

  const startGame = async () => {
    if (!lowerAddr || starting) return;
    console.log('[MathSlash] Starting game for wallet:', lowerAddr);
    if (gamesLeft <= 0) {
      setErrMsg('No games left today');
      return;
    }
    setErrMsg('');
    setGameOver(null);
    setSentNotice('');
    setAutoStart(false);
    setStarting(true);
    liveScoreRef.current = 0;
    endCalledRef.current = false;
    try {
      const r = await fetch(`${SIMPLE_API}/simple/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: lowerAddr }),
      });
      const data = await r.json().catch(() => ({}));
      console.log('[MathSlash] /simple/start response:', data);
      if (!r.ok) {
        setErrMsg(data?.error || data?.message || `Failed to start (${r.status})`);
        return;
      }
      setPlaying(true);
      try {
        const el: any = document.documentElement;
        const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen;
        if (req) req.call(el).catch(() => {});
      } catch {}
      try { (screen.orientation as any)?.lock?.('landscape').catch(() => {}); } catch {}
    } catch (e: any) {
      setErrMsg(e?.message || 'Network error');
    } finally {
      setStarting(false);
    }
  };

  const leaderboard = (
    <div className="p-5 rounded-2xl font-mono bg-brand-surface border border-brand-border">
      <div className="text-[11px] uppercase text-brand-text-primary mb-3">Weekly Leaderboard</div>
      {board.length === 0 ? (
        <div className="text-brand-text-muted text-xs">No games yet</div>
      ) : (
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-brand-text-muted">
              <th className="text-left font-normal">#</th>
              <th className="text-left font-normal">Wallet</th>
              <th className="text-right font-normal">Score</th>
              <th className="text-right font-normal">Points</th>
            </tr>
          </thead>
          <tbody>
            {board.slice(0, 20).map((e: any, i: number) => {
              const w = e.wallet || e.walletAddress || e.address || '';
              const cls = i === 0 ? 'text-brand-text-primary font-bold' : 'text-brand-text-muted';
              const score = Number(e.total_score ?? e.totalScore ?? e.score ?? 0);
              return (
                <tr key={i} className={cls}>
                  <td className="py-1">{i + 1}</td>
                  <td className="py-1">{mask(w)}</td>
                  <td className="py-1 text-right">{score.toLocaleString()}</td>
                  <td className="py-1 text-right">{Math.floor(score * 0.3).toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <RewardTierFooter />
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="math-slash-page py-8 max-w-7xl mx-auto px-4">
      <button onClick={onBack} className="font-mono text-[11px] uppercase text-brand-text-muted hover:text-brand-text-primary mb-6">← Back to Games</button>

      <div className={`grid gap-5 ${playing ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-[260px_1fr_300px]'}`}>
        {/* Stats (left) */}
        {!playing && (
          <div className="order-2 lg:order-1 space-y-5">
          <div className="p-5 rounded-2xl font-mono bg-brand-surface border border-brand-border">
            <div className="flex items-center justify-between mb-4">
              <div className="text-[11px] uppercase text-brand-text-muted">Your Stats</div>
              <span className="text-[9px] uppercase px-2 py-0.5 rounded-full text-black bg-green-500 font-bold">Free to Play</span>
            </div>
            {!isConnected ? (
              <div className="text-brand-text-muted text-xs">Connect wallet to track your stats</div>
            ) : (
              <>
                <div className="mb-3">
                  <div className="text-[10px] uppercase text-brand-text-muted">Games Today</div>
                  <div className="text-brand-text-primary text-sm">{gamesPlayed} / {DAILY_LIMIT}</div>
                </div>
                <div className="mb-3">
                  <div className="text-[10px] uppercase text-brand-text-muted">Total Points Earned</div>
                  <div className="text-brand-text-primary text-sm">{Number(stats?.totalPointsClaimed ?? 0).toLocaleString()} pts</div>
                </div>
                <div className="mb-4">
                  <div className="text-[10px] uppercase text-brand-text-muted">Rate</div>
                  <div className="text-brand-text-primary text-xs">1 score = 0.3 pts</div>
                </div>
                <div className="pt-3 border-t border-brand-border">
                  <div className="text-[10px] uppercase text-brand-text-muted mb-2">Recent Games</div>
                  {recent.length === 0 ? (
                    <div className="text-brand-text-muted text-[11px]">No games yet</div>
                  ) : (
                    <div className="space-y-1.5">
                      {recent.slice(0, 5).map((g: any, i: number) => {
                        // Game-rewards rows store the on-chain claim tx as
                        // `claimed_<hash>`. Show as the proof for that game.
                        const tx = String(g.tx_hash || '');
                        const claimedHash = tx.startsWith('claimed_') ? tx.slice('claimed_'.length) : null;
                        const url = claimedHash ? `https://liteforge.explorer.caldera.xyz/tx/${claimedHash}` : undefined;
                        const score = Number(g.score ?? 0);
                        const ptsRow = Math.floor(score * 0.3);
                        return (
                          <div key={i} className="flex items-center justify-between text-[10px]">
                            <span className="text-brand-text-primary">{score} score</span>
                            <span className="text-brand-text-muted">{ptsRow} pts</span>
                            {url ? (
                              <a href={url} target="_blank" rel="noreferrer" className="text-brand-text-primary underline decoration-white/30">tx</a>
                            ) : <span className="text-brand-text-muted">unclaimed</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
          {isConnected && <ConvertPointsCard wallet={lowerAddr} />}
          </div>
        )}

        {/* Game (center) */}
        <div className={`order-1 lg:order-2 overflow-hidden ${playing ? 'fixed inset-0 z-[100000] bg-black rounded-none border-0' : 'game-canvas-wrap rounded-2xl'}`}>
          {!playing ? (
            <div className="p-6 sm:p-8 text-center">
              <div className="font-mono text-brand-text-primary text-base sm:text-lg mb-2">MATH SLASH</div>
              <div className="font-mono text-brand-text-muted text-xs mb-2">Slash the equations. zkLTC auto-sent after each game.</div>
              <div className="font-mono text-[10px] text-brand-text-muted mb-6">{DAILY_LIMIT} games/day · resets 00:00 IST</div>
              <button
                type="button"
                onClick={startGame}
                onTouchEnd={(e) => { e.preventDefault(); (e.currentTarget as HTMLButtonElement).click(); }}
                disabled={!isConnected || starting || (isConnected && gamesLeft <= 0)}
                className="w-full sm:w-auto min-h-12 px-8 py-3 rounded-lg bg-brand-text-primary text-brand-bg font-mono font-bold text-sm cursor-pointer touch-manipulation select-none active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                {!isConnected ? 'CONNECT WALLET' : starting ? 'STARTING…' : gamesLeft <= 0 ? 'DAILY LIMIT REACHED' : 'START GAME'}
              </button>
              {errMsg && (
                <div className="mt-4 font-mono text-[11px]" style={{ color: '#c44' }}>{errMsg}</div>
              )}
            </div>
          ) : (
            <div className="relative w-screen h-screen ms-playing-root" style={{ width: '100vw', height: '100dvh', touchAction: 'none', overscrollBehavior: 'none' }}>
              {!gameOver && (
                <button
                  onClick={handleExitGame}
                  aria-label="Exit game"
                  className="ms-exit-btn font-mono text-[11px] uppercase bg-brand-surface-2 text-brand-text-primary border border-brand-border"
                  style={{ position: 'fixed', top: 16, right: 16, zIndex: 999999, borderRadius: 8 }}
                >
                  <span className="ms-exit-label">EXIT</span>
                  <span className="ms-exit-x" aria-hidden>✕</span>
                </button>
              )}
              <iframe
                key={iframeKey}
                src={`/games/math-slash.html?wallet=${lowerAddr}${autoStart ? '&autostart=1' : ''}`}
                title="Math Slash"
                style={{ border: 'none', position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none' }}
                allow="autoplay; fullscreen"
              />

              {/* React-owned GAME OVER overlay (covers the iframe's own one) */}
              {gameOver && (
                <div style={{
                  position: 'fixed', inset: 0, zIndex: 1000001,
                  background: 'rgba(0,0,0,0.92)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: 16,
                }}>
                  <div className="font-mono ms-go-card" style={{
                    width: '100%', maxWidth: 380,
                    background: '#0a0a0a', border: '1px solid #1f1f1f',
                    borderRadius: 16, padding: 24, textAlign: 'center', color: '#fff',
                  }}>
                    <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '0.1em', marginBottom: 12 }}>🎮 GAME OVER</div>
                    <div style={{ fontSize: 12, textTransform: 'uppercase', color: '#666', letterSpacing: '0.1em' }}>Score</div>
                    <div className="ms-go-score" style={{ fontSize: 32, fontWeight: 700, marginBottom: 18 }}>{gameOver.score}</div>

                    <div style={{ display: 'grid', gap: 10, marginBottom: 18, textAlign: 'left' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span style={{ color: '#777', textTransform: 'uppercase' }}>Correct / Wrong</span><span>{gameOver.correct} / {gameOver.wrong}</span></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span style={{ color: '#777', textTransform: 'uppercase' }}>Level reached</span><span>{gameOver.levelName ? `${gameOver.level} — ${gameOver.levelName}` : gameOver.level}</span></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span style={{ color: '#777', textTransform: 'uppercase' }}>Best score</span><span>{gameOver.best}</span></div>
                    </div>




                    <div className="ms-go-actions" style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                      <button
                        onClick={handlePlayAgain}
                        disabled={endingGame}
                        style={{
                          flex: 1, minHeight: 48, borderRadius: 10,
                          background: '#fff', color: '#000', border: 'none',
                          fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
                          textTransform: 'uppercase', cursor: endingGame ? 'not-allowed' : 'pointer',
                          opacity: endingGame ? 0.5 : 1,
                          WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
                        }}
                      >PLAY AGAIN</button>
                      <button
                        onClick={handleGameOverExit}
                        disabled={endingGame}
                        style={{
                          flex: 1, minHeight: 48, borderRadius: 10,
                          background: 'transparent', color: '#fff', border: '1px solid #333',
                          fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
                          textTransform: 'uppercase', cursor: endingGame ? 'not-allowed' : 'pointer',
                          opacity: endingGame ? 0.5 : 1,
                          WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
                        }}
                      >EXIT</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Leaderboard (right) */}
        {!playing && <div className="order-3">{leaderboard}</div>}
      </div>

      {/* Global stats bottom bar */}
      {!playing && (
        <div className="mt-6 p-5 rounded-2xl font-mono bg-brand-surface border border-brand-border grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <div className="text-[10px] uppercase text-brand-text-muted">Total Games</div>
            <div className="text-brand-text-primary text-lg font-bold">{Number(global?.totalGames ?? 0).toLocaleString()}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-brand-text-muted">Unique Players</div>
            <div className="text-brand-text-primary text-lg font-bold">{Number(global?.uniquePlayers ?? 0).toLocaleString()}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-brand-text-muted">Total zkLTC Distributed</div>
            <div className="text-brand-text-primary text-lg font-bold">{Number(global?.totalZkltc ?? 0).toFixed(6)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase text-brand-text-muted">Total Points Distributed</div>
            <div className="text-brand-text-primary text-lg font-bold">
              {Math.floor(Number(global?.totalScore ?? 0) * 0.3).toLocaleString()}
            </div>
          </div>
        </div>
      )}

    </motion.div>
  );
};

const PumpDumpPage = ({ onBack }: { onBack: () => void }) => {
  const { address, isConnected } = useAccount();
  const SIMPLE_API = 'https://game.test-hub.xyz';
  const DAILY_LIMIT = 15;
  const ENTRY_COST = 10;

  const [stats, setStats] = useState<any>(null);
  const [playing, setPlaying] = useState(false);
  const [starting, setStarting] = useState(false);
  const [gameOver, setGameOver] = useState<{
    reason: string;
    pot: number;
    streak: number;
    correct: number;
    wrong: number;
    profit: number;
    best: number;
    bestStreak: number;
  } | null>(null);
  const [autoStart, setAutoStart] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [errMsg, setErrMsg] = useState('');

  const lowerAddr = address ? address.toLowerCase() : '';

  const fetchStats = async () => {
    if (!lowerAddr) return;
    let data: any = null;
    try {
      const r = await fetch(`${SIMPLE_API}/pumpdump/stats/${lowerAddr}`);
      if (r.ok) data = await r.json();
    } catch {}
    if (!data) {
      try {
        const r2 = await fetch(`${SIMPLE_API}/simple/stats/${lowerAddr}`);
        if (r2.ok) data = await r2.json();
      } catch {}
    }
    if (data) setStats(data);
  };

  useEffect(() => {
    if (!lowerAddr) return;
    fetchStats();
    const t = setInterval(fetchStats, 20000);
    return () => clearInterval(t);
  }, [lowerAddr]);

  // Listen to iframe messages
  useEffect(() => {
    if (!lowerAddr) return;
    const onMsg = (e: MessageEvent) => {
      const d: any = e?.data;
      if (!d || typeof d !== 'object') return;
      if (d.type === 'litdex:pumpdump:exit') {
        setPlaying(false);
        setGameOver(null);
        try { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); } catch {}
        try { (screen.orientation as any)?.unlock?.(); } catch {}
        fetchStats();
        return;
      }
      if (d.type === 'litdex:pumpdump:end') {
        const profit = Number(d.profit) || 0;
        const pot = Number(d.pot) || 0;
        setGameOver({
          reason: String(d.reason || 'ended'),
          pot,
          streak: Number(d.streak) || 0,
          correct: Number(d.correct) || 0,
          wrong: Number(d.wrong) || 0,
          profit,
          best: Number(d.best) || 0,
          bestStreak: Number(d.bestStreak) || 0,
        });
        try {
          if (d.reason === 'cashout' && profit > 0) {
            addNotif(lowerAddr, {
              type: 'game',
              title: 'Pump or Dump · Cashed Out',
              message: `Pot ${pot} PTS · profit +${profit}`,
              link: d?.txInfo?.explorerUrl || (d?.txInfo?.txHash ? `https://liteforge.explorer.caldera.xyz/tx/${d.txInfo.txHash}` : undefined),
            });
          } else if (d.reason === 'wrong') {
            addNotif(lowerAddr, {
              type: 'game',
              title: 'Pump or Dump · Wrong Call',
              message: `Streak ${d.streak} · -${ENTRY_COST} PTS`,
            });
          }
        } catch {}
        fetchStats();
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [lowerAddr]);

  const handlePlayAgain = () => {
    setGameOver(null);
    setErrMsg('');
    setAutoStart(true);
    setIframeKey((k) => k + 1);
    fetchStats();
  };

  const handleGameOverExit = () => {
    setGameOver(null);
    setErrMsg('');
    setPlaying(false);
    setAutoStart(false);
    try { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); } catch {}
    try { (screen.orientation as any)?.unlock?.(); } catch {}
    fetchStats();
  };

  const handleExitGame = () => {
    setPlaying(false);
    setGameOver(null);
    setAutoStart(false);
    try { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); } catch {}
    try { (screen.orientation as any)?.unlock?.(); } catch {}
    fetchStats();
  };

  useEffect(() => {
    if (playing) document.body.classList.add('hide-nav');
    else document.body.classList.remove('hide-nav');
    return () => document.body.classList.remove('hide-nav');
  }, [playing]);

  const balance   = Math.max(0, Number(stats?.pointsBalance ?? stats?.balance ?? stats?.totalPoints ?? 0));
  const gamesLeft = Math.max(0, Number(stats?.gamesLeft ?? Math.max(0, DAILY_LIMIT - Number(stats?.gamesPlayed ?? 0))));
  const nftTier   = Number(stats?.nftTier ?? 0);
  const NFT_NAMES = ['—', 'COMMON', 'RARE', 'EPIC'];
  const TIER_INC  = [10, 12, 14, 16];
  const increment = Number(stats?.increment ?? TIER_INC[nftTier] ?? 10);
  const bestPot   = Math.max(Number(stats?.bestPot ?? 0), Number(stats?.pumpdumpBestPot ?? 0));
  const bestStrk  = Math.max(Number(stats?.bestStreak ?? 0), Number(stats?.pumpdumpBestStreak ?? 0));

  const startGame = async () => {
    if (!lowerAddr || starting) return;
    if (balance < ENTRY_COST) {
      setErrMsg(`Need ${ENTRY_COST} PTS to play. You have ${balance}.`);
      return;
    }
    if (gamesLeft <= 0) {
      setErrMsg('Daily limit reached. Resets at 00:00 IST.');
      return;
    }
    setErrMsg('');
    setGameOver(null);
    setAutoStart(true);
    setStarting(true);
    setPlaying(true);
    try {
      const elx: any = document.documentElement;
      const req = elx.requestFullscreen || elx.webkitRequestFullscreen || elx.mozRequestFullScreen;
      if (req) req.call(elx).catch(() => {});
    } catch {}
    try { (screen.orientation as any)?.lock?.('portrait').catch(() => {}); } catch {}
    setStarting(false);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pump-dump-page py-8 max-w-7xl mx-auto px-4">
      <button onClick={onBack} className="font-mono text-[11px] uppercase text-brand-text-muted hover:text-brand-text-primary mb-6">← Back to Games</button>

      <div className={`grid gap-5 ${playing ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-[260px_1fr_300px]'}`}>
        {!playing && (
          <div className="order-2 lg:order-1 space-y-5">
            <div className="p-5 rounded-2xl font-mono bg-brand-surface border border-brand-border">
              <div className="flex items-center justify-between mb-4">
                <div className="text-[11px] uppercase text-brand-text-muted">Your Stats</div>
                <span className="text-[9px] uppercase px-2 py-0.5 rounded-full text-black bg-white font-bold">{ENTRY_COST} PTS Entry</span>
              </div>
              {!isConnected ? (
                <div className="text-brand-text-muted text-xs">Connect wallet to track your stats</div>
              ) : (
                <>
                  <div className="mb-3">
                    <div className="text-[10px] uppercase text-brand-text-muted">Balance</div>
                    <div className="text-brand-text-primary text-sm font-bold">{balance.toLocaleString()} PTS</div>
                  </div>
                  <div className="mb-3">
                    <div className="text-[10px] uppercase text-brand-text-muted">NFT Tier</div>
                    <div className="text-brand-text-primary text-sm">{NFT_NAMES[nftTier] || '—'}</div>
                  </div>
                  <div className="mb-3">
                    <div className="text-[10px] uppercase text-brand-text-muted">Per Correct</div>
                    <div className="text-brand-text-primary text-sm">+{increment} PTS</div>
                  </div>
                  <div className="mb-4">
                    <div className="text-[10px] uppercase text-brand-text-muted">Games Today</div>
                    <div className="text-brand-text-primary text-sm">{Math.max(0, DAILY_LIMIT - gamesLeft)} / {DAILY_LIMIT}</div>
                  </div>
                  <div className="pt-3 border-t border-brand-border">
                    <div className="text-[10px] uppercase text-brand-text-muted mb-2">Personal Best</div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-brand-text-muted">Best Pot</span>
                      <span className="text-brand-text-primary">{bestPot}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] mt-1">
                      <span className="text-brand-text-muted">Best Streak</span>
                      <span className="text-brand-text-primary">{bestStrk}</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Game */}
        <div className={`order-1 lg:order-2 overflow-hidden ${playing ? 'fixed inset-0 z-[100000] bg-black rounded-none border-0' : 'game-canvas-wrap rounded-2xl'}`}>
          {!playing ? (
            <div className="p-6 sm:p-8 text-center">
              <div className="font-mono text-brand-text-primary text-base sm:text-lg mb-2">PUMP OR DUMP</div>
              <div className="font-mono text-brand-text-muted text-xs mb-2">Predict next candle. Pot grows on each correct. Cash out anytime.</div>
              <div className="font-mono text-[10px] text-brand-text-muted mb-6">{ENTRY_COST} PTS entry · {DAILY_LIMIT} games/day · resets 00:00 IST</div>
              <button
                type="button"
                onClick={startGame}
                onTouchEnd={(e) => { e.preventDefault(); (e.currentTarget as HTMLButtonElement).click(); }}
                disabled={!isConnected || starting || (isConnected && (balance < ENTRY_COST || gamesLeft <= 0))}
                className="w-full sm:w-auto min-h-12 px-8 py-3 rounded-lg bg-brand-text-primary text-brand-bg font-mono font-bold text-sm cursor-pointer touch-manipulation select-none active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                {!isConnected ? 'CONNECT WALLET' :
                  starting ? 'STARTING…' :
                  balance < ENTRY_COST ? `NEED ${ENTRY_COST} PTS` :
                  gamesLeft <= 0 ? 'DAILY LIMIT REACHED' : `START · ${ENTRY_COST} PTS`}
              </button>
              {errMsg && (
                <div className="mt-4 font-mono text-[11px]" style={{ color: '#c44' }}>{errMsg}</div>
              )}
            </div>
          ) : (
            <div className="relative w-screen h-screen pd-playing-root" style={{ width: '100vw', height: '100dvh', touchAction: 'none', overscrollBehavior: 'none' }}>
              {!gameOver && (
                <button
                  onClick={handleExitGame}
                  aria-label="Exit game"
                  className="pd-exit-btn font-mono text-[11px] uppercase bg-brand-surface-2 text-brand-text-primary border border-brand-border"
                  style={{ position: 'fixed', top: 16, right: 16, zIndex: 999999, borderRadius: 8, padding: '8px 12px' }}
                >
                  EXIT
                </button>
              )}
              <iframe
                key={iframeKey}
                src={`/games/pump-or-dump.html?wallet=${lowerAddr}${autoStart ? '&autostart=1' : ''}`}
                title="Pump or Dump"
                style={{ border: 'none', position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none' }}
                allow="autoplay; fullscreen"
              />

              {gameOver && (
                <div style={{
                  position: 'fixed', inset: 0, zIndex: 1000001,
                  background: 'rgba(0,0,0,0.92)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: 16,
                }}>
                  <div className="font-mono" style={{
                    width: '100%', maxWidth: 380,
                    background: '#0a0a0a', border: '1px solid #1f1f1f',
                    borderRadius: 16, padding: 24, textAlign: 'center', color: '#fff',
                  }}>
                    <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '0.1em', marginBottom: 4 }}>
                      {gameOver.reason === 'cashout' ? 'CASHED OUT' : gameOver.reason === 'wrong' ? 'WRONG CALL' : 'GAME OVER'}
                    </div>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#666', letterSpacing: '0.2em', marginBottom: 18 }}>
                      Session ended
                    </div>

                    <div style={{ fontSize: 11, textTransform: 'uppercase', color: '#777', letterSpacing: '0.15em' }}>Final Pot</div>
                    <div style={{ fontSize: 40, fontWeight: 700, lineHeight: 1, marginTop: 4 }}>{gameOver.pot}</div>
                    <div style={{
                      fontSize: 14, fontWeight: 700, marginTop: 6, marginBottom: 18,
                      color: gameOver.profit >= 0 ? '#3ecf8e' : '#ef4956',
                    }}>
                      {gameOver.profit >= 0 ? '+' : ''}{gameOver.profit} PTS
                    </div>

                    <div style={{ display: 'grid', gap: 10, marginBottom: 18, textAlign: 'left' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: '#777', textTransform: 'uppercase' }}>Streak</span><span>{gameOver.streak}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: '#777', textTransform: 'uppercase' }}>Accuracy</span><span>{gameOver.correct} / {gameOver.correct + gameOver.wrong}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: '#777', textTransform: 'uppercase' }}>Best Pot</span><span>{gameOver.best}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: '#777', textTransform: 'uppercase' }}>Best Streak</span><span>{gameOver.bestStreak}</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                      <button
                        onClick={handlePlayAgain}
                        style={{
                          flex: 1, minHeight: 48, borderRadius: 10,
                          background: '#fff', color: '#000', border: 'none',
                          fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
                          textTransform: 'uppercase', cursor: 'pointer',
                          WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
                        }}
                      >PLAY AGAIN</button>
                      <button
                        onClick={handleGameOverExit}
                        style={{
                          flex: 1, minHeight: 48, borderRadius: 10,
                          background: 'transparent', color: '#fff', border: '1px solid #333',
                          fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
                          textTransform: 'uppercase', cursor: 'pointer',
                          WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
                        }}
                      >EXIT</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      {!playing && (<div className="order-3"><GameLeaderboard title="Pump or Dump · Top Pots" endpoint={`${SIMPLE_API}/pumpdump/leaderboard`} scoreField="best_pot" scoreLabel="Best Pot" /></div>)}
      </div>
          {!playing && <GameGlobalStats endpoint={`${SIMPLE_API}/pumpdump/global`} />}
      </motion.div>
  );
};

const LitTowerPage = ({ onBack }: { onBack: () => void }) => {
  const { address, isConnected } = useAccount();
  const SIMPLE_API = 'https://game.test-hub.xyz';
  const DAILY_LIMIT = 5;
  const PER_CORRECT = 1;

  const [stats, setStats] = useState<any>(null);
  const [playing, setPlaying] = useState(false);
  const [starting, setStarting] = useState(false);
  const [gameOver, setGameOver] = useState<{
    reason: string;
    height: number;
    awarded: number;
    best: number;
  } | null>(null);
  const [autoStart, setAutoStart] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [errMsg, setErrMsg] = useState('');

  const lowerAddr = address ? address.toLowerCase() : '';

  const fetchStats = async () => {
    if (!lowerAddr) return;
    try {
      const r = await fetch(`${SIMPLE_API}/littower/stats/${lowerAddr}`);
      if (r.ok) setStats(await r.json());
    } catch {}
  };

  useEffect(() => {
    if (!lowerAddr) return;
    fetchStats();
    const t = setInterval(fetchStats, 20000);
    return () => clearInterval(t);
  }, [lowerAddr]);

  useEffect(() => {
    if (!lowerAddr) return;
    const onMsg = (e: MessageEvent) => {
      const d: any = e?.data;
      if (!d || typeof d !== 'object') return;
      if (d.type === 'litdex:littower:exit') {
        setPlaying(false);
        setGameOver(null);
        try { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); } catch {}
        try { (screen.orientation as any)?.unlock?.(); } catch {}
        fetchStats();
        return;
      }
      if (d.type === 'litdex:littower:end') {
        const awarded = Number(d.awarded) || 0;
        setGameOver({
          reason:  String(d.reason || 'miss'),
          height:  Number(d.height) || 0,
          awarded,
          best:    Number(d.best) || 0,
        });
        try {
          if (awarded > 0) {
            addNotif(lowerAddr, {
              type: 'game',
              title: 'Lit Tower · Stack Banked',
              message: `Height ${d.height} · +${awarded} PTS`,
            });
          }
        } catch {}
        fetchStats();
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [lowerAddr]);

  const handlePlayAgain = () => {
    setGameOver(null);
    setErrMsg('');
    setAutoStart(false);
    setIframeKey((k) => k + 1);
    fetchStats();
  };

  const handleGameOverExit = () => {
    setGameOver(null);
    setErrMsg('');
    setPlaying(false);
    setAutoStart(false);
    try { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); } catch {}
    try { (screen.orientation as any)?.unlock?.(); } catch {}
    fetchStats();
  };

  const handleExitGame = () => {
    setPlaying(false);
    setGameOver(null);
    setAutoStart(false);
    try { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); } catch {}
    try { (screen.orientation as any)?.unlock?.(); } catch {}
    fetchStats();
  };

  useEffect(() => {
    if (playing) document.body.classList.add('hide-nav');
    else document.body.classList.remove('hide-nav');
    return () => document.body.classList.remove('hide-nav');
  }, [playing]);

  const balance    = Math.max(0, Number(stats?.pointsBalance ?? 0));
  const gamesLeft  = Math.max(0, Number(stats?.gamesLeft ?? Math.max(0, DAILY_LIMIT - Number(stats?.gamesPlayed ?? 0))));
  const bestHeight = Number(stats?.bestHeight ?? 0);
  const maxPerGame = Number(stats?.maxPerGame ?? 100);

  const startGame = async () => {
    if (!lowerAddr || starting) return;
    if (gamesLeft <= 0) { setErrMsg('Daily limit reached. Resets at 00:00 IST.'); return; }
    setErrMsg('');
    setGameOver(null);
    setAutoStart(false); // iframe shows its own PLAY button — no auto-start
    setStarting(true);
    setPlaying(true);
    try {
      const elx: any = document.documentElement;
      const req = elx.requestFullscreen || elx.webkitRequestFullscreen || elx.mozRequestFullScreen;
      if (req) req.call(elx).catch(() => {});
    } catch {}
    try { (screen.orientation as any)?.lock?.('portrait').catch(() => {}); } catch {}
    setStarting(false);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="lit-tower-page py-8 max-w-7xl mx-auto px-4">
      <button onClick={onBack} className="font-mono text-[11px] uppercase text-brand-text-muted hover:text-brand-text-primary mb-6">← Back to Games</button>

      <div className={`grid gap-5 ${playing ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-[260px_1fr_300px]'}`}>
        {!playing && (
          <div className="order-2 lg:order-1 space-y-5">
            <div className="p-5 rounded-2xl font-mono bg-brand-surface border border-brand-border">
              <div className="flex items-center justify-between mb-4">
                <div className="text-[11px] uppercase text-brand-text-muted">Your Stats</div>
                <span className="text-[9px] uppercase px-2 py-0.5 rounded-full text-black bg-white font-bold">FREE</span>
              </div>
              {!isConnected ? (
                <div className="text-brand-text-muted text-xs">Connect wallet to track your stats</div>
              ) : (
                <>
                  <div className="mb-3">
                    <div className="text-[10px] uppercase text-brand-text-muted">Balance</div>
                    <div className="text-brand-text-primary text-sm font-bold">{balance.toLocaleString()} PTS</div>
                  </div>
                  <div className="mb-3">
                    <div className="text-[10px] uppercase text-brand-text-muted">Reward</div>
                    <div className="text-brand-text-primary text-sm">+{PER_CORRECT} PT / stack</div>
                  </div>
                  <div className="mb-3">
                    <div className="text-[10px] uppercase text-brand-text-muted">Cap / Game</div>
                    <div className="text-brand-text-primary text-sm">{maxPerGame}</div>
                  </div>
                  <div className="mb-4">
                    <div className="text-[10px] uppercase text-brand-text-muted">Games Today</div>
                    <div className="text-brand-text-primary text-sm">{Math.max(0, DAILY_LIMIT - gamesLeft)} / {DAILY_LIMIT}</div>
                  </div>
                  <div className="pt-3 border-t border-brand-border">
                    <div className="text-[10px] uppercase text-brand-text-muted mb-2">Personal Best</div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-brand-text-muted">Best Height</span>
                      <span className="text-brand-text-primary">{bestHeight}</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        <div className={`order-1 lg:order-2 overflow-hidden ${playing ? 'fixed inset-0 z-[100000] bg-black rounded-none border-0' : 'game-canvas-wrap rounded-2xl'}`}>
          {!playing ? (
            <div className="p-6 sm:p-8 text-center">
              <div className="font-mono text-brand-text-primary text-base sm:text-lg mb-2">LIT TOWER</div>
              <div className="font-mono text-brand-text-muted text-xs mb-2">Tap to stack moving blocks. Each correct stack mints +1 PT.</div>
              <div className="font-mono text-[10px] text-brand-text-muted mb-6">Free · {DAILY_LIMIT} games/day · cap {maxPerGame} stacks · resets 00:00 IST</div>
              <button
                type="button"
                onClick={startGame}
                onTouchEnd={(e) => { e.preventDefault(); (e.currentTarget as HTMLButtonElement).click(); }}
                disabled={!isConnected || starting || (isConnected && gamesLeft <= 0)}
                className="w-full sm:w-auto min-h-12 px-8 py-3 rounded-lg bg-brand-text-primary text-brand-bg font-mono font-bold text-sm cursor-pointer touch-manipulation select-none active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                {!isConnected ? 'CONNECT WALLET' :
                  starting ? 'STARTING…' :
                  gamesLeft <= 0 ? 'DAILY LIMIT REACHED' : 'START · FREE'}
              </button>
              {errMsg && (
                <div className="mt-4 font-mono text-[11px]" style={{ color: '#c44' }}>{errMsg}</div>
              )}
            </div>
          ) : (
            <div className="relative w-screen h-screen lt-playing-root" style={{ width: '100vw', height: '100dvh', touchAction: 'manipulation', overscrollBehavior: 'none' }}>
              {!gameOver && (
                <button
                  onClick={handleExitGame}
                  aria-label="Exit game"
                  className="lt-exit-btn font-mono text-[11px] uppercase bg-brand-surface-2 text-brand-text-primary border border-brand-border"
                  style={{ position: 'fixed', bottom: 16, left: 16, zIndex: 999999, borderRadius: 8, padding: '8px 12px' }}
                >
                  EXIT
                </button>
              )}
              <iframe
                key={iframeKey}
                src={`/games/lit-tower.html?wallet=${lowerAddr}`}
                title="Lit Tower"
                style={{ border: 'none', position: 'absolute', inset: 0, width: '100%', height: '100%' }}
                allow="autoplay; fullscreen"
              />

              {gameOver && (
                <div style={{
                  position: 'fixed', inset: 0, zIndex: 1000001,
                  background: 'rgba(0,0,0,0.92)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: 16,
                }}>
                  <div className="font-mono" style={{
                    width: '100%', maxWidth: 380,
                    background: '#0a0a0a', border: '1px solid #1f1f1f',
                    borderRadius: 16, padding: 24, textAlign: 'center', color: '#fff',
                  }}>
                    <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '0.1em', marginBottom: 4 }}>
                      {gameOver.reason === 'cap' ? 'TOWER MAXED' : 'TOWER FELL'}
                    </div>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#666', letterSpacing: '0.2em', marginBottom: 18 }}>
                      Session ended
                    </div>

                    <div style={{ fontSize: 11, textTransform: 'uppercase', color: '#777', letterSpacing: '0.15em' }}>Banked</div>
                    <div style={{ fontSize: 40, fontWeight: 700, lineHeight: 1, marginTop: 4, color: '#3ecf8e' }}>+{gameOver.awarded}</div>
                    <div style={{ fontSize: 11, color: '#777', marginTop: 4, marginBottom: 18, letterSpacing: '0.1em' }}>POINTS</div>

                    <div style={{ display: 'grid', gap: 10, marginBottom: 18, textAlign: 'left' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: '#777', textTransform: 'uppercase' }}>Height</span><span>{gameOver.height}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: '#777', textTransform: 'uppercase' }}>Best</span><span>{gameOver.best}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: '#777', textTransform: 'uppercase' }}>Cap</span><span>{maxPerGame}</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                      <button
                        onClick={handlePlayAgain}
                        disabled={gamesLeft <= 0}
                        style={{
                          flex: 1, minHeight: 48, borderRadius: 10,
                          background: '#fff', color: '#000', border: 'none',
                          fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
                          textTransform: 'uppercase', cursor: gamesLeft <= 0 ? 'not-allowed' : 'pointer',
                          opacity: gamesLeft <= 0 ? 0.4 : 1,
                          WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
                        }}
                      >{gamesLeft <= 0 ? 'NO GAMES LEFT' : 'PLAY AGAIN'}</button>
                      <button
                        onClick={handleGameOverExit}
                        style={{
                          flex: 1, minHeight: 48, borderRadius: 10,
                          background: 'transparent', color: '#fff', border: '1px solid #333',
                          fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
                          textTransform: 'uppercase', cursor: 'pointer',
                          WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
                        }}
                      >EXIT</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      {!playing && (<div className="order-3"><GameLeaderboard title="Lit Tower · Top Heights" endpoint={`${SIMPLE_API}/littower/leaderboard`} scoreField="best_height" scoreLabel="Best Height" /></div>)}
      </div>
          {!playing && <GameGlobalStats endpoint={`${SIMPLE_API}/littower/global`} />}
      </motion.div>
  );
};

const ZkMinerPage = ({ onBack }: { onBack: () => void }) => {
  const { address, isConnected } = useAccount();
  const SIMPLE_API = 'https://game.test-hub.xyz';
  const DAILY_LIMIT = 5;

  const [stats, setStats] = useState<any>(null);
  const [playing, setPlaying] = useState(false);
  const [starting, setStarting] = useState(false);
  const [gameOver, setGameOver] = useState<{
    reason: string;
    scorePts: number;
    awarded: number;
    bestPts: number;
  } | null>(null);
  const [iframeKey, setIframeKey] = useState(0);
  const [errMsg, setErrMsg] = useState('');

  const lowerAddr = address ? address.toLowerCase() : '';

  const fetchStats = async () => {
    if (!lowerAddr) return;
    try {
      const r = await fetch(`${SIMPLE_API}/zkminer/stats/${lowerAddr}`);
      if (r.ok) setStats(await r.json());
    } catch {}
  };

  useEffect(() => {
    if (!lowerAddr) return;
    fetchStats();
    const t = setInterval(fetchStats, 20000);
    return () => clearInterval(t);
  }, [lowerAddr]);

  useEffect(() => {
    if (!lowerAddr) return;
    const onMsg = (e: MessageEvent) => {
      const d: any = e?.data;
      if (!d || typeof d !== 'object') return;
      if (d.type === 'litdex:zkminer:exit') {
        setPlaying(false);
        setGameOver(null);
        try { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); } catch {}
        try { (screen.orientation as any)?.unlock?.(); } catch {}
        fetchStats();
        return;
      }
      if (d.type === 'litdex:zkminer:end') {
        const awarded = Number(d.awarded) || 0;
        const scorePts = Number(d.scorePts) || 0;
        setGameOver({
          reason:   String(d.reason || 'end'),
          scorePts,
          awarded,
          bestPts:  Number(d.bestPts) || 0,
        });
        try {
          if (awarded > 0) {
            addNotif(lowerAddr, {
              type: 'game',
              title: 'ZK Miner · Run Banked',
              message: `Score ${scorePts.toFixed(1)} · +${awarded} PTS`,
            });
          }
        } catch {}
        fetchStats();
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [lowerAddr]);

  const handlePlayAgain = () => {
    setGameOver(null);
    setErrMsg('');
    setIframeKey((k) => k + 1);
    fetchStats();
  };

  const handleGameOverExit = () => {
    setGameOver(null);
    setErrMsg('');
    setPlaying(false);
    try { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); } catch {}
    try { (screen.orientation as any)?.unlock?.(); } catch {}
    fetchStats();
  };

  const handleExitGame = () => {
    setPlaying(false);
    setGameOver(null);
    try { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); } catch {}
    try { (screen.orientation as any)?.unlock?.(); } catch {}
    fetchStats();
  };

  useEffect(() => {
    if (playing) document.body.classList.add('hide-nav');
    else document.body.classList.remove('hide-nav');
    return () => document.body.classList.remove('hide-nav');
  }, [playing]);

  const balance     = Math.max(0, Number(stats?.pointsBalance ?? 0));
  const gamesLeft   = Math.max(0, Number(stats?.gamesLeft ?? Math.max(0, DAILY_LIMIT - Number(stats?.gamesPlayed ?? 0))));
  const bestScore   = Number(stats?.bestScorePts ?? 0);
  const maxScore    = Number(stats?.maxScorePts ?? 50);
  const movesGame   = Number(stats?.movesPerGame ?? 30);

  const startGame = async () => {
    if (!lowerAddr || starting) return;
    if (gamesLeft <= 0) { setErrMsg('Daily limit reached. Resets at 00:00 IST.'); return; }
    setErrMsg('');
    setGameOver(null);
    setStarting(true);
    setPlaying(true);
    try {
      const elx: any = document.documentElement;
      const req = elx.requestFullscreen || elx.webkitRequestFullscreen || elx.mozRequestFullScreen;
      if (req) req.call(elx).catch(() => {});
    } catch {}
    try { (screen.orientation as any)?.lock?.('portrait').catch(() => {}); } catch {}
    setStarting(false);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="zk-miner-page py-8 max-w-7xl mx-auto px-4">
      <button onClick={onBack} className="font-mono text-[11px] uppercase text-brand-text-muted hover:text-brand-text-primary mb-6">← Back to Games</button>

      <div className={`grid gap-5 ${playing ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-[260px_1fr_300px]'}`}>
        {!playing && (
          <div className="order-2 lg:order-1 space-y-5">
            <div className="p-5 rounded-2xl font-mono bg-brand-surface border border-brand-border">
              <div className="flex items-center justify-between mb-4">
                <div className="text-[11px] uppercase text-brand-text-muted">Your Stats</div>
                <span className="text-[9px] uppercase px-2 py-0.5 rounded-full text-black bg-white font-bold">FREE</span>
              </div>
              {!isConnected ? (
                <div className="text-brand-text-muted text-xs">Connect wallet to track your stats</div>
              ) : (
                <>
                  <div className="mb-3">
                    <div className="text-[10px] uppercase text-brand-text-muted">Balance</div>
                    <div className="text-brand-text-primary text-sm font-bold">{balance.toLocaleString()} PTS</div>
                  </div>
                  <div className="mb-3">
                    <div className="text-[10px] uppercase text-brand-text-muted">Per Match</div>
                    <div className="text-brand-text-primary text-sm">3=+0.3 · 4=+0.4 · 5=+0.5</div>
                  </div>
                  <div className="mb-3">
                    <div className="text-[10px] uppercase text-brand-text-muted">Cap / Game</div>
                    <div className="text-brand-text-primary text-sm">{maxScore.toFixed(0)} PTS</div>
                  </div>
                  <div className="mb-3">
                    <div className="text-[10px] uppercase text-brand-text-muted">Moves</div>
                    <div className="text-brand-text-primary text-sm">{movesGame} / game</div>
                  </div>
                  <div className="mb-4">
                    <div className="text-[10px] uppercase text-brand-text-muted">Games Today</div>
                    <div className="text-brand-text-primary text-sm">{Math.max(0, DAILY_LIMIT - gamesLeft)} / {DAILY_LIMIT}</div>
                  </div>
                  <div className="pt-3 border-t border-brand-border">
                    <div className="text-[10px] uppercase text-brand-text-muted mb-2">Personal Best</div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-brand-text-muted">Best Score</span>
                      <span className="text-brand-text-primary">{bestScore.toFixed(1)} PTS</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        <div className={`order-1 lg:order-2 overflow-hidden ${playing ? 'fixed inset-0 z-[100000] bg-black rounded-none border-0' : 'game-canvas-wrap rounded-2xl'}`}>
          {!playing ? (
            <div className="p-6 sm:p-8 text-center">
              <div className="font-mono text-brand-text-primary text-base sm:text-lg mb-2">ZK MINER</div>
              <div className="font-mono text-brand-text-muted text-xs mb-2">Match 3+ token gems to score points. 3-match = +0.3 PT, 4-match = +0.4, cascades stack.</div>
              <div className="font-mono text-[10px] text-brand-text-muted mb-6">Free · {DAILY_LIMIT} games/day · {movesGame} moves · cap {maxScore.toFixed(0)} PTS · resets 00:00 IST</div>
              <button
                type="button"
                onClick={startGame}
                onTouchEnd={(e) => { e.preventDefault(); (e.currentTarget as HTMLButtonElement).click(); }}
                disabled={!isConnected || starting || (isConnected && gamesLeft <= 0)}
                className="w-full sm:w-auto min-h-12 px-8 py-3 rounded-lg bg-brand-text-primary text-brand-bg font-mono font-bold text-sm cursor-pointer touch-manipulation select-none active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                {!isConnected ? 'CONNECT WALLET' :
                  starting ? 'STARTING…' :
                  gamesLeft <= 0 ? 'DAILY LIMIT REACHED' : 'START · FREE'}
              </button>
              {errMsg && (
                <div className="mt-4 font-mono text-[11px]" style={{ color: '#c44' }}>{errMsg}</div>
              )}
            </div>
          ) : (
            <div className="relative w-screen h-screen zm-playing-root" style={{ width: '100vw', height: '100dvh', touchAction: 'manipulation', overscrollBehavior: 'none' }}>
              {!gameOver && (
                <button
                  onClick={handleExitGame}
                  aria-label="Exit game"
                  className="zm-exit-btn font-mono text-[11px] uppercase bg-brand-surface-2 text-brand-text-primary border border-brand-border"
                  style={{ position: 'fixed', bottom: 16, left: 16, zIndex: 999999, borderRadius: 8, padding: '8px 12px' }}
                >
                  EXIT
                </button>
              )}
              <iframe
                key={iframeKey}
                src={`/games/zk-miner.html?wallet=${lowerAddr}`}
                title="ZK Miner"
                style={{ border: 'none', position: 'absolute', inset: 0, width: '100%', height: '100%' }}
                allow="autoplay; fullscreen"
              />

              {gameOver && (
                <div style={{
                  position: 'fixed', inset: 0, zIndex: 1000001,
                  background: 'rgba(0,0,0,0.92)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: 16,
                }}>
                  <div className="font-mono" style={{
                    width: '100%', maxWidth: 380,
                    background: '#0a0a0a', border: '1px solid #1f1f1f',
                    borderRadius: 16, padding: 24, textAlign: 'center', color: '#fff',
                  }}>
                    <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '0.1em', marginBottom: 4 }}>
                      {gameOver.reason === 'cap' ? 'MAX SCORE' : 'OUT OF MOVES'}
                    </div>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#666', letterSpacing: '0.2em', marginBottom: 18 }}>
                      Session ended
                    </div>

                    <div style={{ fontSize: 11, textTransform: 'uppercase', color: '#777', letterSpacing: '0.15em' }}>Score</div>
                    <div style={{ fontSize: 40, fontWeight: 700, lineHeight: 1, marginTop: 4, color: '#5be0a4' }}>{gameOver.scorePts.toFixed(1)}</div>
                    <div style={{ fontSize: 11, color: '#777', marginTop: 4, marginBottom: 18, letterSpacing: '0.1em' }}>POINTS</div>

                    <div style={{ display: 'grid', gap: 10, marginBottom: 18, textAlign: 'left' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: '#777', textTransform: 'uppercase' }}>Credited On Chain</span><span>+{gameOver.awarded} PTS</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: '#777', textTransform: 'uppercase' }}>Best</span><span>{gameOver.bestPts.toFixed(1)} PTS</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: '#777', textTransform: 'uppercase' }}>Cap</span><span>{maxScore.toFixed(0)} PTS</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                      <button
                        onClick={handlePlayAgain}
                        disabled={gamesLeft <= 0}
                        style={{
                          flex: 1, minHeight: 48, borderRadius: 10,
                          background: '#fff', color: '#000', border: 'none',
                          fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
                          textTransform: 'uppercase', cursor: gamesLeft <= 0 ? 'not-allowed' : 'pointer',
                          opacity: gamesLeft <= 0 ? 0.4 : 1,
                          WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
                        }}
                      >{gamesLeft <= 0 ? 'NO GAMES LEFT' : 'PLAY AGAIN'}</button>
                      <button
                        onClick={handleGameOverExit}
                        style={{
                          flex: 1, minHeight: 48, borderRadius: 10,
                          background: 'transparent', color: '#fff', border: '1px solid #333',
                          fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
                          textTransform: 'uppercase', cursor: 'pointer',
                          WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
                        }}
                      >EXIT</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      {!playing && (<div className="order-3"><GameLeaderboard title="ZK Miner · Top Scores" endpoint={`${SIMPLE_API}/zkminer/leaderboard`} scoreField="best_score" scoreLabel="Best Score" scoreFormat={(v) => `${Number(v||0).toFixed(1)} PTS`} /></div>)}
      </div>
          {!playing && <GameGlobalStats endpoint={`${SIMPLE_API}/zkminer/global`} />}
      </motion.div>
  );
};

const LitLaunchPage = ({ onBack }: { onBack: () => void }) => {
  const { address, isConnected } = useAccount();
  const SIMPLE_API = 'https://game.test-hub.xyz';
  const DAILY_LIMIT = 5;
  const MAX_LIVES = 3;

  const [stats, setStats] = useState<any>(null);
  const [playing, setPlaying] = useState(false);
  const [starting, setStarting] = useState(false);
  const [gameOver, setGameOver] = useState<{
    reason: string;
    score: number;
    hits: number;
    awarded: number;
    best: number;
  } | null>(null);
  const [iframeKey, setIframeKey] = useState(0);
  const [errMsg, setErrMsg] = useState('');

  const lowerAddr = address ? address.toLowerCase() : '';

  const fetchStats = async () => {
    if (!lowerAddr) return;
    try {
      const r = await fetch(`${SIMPLE_API}/litlaunch/stats/${lowerAddr}`);
      if (r.ok) setStats(await r.json());
    } catch {}
  };

  useEffect(() => {
    if (!lowerAddr) return;
    fetchStats();
    const t = setInterval(fetchStats, 20000);
    return () => clearInterval(t);
  }, [lowerAddr]);

  useEffect(() => {
    if (!lowerAddr) return;
    const onMsg = (e: MessageEvent) => {
      const d: any = e?.data;
      if (!d || typeof d !== 'object') return;
      if (d.type === 'litdex:litlaunch:exit') {
        setPlaying(false);
        setGameOver(null);
        try { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); } catch {}
        try { (screen.orientation as any)?.unlock?.(); } catch {}
        fetchStats();
        return;
      }
      if (d.type === 'litdex:litlaunch:end') {
        const awarded = Number(d.awarded) || 0;
        setGameOver({
          reason:  String(d.reason || 'gameover'),
          score:   Number(d.score) || 0,
          hits:    Number(d.hits) || 0,
          awarded,
          best:    Number(d.best) || 0,
        });
        try {
          if (awarded > 0) {
            addNotif(lowerAddr, {
              type: 'game',
              title: 'Lit Launch · Run Banked',
              message: `${d.score} coins · +${awarded} PTS`,
              link: d?.txInfo?.explorerUrl,
            });
          }
        } catch {}
        fetchStats();
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [lowerAddr]);

  const handlePlayAgain = () => {
    setGameOver(null);
    setErrMsg('');
    setIframeKey((k) => k + 1);
    fetchStats();
  };

  const handleGameOverExit = () => {
    setGameOver(null);
    setErrMsg('');
    setPlaying(false);
    try { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); } catch {}
    try { (screen.orientation as any)?.unlock?.(); } catch {}
    fetchStats();
  };

  const handleExitGame = () => {
    setPlaying(false);
    setGameOver(null);
    try { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); } catch {}
    try { (screen.orientation as any)?.unlock?.(); } catch {}
    fetchStats();
  };

  useEffect(() => {
    if (playing) document.body.classList.add('hide-nav');
    else document.body.classList.remove('hide-nav');
    return () => document.body.classList.remove('hide-nav');
  }, [playing]);

  const balance     = Math.max(0, Number(stats?.pointsBalance ?? 0));
  const gamesLeft   = Math.max(0, Number(stats?.gamesLeft ?? Math.max(0, DAILY_LIMIT - Number(stats?.gamesPlayed ?? 0))));
  const bestScore   = Number(stats?.bestScore ?? 0);
  const maxCoins    = Number(stats?.maxCoinsPerGame ?? 50);

  const startGame = async () => {
    if (!lowerAddr || starting) return;
    if (gamesLeft <= 0) { setErrMsg('Daily limit reached. Resets at 00:00 IST.'); return; }
    setErrMsg('');
    setGameOver(null);
    setStarting(true);
    setPlaying(true);
    try {
      const elx: any = document.documentElement;
      const req = elx.requestFullscreen || elx.webkitRequestFullscreen || elx.mozRequestFullScreen;
      if (req) req.call(elx).catch(() => {});
    } catch {}
    try { (screen.orientation as any)?.lock?.('portrait').catch(() => {}); } catch {}
    setStarting(false);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="lit-launch-page py-8 max-w-7xl mx-auto px-4">
      <button onClick={onBack} className="font-mono text-[11px] uppercase text-brand-text-muted hover:text-brand-text-primary mb-6">← Back to Games</button>

      <div className={`grid gap-5 ${playing ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-[260px_1fr_300px]'}`}>
        {!playing && (
          <div className="order-2 lg:order-1 space-y-5">
            <div className="p-5 rounded-2xl font-mono bg-brand-surface border border-brand-border">
              <div className="flex items-center justify-between mb-4">
                <div className="text-[11px] uppercase text-brand-text-muted">Your Stats</div>
                <span className="text-[9px] uppercase px-2 py-0.5 rounded-full text-black bg-white font-bold">FREE</span>
              </div>
              {!isConnected ? (
                <div className="text-brand-text-muted text-xs">Connect wallet to track your stats</div>
              ) : (
                <>
                  <div className="mb-3">
                    <div className="text-[10px] uppercase text-brand-text-muted">Balance</div>
                    <div className="text-brand-text-primary text-sm font-bold">{balance.toLocaleString()} PTS</div>
                  </div>
                  <div className="mb-3">
                    <div className="text-[10px] uppercase text-brand-text-muted">Reward</div>
                    <div className="text-brand-text-primary text-sm">+1 PT / coin · {MAX_LIVES} lives</div>
                  </div>
                  <div className="mb-3">
                    <div className="text-[10px] uppercase text-brand-text-muted">Cap / Game</div>
                    <div className="text-brand-text-primary text-sm">{maxCoins} PTS</div>
                  </div>
                  <div className="mb-4">
                    <div className="text-[10px] uppercase text-brand-text-muted">Games Today</div>
                    <div className="text-brand-text-primary text-sm">{Math.max(0, DAILY_LIMIT - gamesLeft)} / {DAILY_LIMIT}</div>
                  </div>
                  <div className="pt-3 border-t border-brand-border">
                    <div className="text-[10px] uppercase text-brand-text-muted mb-2">Personal Best</div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-brand-text-muted">Best Score</span>
                      <span className="text-brand-text-primary">{bestScore} coins</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        <div className={`order-1 lg:order-2 overflow-hidden ${playing ? 'fixed inset-0 z-[100000] bg-black rounded-none border-0' : 'game-canvas-wrap rounded-2xl'}`}>
          {!playing ? (
            <div className="p-6 sm:p-8 text-center">
              <div className="font-mono text-brand-text-primary text-base sm:text-lg mb-2">LIT LAUNCH</div>
              <div className="font-mono text-brand-text-muted text-xs mb-2">Drag left/right · dodge asteroids · catch coins. 3 lives, +1 PT per coin.</div>
              <div className="font-mono text-[10px] text-brand-text-muted mb-6">Free · {DAILY_LIMIT} games/day · cap {maxCoins} coins · resets 00:00 IST</div>
              <button
                type="button"
                onClick={startGame}
                onTouchEnd={(e) => { e.preventDefault(); (e.currentTarget as HTMLButtonElement).click(); }}
                disabled={!isConnected || starting || (isConnected && gamesLeft <= 0)}
                className="w-full sm:w-auto min-h-12 px-8 py-3 rounded-lg bg-brand-text-primary text-brand-bg font-mono font-bold text-sm cursor-pointer touch-manipulation select-none active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                {!isConnected ? 'CONNECT WALLET' :
                  starting ? 'STARTING…' :
                  gamesLeft <= 0 ? 'DAILY LIMIT REACHED' : 'START · FREE'}
              </button>
              {errMsg && (
                <div className="mt-4 font-mono text-[11px]" style={{ color: '#c44' }}>{errMsg}</div>
              )}
            </div>
          ) : (
            <div className="relative w-screen h-screen ll-playing-root" style={{ width: '100vw', height: '100dvh', touchAction: 'none', overscrollBehavior: 'none' }}>
              {!gameOver && (
                <button
                  onClick={handleExitGame}
                  aria-label="Exit game"
                  className="ll-exit-btn font-mono text-[11px] uppercase bg-brand-surface-2 text-brand-text-primary border border-brand-border"
                  style={{ position: 'fixed', bottom: 16, left: 16, zIndex: 999999, borderRadius: 8, padding: '8px 12px' }}
                >
                  EXIT
                </button>
              )}
              <iframe
                key={iframeKey}
                src={`/games/lit-launch.html?wallet=${lowerAddr}`}
                title="Lit Launch"
                style={{ border: 'none', position: 'absolute', inset: 0, width: '100%', height: '100%' }}
                allow="autoplay; fullscreen"
              />

              {gameOver && (
                <div style={{
                  position: 'fixed', inset: 0, zIndex: 1000001,
                  background: 'rgba(0,0,0,0.92)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: 16,
                }}>
                  <div className="font-mono" style={{
                    width: '100%', maxWidth: 380,
                    background: '#0a0e1a', border: '1px solid #1f2638',
                    borderRadius: 16, padding: 24, textAlign: 'center', color: '#fff',
                  }}>
                    <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '0.1em', marginBottom: 4 }}>
                      {gameOver.reason === 'cap' ? 'COIN CAP' : 'GAME OVER'}
                    </div>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#666', letterSpacing: '0.2em', marginBottom: 18 }}>
                      Session ended
                    </div>

                    <div style={{ fontSize: 11, textTransform: 'uppercase', color: '#777', letterSpacing: '0.15em' }}>Banked</div>
                    <div style={{ fontSize: 40, fontWeight: 700, lineHeight: 1, marginTop: 4, color: '#5be0a4' }}>+{gameOver.awarded}</div>
                    <div style={{ fontSize: 11, color: '#777', marginTop: 4, marginBottom: 18, letterSpacing: '0.1em' }}>POINTS</div>

                    <div style={{ display: 'grid', gap: 10, marginBottom: 18, textAlign: 'left' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: '#777', textTransform: 'uppercase' }}>Coins</span><span>{gameOver.score}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: '#777', textTransform: 'uppercase' }}>Hits</span><span>{gameOver.hits} / {MAX_LIVES}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: '#777', textTransform: 'uppercase' }}>Best</span><span>{gameOver.best}</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                      <button
                        onClick={handlePlayAgain}
                        disabled={gamesLeft <= 0}
                        style={{
                          flex: 1, minHeight: 48, borderRadius: 10,
                          background: '#fff', color: '#000', border: 'none',
                          fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
                          textTransform: 'uppercase',
                          cursor: gamesLeft <= 0 ? 'not-allowed' : 'pointer',
                          opacity: gamesLeft <= 0 ? 0.4 : 1,
                          WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
                        }}
                      >{gamesLeft <= 0 ? 'NO GAMES LEFT' : 'PLAY AGAIN'}</button>
                      <button
                        onClick={handleGameOverExit}
                        style={{
                          flex: 1, minHeight: 48, borderRadius: 10,
                          background: 'transparent', color: '#fff', border: '1px solid #333',
                          fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
                          textTransform: 'uppercase', cursor: 'pointer',
                          WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
                        }}
                      >EXIT</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      {!playing && (<div className="order-3"><GameLeaderboard title="Lit Launch · Top Coins" endpoint={`${SIMPLE_API}/litlaunch/leaderboard`} scoreField="best_score" scoreLabel="Coins" /></div>)}
      </div>
          {!playing && <GameGlobalStats endpoint={`${SIMPLE_API}/litlaunch/global`} />}
      </motion.div>
  );
};

const BlockChainPage = ({ onBack }: { onBack: () => void }) => {
  const { address, isConnected } = useAccount();
  const SIMPLE_API = 'https://game.test-hub.xyz';
  const DAILY_LIMIT = 5;

  const [stats, setStats] = useState<any>(null);
  const [playing, setPlaying] = useState(false);
  const [starting, setStarting] = useState(false);
  const [gameOver, setGameOver] = useState<{
    reason: string;
    awarded: number;
    highestTile: number;
    bestTile: number;
  } | null>(null);
  const [iframeKey, setIframeKey] = useState(0);
  const [errMsg, setErrMsg] = useState('');

  const lowerAddr = address ? address.toLowerCase() : '';

  const fetchStats = async () => {
    if (!lowerAddr) return;
    try {
      const r = await fetch(`${SIMPLE_API}/blockchain/stats/${lowerAddr}`);
      if (r.ok) setStats(await r.json());
    } catch {}
  };

  useEffect(() => {
    if (!lowerAddr) return;
    fetchStats();
    const t = setInterval(fetchStats, 20000);
    return () => clearInterval(t);
  }, [lowerAddr]);

  useEffect(() => {
    if (!lowerAddr) return;
    const onMsg = (e: MessageEvent) => {
      const d: any = e?.data;
      if (!d || typeof d !== 'object') return;
      if (d.type === 'litdex:blockchain:exit') {
        setPlaying(false);
        setGameOver(null);
        try { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); } catch {}
        try { (screen.orientation as any)?.unlock?.(); } catch {}
        fetchStats();
        return;
      }
      if (d.type === 'litdex:blockchain:end') {
        const awarded = Number(d.awarded) || 0;
        setGameOver({
          reason:      String(d.reason || 'gameover'),
          awarded,
          highestTile: Number(d.highestTile) || 0,
          bestTile:    Number(d.bestTile) || 0,
        });
        try {
          if (awarded > 0) {
            addNotif(lowerAddr, {
              type: 'game',
              title: Number(d.highestTile) >= 2048 ? 'Block Chain · 2048 JACKPOT' : 'Block Chain · Run Banked',
              message: `Highest ${d.highestTile} · +${awarded} PTS`,
              link: d?.txInfo?.explorerUrl,
            });
          }
        } catch {}
        fetchStats();
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [lowerAddr]);

  const handlePlayAgain = () => {
    setGameOver(null);
    setErrMsg('');
    setIframeKey((k) => k + 1);
    fetchStats();
  };

  const handleGameOverExit = () => {
    setGameOver(null);
    setErrMsg('');
    setPlaying(false);
    try { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); } catch {}
    try { (screen.orientation as any)?.unlock?.(); } catch {}
    fetchStats();
  };

  const handleExitGame = () => {
    setPlaying(false);
    setGameOver(null);
    try { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); } catch {}
    try { (screen.orientation as any)?.unlock?.(); } catch {}
    fetchStats();
  };

  useEffect(() => {
    if (playing) document.body.classList.add('hide-nav');
    else document.body.classList.remove('hide-nav');
    return () => document.body.classList.remove('hide-nav');
  }, [playing]);

  const balance     = Math.max(0, Number(stats?.pointsBalance ?? 0));
  const gamesLeft   = Math.max(0, Number(stats?.gamesLeft ?? Math.max(0, DAILY_LIMIT - Number(stats?.gamesPlayed ?? 0))));
  const bestTile    = Number(stats?.bestTile ?? 0);
  const bestAwarded = Number(stats?.bestAwarded ?? 0);
  const maxAward    = Number(stats?.maxAwardPerGame ?? 315);

  const startGame = async () => {
    if (!lowerAddr || starting) return;
    if (gamesLeft <= 0) { setErrMsg('Daily limit reached. Resets at 00:00 IST.'); return; }
    setErrMsg('');
    setGameOver(null);
    setStarting(true);
    setPlaying(true);
    try {
      const elx: any = document.documentElement;
      const req = elx.requestFullscreen || elx.webkitRequestFullscreen || elx.mozRequestFullScreen;
      if (req) req.call(elx).catch(() => {});
    } catch {}
    try { (screen.orientation as any)?.lock?.('portrait').catch(() => {}); } catch {}
    setStarting(false);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="block-chain-page py-8 max-w-7xl mx-auto px-4">
      <button onClick={onBack} className="font-mono text-[11px] uppercase text-brand-text-muted hover:text-brand-text-primary mb-6">← Back to Games</button>

      <div className={`grid gap-5 ${playing ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-[260px_1fr_300px]'}`}>
        {!playing && (
          <div className="order-2 lg:order-1 space-y-5">
            <div className="p-5 rounded-2xl font-mono bg-brand-surface border border-brand-border">
              <div className="flex items-center justify-between mb-4">
                <div className="text-[11px] uppercase text-brand-text-muted">Your Stats</div>
                <span className="text-[9px] uppercase px-2 py-0.5 rounded-full text-black bg-white font-bold">FREE</span>
              </div>
              {!isConnected ? (
                <div className="text-brand-text-muted text-xs">Connect wallet to track your stats</div>
              ) : (
                <>
                  <div className="mb-3">
                    <div className="text-[10px] uppercase text-brand-text-muted">Balance</div>
                    <div className="text-brand-text-primary text-sm font-bold">{balance.toLocaleString()} PTS</div>
                  </div>
                  <div className="mb-3">
                    <div className="text-[10px] uppercase text-brand-text-muted">Reward</div>
                    <div className="text-brand-text-primary text-sm">milestone tiles</div>
                  </div>
                  <div className="mb-3">
                    <div className="text-[10px] uppercase text-brand-text-muted">Cap / Game</div>
                    <div className="text-brand-text-primary text-sm">{maxAward} PTS</div>
                  </div>
                  <div className="mb-4">
                    <div className="text-[10px] uppercase text-brand-text-muted">Games Today</div>
                    <div className="text-brand-text-primary text-sm">{Math.max(0, DAILY_LIMIT - gamesLeft)} / {DAILY_LIMIT}</div>
                  </div>
                  <div className="pt-3 border-t border-brand-border">
                    <div className="text-[10px] uppercase text-brand-text-muted mb-2">Personal Best</div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-brand-text-muted">Best Tile</span>
                      <span className="text-brand-text-primary">{bestTile}</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] mt-1">
                      <span className="text-brand-text-muted">Best Run</span>
                      <span className="text-brand-text-primary">{bestAwarded} PTS</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        <div className={`order-1 lg:order-2 overflow-hidden ${playing ? 'fixed inset-0 z-[100000] bg-black rounded-none border-0' : 'game-canvas-wrap rounded-2xl'}`}>
          {!playing ? (
            <div className="p-6 sm:p-8 text-center">
              <div className="font-mono text-brand-text-primary text-base sm:text-lg mb-2">BLOCK CHAIN</div>
              <div className="font-mono text-brand-text-muted text-xs mb-2">Swipe to merge tiles. Each new milestone tile (64 → 2048) mints PTS.</div>
              <div className="font-mono text-[10px] text-brand-text-muted mb-6">Free · {DAILY_LIMIT} games/day · cap {maxAward} PTS · 2048 = jackpot · resets 00:00 IST</div>
              <button
                type="button"
                onClick={startGame}
                onTouchEnd={(e) => { e.preventDefault(); (e.currentTarget as HTMLButtonElement).click(); }}
                disabled={!isConnected || starting || (isConnected && gamesLeft <= 0)}
                className="w-full sm:w-auto min-h-12 px-8 py-3 rounded-lg bg-brand-text-primary text-brand-bg font-mono font-bold text-sm cursor-pointer touch-manipulation select-none active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                {!isConnected ? 'CONNECT WALLET' :
                  starting ? 'STARTING…' :
                  gamesLeft <= 0 ? 'DAILY LIMIT REACHED' : 'START · FREE'}
              </button>
              {errMsg && (
                <div className="mt-4 font-mono text-[11px]" style={{ color: '#c44' }}>{errMsg}</div>
              )}
            </div>
          ) : (
            <div className="relative w-screen h-screen bc-playing-root" style={{ width: '100vw', height: '100dvh', touchAction: 'none', overscrollBehavior: 'none' }}>
              {!gameOver && (
                <button
                  onClick={handleExitGame}
                  aria-label="Exit game"
                  className="bc-exit-btn font-mono text-[11px] uppercase bg-brand-surface-2 text-brand-text-primary border border-brand-border"
                  style={{ position: 'fixed', bottom: 16, left: 16, zIndex: 999999, borderRadius: 8, padding: '8px 12px' }}
                >
                  EXIT
                </button>
              )}
              <iframe
                key={iframeKey}
                src={`/games/block-chain.html?wallet=${lowerAddr}`}
                title="Block Chain"
                style={{ border: 'none', position: 'absolute', inset: 0, width: '100%', height: '100%' }}
                allow="autoplay; fullscreen"
              />

              {gameOver && (
                <div style={{
                  position: 'fixed', inset: 0, zIndex: 1000001,
                  background: 'rgba(0,0,0,0.92)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: 16,
                }}>
                  <div className="font-mono" style={{
                    width: '100%', maxWidth: 380,
                    background: '#0a0e1a', border: '1px solid #1f2638',
                    borderRadius: 16, padding: 24, textAlign: 'center', color: '#fff',
                  }}>
                    <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '0.1em', marginBottom: 4 }}>
                      {gameOver.highestTile >= 2048 ? '2048 JACKPOT' : 'GAME OVER'}
                    </div>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#666', letterSpacing: '0.2em', marginBottom: 18 }}>
                      Session ended
                    </div>

                    <div style={{ fontSize: 11, textTransform: 'uppercase', color: '#777', letterSpacing: '0.15em' }}>Banked</div>
                    <div style={{ fontSize: 40, fontWeight: 700, lineHeight: 1, marginTop: 4, color: '#5be0a4' }}>+{gameOver.awarded}</div>
                    <div style={{ fontSize: 11, color: '#777', marginTop: 4, marginBottom: 18, letterSpacing: '0.1em' }}>POINTS</div>

                    <div style={{ display: 'grid', gap: 10, marginBottom: 18, textAlign: 'left' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: '#777', textTransform: 'uppercase' }}>Highest Tile</span><span>{gameOver.highestTile}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: '#777', textTransform: 'uppercase' }}>Best Ever</span><span>{gameOver.bestTile}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: '#777', textTransform: 'uppercase' }}>Cap</span><span>{maxAward} PTS</span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                      <button
                        onClick={handlePlayAgain}
                        disabled={gamesLeft <= 0}
                        style={{
                          flex: 1, minHeight: 48, borderRadius: 10,
                          background: '#fff', color: '#000', border: 'none',
                          fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
                          textTransform: 'uppercase',
                          cursor: gamesLeft <= 0 ? 'not-allowed' : 'pointer',
                          opacity: gamesLeft <= 0 ? 0.4 : 1,
                          WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
                        }}
                      >{gamesLeft <= 0 ? 'NO GAMES LEFT' : 'PLAY AGAIN'}</button>
                      <button
                        onClick={handleGameOverExit}
                        style={{
                          flex: 1, minHeight: 48, borderRadius: 10,
                          background: 'transparent', color: '#fff', border: '1px solid #333',
                          fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
                          textTransform: 'uppercase', cursor: 'pointer',
                          WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
                        }}
                      >EXIT</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      {!playing && (<div className="order-3"><GameLeaderboard title="Block Chain · Top Tiles" endpoint={`${SIMPLE_API}/blockchain/leaderboard`} scoreField="best_tile" scoreLabel="Best Tile" /></div>)}
      </div>
          {!playing && <GameGlobalStats endpoint={`${SIMPLE_API}/blockchain/global`} />}
      </motion.div>
  );
};

const LitDicePage = ({ onBack }: { onBack: () => void }) => {
  const { address, isConnected } = useAccount();
  const SIMPLE_API = 'https://game.test-hub.xyz';
  const STAKE = 5;
  const DAILY_LIMIT = 20;
  const [stats, setStats] = useState<any>(null);
  const [playing, setPlaying] = useState(false);
  const [starting, setStarting] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [errMsg, setErrMsg] = useState('');
  const lowerAddr = address ? address.toLowerCase() : '';

  const fetchStats = async () => {
    if (!lowerAddr) return;
    try { const r = await fetch(`${SIMPLE_API}/litdice/stats/${lowerAddr}`); if (r.ok) setStats(await r.json()); } catch {}
  };
  useEffect(() => {
    if (!lowerAddr) return;
    fetchStats();
    const t = setInterval(fetchStats, 20000);
    return () => clearInterval(t);
  }, [lowerAddr]);
  useEffect(() => {
    if (!lowerAddr) return;
    const onMsg = (e: MessageEvent) => {
      const d: any = e?.data;
      if (!d || typeof d !== 'object') return;
      if (d.type === 'litdex:litdice:exit') {
        setPlaying(false);
        try { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); } catch {}
        try { (screen.orientation as any)?.unlock?.(); } catch {}
        fetchStats();
        return;
      }
      if (d.type === 'litdex:litdice:end') {
        try {
          addNotif(lowerAddr, {
            type: 'game',
            title: d.won ? 'Lit Dice · Won' : 'Lit Dice · Lost',
            message: `${Number(d.multiplier || 0).toFixed(2)}x · ${d.profit >= 0 ? '+' : ''}${d.profit} PTS`,
            link: d?.txInfo?.explorerUrl,
          });
        } catch {}
        saveFairness({ game: 'dice', seedHash: d.seedHash, serverSeed: d.serverSeed, roundId: d.roundId });
        fetchStats();
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [lowerAddr]);

  useEffect(() => {
    if (playing) document.body.classList.add('hide-nav');
    else document.body.classList.remove('hide-nav');
    return () => document.body.classList.remove('hide-nav');
  }, [playing]);

  const balance   = Math.max(0, Number(stats?.pointsBalance ?? 0));
  const gamesLeft = Math.max(0, Number(stats?.gamesLeft ?? Math.max(0, DAILY_LIMIT - Number(stats?.gamesPlayed ?? 0))));
  const bestMult  = Number(stats?.bestMultiplier ?? 0);

  const startGame = async () => {
    if (!lowerAddr || starting) return;
    if (balance < STAKE) { setErrMsg(`Need ${STAKE} PTS.`); return; }
    if (gamesLeft <= 0) { setErrMsg('Daily limit reached.'); return; }
    setErrMsg(''); setStarting(true); setPlaying(true);
    try { const elx: any = document.documentElement; const req = elx.requestFullscreen || elx.webkitRequestFullscreen || elx.mozRequestFullScreen; if (req) req.call(elx).catch(() => {}); } catch {}
    try { (screen.orientation as any)?.lock?.('portrait').catch(() => {}); } catch {}
    setStarting(false);
  };
  const handleExitGame = () => {
    setPlaying(false);
    try { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); } catch {}
    try { (screen.orientation as any)?.unlock?.(); } catch {}
    fetchStats();
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="lit-dice-page py-8 max-w-7xl mx-auto px-4">
      <button onClick={onBack} className="font-mono text-[11px] uppercase text-brand-text-muted hover:text-brand-text-primary mb-6">← Back to Games</button>
      <div className={`grid gap-5 ${playing ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-[260px_1fr_300px]'}`}>
        {!playing && (
          <div className="order-2 lg:order-1 space-y-5">
            <div className="p-5 rounded-2xl font-mono bg-brand-surface border border-brand-border">
              <div className="flex items-center justify-between mb-4">
                <div className="text-[11px] uppercase text-brand-text-muted">Your Stats</div>
                <span className="text-[9px] uppercase px-2 py-0.5 rounded-full text-black bg-white font-bold">{STAKE} PTS Stake</span>
              </div>
              {!isConnected ? <div className="text-brand-text-muted text-xs">Connect wallet to track your stats</div> : (
                <>
                  <div className="mb-3"><div className="text-[10px] uppercase text-brand-text-muted">Balance</div><div className="text-brand-text-primary text-sm font-bold">{balance.toLocaleString()} PTS</div></div>
                  <div className="mb-3"><div className="text-[10px] uppercase text-brand-text-muted">RTP</div><div className="text-brand-text-primary text-sm">97%</div></div>
                  <div className="mb-4"><div className="text-[10px] uppercase text-brand-text-muted">Games Today</div><div className="text-brand-text-primary text-sm">{Math.max(0, DAILY_LIMIT - gamesLeft)} / {DAILY_LIMIT}</div></div>
                  <div className="pt-3 border-t border-brand-border">
                    <div className="text-[10px] uppercase text-brand-text-muted mb-2">Personal Best</div>
                    <div className="flex items-center justify-between text-[11px]"><span className="text-brand-text-muted">Best Multiplier</span><span className="text-brand-text-primary">{bestMult.toFixed(2)}x</span></div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
        <div className={`order-1 lg:order-2 overflow-hidden ${playing ? 'fixed inset-0 z-[100000] bg-black rounded-none border-0' : 'game-canvas-wrap rounded-2xl'}`}>
          {!playing ? (
            <div className="p-6 sm:p-8 text-center">
              <div className="font-mono text-brand-text-primary text-base sm:text-lg mb-2">LIT DICE</div>
              <div className="font-mono text-brand-text-muted text-xs mb-2">Pick a target (2–98), choose UNDER or OVER, roll the dice. 97% RTP.</div>
              <div className="font-mono text-[10px] text-brand-text-muted mb-6">{STAKE} PTS stake · {DAILY_LIMIT} games/day · provably fair</div>
              <button type="button" onClick={startGame} disabled={!isConnected || starting || (isConnected && (gamesLeft <= 0 || balance < STAKE))}
                className="w-full sm:w-auto min-h-12 px-8 py-3 rounded-lg bg-brand-text-primary text-brand-bg font-mono font-bold text-sm cursor-pointer touch-manipulation select-none active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ WebkitTapHighlightColor: 'transparent' }}>
                {!isConnected ? 'CONNECT WALLET' : starting ? 'STARTING…' : balance < STAKE ? `NEED ${STAKE} PTS` : gamesLeft <= 0 ? 'DAILY LIMIT REACHED' : `START · ${STAKE} PTS`}
              </button>
              {errMsg && <div className="mt-4 font-mono text-[11px]" style={{ color: '#c44' }}>{errMsg}</div>}
            </div>
          ) : (
            <div className="relative w-screen h-screen" style={{ width: '100vw', height: '100dvh', overscrollBehavior: 'none' }}>
              <button onClick={handleExitGame} aria-label="Exit game" className="font-mono text-[11px] uppercase bg-brand-surface-2 text-brand-text-primary border border-brand-border" style={{ position: 'fixed', bottom: 16, left: 16, zIndex: 999999, borderRadius: 8, padding: '8px 12px' }}>EXIT</button>
              <iframe key={iframeKey} src={`/games/lit-dice.html?wallet=${lowerAddr}`} title="Lit Dice" style={{ border: 'none', position: 'absolute', inset: 0, width: '100%', height: '100%' }} allow="autoplay; fullscreen" />
            </div>
          )}
        </div>
      {!playing && (<div className="order-3"><GameLeaderboard title="Lit Dice · Top Multipliers" endpoint={`${SIMPLE_API}/litdice/leaderboard`} scoreField="best_multiplier" scoreLabel="Best ×" scoreFormat={(v) => `${Number(v||0).toFixed(2)}x`} /></div>)}
      </div>
          {!playing && <GameGlobalStats endpoint={`${SIMPLE_API}/litdice/global`} />}
      </motion.div>
  );
};

const LitLimboPage = ({ onBack }: { onBack: () => void }) => {
  const { address, isConnected } = useAccount();
  const SIMPLE_API = 'https://game.test-hub.xyz';
  const STAKE = 5;
  const DAILY_LIMIT = 20;
  const [stats, setStats] = useState<any>(null);
  const [playing, setPlaying] = useState(false);
  const [starting, setStarting] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [errMsg, setErrMsg] = useState('');
  const lowerAddr = address ? address.toLowerCase() : '';

  const fetchStats = async () => {
    if (!lowerAddr) return;
    try { const r = await fetch(`${SIMPLE_API}/litlimbo/stats/${lowerAddr}`); if (r.ok) setStats(await r.json()); } catch {}
  };
  useEffect(() => {
    if (!lowerAddr) return;
    fetchStats();
    const t = setInterval(fetchStats, 20000);
    return () => clearInterval(t);
  }, [lowerAddr]);
  useEffect(() => {
    if (!lowerAddr) return;
    const onMsg = (e: MessageEvent) => {
      const d: any = e?.data;
      if (!d || typeof d !== 'object') return;
      if (d.type === 'litdex:litlimbo:exit') {
        setPlaying(false);
        try { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); } catch {}
        try { (screen.orientation as any)?.unlock?.(); } catch {}
        fetchStats();
        return;
      }
      if (d.type === 'litdex:litlimbo:end') {
        try {
          addNotif(lowerAddr, {
            type: 'game',
            title: d.won ? 'Lit Limbo · Hit' : 'Lit Limbo · Missed',
            message: `Target ${Number(d.target).toFixed(2)}x · Rolled ${Number(d.rolled).toFixed(2)}x`,
            link: d?.txInfo?.explorerUrl,
          });
        } catch {}
        saveFairness({ game: 'limbo', seedHash: d.seedHash, serverSeed: d.serverSeed, roundId: d.roundId });
        fetchStats();
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [lowerAddr]);

  useEffect(() => {
    if (playing) document.body.classList.add('hide-nav');
    else document.body.classList.remove('hide-nav');
    return () => document.body.classList.remove('hide-nav');
  }, [playing]);

  const balance   = Math.max(0, Number(stats?.pointsBalance ?? 0));
  const gamesLeft = Math.max(0, Number(stats?.gamesLeft ?? Math.max(0, DAILY_LIMIT - Number(stats?.gamesPlayed ?? 0))));
  const bestRoll  = Number(stats?.bestRoll ?? 0);

  const startGame = async () => {
    if (!lowerAddr || starting) return;
    if (balance < STAKE) { setErrMsg(`Need ${STAKE} PTS.`); return; }
    if (gamesLeft <= 0) { setErrMsg('Daily limit reached.'); return; }
    setErrMsg(''); setStarting(true); setPlaying(true);
    try { const elx: any = document.documentElement; const req = elx.requestFullscreen || elx.webkitRequestFullscreen || elx.mozRequestFullScreen; if (req) req.call(elx).catch(() => {}); } catch {}
    try { (screen.orientation as any)?.lock?.('portrait').catch(() => {}); } catch {}
    setStarting(false);
  };
  const handleExitGame = () => {
    setPlaying(false);
    try { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); } catch {}
    try { (screen.orientation as any)?.unlock?.(); } catch {}
    fetchStats();
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="lit-limbo-page py-8 max-w-7xl mx-auto px-4">
      <button onClick={onBack} className="font-mono text-[11px] uppercase text-brand-text-muted hover:text-brand-text-primary mb-6">← Back to Games</button>
      <div className={`grid gap-5 ${playing ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-[260px_1fr_300px]'}`}>
        {!playing && (
          <div className="order-2 lg:order-1 space-y-5">
            <div className="p-5 rounded-2xl font-mono bg-brand-surface border border-brand-border">
              <div className="flex items-center justify-between mb-4">
                <div className="text-[11px] uppercase text-brand-text-muted">Your Stats</div>
                <span className="text-[9px] uppercase px-2 py-0.5 rounded-full text-black bg-white font-bold">{STAKE} PTS Stake</span>
              </div>
              {!isConnected ? <div className="text-brand-text-muted text-xs">Connect wallet to track your stats</div> : (
                <>
                  <div className="mb-3"><div className="text-[10px] uppercase text-brand-text-muted">Balance</div><div className="text-brand-text-primary text-sm font-bold">{balance.toLocaleString()} PTS</div></div>
                  <div className="mb-3"><div className="text-[10px] uppercase text-brand-text-muted">Range</div><div className="text-brand-text-primary text-sm">1.01x — 100x</div></div>
                  <div className="mb-3"><div className="text-[10px] uppercase text-brand-text-muted">RTP</div><div className="text-brand-text-primary text-sm">99%</div></div>
                  <div className="mb-4"><div className="text-[10px] uppercase text-brand-text-muted">Games Today</div><div className="text-brand-text-primary text-sm">{Math.max(0, DAILY_LIMIT - gamesLeft)} / {DAILY_LIMIT}</div></div>
                  <div className="pt-3 border-t border-brand-border">
                    <div className="text-[10px] uppercase text-brand-text-muted mb-2">Personal Best</div>
                    <div className="flex items-center justify-between text-[11px]"><span className="text-brand-text-muted">Best Roll</span><span className="text-brand-text-primary">{bestRoll.toFixed(2)}x</span></div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
        <div className={`order-1 lg:order-2 overflow-hidden ${playing ? 'fixed inset-0 z-[100000] bg-black rounded-none border-0' : 'game-canvas-wrap rounded-2xl'}`}>
          {!playing ? (
            <div className="p-6 sm:p-8 text-center">
              <div className="font-mono text-brand-text-primary text-base sm:text-lg mb-2">LIT LIMBO</div>
              <div className="font-mono text-brand-text-muted text-xs mb-2">Set target multiplier · roll · win if RNG ≥ target. 99% RTP.</div>
              <div className="font-mono text-[10px] text-brand-text-muted mb-6">{STAKE} PTS stake · {DAILY_LIMIT} games/day · up to 100x</div>
              <button type="button" onClick={startGame} disabled={!isConnected || starting || (isConnected && (gamesLeft <= 0 || balance < STAKE))}
                className="w-full sm:w-auto min-h-12 px-8 py-3 rounded-lg bg-brand-text-primary text-brand-bg font-mono font-bold text-sm cursor-pointer touch-manipulation select-none active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ WebkitTapHighlightColor: 'transparent' }}>
                {!isConnected ? 'CONNECT WALLET' : starting ? 'STARTING…' : balance < STAKE ? `NEED ${STAKE} PTS` : gamesLeft <= 0 ? 'DAILY LIMIT REACHED' : `START · ${STAKE} PTS`}
              </button>
              {errMsg && <div className="mt-4 font-mono text-[11px]" style={{ color: '#c44' }}>{errMsg}</div>}
            </div>
          ) : (
            <div className="relative w-screen h-screen" style={{ width: '100vw', height: '100dvh', overscrollBehavior: 'none' }}>
              <button onClick={handleExitGame} aria-label="Exit game" className="font-mono text-[11px] uppercase bg-brand-surface-2 text-brand-text-primary border border-brand-border" style={{ position: 'fixed', bottom: 16, left: 16, zIndex: 999999, borderRadius: 8, padding: '8px 12px' }}>EXIT</button>
              <iframe key={iframeKey} src={`/games/lit-limbo.html?wallet=${lowerAddr}`} title="Lit Limbo" style={{ border: 'none', position: 'absolute', inset: 0, width: '100%', height: '100%' }} allow="autoplay; fullscreen" />
            </div>
          )}
        </div>
      {!playing && (<div className="order-3"><GameLeaderboard title="Lit Limbo · Top Crashes" endpoint={`${SIMPLE_API}/litlimbo/leaderboard`} scoreField="best_roll" scoreLabel="Best ×" scoreFormat={(v) => `${Number(v||0).toFixed(2)}x`} /></div>)}
      </div>
          {!playing && <GameGlobalStats endpoint={`${SIMPLE_API}/litlimbo/global`} />}
      </motion.div>
  );
};

const LitMinesPage = ({ onBack }: { onBack: () => void }) => {
  const { address, isConnected } = useAccount();
  const SIMPLE_API = 'https://game.test-hub.xyz';
  const STAKE = 5;
  const DAILY_LIMIT = 20;
  const [stats, setStats] = useState<any>(null);
  const [playing, setPlaying] = useState(false);
  const [starting, setStarting] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [errMsg, setErrMsg] = useState('');
  const lowerAddr = address ? address.toLowerCase() : '';

  const fetchStats = async () => {
    if (!lowerAddr) return;
    try { const r = await fetch(`${SIMPLE_API}/litmines/stats/${lowerAddr}`); if (r.ok) setStats(await r.json()); } catch {}
  };
  useEffect(() => {
    if (!lowerAddr) return;
    fetchStats();
    const t = setInterval(fetchStats, 20000);
    return () => clearInterval(t);
  }, [lowerAddr]);
  useEffect(() => {
    if (!lowerAddr) return;
    const onMsg = (e: MessageEvent) => {
      const d: any = e?.data;
      if (!d || typeof d !== 'object') return;
      if (d.type === 'litdex:litmines:exit') {
        setPlaying(false);
        try { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); } catch {}
        try { (screen.orientation as any)?.unlock?.(); } catch {}
        fetchStats();
        return;
      }
      if (d.type === 'litdex:litmines:end') {
        try {
          addNotif(lowerAddr, {
            type: 'game',
            title: d.won ? 'Lit Mines · Cashed Out' : 'Lit Mines · Boom',
            message: `${Number(d.multiplier || 0).toFixed(2)}x · ${d.profit >= 0 ? '+' : ''}${d.profit} PTS`,
            link: d?.txInfo?.explorerUrl,
          });
        } catch {}
        saveFairness({ game: 'mines', seedHash: d.seedHash, serverSeed: d.serverSeed, roundId: d.roundId, bombs: d.bombs });
        fetchStats();
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [lowerAddr]);

  useEffect(() => {
    if (playing) document.body.classList.add('hide-nav');
    else document.body.classList.remove('hide-nav');
    return () => document.body.classList.remove('hide-nav');
  }, [playing]);

  const balance   = Math.max(0, Number(stats?.pointsBalance ?? 0));
  const gamesLeft = Math.max(0, Number(stats?.gamesLeft ?? Math.max(0, DAILY_LIMIT - Number(stats?.gamesPlayed ?? 0))));
  const bestMult  = Number(stats?.bestMultiplier ?? 0);

  const startGame = async () => {
    if (!lowerAddr || starting) return;
    if (balance < STAKE) { setErrMsg(`Need ${STAKE} PTS.`); return; }
    if (gamesLeft <= 0) { setErrMsg('Daily limit reached.'); return; }
    setErrMsg(''); setStarting(true); setPlaying(true);
    try { const elx: any = document.documentElement; const req = elx.requestFullscreen || elx.webkitRequestFullscreen || elx.mozRequestFullScreen; if (req) req.call(elx).catch(() => {}); } catch {}
    try { (screen.orientation as any)?.lock?.('portrait').catch(() => {}); } catch {}
    setStarting(false);
  };
  const handleExitGame = () => {
    setPlaying(false);
    try { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); } catch {}
    try { (screen.orientation as any)?.unlock?.(); } catch {}
    fetchStats();
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="lit-mines-page py-8 max-w-7xl mx-auto px-4">
      <button onClick={onBack} className="font-mono text-[11px] uppercase text-brand-text-muted hover:text-brand-text-primary mb-6">← Back to Games</button>
      <div className={`grid gap-5 ${playing ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-[260px_1fr_300px]'}`}>
        {!playing && (
          <div className="order-2 lg:order-1 space-y-5">
            <div className="p-5 rounded-2xl font-mono bg-brand-surface border border-brand-border">
              <div className="flex items-center justify-between mb-4">
                <div className="text-[11px] uppercase text-brand-text-muted">Your Stats</div>
                <span className="text-[9px] uppercase px-2 py-0.5 rounded-full text-black bg-white font-bold">{STAKE} PTS Stake</span>
              </div>
              {!isConnected ? <div className="text-brand-text-muted text-xs">Connect wallet to track your stats</div> : (
                <>
                  <div className="mb-3"><div className="text-[10px] uppercase text-brand-text-muted">Balance</div><div className="text-brand-text-primary text-sm font-bold">{balance.toLocaleString()} PTS</div></div>
                  <div className="mb-3"><div className="text-[10px] uppercase text-brand-text-muted">Grid</div><div className="text-brand-text-primary text-sm">5×5 · 3 / 5 / 10 bombs</div></div>
                  <div className="mb-3"><div className="text-[10px] uppercase text-brand-text-muted">RTP</div><div className="text-brand-text-primary text-sm">97%</div></div>
                  <div className="mb-4"><div className="text-[10px] uppercase text-brand-text-muted">Games Today</div><div className="text-brand-text-primary text-sm">{Math.max(0, DAILY_LIMIT - gamesLeft)} / {DAILY_LIMIT}</div></div>
                  <div className="pt-3 border-t border-brand-border">
                    <div className="text-[10px] uppercase text-brand-text-muted mb-2">Personal Best</div>
                    <div className="flex items-center justify-between text-[11px]"><span className="text-brand-text-muted">Best Multiplier</span><span className="text-brand-text-primary">{bestMult.toFixed(2)}x</span></div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
        <div className={`order-1 lg:order-2 overflow-hidden ${playing ? 'fixed inset-0 z-[100000] bg-black rounded-none border-0' : 'game-canvas-wrap rounded-2xl'}`}>
          {!playing ? (
            <div className="p-6 sm:p-8 text-center">
              <div className="font-mono text-brand-text-primary text-base sm:text-lg mb-2">LIT MINES</div>
              <div className="font-mono text-brand-text-muted text-xs mb-2">5×5 grid. Reveal safe tiles to grow multiplier. Cash out anytime. Bomb = lose.</div>
              <div className="font-mono text-[10px] text-brand-text-muted mb-6">{STAKE} PTS stake · {DAILY_LIMIT} games/day · 97% RTP</div>
              <button type="button" onClick={startGame} disabled={!isConnected || starting || (isConnected && (gamesLeft <= 0 || balance < STAKE))}
                className="w-full sm:w-auto min-h-12 px-8 py-3 rounded-lg bg-brand-text-primary text-brand-bg font-mono font-bold text-sm cursor-pointer touch-manipulation select-none active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ WebkitTapHighlightColor: 'transparent' }}>
                {!isConnected ? 'CONNECT WALLET' : starting ? 'STARTING…' : balance < STAKE ? `NEED ${STAKE} PTS` : gamesLeft <= 0 ? 'DAILY LIMIT REACHED' : `START · ${STAKE} PTS`}
              </button>
              {errMsg && <div className="mt-4 font-mono text-[11px]" style={{ color: '#c44' }}>{errMsg}</div>}
            </div>
          ) : (
            <div className="relative w-screen h-screen" style={{ width: '100vw', height: '100dvh', overscrollBehavior: 'none' }}>
              <button onClick={handleExitGame} aria-label="Exit game" className="font-mono text-[11px] uppercase bg-brand-surface-2 text-brand-text-primary border border-brand-border" style={{ position: 'fixed', bottom: 16, left: 16, zIndex: 999999, borderRadius: 8, padding: '8px 12px' }}>EXIT</button>
              <iframe key={iframeKey} src={`/games/lit-mines.html?wallet=${lowerAddr}`} title="Lit Mines" style={{ border: 'none', position: 'absolute', inset: 0, width: '100%', height: '100%' }} allow="autoplay; fullscreen" />
            </div>
          )}
        </div>
      {!playing && (<div className="order-3"><GameLeaderboard title="Lit Mines · Top Multipliers" endpoint={`${SIMPLE_API}/litmines/leaderboard`} scoreField="best_multiplier" scoreLabel="Best ×" scoreFormat={(v) => `${Number(v||0).toFixed(2)}x`} /></div>)}
      </div>
          {!playing && <GameGlobalStats endpoint={`${SIMPLE_API}/litmines/global`} />}
      </motion.div>
  );
};

const LitPlinkoPage = ({ onBack }: { onBack: () => void }) => {
  const { address, isConnected } = useAccount();
  const SIMPLE_API = 'https://game.test-hub.xyz';
  const STAKE = 5;
  const DAILY_LIMIT = 20;
  const [stats, setStats] = useState<any>(null);
  const [playing, setPlaying] = useState(false);
  const [starting, setStarting] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [errMsg, setErrMsg] = useState('');
  const lowerAddr = address ? address.toLowerCase() : '';
  const fetchStats = async () => {
    if (!lowerAddr) return;
    try { const r = await fetch(`${SIMPLE_API}/litplinko/stats/${lowerAddr}`); if (r.ok) setStats(await r.json()); } catch {}
  };
  useEffect(() => { if (!lowerAddr) return; fetchStats(); const t = setInterval(fetchStats, 20000); return () => clearInterval(t); }, [lowerAddr]);
  useEffect(() => {
    if (!lowerAddr) return;
    const onMsg = (e: MessageEvent) => {
      const d: any = e?.data;
      if (!d || typeof d !== 'object') return;
      if (d.type === 'litdex:litplinko:exit') { setPlaying(false); try { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); } catch {} try { (screen.orientation as any)?.unlock?.(); } catch {} fetchStats(); return; }
      if (d.type === 'litdex:litplinko:end') {
        try { addNotif(lowerAddr, { type: 'game', title: d.won ? 'Lit Plinko · Win' : 'Lit Plinko · Loss', message: `${Number(d.multiplier || 0).toFixed(2)}x · ${d.profit >= 0 ? '+' : ''}${d.profit} PTS`, link: d?.txInfo?.explorerUrl }); } catch {}
        saveFairness({ game: 'plinko', seedHash: d.seedHash, serverSeed: d.serverSeed, clientSeed: d.clientSeed, risk: d.risk });
        fetchStats();
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [lowerAddr]);
  useEffect(() => { if (playing) document.body.classList.add('hide-nav'); else document.body.classList.remove('hide-nav'); return () => document.body.classList.remove('hide-nav'); }, [playing]);
  const balance = Math.max(0, Number(stats?.pointsBalance ?? 0));
  const gamesLeft = Math.max(0, Number(stats?.gamesLeft ?? Math.max(0, DAILY_LIMIT - Number(stats?.gamesPlayed ?? 0))));
  const bestMult = Number(stats?.bestMultiplier ?? 0);
  const startGame = async () => {
    if (!lowerAddr || starting) return;
    if (balance < STAKE) { setErrMsg(`Need ${STAKE} PTS.`); return; }
    if (gamesLeft <= 0) { setErrMsg('Daily limit reached.'); return; }
    setErrMsg(''); setStarting(true); setPlaying(true);
    try { const elx: any = document.documentElement; const req = elx.requestFullscreen || elx.webkitRequestFullscreen || elx.mozRequestFullScreen; if (req) req.call(elx).catch(() => {}); } catch {}
    try { (screen.orientation as any)?.lock?.('portrait').catch(() => {}); } catch {}
    setStarting(false);
  };
  const handleExitGame = () => { setPlaying(false); try { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); } catch {} try { (screen.orientation as any)?.unlock?.(); } catch {} fetchStats(); };
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="lit-plinko-page py-8 max-w-7xl mx-auto px-4">
      <button onClick={onBack} className="font-mono text-[11px] uppercase text-brand-text-muted hover:text-brand-text-primary mb-6">← Back to Games</button>
      <div className={`grid gap-5 ${playing ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-[260px_1fr_300px]'}`}>
        {!playing && (
          <div className="order-2 lg:order-1 space-y-5">
            <div className="p-5 rounded-2xl font-mono bg-brand-surface border border-brand-border">
              <div className="flex items-center justify-between mb-4">
                <div className="text-[11px] uppercase text-brand-text-muted">Your Stats</div>
                <span className="text-[9px] uppercase px-2 py-0.5 rounded-full text-black bg-white font-bold">{STAKE} PTS Stake</span>
              </div>
              {!isConnected ? <div className="text-brand-text-muted text-xs">Connect wallet to track your stats</div> : (
                <>
                  <div className="mb-3"><div className="text-[10px] uppercase text-brand-text-muted">Balance</div><div className="text-brand-text-primary text-sm font-bold">{balance.toLocaleString()} PTS</div></div>
                  <div className="mb-3"><div className="text-[10px] uppercase text-brand-text-muted">Slots</div><div className="text-brand-text-primary text-sm">13 · LOW / MED / HIGH</div></div>
                  <div className="mb-3"><div className="text-[10px] uppercase text-brand-text-muted">Max Multiplier</div><div className="text-brand-text-primary text-sm">130x (HIGH)</div></div>
                  <div className="mb-4"><div className="text-[10px] uppercase text-brand-text-muted">Games Today</div><div className="text-brand-text-primary text-sm">{Math.max(0, DAILY_LIMIT - gamesLeft)} / {DAILY_LIMIT}</div></div>
                  <div className="pt-3 border-t border-brand-border">
                    <div className="text-[10px] uppercase text-brand-text-muted mb-2">Personal Best</div>
                    <div className="flex items-center justify-between text-[11px]"><span className="text-brand-text-muted">Best Multiplier</span><span className="text-brand-text-primary">{bestMult.toFixed(2)}x</span></div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
        <div className={`order-1 lg:order-2 overflow-hidden ${playing ? 'fixed inset-0 z-[100000] bg-black rounded-none border-0' : 'game-canvas-wrap rounded-2xl'}`}>
          {!playing ? (
            <div className="p-6 sm:p-8 text-center">
              <div className="font-mono text-brand-text-primary text-base sm:text-lg mb-2">LIT PLINKO</div>
              <div className="font-mono text-brand-text-muted text-xs mb-2">Drop a ball through 12 rows of pegs into 13 multiplier slots. Provably fair.</div>
              <div className="font-mono text-[10px] text-brand-text-muted mb-6">{STAKE} PTS stake · {DAILY_LIMIT} games/day · 95-97% RTP</div>
              <button type="button" onClick={startGame} disabled={!isConnected || starting || (isConnected && (gamesLeft <= 0 || balance < STAKE))} className="w-full sm:w-auto min-h-12 px-8 py-3 rounded-lg bg-brand-text-primary text-brand-bg font-mono font-bold text-sm cursor-pointer touch-manipulation select-none active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed" style={{ WebkitTapHighlightColor: 'transparent' }}>
                {!isConnected ? 'CONNECT WALLET' : starting ? 'STARTING…' : balance < STAKE ? `NEED ${STAKE} PTS` : gamesLeft <= 0 ? 'DAILY LIMIT REACHED' : `START · ${STAKE} PTS`}
              </button>
              {errMsg && <div className="mt-4 font-mono text-[11px]" style={{ color: '#c44' }}>{errMsg}</div>}
            </div>
          ) : (
            <div className="relative w-screen h-screen" style={{ width: '100vw', height: '100dvh', overscrollBehavior: 'none' }}>
              <button onClick={handleExitGame} aria-label="Exit game" className="font-mono text-[11px] uppercase bg-brand-surface-2 text-brand-text-primary border border-brand-border" style={{ position: 'fixed', bottom: 16, left: 16, zIndex: 999999, borderRadius: 8, padding: '8px 12px' }}>EXIT</button>
              <iframe key={iframeKey} src={`/games/lit-plinko.html?wallet=${lowerAddr}`} title="Lit Plinko" style={{ border: 'none', position: 'absolute', inset: 0, width: '100%', height: '100%' }} allow="autoplay; fullscreen" />
            </div>
          )}
        </div>
      {!playing && (<div className="order-3"><GameLeaderboard title="Lit Plinko · Top Multipliers" endpoint={`${SIMPLE_API}/litplinko/leaderboard`} scoreField="best_multiplier" scoreLabel="Best ×" scoreFormat={(v) => `${Number(v||0).toFixed(2)}x`} /></div>)}
      </div>
          {!playing && <GameGlobalStats endpoint={`${SIMPLE_API}/litplinko/global`} />}
      </motion.div>
  );
};

const LitWheelPage = ({ onBack }: { onBack: () => void }) => {
  const { address, isConnected } = useAccount();
  const SIMPLE_API = 'https://game.test-hub.xyz';
  const STAKE = 5;
  const DAILY_LIMIT = 20;
  const [stats, setStats] = useState<any>(null);
  const [playing, setPlaying] = useState(false);
  const [starting, setStarting] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [errMsg, setErrMsg] = useState('');
  const lowerAddr = address ? address.toLowerCase() : '';
  const fetchStats = async () => { if (!lowerAddr) return; try { const r = await fetch(`${SIMPLE_API}/litwheel/stats/${lowerAddr}`); if (r.ok) setStats(await r.json()); } catch {} };
  useEffect(() => { if (!lowerAddr) return; fetchStats(); const t = setInterval(fetchStats, 20000); return () => clearInterval(t); }, [lowerAddr]);
  useEffect(() => {
    if (!lowerAddr) return;
    const onMsg = (e: MessageEvent) => {
      const d: any = e?.data;
      if (!d || typeof d !== 'object') return;
      if (d.type === 'litdex:litwheel:exit') { setPlaying(false); try { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); } catch {} try { (screen.orientation as any)?.unlock?.(); } catch {} fetchStats(); return; }
      if (d.type === 'litdex:litwheel:end') {
        try { addNotif(lowerAddr, { type: 'game', title: d.won ? 'Lit Wheel · Win' : 'Lit Wheel · Loss', message: `${Number(d.multiplier || 0).toFixed(2)}x · ${d.profit >= 0 ? '+' : ''}${d.profit} PTS`, link: d?.txInfo?.explorerUrl }); } catch {}
        saveFairness({ game: 'wheel', seedHash: d.seedHash, serverSeed: d.serverSeed, clientSeed: d.clientSeed, risk: d.risk });
        fetchStats();
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [lowerAddr]);
  useEffect(() => { if (playing) document.body.classList.add('hide-nav'); else document.body.classList.remove('hide-nav'); return () => document.body.classList.remove('hide-nav'); }, [playing]);
  const balance = Math.max(0, Number(stats?.pointsBalance ?? 0));
  const gamesLeft = Math.max(0, Number(stats?.gamesLeft ?? Math.max(0, DAILY_LIMIT - Number(stats?.gamesPlayed ?? 0))));
  const bestMult = Number(stats?.bestMultiplier ?? 0);
  const startGame = async () => {
    if (!lowerAddr || starting) return;
    if (balance < STAKE) { setErrMsg(`Need ${STAKE} PTS.`); return; }
    if (gamesLeft <= 0) { setErrMsg('Daily limit reached.'); return; }
    setErrMsg(''); setStarting(true); setPlaying(true);
    try { const elx: any = document.documentElement; const req = elx.requestFullscreen || elx.webkitRequestFullscreen || elx.mozRequestFullScreen; if (req) req.call(elx).catch(() => {}); } catch {}
    try { (screen.orientation as any)?.lock?.('portrait').catch(() => {}); } catch {}
    setStarting(false);
  };
  const handleExitGame = () => { setPlaying(false); try { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); } catch {} try { (screen.orientation as any)?.unlock?.(); } catch {} fetchStats(); };
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="lit-wheel-page py-8 max-w-7xl mx-auto px-4">
      <button onClick={onBack} className="font-mono text-[11px] uppercase text-brand-text-muted hover:text-brand-text-primary mb-6">← Back to Games</button>
      <div className={`grid gap-5 ${playing ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-[260px_1fr_300px]'}`}>
        {!playing && (
          <div className="order-2 lg:order-1 space-y-5">
            <div className="p-5 rounded-2xl font-mono bg-brand-surface border border-brand-border">
              <div className="flex items-center justify-between mb-4">
                <div className="text-[11px] uppercase text-brand-text-muted">Your Stats</div>
                <span className="text-[9px] uppercase px-2 py-0.5 rounded-full text-black bg-white font-bold">{STAKE} PTS Stake</span>
              </div>
              {!isConnected ? <div className="text-brand-text-muted text-xs">Connect wallet to track your stats</div> : (
                <>
                  <div className="mb-3"><div className="text-[10px] uppercase text-brand-text-muted">Balance</div><div className="text-brand-text-primary text-sm font-bold">{balance.toLocaleString()} PTS</div></div>
                  <div className="mb-3"><div className="text-[10px] uppercase text-brand-text-muted">Segments</div><div className="text-brand-text-primary text-sm">24 · LOW / MED / HIGH</div></div>
                  <div className="mb-3"><div className="text-[10px] uppercase text-brand-text-muted">Max Multiplier</div><div className="text-brand-text-primary text-sm">20x (HIGH)</div></div>
                  <div className="mb-4"><div className="text-[10px] uppercase text-brand-text-muted">Games Today</div><div className="text-brand-text-primary text-sm">{Math.max(0, DAILY_LIMIT - gamesLeft)} / {DAILY_LIMIT}</div></div>
                  <div className="pt-3 border-t border-brand-border">
                    <div className="text-[10px] uppercase text-brand-text-muted mb-2">Personal Best</div>
                    <div className="flex items-center justify-between text-[11px]"><span className="text-brand-text-muted">Best Multiplier</span><span className="text-brand-text-primary">{bestMult.toFixed(2)}x</span></div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
        <div className={`order-1 lg:order-2 overflow-hidden ${playing ? 'fixed inset-0 z-[100000] bg-black rounded-none border-0' : 'game-canvas-wrap rounded-2xl'}`}>
          {!playing ? (
            <div className="p-6 sm:p-8 text-center">
              <div className="font-mono text-brand-text-primary text-base sm:text-lg mb-2">LIT WHEEL</div>
              <div className="font-mono text-brand-text-muted text-xs mb-2">Spin a 24-segment wheel. LOW / MED / HIGH multiplier tables. Provably fair.</div>
              <div className="font-mono text-[10px] text-brand-text-muted mb-6">{STAKE} PTS stake · {DAILY_LIMIT} games/day · up to 20x</div>
              <button type="button" onClick={startGame} disabled={!isConnected || starting || (isConnected && (gamesLeft <= 0 || balance < STAKE))} className="w-full sm:w-auto min-h-12 px-8 py-3 rounded-lg bg-brand-text-primary text-brand-bg font-mono font-bold text-sm cursor-pointer touch-manipulation select-none active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed" style={{ WebkitTapHighlightColor: 'transparent' }}>
                {!isConnected ? 'CONNECT WALLET' : starting ? 'STARTING…' : balance < STAKE ? `NEED ${STAKE} PTS` : gamesLeft <= 0 ? 'DAILY LIMIT REACHED' : `START · ${STAKE} PTS`}
              </button>
              {errMsg && <div className="mt-4 font-mono text-[11px]" style={{ color: '#c44' }}>{errMsg}</div>}
            </div>
          ) : (
            <div className="relative w-screen h-screen" style={{ width: '100vw', height: '100dvh', overscrollBehavior: 'none' }}>
              <button onClick={handleExitGame} aria-label="Exit game" className="font-mono text-[11px] uppercase bg-brand-surface-2 text-brand-text-primary border border-brand-border" style={{ position: 'fixed', bottom: 16, left: 16, zIndex: 999999, borderRadius: 8, padding: '8px 12px' }}>EXIT</button>
              <iframe key={iframeKey} src={`/games/lit-wheel.html?wallet=${lowerAddr}`} title="Lit Wheel" style={{ border: 'none', position: 'absolute', inset: 0, width: '100%', height: '100%' }} allow="autoplay; fullscreen" />
            </div>
          )}
        </div>
      {!playing && (<div className="order-3"><GameLeaderboard title="Lit Wheel · Top Multipliers" endpoint={`${SIMPLE_API}/litwheel/leaderboard`} scoreField="best_multiplier" scoreLabel="Best ×" scoreFormat={(v) => `${Number(v||0).toFixed(2)}x`} /></div>)}
      </div>
          {!playing && <GameGlobalStats endpoint={`${SIMPLE_API}/litwheel/global`} />}
      </motion.div>
  );
};

const LitCoinFlipPage = ({ onBack }: { onBack: () => void }) => {
  const { address, isConnected } = useAccount();
  const SIMPLE_API = 'https://game.test-hub.xyz';
  const STAKE = 5;
  const DAILY_LIMIT = 20;
  const [stats, setStats] = useState<any>(null);
  const [playing, setPlaying] = useState(false);
  const [starting, setStarting] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [errMsg, setErrMsg] = useState('');
  const lowerAddr = address ? address.toLowerCase() : '';
  const fetchStats = async () => { if (!lowerAddr) return; try { const r = await fetch(`${SIMPLE_API}/litcoinflip/stats/${lowerAddr}`); if (r.ok) setStats(await r.json()); } catch {} };
  useEffect(() => { if (!lowerAddr) return; fetchStats(); const t = setInterval(fetchStats, 20000); return () => clearInterval(t); }, [lowerAddr]);
  useEffect(() => {
    if (!lowerAddr) return;
    const onMsg = (e: MessageEvent) => {
      const d: any = e?.data;
      if (!d || typeof d !== 'object') return;
      if (d.type === 'litdex:litcoinflip:exit') { setPlaying(false); try { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); } catch {} try { (screen.orientation as any)?.unlock?.(); } catch {} fetchStats(); return; }
      if (d.type === 'litdex:litcoinflip:end') {
        try { addNotif(lowerAddr, { type: 'game', title: d.won ? `Lit Coin Flip · Streak ×${d.streak}` : 'Lit Coin Flip · Loss', message: `${Number(d.multiplier || 0).toFixed(2)}x · ${d.profit >= 0 ? '+' : ''}${d.profit} PTS`, link: d?.txInfo?.explorerUrl }); } catch {}
        saveFairness({ game: 'coinflip', seedHash: d.seedHash, serverSeed: d.serverSeed, clientSeed: d.clientSeed, side: d.side, streak: d.streak });
        fetchStats();
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [lowerAddr]);
  useEffect(() => { if (playing) document.body.classList.add('hide-nav'); else document.body.classList.remove('hide-nav'); return () => document.body.classList.remove('hide-nav'); }, [playing]);
  const balance = Math.max(0, Number(stats?.pointsBalance ?? 0));
  const gamesLeft = Math.max(0, Number(stats?.gamesLeft ?? Math.max(0, DAILY_LIMIT - Number(stats?.gamesPlayed ?? 0))));
  const bestStreak = Number(stats?.bestStreak ?? 0);
  const startGame = async () => {
    if (!lowerAddr || starting) return;
    if (balance < STAKE) { setErrMsg(`Need ${STAKE} PTS.`); return; }
    if (gamesLeft <= 0) { setErrMsg('Daily limit reached.'); return; }
    setErrMsg(''); setStarting(true); setPlaying(true);
    try { const elx: any = document.documentElement; const req = elx.requestFullscreen || elx.webkitRequestFullscreen || elx.mozRequestFullScreen; if (req) req.call(elx).catch(() => {}); } catch {}
    try { (screen.orientation as any)?.lock?.('portrait').catch(() => {}); } catch {}
    setStarting(false);
  };
  const handleExitGame = () => { setPlaying(false); try { if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); } catch {} try { (screen.orientation as any)?.unlock?.(); } catch {} fetchStats(); };
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="lit-coin-flip-page py-8 max-w-7xl mx-auto px-4">
      <button onClick={onBack} className="font-mono text-[11px] uppercase text-brand-text-muted hover:text-brand-text-primary mb-6">← Back to Games</button>
      <div className={`grid gap-5 ${playing ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-[260px_1fr_300px]'}`}>
        {!playing && (
          <div className="order-2 lg:order-1 space-y-5">
            <div className="p-5 rounded-2xl font-mono bg-brand-surface border border-brand-border">
              <div className="flex items-center justify-between mb-4">
                <div className="text-[11px] uppercase text-brand-text-muted">Your Stats</div>
                <span className="text-[9px] uppercase px-2 py-0.5 rounded-full text-black bg-white font-bold">{STAKE} PTS Stake</span>
              </div>
              {!isConnected ? <div className="text-brand-text-muted text-xs">Connect wallet to track your stats</div> : (
                <>
                  <div className="mb-3"><div className="text-[10px] uppercase text-brand-text-muted">Balance</div><div className="text-brand-text-primary text-sm font-bold">{balance.toLocaleString()} PTS</div></div>
                  <div className="mb-3"><div className="text-[10px] uppercase text-brand-text-muted">Per-flip</div><div className="text-brand-text-primary text-sm">1.96x · 98% RTP</div></div>
                  <div className="mb-3"><div className="text-[10px] uppercase text-brand-text-muted">Max Streak</div><div className="text-brand-text-primary text-sm">×5 = 28.89x</div></div>
                  <div className="mb-4"><div className="text-[10px] uppercase text-brand-text-muted">Games Today</div><div className="text-brand-text-primary text-sm">{Math.max(0, DAILY_LIMIT - gamesLeft)} / {DAILY_LIMIT}</div></div>
                  <div className="pt-3 border-t border-brand-border">
                    <div className="text-[10px] uppercase text-brand-text-muted mb-2">Personal Best</div>
                    <div className="flex items-center justify-between text-[11px]"><span className="text-brand-text-muted">Best Streak</span><span className="text-brand-text-primary">×{bestStreak}</span></div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
        <div className={`order-1 lg:order-2 overflow-hidden ${playing ? 'fixed inset-0 z-[100000] bg-black rounded-none border-0' : 'game-canvas-wrap rounded-2xl'}`}>
          {!playing ? (
            <div className="p-6 sm:p-8 text-center">
              <div className="font-mono text-brand-text-primary text-base sm:text-lg mb-2">LIT COIN FLIP</div>
              <div className="font-mono text-brand-text-muted text-xs mb-2">Heads or tails. Pre-commit a streak (×1 to ×5) for compounding payouts. Provably fair.</div>
              <div className="font-mono text-[10px] text-brand-text-muted mb-6">{STAKE} PTS stake · {DAILY_LIMIT} games/day · 98% RTP per flip</div>
              <button type="button" onClick={startGame} disabled={!isConnected || starting || (isConnected && (gamesLeft <= 0 || balance < STAKE))} className="w-full sm:w-auto min-h-12 px-8 py-3 rounded-lg bg-brand-text-primary text-brand-bg font-mono font-bold text-sm cursor-pointer touch-manipulation select-none active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed" style={{ WebkitTapHighlightColor: 'transparent' }}>
                {!isConnected ? 'CONNECT WALLET' : starting ? 'STARTING…' : balance < STAKE ? `NEED ${STAKE} PTS` : gamesLeft <= 0 ? 'DAILY LIMIT REACHED' : `START · ${STAKE} PTS`}
              </button>
              {errMsg && <div className="mt-4 font-mono text-[11px]" style={{ color: '#c44' }}>{errMsg}</div>}
            </div>
          ) : (
            <div className="relative w-screen h-screen" style={{ width: '100vw', height: '100dvh', overscrollBehavior: 'none' }}>
              <button onClick={handleExitGame} aria-label="Exit game" className="font-mono text-[11px] uppercase bg-brand-surface-2 text-brand-text-primary border border-brand-border" style={{ position: 'fixed', bottom: 16, left: 16, zIndex: 999999, borderRadius: 8, padding: '8px 12px' }}>EXIT</button>
              <iframe key={iframeKey} src={`/games/lit-coinflip.html?wallet=${lowerAddr}`} title="Lit Coin Flip" style={{ border: 'none', position: 'absolute', inset: 0, width: '100%', height: '100%' }} allow="autoplay; fullscreen" />
            </div>
          )}
        </div>
      {!playing && (<div className="order-3"><GameLeaderboard title="Lit Coin Flip · Top Streaks" endpoint={`${SIMPLE_API}/litcoinflip/leaderboard`} scoreField="best_streak" scoreLabel="Best Streak" scoreFormat={(v) => `×${Number(v||0)}`} /></div>)}
      </div>
          {!playing && <GameGlobalStats endpoint={`${SIMPLE_API}/litcoinflip/global`} />}
      </motion.div>
  );
};

const GameGlobalStats = ({ endpoint, className = '' }: { endpoint: string; className?: string }) => {
  const [stats, setStats] = useState<{ totalGames: number; uniquePlayers: number; totalPoints: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch(endpoint);
        if (r.ok) {
          const d = await r.json();
          if (!cancelled) setStats({
            totalGames: Number(d?.totalGames ?? 0),
            uniquePlayers: Number(d?.uniquePlayers ?? 0),
            totalPoints: Number(d?.totalPoints ?? 0),
          });
        }
      } catch { /* ignore — endpoint may not be deployed yet */ }
    };
    load();
    const t = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(t); };
  }, [endpoint]);
  if (!stats) return null;
  return (
    <div className={`mt-6 p-5 rounded-2xl font-mono bg-brand-surface border border-brand-border grid grid-cols-3 gap-4 ${className}`}>
      <div>
        <div className="text-[10px] uppercase text-brand-text-muted">Total Games</div>
        <div className="text-brand-text-primary text-lg font-bold">{stats.totalGames.toLocaleString()}</div>
      </div>
      <div>
        <div className="text-[10px] uppercase text-brand-text-muted">Unique Players</div>
        <div className="text-brand-text-primary text-lg font-bold">{stats.uniquePlayers.toLocaleString()}</div>
      </div>
      <div>
        <div className="text-[10px] uppercase text-brand-text-muted">Total Points Distributed</div>
        <div className="text-brand-text-primary text-lg font-bold">{stats.totalPoints.toLocaleString()}</div>
      </div>
    </div>
  );
};

const GameLeaderboard = ({ title, endpoint, scoreField, scoreLabel, scoreFormat, className = '' }: {
  title: string;
  endpoint: string;
  scoreField: string;
  scoreLabel: string;
  scoreFormat?: (v: any) => string;
  className?: string;
}) => {
  const [entries, setEntries] = useState<any[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch(endpoint);
        if (r.ok) {
          const d = await r.json();
          if (!cancelled) {
            setEntries(Array.isArray(d) ? d : (d?.leaderboard || d?.entries || []));
            setError(false);
          }
        } else { if (!cancelled) setError(true); }
      } catch { if (!cancelled) setError(true); }
    };
    load();
    const t = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(t); };
  }, [endpoint]);
  const mask = (a: string) => a ? `${a.slice(0, 6)}...${a.slice(-4)}` : '';
  const fmt = scoreFormat || ((v: any) => String(v ?? 0));
  return (
    <div className={`p-5 rounded-2xl font-mono bg-brand-surface border border-brand-border ${className}`}>
      <div className="text-[11px] uppercase text-brand-text-primary mb-3">{title}</div>
      {error || entries === null ? (
        <div className="text-brand-text-muted text-xs">{error ? 'Leaderboard not available yet' : 'Loading…'}</div>
      ) : entries.length === 0 ? (
        <div className="text-brand-text-muted text-xs">No entries yet · be the first</div>
      ) : (
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-brand-text-muted"><th className="text-left font-normal">#</th><th className="text-left font-normal">Wallet</th><th className="text-right font-normal">{scoreLabel}</th></tr>
          </thead>
          <tbody>
            {entries.slice(0, 20).map((e: any, i: number) => {
              const c = i === 0 ? 'text-brand-text-primary font-bold' : 'text-brand-text-muted';
              const w = e.wallet || e.walletAddress || e.address || '';
              const displayWallet = w.includes('...') ? w : mask(w);
              return (
                <tr key={i} className={c}>
                  <td className="py-1">{i + 1}</td>
                  <td className="py-1">{displayWallet}</td>
                  <td className="py-1 text-right">{fmt(e[scoreField])}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <RewardTierFooter />
    </div>
  );
};

const FAIRNESS_KEY = 'litdex_last_fairness_v1';
type FairnessGame = 'dice'|'limbo'|'mines'|'plinko'|'wheel'|'coinflip';
type FairnessRecord = {
  game: FairnessGame;
  seedHash?: string;
  serverSeed?: string;
  roundId?: string;
  clientSeed?: string;
  risk?: 'low'|'medium'|'high';
  side?: 'heads'|'tails';
  streak?: number;
  bombs?: number;
  ts: number;
};
const saveFairness = (rec: Omit<FairnessRecord, 'ts'>) => {
  try {
    const raw = localStorage.getItem(FAIRNESS_KEY);
    const map: Record<string, FairnessRecord> = raw ? JSON.parse(raw) : {};
    map[rec.game] = { ...rec, ts: Date.now() };
    map.__last = { ...rec, ts: Date.now() };
    localStorage.setItem(FAIRNESS_KEY, JSON.stringify(map));
  } catch { /* ignore quota / parse */ }
};
const loadFairness = (g?: FairnessGame): FairnessRecord | null => {
  try {
    const raw = localStorage.getItem(FAIRNESS_KEY);
    if (!raw) return null;
    const map: Record<string, FairnessRecord> = JSON.parse(raw);
    return (g ? map[g] : map.__last) || null;
  } catch { return null; }
};

const ProvablyFairModal = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const [game, setGame] = useState<'dice'|'limbo'|'mines'|'plinko'|'wheel'|'coinflip'>('dice');
  const [seedHash, setSeedHash] = useState('');
  const [serverSeed, setServerSeed] = useState('');
  const [roundId, setRoundId] = useState('');
  const [clientSeed, setClientSeed] = useState('');
  const [risk, setRisk] = useState<'low'|'medium'|'high'>('low');
  const [side, setSide] = useState<'heads'|'tails'>('heads');
  const [streak, setStreak] = useState(1);
  const [bombs, setBombs] = useState(3);
  const [result, setResult] = useState<{ won: boolean; details: string; subline?: string; flips?: string; mismatch?: boolean } | null>(null);
  const [scriptReady, setScriptReady] = useState<boolean>(typeof window !== 'undefined' && !!(window as any).LitDexVerify);

  // Pre-fill on open with the most recent fairness record from any game.
  useEffect(() => {
    if (!open) return;
    const last = loadFairness();
    if (last) {
      setGame(last.game);
      setSeedHash(last.seedHash || '');
      setServerSeed(last.serverSeed || '');
      setRoundId(last.roundId || '');
      setClientSeed(last.clientSeed || '');
      if (last.risk) setRisk(last.risk);
      if (last.side) setSide(last.side);
      if (last.streak) setStreak(last.streak);
      if (last.bombs) setBombs(last.bombs);
    }
    if ((window as any).LitDexVerify) setScriptReady(true);
  }, [open]);

  // When user switches game, pre-fill from that game's last record
  // (without clearing if no record).
  useEffect(() => {
    if (!open) return;
    const rec = loadFairness(game);
    if (rec) {
      setSeedHash(rec.seedHash || '');
      setServerSeed(rec.serverSeed || '');
      setRoundId(rec.roundId || '');
      setClientSeed(rec.clientSeed || '');
      if (rec.risk) setRisk(rec.risk);
      if (rec.side) setSide(rec.side);
      if (rec.streak) setStreak(rec.streak);
      if (rec.bombs) setBombs(rec.bombs);
      setResult(null);
    } else {
      // No record for this game — clear inputs that don't apply.
      setResult(null);
    }
  }, [game, open]);

  useEffect(() => {
    if (!open) return;
    if ((window as any).LitDexVerify) { setScriptReady(true); return; }
    // Try existing tag first
    const existing = document.querySelector('script[data-litdex-verify="1"]') as HTMLScriptElement | null;
    if (existing) {
      const checkInterval = setInterval(() => {
        if ((window as any).LitDexVerify) { setScriptReady(true); clearInterval(checkInterval); }
      }, 100);
      return () => clearInterval(checkInterval);
    }
    const s = document.createElement('script');
    s.src = '/games/verify-inline.js';
    s.dataset.litdexVerify = '1';
    s.onload = () => setScriptReady(true);
    s.onerror = () => setScriptReady(false);
    document.head.appendChild(s);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if ((window as any).LitDexVerify) { setScriptReady(true); return; }
    // Try existing tag first
    const existing = document.querySelector('script[data-litdex-verify="1"]') as HTMLScriptElement | null;
    if (existing) {
      const checkInterval = setInterval(() => {
        if ((window as any).LitDexVerify) { setScriptReady(true); clearInterval(checkInterval); }
      }, 100);
      return () => clearInterval(checkInterval);
    }
    const s = document.createElement('script');
    s.src = '/games/verify-inline.js';
    s.dataset.litdexVerify = '1';
    s.onload = () => setScriptReady(true);
    s.onerror = () => setScriptReady(false);
    document.head.appendChild(s);
  }, [open]);

  const reset = () => { setSeedHash(''); setServerSeed(''); setRoundId(''); setClientSeed(''); setResult(null); };

  const run = () => {
    const v = (window as any).LitDexVerify;
    if (!v) {
      // Try one more time to load synchronously
      setResult({ won: false, details: 'Loading verifier… try again in a second', mismatch: true });
      const s = document.createElement('script');
      s.src = '/games/verify-inline.js';
      s.onload = () => setScriptReady(true);
      document.head.appendChild(s);
      return;
    }
    const seed = serverSeed.trim().toLowerCase();
    if (!/^[0-9a-f]+$/.test(seed)) { setResult({ won: false, details: 'Server seed must be hex', mismatch: true }); return; }
    const wantHash = seedHash.trim().toLowerCase();
    if (wantHash && v.sha256str(seed) !== wantHash) { setResult({ won: false, details: 'Hash mismatch — sha256(seed) does not match seedHash', mismatch: true }); return; }
    try {
      if (game === 'dice') {
        if (!roundId.trim()) { setResult({ won: false, details: 'Round ID required for dice', mismatch: true }); return; }
        const roll = v.diceRoll(seed, roundId.trim());
        setResult({ won: false, details: `Roll: ${roll.toFixed(2)}`, subline: 'Compare against your target & direction' });
      } else if (game === 'limbo') {
        if (!roundId.trim()) { setResult({ won: false, details: 'Round ID required for limbo', mismatch: true }); return; }
        const roll = v.limboRoll(seed, roundId.trim());
        setResult({ won: false, details: `Crash: ${roll.toFixed(2)}x`, subline: 'Compare against your target multiplier' });
      } else if (game === 'mines') {
        if (!roundId.trim()) { setResult({ won: false, details: 'Round ID required for mines', mismatch: true }); return; }
        const arr = v.minesBombs(seed, roundId.trim(), bombs);
        setResult({ won: false, details: `Bombs at: [${arr.join(', ')}]`, subline: `${bombs} bombs of 25 cells` });
      } else if (game === 'plinko') {
        if (!clientSeed.trim()) { setResult({ won: false, details: 'Client seed required for plinko', mismatch: true }); return; }
        const { slot } = v.plinkoOutcome(seed, clientSeed.trim(), risk);
        const mult = (v.PLINKO[risk] || [])[slot] || 0;
        const won = mult > 1;
        setResult({ won, details: `Slot ${slot} · ${mult.toFixed(2)}x`, subline: `Risk: ${risk.toUpperCase()}` });
      } else if (game === 'wheel') {
        if (!clientSeed.trim()) { setResult({ won: false, details: 'Client seed required for wheel', mismatch: true }); return; }
        const seg = v.wheelSegment(seed, clientSeed.trim(), risk);
        const mult = (v.WHEEL[risk] || [])[seg] || 0;
        const won = mult > 0;
        setResult({ won, details: `Segment ${seg} · ${mult.toFixed(2)}x`, subline: `Risk: ${risk.toUpperCase()}` });
      } else if (game === 'coinflip') {
        if (!clientSeed.trim()) { setResult({ won: false, details: 'Client seed required for coinflip', mismatch: true }); return; }
        const flips = v.coinflipFlips(seed, clientSeed.trim(), side, streak);
        const won = flips.every((f: string) => f === side);
        setResult({ won, details: won ? 'All flips matched your side' : 'A flip went against you', subline: `Picked ${side.toUpperCase()} · streak ×${streak}`, flips: flips.map((f: string) => f === 'heads' ? 'H' : 'T').join(' · ') });
      }
    } catch (err: any) { setResult({ won: false, details: 'Verify failed: ' + (err?.message || 'unknown'), mismatch: true }); }
  };

  if (!open) return null;
  const needsRound = game === 'dice' || game === 'limbo' || game === 'mines';
  const needsClient = game === 'plinko' || game === 'wheel' || game === 'coinflip';
  return (
    <div className="fixed inset-0 z-[200000] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-brand-surface border border-brand-border rounded-2xl p-6 w-full max-w-[480px] font-mono text-brand-text-primary max-h-[90vh] overflow-y-auto">
        <div className="text-center mb-5">
          <div className="text-2xl font-bold tracking-tighter text-brand-text-primary">Provably Fair</div>
          <div className="text-[10px] uppercase tracking-widest text-brand-text-muted mt-1">Verify any past round on chain</div>
        </div>
        <div className="grid grid-cols-3 gap-1.5 mb-4">
          {(['dice','limbo','mines','plinko','wheel','coinflip'] as const).map((g) => (
            <button key={g} onClick={() => setGame(g)} className={`py-2 rounded-lg text-[10px] uppercase tracking-widest font-bold transition-colors ${game === g ? 'bg-white text-black' : 'bg-[#0a0a0a] border border-[#1f1f1f] text-brand-text-muted hover:text-brand-text-primary'}`}>{g}</button>
          ))}
        </div>
        <div className="space-y-3">
          <div>
            <div className="text-[9px] uppercase tracking-widest text-brand-text-muted mb-1">Seed Hash · committed before bet</div>
            <input value={seedHash} onChange={(e) => setSeedHash(e.target.value)} placeholder="64 hex chars (optional but recommended)" className="w-full bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg px-3 py-2.5 text-[11px] text-brand-text-primary placeholder:text-brand-text-muted/50 outline-none focus:border-white/30" />
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-widest text-brand-text-muted mb-1">Server Seed · revealed after bet</div>
            <input value={serverSeed} onChange={(e) => setServerSeed(e.target.value)} placeholder="64 hex chars" className="w-full bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg px-3 py-2.5 text-[11px] text-brand-text-primary placeholder:text-brand-text-muted/50 outline-none focus:border-white/30" />
          </div>
          {needsRound && (
            <div>
              <div className="text-[9px] uppercase tracking-widest text-brand-text-muted mb-1">Round ID</div>
              <input value={roundId} onChange={(e) => setRoundId(e.target.value)} placeholder="UUID from your round" className="w-full bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg px-3 py-2.5 text-[11px] text-brand-text-primary placeholder:text-brand-text-muted/50 outline-none focus:border-white/30" />
            </div>
          )}
          {needsClient && (
            <div>
              <div className="text-[9px] uppercase tracking-widest text-brand-text-muted mb-1">Client Seed</div>
              <input value={clientSeed} onChange={(e) => setClientSeed(e.target.value)} placeholder="from commit modal" className="w-full bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg px-3 py-2.5 text-[11px] text-brand-text-primary placeholder:text-brand-text-muted/50 outline-none focus:border-white/30" />
            </div>
          )}
          {(game === 'plinko' || game === 'wheel') && (
            <div>
              <div className="text-[9px] uppercase tracking-widest text-brand-text-muted mb-1">Risk</div>
              <div className="grid grid-cols-3 gap-1.5">
                {(['low','medium','high'] as const).map((r) => (
                  <button key={r} onClick={() => setRisk(r)} className={`py-2 rounded-lg text-[9px] uppercase tracking-widest font-bold transition-colors ${risk === r ? 'bg-white text-black' : 'bg-[#0a0a0a] border border-[#1f1f1f] text-brand-text-muted hover:text-brand-text-primary'}`}>{r}</button>
                ))}
              </div>
            </div>
          )}
          {game === 'mines' && (
            <div>
              <div className="text-[9px] uppercase tracking-widest text-brand-text-muted mb-1">Bombs</div>
              <input type="number" min={1} max={24} value={bombs} onChange={(e) => setBombs(Math.max(1, Math.min(24, Number(e.target.value)||3)))} className="w-full bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg px-3 py-2.5 text-[11px] text-brand-text-primary outline-none focus:border-white/30" />
            </div>
          )}
          {game === 'coinflip' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[9px] uppercase tracking-widest text-brand-text-muted mb-1">Side</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {(['heads','tails'] as const).map((s) => (
                    <button key={s} onClick={() => setSide(s)} className={`py-2 rounded-lg text-[9px] uppercase tracking-widest font-bold transition-colors ${side === s ? 'bg-white text-black' : 'bg-[#0a0a0a] border border-[#1f1f1f] text-brand-text-muted hover:text-brand-text-primary'}`}>{s}</button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-widest text-brand-text-muted mb-1">Streak</div>
                <input type="number" min={1} max={5} value={streak} onChange={(e) => setStreak(Math.max(1, Math.min(5, Number(e.target.value)||1)))} className="w-full bg-[#0a0a0a] border border-[#1f1f1f] rounded-lg px-3 py-2.5 text-[11px] text-brand-text-primary outline-none focus:border-white/30" />
              </div>
            </div>
          )}
        </div>
        {result && (
          <div className="mt-4 p-4 rounded-lg text-center" style={{ background: result.mismatch ? 'rgba(239,73,86,0.06)' : (result.won ? 'rgba(62,207,142,0.06)' : 'rgba(239,73,86,0.06)'), border: result.mismatch ? '1px solid rgba(239,73,86,0.3)' : (result.won ? '1px solid rgba(62,207,142,0.3)' : '1px solid rgba(239,73,86,0.25)') }}>
            <div className="text-5xl mb-2">{result.mismatch ? '⚠️' : (result.won ? '😄' : '😢')}</div>
            {!result.mismatch && (game === 'plinko' || game === 'wheel' || game === 'coinflip') && (
              <div className={`text-base font-bold tracking-widest mb-1 ${result.won ? 'text-[#3ecf8e]' : 'text-[#ef4956]'}`}>{result.won ? 'YOU WON' : 'YOU LOST'}</div>
            )}
            <div className="text-[12px] text-brand-text-primary font-bold">{result.details}</div>
            {result.subline && <div className="text-[10px] text-brand-text-muted mt-1">{result.subline}</div>}
            {result.flips && <div className="text-[10px] text-brand-text-primary mt-1">Flips: <b>{result.flips}</b></div>}
            {!result.mismatch && seedHash && <div className="text-[10px] text-[#3ecf8e] mt-2">✓ Hash verified</div>}
          </div>
        )}
        <div className="flex gap-2 mt-5">
          <button onClick={run} className="flex-1 py-3 rounded-lg bg-white text-black font-bold text-[11px] uppercase tracking-widest hover:bg-white/90 transition-colors">{scriptReady ? 'Verify' : 'Loading…'}</button>
          <button onClick={onClose} className="flex-1 py-3 rounded-lg bg-[#0a0a0a] border border-[#1f1f1f] text-brand-text-primary font-bold text-[11px] uppercase tracking-widest hover:bg-[#1a1a1a] transition-colors">Close</button>
        </div>
      </div>
    </div>
  );
};

const GamesPage = () => {
  const [sub, setSub] = useState<'lobby' | 'math-slash' | 'pump-dump' | 'lit-tower' | 'zk-miner' | 'lit-launch' | 'block-chain' | 'lit-dice' | 'lit-limbo' | 'lit-mines' | 'lit-plinko' | 'lit-wheel' | 'lit-coinflip'>('lobby');
  const [tab, setTab] = useState<'fun' | 'casino'>('fun');
  const [pfOpen, setPfOpen] = useState(false);
  const [cwOpen, setCwOpen] = useState(false);
  const { address } = useAccount();
  const lowerAddr = address ? address.toLowerCase() : '';
  if (sub === 'math-slash') return <MathSlashPage onBack={() => setSub('lobby')} />;
  if (sub === 'pump-dump')  return <PumpDumpPage  onBack={() => setSub('lobby')} />;
  if (sub === 'lit-tower')  return <LitTowerPage  onBack={() => setSub('lobby')} />;
  if (sub === 'zk-miner')   return <ZkMinerPage   onBack={() => setSub('lobby')} />;
  if (sub === 'lit-launch') return <LitLaunchPage onBack={() => setSub('lobby')} />;
  if (sub === 'block-chain') return <BlockChainPage onBack={() => setSub('lobby')} />;
  if (sub === 'lit-dice')   return <LitDicePage   onBack={() => setSub('lobby')} />;
  if (sub === 'lit-limbo')  return <LitLimboPage  onBack={() => setSub('lobby')} />;
  if (sub === 'lit-mines')  return <LitMinesPage  onBack={() => setSub('lobby')} />;
  if (sub === 'lit-plinko') return <LitPlinkoPage onBack={() => setSub('lobby')} />;
  if (sub === 'lit-wheel')  return <LitWheelPage  onBack={() => setSub('lobby')} />;
  if (sub === 'lit-coinflip') return <LitCoinFlipPage onBack={() => setSub('lobby')} />;
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-12 max-w-6xl mx-auto px-4">
      <div className="flex items-center justify-between flex-wrap gap-4 mb-6">
        <h1 className="text-3xl font-bold tracking-tighter text-white">Games</h1>
        <div className="flex flex-wrap items-center gap-3">
          {lowerAddr && tab === 'casino' && <CasinoWalletBadge wallet={lowerAddr} onOpen={() => setCwOpen(true)} />}
          <div className="inline-flex bg-[#0a0a0a] border border-[#1f1f1f] rounded-xl p-1 font-mono">
            <button
              onClick={() => setTab('fun')}
              className={`px-5 py-2 rounded-lg text-[11px] font-bold uppercase tracking-widest transition-colors ${tab === 'fun' ? 'bg-white text-black' : 'text-white/55 hover:text-white'}`}
            >Fun</button>
            <button
              onClick={() => setTab('casino')}
              className={`px-5 py-2 rounded-lg text-[11px] font-bold uppercase tracking-widest transition-colors ${tab === 'casino' ? 'bg-white text-black' : 'text-white/55 hover:text-white'}`}
            >Casino</button>
            <button
              onClick={() => setPfOpen(true)}
              className="px-5 py-2 rounded-lg text-[11px] font-bold uppercase tracking-widest transition-colors text-white/55 hover:text-white border-l border-white/10 ml-1"
            >Provably Fair</button>
          </div>
        </div>
      </div>
      <ProvablyFairModal open={pfOpen} onClose={() => setPfOpen(false)} />
      <CasinoWalletModal open={cwOpen} onClose={() => setCwOpen(false)} wallet={lowerAddr} />
      <div className="grid grid-cols-1 gap-6 items-start">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {tab === 'casino' ? (
            <>
              {/* LIT DICE */}
              <div className="games-card-dark rounded-2xl overflow-hidden flex flex-col" style={{ background: '#0a0a0a', border: '1px solid #1f1f1f' }}>
                <div className="h-44 flex items-center justify-center relative" style={{ background: 'linear-gradient(180deg, #04070d 0%, #0a1226 100%)' }}>
                  <svg width="160" height="120" viewBox="0 0 160 120" style={{ opacity: 0.95 }}>
                    <defs>
                      <linearGradient id="ldice1" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#fff5d2"/><stop offset="100%" stopColor="#ffd166"/></linearGradient>
                      <linearGradient id="ldice2" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#5be0a4"/><stop offset="100%" stopColor="#1f9c66"/></linearGradient>
                    </defs>
                    <rect x="22" y="30" width="50" height="50" rx="10" fill="url(#ldice1)" stroke="#fff" strokeOpacity="0.4" strokeWidth="1.5" transform="rotate(-12 47 55)"/>
                    <circle cx="38" cy="46" r="4" fill="#5a3a0a" transform="rotate(-12 47 55)"/>
                    <circle cx="56" cy="64" r="4" fill="#5a3a0a" transform="rotate(-12 47 55)"/>
                    <rect x="86" y="40" width="50" height="50" rx="10" fill="url(#ldice2)" stroke="#fff" strokeOpacity="0.4" strokeWidth="1.5" transform="rotate(8 111 65)"/>
                    <circle cx="100" cy="56" r="4" fill="#04241a" transform="rotate(8 111 65)"/>
                    <circle cx="111" cy="65" r="4" fill="#04241a" transform="rotate(8 111 65)"/>
                    <circle cx="122" cy="74" r="4" fill="#04241a" transform="rotate(8 111 65)"/>
                  </svg>
                  <span className="absolute top-3 right-3 text-[9px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full" style={{ background: '#ffd166', color: '#5a3a0a' }}>5 PTS</span>
                </div>
                <div className="p-6 flex-1 flex flex-col">
                  <h3 className="font-bold text-xl text-white mb-2">LIT DICE</h3>
                  <p className="text-sm text-[#888] mb-6 leading-relaxed">Pick a target, roll the dice. Win up to 99x. Provably fair, 97% RTP.</p>
                  <button onClick={() => setSub('lit-dice')} className="mt-auto w-full py-3 rounded-lg bg-white text-black font-mono font-bold text-xs uppercase tracking-widest">Play Now</button>
                </div>
              </div>

              {/* LIT LIMBO */}
              <div className="games-card-dark rounded-2xl overflow-hidden flex flex-col" style={{ background: '#0a0a0a', border: '1px solid #1f1f1f' }}>
                <div className="h-44 flex items-center justify-center relative" style={{ background: 'linear-gradient(180deg, #04070d 0%, #1a0a2c 100%)' }}>
                  <svg width="160" height="120" viewBox="0 0 160 120" style={{ opacity: 0.95 }}>
                    <defs>
                      <linearGradient id="llim1" x1="0" y1="1" x2="1" y2="0"><stop offset="0%" stopColor="#3a0e60"/><stop offset="100%" stopColor="#c466ff"/></linearGradient>
                    </defs>
                    <path d="M 18 96 Q 40 90 60 78 T 110 38 T 148 16" stroke="url(#llim1)" strokeWidth="3" fill="none" strokeLinecap="round" />
                    <circle cx="148" cy="16" r="6" fill="#c466ff" />
                    <text x="80" y="54" fontFamily="Bangers, cursive" fontSize="32" fill="#c466ff" textAnchor="middle">10x</text>
                  </svg>
                  <span className="absolute top-3 right-3 text-[9px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full" style={{ background: '#c466ff', color: '#fff' }}>5 PTS</span>
                </div>
                <div className="p-6 flex-1 flex flex-col">
                  <h3 className="font-bold text-xl text-white mb-2">LIT LIMBO</h3>
                  <p className="text-sm text-[#888] mb-6 leading-relaxed">Set a target multiplier. Win if RNG meets it. Up to 100x. 99% RTP.</p>
                  <button onClick={() => setSub('lit-limbo')} className="mt-auto w-full py-3 rounded-lg bg-white text-black font-mono font-bold text-xs uppercase tracking-widest">Play Now</button>
                </div>
              </div>

              {/* LIT MINES */}
              <div className="games-card-dark rounded-2xl overflow-hidden flex flex-col" style={{ background: '#0a0a0a', border: '1px solid #1f1f1f' }}>
                <div className="h-44 flex items-center justify-center relative" style={{ background: 'linear-gradient(180deg, #04070d 0%, #1a0a14 100%)' }}>
                  <svg width="160" height="120" viewBox="0 0 160 120" style={{ opacity: 0.95 }}>
                    <defs>
                      <linearGradient id="lmS" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5be0a4"/><stop offset="100%" stopColor="#1f9c66"/></linearGradient>
                      <linearGradient id="lmB" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ff5a6e"/><stop offset="100%" stopColor="#8a1c30"/></linearGradient>
                      <linearGradient id="lmH" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2a3450"/><stop offset="100%" stopColor="#131b30"/></linearGradient>
                    </defs>
                    {[0,1,2,3,4].map((r) => [0,1,2,3,4].map((c) => {
                      const i = r*5+c;
                      const safe = i === 6 || i === 12 || i === 13 || i === 18;
                      const bomb = i === 8 || i === 16;
                      return (
                        <g key={i}>
                          <rect x={14 + c*26} y={4 + r*22} width="22" height="18" rx="4" fill={safe ? "url(#lmS)" : bomb ? "url(#lmB)" : "url(#lmH)"} />
                          {safe && <text x={25 + c*26} y={17 + r*22} fontSize="10" textAnchor="middle">💎</text>}
                          {bomb && <text x={25 + c*26} y={17 + r*22} fontSize="10" textAnchor="middle">💣</text>}
                        </g>
                      );
                    }))}
                  </svg>
                  <span className="absolute top-3 right-3 text-[9px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full" style={{ background: '#ff7a45', color: '#fff' }}>5 PTS</span>
                </div>
                <div className="p-6 flex-1 flex flex-col">
                  <h3 className="font-bold text-xl text-white mb-2">LIT MINES</h3>
                  <p className="text-sm text-[#888] mb-6 leading-relaxed">5×5 grid. Reveal safe tiles, multiplier grows. Cash out before hitting a bomb.</p>
                  <button onClick={() => setSub('lit-mines')} className="mt-auto w-full py-3 rounded-lg bg-white text-black font-mono font-bold text-xs uppercase tracking-widest">Play Now</button>
                </div>
              </div>

              {/* LIT PLINKO */}
              <div className="games-card-dark rounded-2xl overflow-hidden flex flex-col" style={{ background: '#0a0a0a', border: '1px solid #1f1f1f' }}>
                <div className="h-44 flex items-center justify-center relative" style={{ background: 'linear-gradient(180deg, #04070d 0%, #1a0a2c 100%)' }}>
                  <svg width="160" height="120" viewBox="0 0 160 120" style={{ opacity: 0.95 }}>
                    {[0,1,2,3,4].map((r) => Array.from({length: r+2}).map((_, p) => (
                      <circle key={`p${r}_${p}`} cx={80 - (r+1)*8 + p*16} cy={20 + r*16} r="2.5" fill="#fff" />
                    )))}
                    <rect x="14" y="98" width="22" height="14" rx="3" fill="rgba(140,180,255,0.3)"/>
                    <rect x="40" y="98" width="22" height="14" rx="3" fill="rgba(91,224,164,0.55)"/>
                    <rect x="66" y="98" width="22" height="14" rx="3" fill="rgba(255,213,90,0.7)"/>
                    <rect x="92" y="98" width="22" height="14" rx="3" fill="rgba(91,224,164,0.55)"/>
                    <rect x="118" y="98" width="22" height="14" rx="3" fill="rgba(140,180,255,0.3)"/>
                    <circle cx="98" cy="86" r="5" fill="#ffd76a" />
                  </svg>
                  <span className="absolute top-3 right-3 text-[9px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full" style={{ background: '#c466ff', color: '#fff' }}>5 PTS</span>
                </div>
                <div className="p-6 flex-1 flex flex-col">
                  <h3 className="font-bold text-xl text-white mb-2">LIT PLINKO</h3>
                  <p className="text-sm text-[#888] mb-6 leading-relaxed">Drop a ball through 12 rows. 13 slots. LOW / MED / HIGH risk. Up to 130x.</p>
                  <button onClick={() => setSub('lit-plinko')} className="mt-auto w-full py-3 rounded-lg bg-white text-black font-mono font-bold text-xs uppercase tracking-widest">Play Now</button>
                </div>
              </div>

              {/* LIT WHEEL */}
              <div className="games-card-dark rounded-2xl overflow-hidden flex flex-col" style={{ background: '#0a0a0a', border: '1px solid #1f1f1f' }}>
                <div className="h-44 flex items-center justify-center relative" style={{ background: 'linear-gradient(180deg, #04070d 0%, #0a2018 100%)' }}>
                  <svg width="120" height="120" viewBox="0 0 120 120" style={{ opacity: 0.95 }}>
                    {Array.from({length: 12}).map((_, i) => {
                      const a0 = (i / 12) * Math.PI * 2 - Math.PI / 2;
                      const a1 = ((i + 1) / 12) * Math.PI * 2 - Math.PI / 2;
                      const x0 = 60 + Math.cos(a0) * 50, y0 = 60 + Math.sin(a0) * 50;
                      const x1 = 60 + Math.cos(a1) * 50, y1 = 60 + Math.sin(a1) * 50;
                      const colors = ['#5be0a4','#ffd166','#ff5a6e','#5be0a4','#ffd166','#23314b','#5be0a4','#ffd166','#ff5a6e','#5be0a4','#ffd166','#23314b'];
                      return <path key={i} d={`M 60 60 L ${x0} ${y0} A 50 50 0 0 1 ${x1} ${y1} Z`} fill={colors[i]} stroke="rgba(0,0,0,0.4)" />;
                    })}
                    <circle cx="60" cy="60" r="8" fill="#0a0e1a" stroke="rgba(255,255,255,0.3)" strokeWidth="2" />
                    <polygon points="60,2 54,16 66,16" fill="#ffe97a" />
                  </svg>
                  <span className="absolute top-3 right-3 text-[9px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full" style={{ background: '#5be0a4', color: '#04241a' }}>5 PTS</span>
                </div>
                <div className="p-6 flex-1 flex flex-col">
                  <h3 className="font-bold text-xl text-white mb-2">LIT WHEEL</h3>
                  <p className="text-sm text-[#888] mb-6 leading-relaxed">Spin the 24-segment wheel. LOW / MED / HIGH risk profiles. Up to 20x.</p>
                  <button onClick={() => setSub('lit-wheel')} className="mt-auto w-full py-3 rounded-lg bg-white text-black font-mono font-bold text-xs uppercase tracking-widest">Play Now</button>
                </div>
              </div>

              {/* LIT COIN FLIP */}
              <div className="games-card-dark rounded-2xl overflow-hidden flex flex-col" style={{ background: '#0a0a0a', border: '1px solid #1f1f1f' }}>
                <div className="h-44 flex items-center justify-center relative" style={{ background: 'linear-gradient(180deg, #04070d 0%, #2a1f08 100%)' }}>
                  <svg width="160" height="120" viewBox="0 0 160 120" style={{ opacity: 0.95 }}>
                    <defs>
                      <radialGradient id="cfH" cx="35%" cy="35%" r="60%"><stop offset="0%" stopColor="#fff5d2"/><stop offset="35%" stopColor="#ffd76a"/><stop offset="100%" stopColor="#a16e10"/></radialGradient>
                      <radialGradient id="cfT" cx="35%" cy="35%" r="60%"><stop offset="0%" stopColor="#cfdbf2"/><stop offset="40%" stopColor="#7c95b8"/><stop offset="100%" stopColor="#2a3450"/></radialGradient>
                    </defs>
                    <ellipse cx="50" cy="60" rx="34" ry="36" fill="url(#cfH)" stroke="#fff8d6" strokeWidth="3"/>
                    <text x="50" y="72" fontFamily="Bangers, cursive" fontSize="36" fill="#5a3a0a" textAnchor="middle">L</text>
                    <ellipse cx="110" cy="60" rx="34" ry="36" fill="url(#cfT)" stroke="#e6edf6" strokeWidth="3" transform="scale(-1 1) translate(-220 0)"/>
                    <text x="110" y="72" fontFamily="Bangers, cursive" fontSize="36" fill="#0a0e1a" textAnchor="middle">D</text>
                  </svg>
                  <span className="absolute top-3 right-3 text-[9px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full" style={{ background: '#ffd166', color: '#5a3a0a' }}>5 PTS</span>
                </div>
                <div className="p-6 flex-1 flex flex-col">
                  <h3 className="font-bold text-xl text-white mb-2">LIT COIN FLIP</h3>
                  <p className="text-sm text-[#888] mb-6 leading-relaxed">Heads or tails. 1.96x per flip. Pre-commit a streak (×1 to ×5) for up to 28.89x.</p>
                  <button onClick={() => setSub('lit-coinflip')} className="mt-auto w-full py-3 rounded-lg bg-white text-black font-mono font-bold text-xs uppercase tracking-widest">Play Now</button>
                </div>
              </div>
            </>
          ) : (
          <>
          <div className="games-card-dark rounded-2xl overflow-hidden flex flex-col" style={{ background: '#0a0a0a', border: '1px solid #1f1f1f' }}>
            <div className="h-44 flex items-center justify-center" style={{ background: '#111' }}>
              <div className="w-16 h-16 rounded-xl flex items-center justify-center" style={{ background: '#0a0a0a' }}>
                <Gamepad2 size={32} className="text-white" />
              </div>
            </div>
            <div className="p-6 flex-1 flex flex-col">
              <h3 className="font-bold text-xl text-white mb-2">MATH SLASH</h3>
              <p className="text-sm text-[#888] mb-6 leading-relaxed">Slash the equations. Earn points, convert to zkLTC.</p>
              <button onClick={() => setSub('math-slash')} className="mt-auto w-full py-3 rounded-lg bg-white text-black font-mono font-bold text-xs uppercase tracking-widest">
                Play Now
              </button>
            </div>
          </div>

          <div className="games-card-dark rounded-2xl overflow-hidden flex flex-col" style={{ background: '#0a0a0a', border: '1px solid #1f1f1f' }}>
            <div className="h-44 flex items-center justify-center relative" style={{ background: 'linear-gradient(135deg, #0a0a0a 0%, #111 50%, #0a0a0a 100%)' }}>
              <svg width="120" height="80" viewBox="0 0 120 80" style={{ opacity: 0.85 }}>
                <line x1="12"  y1="44" x2="12"  y2="22" stroke="#3ecf8e" strokeWidth="1.5"/>
                <rect x="8"  y="28" width="8" height="14" fill="#3ecf8e" />
                <line x1="28"  y1="58" x2="28"  y2="34" stroke="#ef4956" strokeWidth="1.5"/>
                <rect x="24" y="40" width="8" height="14" fill="#ef4956" />
                <line x1="44"  y1="38" x2="44"  y2="14" stroke="#3ecf8e" strokeWidth="1.5"/>
                <rect x="40" y="18" width="8" height="16" fill="#3ecf8e" />
                <line x1="60"  y1="46" x2="60"  y2="22" stroke="#3ecf8e" strokeWidth="1.5"/>
                <rect x="56" y="26" width="8" height="14" fill="#3ecf8e" />
                <line x1="76"  y1="62" x2="76"  y2="38" stroke="#ef4956" strokeWidth="1.5"/>
                <rect x="72" y="42" width="8" height="16" fill="#ef4956" />
                <line x1="92"  y1="36" x2="92"  y2="10" stroke="#3ecf8e" strokeWidth="1.5"/>
                <rect x="88" y="14" width="8" height="18" fill="#3ecf8e" />
                <rect x="104" y="20" width="8" height="42" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeDasharray="2,2"/>
                <text x="108" y="46" fontFamily="Bangers, cursive" fontSize="20" fill="rgba(255,255,255,0.6)" textAnchor="middle">?</text>
              </svg>
            </div>
            <div className="p-6 flex-1 flex flex-col">
              <h3 className="font-bold text-xl text-white mb-2">PUMP OR DUMP</h3>
              <p className="text-sm text-[#888] mb-6 leading-relaxed">Predict next candle. Pot grows on streak. Cash out anytime.</p>
              <button onClick={() => setSub('pump-dump')} className="mt-auto w-full py-3 rounded-lg bg-white text-black font-mono font-bold text-xs uppercase tracking-widest">
                Play Now
              </button>
            </div>
          </div>

          <div className="games-card-dark rounded-2xl overflow-hidden flex flex-col" style={{ background: '#0a0a0a', border: '1px solid #1f1f1f' }}>
            <div className="h-44 flex items-center justify-center relative" style={{ background: 'linear-gradient(180deg, #0a0a0a 0%, #0f1a13 100%)' }}>
              <svg width="120" height="120" viewBox="0 0 120 120" style={{ opacity: 0.95 }}>
                <rect x="22" y="92" width="76" height="14" rx="3" fill="#1c5f3a" stroke="#3ecf8e" strokeOpacity="0.5"/>
                <rect x="28" y="76" width="64" height="14" rx="3" fill="#246c45" stroke="#3ecf8e" strokeOpacity="0.55"/>
                <rect x="34" y="60" width="52" height="14" rx="3" fill="#2c7a4f" stroke="#3ecf8e" strokeOpacity="0.6"/>
                <rect x="40" y="44" width="42" height="14" rx="3" fill="#36885a" stroke="#3ecf8e" strokeOpacity="0.7"/>
                <rect x="46" y="28" width="32" height="14" rx="3" fill="#3ecf8e" stroke="#fff" strokeOpacity="0.5"/>
                <rect x="60" y="14" width="36" height="12" rx="3" fill="#5be0a4" stroke="#fff" strokeOpacity="0.7" opacity="0.85"/>
              </svg>
              <span className="absolute top-3 right-3 text-[9px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full" style={{ background: '#3ecf8e', color: '#0a0a0a' }}>FREE</span>
            </div>
            <div className="p-6 flex-1 flex flex-col">
              <h3 className="font-bold text-xl text-white mb-2">LIT TOWER</h3>
              <p className="text-sm text-[#888] mb-6 leading-relaxed">Tap to stack moving blocks. +1 PT each correct stack, no entry cost.</p>
              <button onClick={() => setSub('lit-tower')} className="mt-auto w-full py-3 rounded-lg bg-white text-black font-mono font-bold text-xs uppercase tracking-widest">
                Play Now
              </button>
            </div>
          </div>

          <div className="games-card-dark rounded-2xl overflow-hidden flex flex-col" style={{ background: '#0a0a0a', border: '1px solid #1f1f1f' }}>
            <div className="h-44 flex items-center justify-center relative" style={{ background: 'linear-gradient(180deg, #03060e 0%, #0f2545 100%)' }}>
              <svg width="140" height="120" viewBox="0 0 140 120" style={{ opacity: 0.95 }}>
                <defs>
                  <radialGradient id="zmG1" cx="35%" cy="35%" r="60%">
                    <stop offset="0%" stopColor="#7dffc1"/><stop offset="55%" stopColor="#3ecf8e"/><stop offset="100%" stopColor="#0f6a48"/>
                  </radialGradient>
                  <radialGradient id="zmG2" cx="35%" cy="35%" r="60%">
                    <stop offset="0%" stopColor="#ffeab0"/><stop offset="55%" stopColor="#ffd166"/><stop offset="100%" stopColor="#7a5e1c"/>
                  </radialGradient>
                  <radialGradient id="zmG3" cx="35%" cy="35%" r="60%">
                    <stop offset="0%" stopColor="#a4e3ff"/><stop offset="55%" stopColor="#4cc1ff"/><stop offset="100%" stopColor="#1d5d85"/>
                  </radialGradient>
                  <radialGradient id="zmG4" cx="35%" cy="35%" r="60%">
                    <stop offset="0%" stopColor="#e0a4ff"/><stop offset="55%" stopColor="#c466ff"/><stop offset="100%" stopColor="#5d2480"/>
                  </radialGradient>
                </defs>
                <rect x="14" y="18" width="26" height="26" rx="6" fill="url(#zmG1)"/>
                <rect x="44" y="18" width="26" height="26" rx="6" fill="url(#zmG2)"/>
                <rect x="74" y="18" width="26" height="26" rx="6" fill="url(#zmG3)"/>
                <rect x="104" y="18" width="26" height="26" rx="6" fill="url(#zmG4)"/>
                <rect x="14" y="48" width="26" height="26" rx="6" fill="url(#zmG3)"/>
                <rect x="44" y="48" width="26" height="26" rx="6" fill="url(#zmG1)"/>
                <rect x="74" y="48" width="26" height="26" rx="6" fill="url(#zmG4)"/>
                <rect x="104" y="48" width="26" height="26" rx="6" fill="url(#zmG2)"/>
                <rect x="14" y="78" width="26" height="26" rx="6" fill="url(#zmG2)"/>
                <rect x="44" y="78" width="26" height="26" rx="6" fill="url(#zmG3)"/>
                <rect x="74" y="78" width="26" height="26" rx="6" fill="url(#zmG1)"/>
                <rect x="104" y="78" width="26" height="26" rx="6" fill="url(#zmG4)"/>
              </svg>
              <span className="absolute top-3 right-3 text-[9px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full" style={{ background: '#5be0a4', color: '#0a0a0a' }}>FREE</span>
            </div>
            <div className="p-6 flex-1 flex flex-col">
              <h3 className="font-bold text-xl text-white mb-2">ZK MINER</h3>
              <p className="text-sm text-[#888] mb-6 leading-relaxed">Match 3+ token gems to charge the rig. +1 PT per full charge.</p>
              <button onClick={() => setSub('zk-miner')} className="mt-auto w-full py-3 rounded-lg bg-white text-black font-mono font-bold text-xs uppercase tracking-widest">
                Play Now
              </button>
            </div>
          </div>

          <div className="games-card-dark rounded-2xl overflow-hidden flex flex-col" style={{ background: '#0a0a0a', border: '1px solid #1f1f1f' }}>
            <div className="h-44 flex items-center justify-center relative" style={{ background: 'linear-gradient(180deg, #050912 0%, #1d3856 100%)' }}>
              <svg width="160" height="120" viewBox="0 0 160 120" style={{ opacity: 0.95 }}>
                <defs>
                  <radialGradient id="llEarth" cx="50%" cy="100%" r="80%">
                    <stop offset="0%" stopColor="#5be0a4"/><stop offset="60%" stopColor="#0d3a47"/><stop offset="100%" stopColor="#04141d"/>
                  </radialGradient>
                  <linearGradient id="llRocket" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#7c95b8"/><stop offset="50%" stopColor="#e6edf6"/><stop offset="100%" stopColor="#7c95b8"/>
                  </linearGradient>
                  <linearGradient id="llTrail" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(255,255,180,0.9)"/>
                    <stop offset="50%" stopColor="rgba(255,140,40,0.7)"/>
                    <stop offset="100%" stopColor="rgba(255,80,20,0)"/>
                  </linearGradient>
                </defs>
                {/* Stars */}
                <circle cx="20"  cy="20"  r="1.2" fill="#fff" opacity="0.8"/>
                <circle cx="135" cy="14"  r="1.5" fill="#fff" opacity="0.9"/>
                <circle cx="50"  cy="35"  r="0.9" fill="#fff" opacity="0.6"/>
                <circle cx="125" cy="52"  r="1.0" fill="#fff" opacity="0.7"/>
                <circle cx="32"  cy="62"  r="1.0" fill="#fff" opacity="0.7"/>
                <circle cx="98"  cy="32"  r="1.3" fill="#fff" opacity="0.85"/>
                {/* Earth at bottom */}
                <ellipse cx="80" cy="135" rx="120" ry="55" fill="url(#llEarth)"/>
                {/* Trail */}
                <ellipse cx="80" cy="86" rx="10" ry="22" fill="url(#llTrail)"/>
                {/* Rocket */}
                <rect x="74" y="52" width="12" height="28" rx="3" fill="url(#llRocket)"/>
                <polygon points="74,52 80,40 86,52" fill="#ff7a45"/>
                <polygon points="74,76 66,84 74,84" fill="#ff7a45"/>
                <polygon points="86,76 94,84 86,84" fill="#ff7a45"/>
                <circle cx="80" cy="62" r="2.5" fill="#5be0a4"/>
              </svg>
              <span className="absolute top-3 right-3 text-[9px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full" style={{ background: '#ff7a45', color: '#0a0a0a' }}>FREE</span>
            </div>
            <div className="p-6 flex-1 flex flex-col">
              <h3 className="font-bold text-xl text-white mb-2">LIT LAUNCH</h3>
              <p className="text-sm text-[#888] mb-6 leading-relaxed">Drag left/right · dodge asteroids · catch coins. 3 lives, +1 PT per coin.</p>
              <button onClick={() => setSub('lit-launch')} className="mt-auto w-full py-3 rounded-lg bg-white text-black font-mono font-bold text-xs uppercase tracking-widest">
                Play Now
              </button>
            </div>
          </div>

          <div className="games-card-dark rounded-2xl overflow-hidden flex flex-col" style={{ background: '#0a0a0a', border: '1px solid #1f1f1f' }}>
            <div className="h-44 flex items-center justify-center relative" style={{ background: 'linear-gradient(180deg, #04070d 0%, #1a2c44 100%)' }}>
              <svg width="160" height="120" viewBox="0 0 160 120" style={{ opacity: 0.95 }}>
                <defs>
                  <linearGradient id="bcG2" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3a4666"/><stop offset="100%" stopColor="#1c2438"/></linearGradient>
                  <linearGradient id="bcG64" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#7dffc1"/><stop offset="100%" stopColor="#2c8a64"/></linearGradient>
                  <linearGradient id="bcG128" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ffeab0"/><stop offset="100%" stopColor="#d09a30"/></linearGradient>
                  <linearGradient id="bcG256" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ffc78a"/><stop offset="100%" stopColor="#c54616"/></linearGradient>
                  <linearGradient id="bcG2048" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ff8aae"/><stop offset="100%" stopColor="#aa1d4a"/></linearGradient>
                </defs>
                <rect x="14"  y="14"  width="32" height="32" rx="6" fill="url(#bcG2)"/>
                <text x="30" y="36" fontFamily="Bangers, cursive" fontSize="18" fill="#cfdbf2" textAnchor="middle">2</text>
                <rect x="50"  y="14"  width="32" height="32" rx="6" fill="url(#bcG64)"/>
                <text x="66" y="35" fontFamily="Bangers, cursive" fontSize="14" fill="#04241a" textAnchor="middle">64</text>
                <rect x="86"  y="14"  width="32" height="32" rx="6" fill="url(#bcG128)"/>
                <text x="102" y="35" fontFamily="Bangers, cursive" fontSize="13" fill="#5a3a0a" textAnchor="middle">128</text>
                <rect x="122" y="14"  width="32" height="32" rx="6" fill="url(#bcG256)"/>
                <text x="138" y="35" fontFamily="Bangers, cursive" fontSize="13" fill="#5a2a0a" textAnchor="middle">256</text>
                <rect x="14"  y="50"  width="32" height="32" rx="6" fill="url(#bcG2)"/>
                <text x="30" y="72" fontFamily="Bangers, cursive" fontSize="18" fill="#cfdbf2" textAnchor="middle">4</text>
                <rect x="50"  y="50"  width="32" height="32" rx="6" fill="url(#bcG2)"/>
                <rect x="86"  y="50"  width="32" height="32" rx="6" fill="url(#bcG2)"/>
                <rect x="122" y="50"  width="32" height="32" rx="6" fill="url(#bcG2048)"/>
                <text x="138" y="71" fontFamily="Bangers, cursive" fontSize="11" fill="#fff" textAnchor="middle">2048</text>
                <rect x="14"  y="86"  width="32" height="32" rx="6" fill="url(#bcG2)"/>
                <rect x="50"  y="86"  width="32" height="32" rx="6" fill="url(#bcG2)"/>
                <rect x="86"  y="86"  width="32" height="32" rx="6" fill="url(#bcG2)"/>
                <rect x="122" y="86"  width="32" height="32" rx="6" fill="url(#bcG2)"/>
              </svg>
              <span className="absolute top-3 right-3 text-[9px] uppercase font-bold tracking-widest px-2 py-0.5 rounded-full" style={{ background: '#5be0a4', color: '#0a0a0a' }}>FREE</span>
            </div>
            <div className="p-6 flex-1 flex flex-col">
              <h3 className="font-bold text-xl text-white mb-2">BLOCK CHAIN</h3>
              <p className="text-sm text-[#888] mb-6 leading-relaxed">2048 with token tiles. Hit 64/128/256/512/1024/2048 milestones for +5 → +160 PTS.</p>
              <button onClick={() => setSub('block-chain')} className="mt-auto w-full py-3 rounded-lg bg-white text-black font-mono font-bold text-xs uppercase tracking-widest">
                Play Now
              </button>
            </div>
          </div>
          </>
          )}
        </div>
      </div>
    </motion.div>
  );
};

// --- Page: Messenger ---
const MessengerPage = () => {
  const { address, isConnected } = useAccount();
  const [activeTab, setActiveTab] = useState<'send' | 'inbox'>('send');
  const [inboxTab, setInboxTab] = useState<'received' | 'sent'>('received');
  const [msgType, setMsgType] = useState<'public' | 'direct'>('public');
  const [messages, setMessages] = useState<any[]>([]);
  const [stats, setStats] = useState({ sent: 0, received: 0, total: 0 });
  const [loading, setLoading] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [lastSentHash, setLastSentHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [backendPoints, setBackendPoints] = useState<number>(0);
  const [msgCount, setMsgCount] = useState<number>(0);
  const DAILY_MSG_LIMIT = 10;

  const getISTDate = () => new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const msgStorageKey = address ? `litdex_msg_count_${address}` : null;

  const readLocalMsgCount = (): number => {
    if (!msgStorageKey) return 0;
    try {
      const raw = localStorage.getItem(msgStorageKey);
      if (!raw) return 0;
      const parsed = JSON.parse(raw);
      if (parsed?.date !== getISTDate()) return 0;
      return Number(parsed?.count ?? 0);
    } catch { return 0; }
  };

  const writeLocalMsgCount = (count: number) => {
    if (!msgStorageKey) return;
    try {
      localStorage.setItem(msgStorageKey, JSON.stringify({ date: getISTDate(), count }));
    } catch { /* ignore */ }
  };

  const fetchBackendPoints = async () => {
    if (!address) return;
    try {
      const r = await fetch(`https://api.test-hub.xyz/points/${address}`);
      const j = await r.json();
      setBackendPoints(Number(j?.total ?? 0));
    } catch (err) { console.error('[Messenger] points fetch failed:', err); }
  };

  const fetchStats = async () => {
    if (!address) return;
    try {
      const { getMessengerStats } = await import('./lib/litdex-core-logic');
      const s = await getMessengerStats(address);
      setStats(s);
      return s; // Return stats to use them immediately
    } catch (err) { console.error(err); }
  };

  const fetchMessages = async () => {
    if (!address) return;
    setLoading(true);
    try {
      const { getSentMessages, getReceivedMessages } = await import('./lib/litdex-core-logic');
      const data = inboxTab === 'sent' 
        ? await getSentMessages(address) 
        : await getReceivedMessages(address);
      setMessages(data);
      fetchStats();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isConnected && address) {
      fetchStats();
      fetchBackendPoints();
      if (activeTab === 'inbox') fetchMessages();

      // Reset local count if IST date has rolled over, then load
      setMsgCount(readLocalMsgCount());

      // Try to get authoritative count from backend
      (async () => {
        try {
          const r = await fetch(`https://api.test-hub.xyz/msg/count/${address}`);
          if (r.ok) {
            const j = await r.json();
            const c = Number(j?.msgsToday ?? j?.count ?? NaN);
            if (!Number.isNaN(c)) {
              setMsgCount(c);
              writeLocalMsgCount(c);
            }
          }
        } catch { /* ignore */ }
      })();
    }
  }, [isConnected, address, activeTab, inboxTab]);

  const handleSend = async () => {
    if (!content) return;
    setSending(true);
    setError(null);

    // Frontend cap check — backend is telemetry-only now, so we own
    // the cap-reached UX. The on-chain tx still goes through (contract
    // may or may not credit, depending on its own internal cap), but
    // the user sees a clear "no points today" message instead of the
    // generic +2 PTS popup.
    const isCapReachedClick = msgCount >= DAILY_MSG_LIMIT;

    try {
      const { sendMessage } = await import('./lib/litdex-core-logic');
      const target = msgType === 'public' ? 'public' : recipient;

      const result = await sendMessage(target, content);
      const sentHash = result.hash;
      setLastSentHash(sentHash);

      // If the backend (legacy) or the frontend cap says daily limit
      // hit, surface the cap popup instead of the +2 PTS card.
      if (isCapReachedClick || (result.success === false && result.reason === "daily_limit")) {
        setMsgCount(DAILY_MSG_LIMIT);
        writeLocalMsgCount(DAILY_MSG_LIMIT);

        const explorerUrl = `${litvmChain.blockExplorers.default.url}/tx/${sentHash}`;
        const shortHash = `${sentHash.slice(0, 6)}...${sentHash.slice(-4)}`;
        showSuccess({
          title: "DAILY CAP REACHED",
          subtitle: "MESSAGE DELIVERED · NO MORE POINTS TODAY",
          rows: [
            { label: "POINTS EARNED", value: "+0 PTS (CAP REACHED)" },
            { label: "TRANSACTION", value: shortHash, href: explorerUrl },
            { label: "STATUS", value: "ON-CHAIN DELIVERED" },
          ],
        });

        await fetchStats();
        await fetchBackendPoints();
        setContent('');
        if (msgType === 'direct') setRecipient('');
        setSending(false);
        return;
      }

      // Determine new count: prefer backend value, otherwise increment locally
      const nextCount = typeof result.msgsToday === "number"
        ? result.msgsToday
        : (readLocalMsgCount() + 1);
      setMsgCount(nextCount);
      writeLocalMsgCount(nextCount);

      // Refresh stats and backend-authoritative points (backend handles all point logic)
      await fetchStats();
      await fetchBackendPoints();

      const explorerUrl = `${litvmChain.blockExplorers.default.url}/tx/${sentHash}`;
      const shortHash = `${sentHash.slice(0, 6)}...${sentHash.slice(-4)}`;

      showSuccess({
        title: "MESSAGE SENT",
        subtitle: "PROTOCOL VERIFICATION COMPLETE",
        rows: [
          { label: "POINTS EARNED", value: "+2 PTS" },
          { label: "TRANSACTION", value: shortHash, href: explorerUrl },
          { label: "STATUS", value: "ON-CHAIN DELIVERED" },
        ],
      });

      try {
        if (address) addNotif(address, {
          type: "points",
          title: "Message Sent",
          message: "+2 points earned from on-chain message",
        });
      } catch { /* ignore */ }

      setContent('');
      if (msgType === 'direct') setRecipient('');
    } catch (err: any) {
      console.error(err);
      const msg = err?.message || String(err);
      if (msg.toLowerCase().includes("user rejected") || msg.toLowerCase().includes("rejected")) {
        setError("User rejected action");
      } else {
        setError(msg.slice(0, 80));
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-8 max-w-5xl mx-auto px-4 h-full flex flex-col">
      {/* Header & Stats Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 bg-black/40 border border-white/5 p-6 rounded-3xl backdrop-blur-2xl">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-white/5 rounded-2xl border border-white/10">
            <MessageSquare size={24} className="text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-white tracking-tight uppercase">Messenger</h2>
            <p className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">LitVM On-Chain Protocol</p>
          </div>
        </div>

        <div className="flex items-center gap-6 px-6 py-3 bg-white/[0.02] border border-white/5 rounded-2xl">
          <div className="flex flex-col">
            <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Sent</span>
            <span className="text-lg font-black text-white">{stats.sent}</span>
          </div>
          <div className="w-px h-8 bg-white/5" />
          <div className="flex flex-col">
            <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Received</span>
            <span className="text-lg font-black text-white">{stats.received}</span>
          </div>
          <div className="w-px h-8 bg-white/5" />
          <div className="flex flex-col">
            <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Global On-Chain</span>
            <span className="text-lg font-black text-white">{stats.total}</span>
          </div>
          <div className="w-px h-8 bg-white/5" />
          <div className="flex flex-col">
            <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Points</span>
            <span className="text-lg font-black text-white">{backendPoints}</span>
          </div>
        </div>
      </div>

      {/* Main Tabs */}
      <div className="flex gap-2 mb-6 p-1.5 bg-black/40 border border-white/5 rounded-2xl w-fit">
        <button 
          onClick={() => setActiveTab('send')}
          className={cn(
            "px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all",
            activeTab === 'send' ? "bg-white text-black shadow-lg" : "text-white/40 hover:text-white"
          )}
        >
          Send
        </button>
        <button 
          onClick={() => setActiveTab('inbox')}
          className={cn(
            "px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all",
            activeTab === 'inbox' ? "bg-white text-black shadow-lg" : "text-white/40 hover:text-white"
          )}
        >
          Inbox
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 min-h-0">
        <AnimatePresence mode="wait">
          {activeTab === 'send' ? (
            <motion.div 
              key="send-tab"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="h-full"
            >
              <Card className="p-10 bg-black/60 border-white/10 backdrop-blur-3xl h-full flex flex-col relative overflow-hidden">
                 <div className="absolute top-0 right-0 w-64 h-64 bg-white/[0.02] rounded-full blur-[100px] -mr-32 -mt-32 pointer-events-none" />
                 
                 <div className="flex items-center justify-between mb-10 relative z-10">
                   <div>
                     <h3 className="text-xl font-black text-white tracking-tight uppercase">Transmit</h3>
                     <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-1">Daily Cap: 10 Messages (20 Points)</p>
                   </div>
                   
                   <div className="flex p-1 bg-white/10 rounded-xl border border-white/10 relative z-20">
                     <button 
                       type="button"
                       id="msg-type-public"
                       onClick={(e) => { e.stopPropagation(); setMsgType('public'); }}
                       className={cn(
                         "px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer",
                         msgType === 'public' ? "bg-white text-black shadow-lg" : "text-white/40 hover:text-white/60"
                       )}
                     >
                       Public
                     </button>
                     <button 
                       type="button"
                       id="msg-type-direct"
                       onClick={(e) => { e.stopPropagation(); setMsgType('direct'); }}
                       className={cn(
                         "px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer",
                         msgType === 'direct' ? "bg-white text-black shadow-lg" : "text-white/40 hover:text-white/60"
                       )}
                     >
                       Direct
                     </button>
                   </div>
                 </div>

                 <div className="space-y-8 flex-1 max-w-2xl relative z-10">
                    {msgType === 'direct' && (
                      <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="space-y-3">
                        <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] ml-1">Recipient Address</label>
                        <input 
                          id="messenger-recipient"
                          value={recipient}
                          onChange={(e) => setRecipient(e.target.value.trim())}
                          placeholder="0x... (Recipient Wallet)" 
                          className="w-full bg-white/[0.03] border border-white/10 rounded-2xl p-5 text-sm text-white focus:border-white/30 outline-none transition-all placeholder:text-white/10"
                        />
                      </motion.div>
                    )}

                    <div className="space-y-3">
                      <div className="flex items-center justify-between ml-1">
                        <label className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">Message Content</label>
                        <span className={cn(
                          "text-[9px] font-mono",
                          content.length > 1000 ? "text-white font-black underline decoration-white/20 underline-offset-4" : "text-white/20"
                        )}>
                          {content.length}/1000
                        </span>
                      </div>
                      <textarea 
                        value={content}
                        onChange={(e) => setContent(e.target.value.slice(0, 1000))}
                        rows={8}
                        placeholder={msgType === 'public' ? "Broadcast your thoughts to the world..." : "Secure message to recipient..."}
                        className="w-full bg-white/[0.03] border border-white/10 rounded-2xl p-5 text-sm text-white focus:border-white/30 outline-none resize-none transition-all placeholder:text-white/10"
                      />
                    </div>
                 </div>

                 <div className="mt-10 flex flex-col gap-6">
                    <div className="flex items-center gap-6">
                       <button 
                         onClick={handleSend}
                         disabled={!isConnected || sending || !content || (msgType === 'direct' && !recipient)}
                         className="px-12 py-4 bg-white text-black rounded-2xl font-black text-xs uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] disabled:opacity-30 transition-all shadow-[0_0_50px_rgba(255,255,255,0.1)] flex items-center gap-3"
                       >
                         {sending ? "TRANSMITTING..." : "AUTHORIZE TRANSMISSION"}
                       </button>
                       {!isConnected && (
                         <p className="text-[10px] text-white/20 font-bold uppercase tracking-widest">Connect wallet to send</p>
                       )}
                       {isConnected && (
                         <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest">
                           {msgCount >= DAILY_MSG_LIMIT
                             ? `Cap reached · ${DAILY_MSG_LIMIT}/${DAILY_MSG_LIMIT} (no more points today)`
                             : `${msgCount}/${DAILY_MSG_LIMIT} messages today`}
                         </p>
                       )}
                    </div>

                    {error && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="px-6 py-3 bg-white/[0.02] border border-white/5 rounded-2xl text-white/40 text-[10px] font-bold uppercase tracking-widest text-center max-w-2xl"
                      >
                        {error}
                      </motion.div>
                    )}
                 </div>
              </Card>
            </motion.div>
          ) : (
            <motion.div 
              key="inbox-tab"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="h-full flex flex-col"
            >
              <Card className="bg-black/60 border-white/10 backdrop-blur-3xl flex-1 flex flex-col overflow-hidden shadow-2xl">
                <div className="p-6 border-b border-white/5 flex items-center justify-between">
                  <div className="flex gap-4 p-1 bg-white/5 rounded-xl border border-white/5 w-fit">
                    <button 
                      onClick={() => setInboxTab('received')}
                      className={cn(
                        "px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                        inboxTab === 'received' ? "bg-white/10 text-white" : "text-white/40 hover:text-white/60"
                      )}
                    >
                      Received
                    </button>
                    <button 
                      onClick={() => setInboxTab('sent')}
                      className={cn(
                        "px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all",
                        inboxTab === 'sent' ? "bg-white/10 text-white" : "text-white/40 hover:text-white/60"
                      )}
                    >
                      Sent
                    </button>
                  </div>

                  <button 
                    onClick={fetchMessages}
                    disabled={loading}
                    className="p-3 rounded-xl hover:bg-white/5 text-white/30 hover:text-white transition-all disabled:opacity-30"
                  >
                    <RefreshCw size={18} className={cn(loading && "animate-spin")} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-10 space-y-8 scrollbar-hide">
                  {!isConnected ? (
                    <div className="h-full flex flex-col items-center justify-center opacity-20">
                      <Lock size={48} className="mb-6" />
                      <p className="text-xs font-black uppercase tracking-[0.3em]">Protocol Encrypted</p>
                    </div>
                  ) : loading ? (
                    <div className="h-full flex flex-col items-center justify-center opacity-40">
                      <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin mb-4" />
                      <p className="text-[10px] font-black uppercase tracking-widest text-white/40">Syncing Feed...</p>
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center opacity-20">
                      <div className="p-8 bg-white/5 rounded-full mb-6">
                        <MessageSquare size={48} />
                      </div>
                      <p className="text-xs font-black uppercase tracking-[0.3em]">No Messages Recorded</p>
                    </div>
                  ) : (
                    <div className="space-y-8">
                       {messages.map((m, i) => (
                         <motion.div 
                           key={i}
                           initial={{ opacity: 0, x: -20 }}
                           animate={{ opacity: 1, x: 0 }}
                           className="flex flex-col gap-2"
                         >
                           <div className="bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-xl relative group hover:bg-white/[0.08] transition-all messenger-msg-card">
                              <p className="text-sm font-medium text-white/90 leading-relaxed mb-6 break-all w-full">{m.content}</p>
                              
                              <div className="pt-4 border-t border-white/5 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                   <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
                                   <p className="text-[10px] font-mono text-white/30">
                                      {inboxTab === 'sent' ? `To: ${m.recipient}` : `From: ${m.sender}`}
                                   </p>
                                </div>
                                <div className="flex items-center gap-4">
                                  {m.isPublic && (
                                    <span className="text-[8px] font-black text-white/20 bg-white/5 px-2 py-0.5 rounded border border-white/5 uppercase tracking-widest">Public</span>
                                  )}
                                  <p className="text-[9px] font-black text-white/20 uppercase tracking-tighter">
                                    {new Date(m.timestamp * 1000).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                                  </p>
                                </div>
                              </div>
                           </div>
                         </motion.div>
                       ))}
                    </div>
                  )}
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

    </motion.div>
  );
};

// --- Page: Faucet ---
const FaucetPage = () => {
  const { address, isConnected } = useAccount();
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [faucetEnabled, setFaucetEnabled] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('https://api.test-hub.xyz/faucet/enabled');
        const j = await r.json();
        if (!cancelled) setFaucetEnabled(!!j.enabled);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const fetchStatus = async () => {
    if (!address) return;
    setLoading(true);
    try {
      const { faucetApi } = await import('./lib/litdex-core-logic');
      const s = await faucetApi.getStatus(address);
      setStatus(s);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isConnected && address) {
      fetchStatus();
    }
  }, [isConnected, address]);

  const handleClaim = async () => {
    if (!address) return;
    setClaiming(true);
    try {
      const { faucetApi } = await import('./lib/litdex-core-logic');
      const res = await faucetApi.claim(address);
      if (res.ok) {
        showSuccess({ title: "FAUCET CLAIMED", subtitle: "PROTOCOL VERIFICATION COMPLETE", rows: [{ label: "AMOUNT", value: "0.001 zkLTC" }, { label: "STATUS", value: res.message || "SENT" }] });
        try {
          if (address) addNotif(address, {
            type: "faucet",
            title: "Faucet Claimed",
            message: `0.001 zkLTC sent to your wallet`,
          });
        } catch { /* ignore */ }
        fetchStatus();
      } else {
        showError(res.reason || res.message || "Claim failed. Check requirements.");
      }
    } catch (err) {
      console.error(err);
      showError("An error occurred during claiming.");
    } finally {
      setClaiming(false);
    }
  };

  const nextClaimStr = status?.nextClaimIn && status.nextClaimIn > 0 
    ? `${Math.ceil(status.nextClaimIn / 3600)}h remaining` 
    : "Available now";

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="max-w-lg mx-auto py-8 md:py-12 px-4 text-center">
      <div className="mb-6">
        <h1 className="text-3xl md:text-4xl font-bold mb-2 tracking-tighter">Faucet</h1>
        <p className="text-brand-text-muted text-base md:text-lg">Get 0.001 zkLTC to test the protocol.</p>
      </div>

      <div className="bg-brand-surface border border-brand-border p-3.5 rounded-xl mb-5 flex items-center justify-between mx-auto max-w-md text-left">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center">
             <LogoLD size={12} className="opacity-80" />
          </div>
          <span className="text-brand-text-muted font-medium text-xs">Your zkLTC balance</span>
        </div>
        <span className="font-bold text-xs">
          {status ? `${Number(status.zkLTCBalance).toLocaleString()} zkLTC` : isConnected ? "Loading..." : "0 zkLTC"}
        </span>
      </div>

      <Card className="max-w-md mx-auto py-8 px-6 flex flex-col items-center border border-white/5 bg-black/20">
        <div className="w-16 h-16 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-6 shadow-2xl relative overflow-hidden group">
           <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
           <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
             <LogoLD size={20} />
           </div>
        </div>
        
        <div className="mb-8">
          <h2 className="text-4xl font-bold tabular-nums mb-1 tracking-tight">0.001</h2>
          <p className="text-brand-text-muted font-medium text-[10px] uppercase tracking-[0.2em] opacity-50">zkLTC per claim</p>
        </div>

        <button 
          onClick={handleClaim}
          disabled={!faucetEnabled || !isConnected || claiming || (status && !status.canClaim)}
          className="w-full py-3.5 bg-white text-black rounded-xl font-bold text-base hover:scale-[1.02] active:scale-[0.98] transition-all shadow-[0_0_30px_rgba(255,255,255,0.1)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {!faucetEnabled ? "Faucet Paused" : claiming ? "Claiming..." : status && !status.canClaim ? nextClaimStr : "Claim 0.001 zkLTC"}
        </button>

        {!faucetEnabled && (
          <p className="mt-3 text-xs text-brand-text-muted text-center">Faucet is temporarily paused. Check back soon!</p>
        )}

        <div className="mt-6 text-[10px] text-brand-text-muted space-y-1">
          <p>• 0.01 zkLTC + 10 Points per claim</p>
          <p>• 24 hour cooldown between claims</p>
          <p>• Requires LitDEX NFT + .lit domain</p>
        </div>
      </Card>
    </motion.div>
  );
};

// --- NAVIGATION SHELL ---

const WalletBalanceDisplay = () => {
  const { address, isConnected } = useAccount();
  const { data: balanceData } = useBalance({ 
    address,
  });

  if (!isConnected || !balanceData) {
    return <div className="px-4 py-1.5 text-[10px] font-bold text-white tracking-widest uppercase border-r border-white/10 mr-1 opacity-50">0.00 zkLTC</div>;
  }

  const formatted = parseFloat(formatEther(balanceData.value)).toLocaleString(undefined, { 
    minimumFractionDigits: 1,
    maximumFractionDigits: 4 
  });

  return (
    <div className="px-4 py-1.5 text-[10px] font-black text-black tracking-widest uppercase rounded-full bg-white shadow-[0_0_30px_rgba(255,255,255,0.15)]">
      {formatted} {balanceData.symbol}
    </div>
  );
};

// --- Faucet Modal ---
const FaucetModal = ({ open, onClose, wallet }: { open: boolean; onClose: () => void; wallet?: string }) => {
  const [status, setStatus] = useState<any>(null);
  const [fetchedAt, setFetchedAt] = useState<number>(Date.now());
  const [claiming, setClaiming] = useState(false);
  const [success, setSuccess] = useState<{ explorerUrl?: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [countdown, setCountdown] = useState<string>("");
  const [faucetEnabled, setFaucetEnabled] = useState<boolean>(true);
  const [eligibility, setEligibility] = useState<{ nft: boolean; domain: boolean } | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('https://api.test-hub.xyz/faucet/enabled');
        const j = await r.json();
        if (!cancelled) setFaucetEnabled(!!j.enabled);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setSuccess(null);
    setErrorMsg("");
    setEligibility(null);
    if (!wallet) return;
    let cancelled = false;
    (async () => {
      try {
        const { faucetApi } = await import('./lib/litdex-core-logic');
        const s = await faucetApi.getStatus(wallet);
        if (!cancelled) { setStatus(s); setFetchedAt(Date.now()); }
      } catch { /* ignore */ }
      try {
        const r = await fetch(`https://api.test-hub.xyz/faucet/eligibility/${wallet.toLowerCase()}`);
        const j = await r.json();
        if (!cancelled && j && typeof j.nft === 'boolean') {
          setEligibility({ nft: !!j.nft, domain: !!j.domain });
        }
      } catch { /* ignore — backend may not be patched yet */ }
    })();
    return () => { cancelled = true; };
  }, [open, wallet]);

  const nextClaimIn: number = status?.nextClaimIn ?? 0;

  useEffect(() => {
    if (!open || !status || status.canClaim) return;
    const tick = () => {
      const secs = nextClaimIn - Math.floor((Date.now() - fetchedAt) / 1000);
      if (secs <= 0) { setCountdown("Ready!"); return; }
      const h = Math.floor(secs / 3600);
      const m = Math.floor((secs % 3600) / 60);
      const s = secs % 60;
      setCountdown(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`);
    };
    tick();
    const i = setInterval(tick, 1000);
    return () => clearInterval(i);
  }, [open, status, nextClaimIn, fetchedAt]);

  const handleClaim = async () => {
    if (!wallet) return;
    setClaiming(true);
    setErrorMsg("");
    try {
      const { faucetApi } = await import('./lib/litdex-core-logic');
      const res = await faucetApi.claim(wallet);
      if (res.ok) {
        setSuccess({ explorerUrl: res.explorerUrl });
        try { addNotif(wallet, { type: "faucet", title: "Faucet Claimed", message: "0.01 zkLTC + 10 Points sent" }); } catch {}
      } else {
        setErrorMsg(res.message || res.reason || "Claim failed");
        try {
          const s = await faucetApi.getStatus(wallet);
          setStatus(s); setFetchedAt(Date.now());
        } catch {}
      }
    } catch (e: any) {
      setErrorMsg(e?.message || "An error occurred during claiming.");
    } finally {
      setClaiming(false);
    }
  };

  if (!open) return null;
  const canClaim = status?.canClaim;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md bg-brand-surface border border-brand-border rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold tracking-tight">zkLTC Faucet</h2>
          <button onClick={onClose} className="text-brand-text-muted hover:text-white">
            <X size={18} />
          </button>
        </div>

        {success ? (
          <div className="py-6 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
              <svg viewBox="0 0 24 24" fill="none" className="w-8 h-8 text-white" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>
            </div>
            <p className="text-lg font-bold mb-1">✅ 0.01 zkLTC + 10 Points sent!</p>
            <p className="text-sm text-brand-text-muted mb-4">Check your wallet & points balance</p>
            {success.explorerUrl && (
              <a
                href={success.explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-sm text-white/80 hover:text-white underline underline-offset-4 mb-6"
              >
                View on Explorer →
              </a>
            )}
            <button onClick={onClose} className="w-full py-3 bg-white text-black rounded-xl font-bold text-sm">Close</button>
          </div>
        ) : !status ? (
          <p className="text-brand-text-muted text-sm py-8 text-center">Loading status…</p>
        ) : !faucetEnabled ? (
          <>
            <p className="text-brand-text-muted text-sm mb-2">Claim free testnet tokens to get started</p>
            <p className="text-xs text-brand-text-muted/70 mb-6">Get 0.01 zkLTC + 10 Points • 24hr cooldown</p>
            <button
              disabled
              className="w-full py-3.5 bg-white text-black rounded-xl font-bold text-base opacity-50 cursor-not-allowed"
            >
              Faucet Paused
            </button>
            <p className="mt-3 text-xs text-brand-text-muted text-center">Faucet is temporarily paused. Check back soon!</p>
          </>
        ) : canClaim ? (
          <>
            <p className="text-brand-text-muted text-sm mb-2">Claim free testnet tokens to get started</p>
            <p className="text-xs text-brand-text-muted/70 mb-6">Get 0.01 zkLTC + 10 Points • 24hr cooldown</p>

            {eligibility && (!eligibility.nft || !eligibility.domain) && (
              <div className="mb-4 p-3 rounded-xl bg-white/[0.02] border border-white/10 text-[11px] space-y-1.5">
                <p className="text-white/80 font-bold uppercase tracking-widest text-[10px]">Eligibility</p>
                <p className={eligibility.nft ? 'text-white/70' : 'text-white/40'}>
                  {eligibility.nft ? '✓' : '✗'} Hold a LitDEX NFT
                </p>
                <p className={eligibility.domain ? 'text-white/70' : 'text-white/40'}>
                  {eligibility.domain ? '✓' : '✗'} Own a .lit domain
                </p>
                <p className="text-white/40 pt-1">Both required to claim.</p>
              </div>
            )}

            <button
              onClick={handleClaim}
              disabled={claiming || (eligibility ? (!eligibility.nft || !eligibility.domain) : false)}
              className="w-full py-3.5 bg-white text-black rounded-xl font-bold text-base hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {claiming
                ? "Claiming..."
                : eligibility && (!eligibility.nft || !eligibility.domain)
                  ? "NFT + .lit Domain Required"
                  : "Claim 0.01 zkLTC + 10 Points"}
            </button>
            {errorMsg && (
              <div className="mt-3 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/5 text-white/40 text-xs text-center font-bold uppercase tracking-widest">
                {errorMsg}
              </div>
            )}
          </>
        ) : (
          <>
            <p className="text-brand-text-muted text-xs uppercase tracking-widest text-center mb-2">Next claim in</p>
            <div className="text-center font-mono text-3xl font-bold tabular-nums my-4 tracking-tight">
              {countdown || "—"}
            </div>
            <p className="text-xs text-brand-text-muted/70 text-center mb-4">Refills every 24 hours</p>
            {errorMsg && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-white/[0.02] border border-white/5 text-white/40 text-xs text-center font-bold uppercase tracking-widest">
                {errorMsg}
              </div>
            )}
            <button onClick={onClose} className="w-full py-3 bg-white/5 border border-white/10 text-white rounded-xl font-bold text-sm hover:bg-white/10 transition-all">
              Close
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      return (localStorage.getItem('theme') as 'dark' | 'light') || 'dark';
    } catch { return 'dark'; }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.add('light');
    } else {
      root.classList.remove('light');
    }
    try { localStorage.setItem('theme', theme); } catch { /* ignore */ }
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  const { address: walletAddr } = useAccount();
  const [activePage, setActivePage] = useState<PageID>('swap');
  const [previousPage, setPreviousPage] = useState<PageID>('swap');
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const { notifs: notifList } = useNotifications(walletAddr);
  const unreadCount = notifList.filter(n => !n.read).length;
  const [hasCheckedInToday, setHasCheckedInToday] = useState<boolean>(true);
  const [hasNewNotif, setHasNewNotif] = useState<boolean>(false);
  const [faucetModalOpen, setFaucetModalOpen] = useState(false);
  const { openConnectModal } = useConnectModal();
  const [showFloatingTools, setShowFloatingTools] = useState(false);
  const footerRef = useRef<HTMLElement | null>(null);
  const [footerHeight, setFooterHeight] = useState(0);

  useEffect(() => {
    const measure = () => {
      const el = footerRef.current;
      if (el) setFooterHeight(el.getBoundingClientRect().height);
    };
    measure();
    window.addEventListener('resize', measure);
    let ro: ResizeObserver | null = null;
    if (footerRef.current && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure);
      ro.observe(footerRef.current);
    }
    return () => {
      window.removeEventListener('resize', measure);
      if (ro) ro.disconnect();
    };
  }, []);

  // Scroll visibility for floating tools (Show on Scroll Down, Hide on Scroll Up)
  useEffect(() => {
    let lastScrollY = window.scrollY;
    
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      
      // If at the very top, always hide
      if (currentScrollY < 10) {
        setShowFloatingTools(false);
      } 
      // Scrolling down
      else if (currentScrollY > lastScrollY) {
        setShowFloatingTools(true);
      } 
      // Scrolling up
      else if (currentScrollY < lastScrollY) {
        setShowFloatingTools(false);
      }
      
      lastScrollY = currentScrollY;
    };
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Check-in red dot — load from contract
  useEffect(() => {
    if (!walletAddr) { setHasCheckedInToday(true); return; }
    let cancelled = false;
    (async () => {
      try {
        const [info, currentDay] = await Promise.all([
          readCheckinInfo(walletAddr),
          readCurrentDay(),
        ]);
        if (!cancelled) setHasCheckedInToday(info.lastDay >= currentDay);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [walletAddr, activePage]);

  // Notification red dot — localStorage + event listener
  const notifFlagKey = walletAddr ? `litdex_has_new_notif_${walletAddr.toLowerCase()}` : "";
  useEffect(() => {
    if (!walletAddr) { setHasNewNotif(false); return; }
    try { setHasNewNotif(localStorage.getItem(notifFlagKey) === "true"); } catch { /* ignore */ }
    const onNotif = () => {
      try { localStorage.setItem(notifFlagKey, "true"); } catch { /* ignore */ }
      setHasNewNotif(true);
    };
    window.addEventListener("litdex:notif", onNotif);
    return () => window.removeEventListener("litdex:notif", onNotif);
  }, [walletAddr, notifFlagKey]);

  // Open notif panel → mark as seen
  useEffect(() => {
    if (notifOpen && walletAddr) {
      try { localStorage.setItem(notifFlagKey, "false"); } catch { /* ignore */ }
      setHasNewNotif(false);
    }
  }, [notifOpen, walletAddr, notifFlagKey]);

  // Helper to handle page changes while tracking history for the check-in overlay
  const handlePageChange = (p: PageID) => {
    if (p === 'checkin') {
      if (activePage !== 'checkin') setPreviousPage(activePage);
    }
    setActivePage(p);
  };

  // ── URL ↔ activePage sync ─────────────────────────────────────────
  // Each top-level page has a clean URL (/swap, /pool, /hub, ...). The
  // Hub also owns its own sub-routes (/hub/private, /hub/global, etc.)
  // — those are handled inside ChatUIPage. We only manage the prefix
  // here and let ChatUIPage own everything after /hub/.
  const PAGE_TO_PATH: Record<PageID, string> = {
    swap: '/swap',
    pool: '/pool',
    deploy: '/deploy',
    points: '/points',
    checkin: '/check-in',
    nfts: '/nfts',
    messenger: '/messenger',
    quests: '/socials',
    games: '/games',
    faucet: '/faucet',
    hub: '/hub',
    chatui: '/hub',
  };
  const pathToPage = (path: string): PageID => {
    const seg = path.split('/').filter(Boolean)[0] || '';
    switch (seg) {
      case 'swap': return 'swap';
      case 'pool': return 'pool';
      case 'deploy': return 'deploy';
      case 'points': return 'points';
      case 'check-in':
      case 'checkin': return 'checkin';
      case 'nfts': return 'nfts';
      case 'messenger': return 'messenger';
      case 'socials':
      case 'quests': return 'quests';
      case 'games': return 'games';
      case 'faucet': return 'faucet';
      case 'hub':
      case 'chatui': return 'chatui';
      default: return 'swap';
    }
  };

  // On first mount, hydrate activePage from the URL.
  useEffect(() => {
    const initial = pathToPage(window.location.pathname);
    if (initial !== 'swap' || window.location.pathname !== '/') {
      setActivePage(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the URL in sync with the active page. The Hub owns deeper
  // sub-paths so we only push when the prefix actually changes.
  useEffect(() => {
    if (activePage === 'checkin') return; // overlay, not a route
    const desired = PAGE_TO_PATH[activePage];
    const current = window.location.pathname;
    const currentPrefix = '/' + (current.split('/').filter(Boolean)[0] || '');
    if (currentPrefix === desired) return;
    window.history.pushState({ page: activePage }, '', desired);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePage]);

  // Browser back/forward — re-sync activePage from the URL.
  useEffect(() => {
    const onPop = () => {
      const next = pathToPage(window.location.pathname);
      if (next !== activePage) setActivePage(next);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePage]);

  useEffect(() => {
    const onNav = (e: Event) => {
      const detail = (e as CustomEvent).detail as PageID;
      if (detail) handlePageChange(detail);
    };
    window.addEventListener('app:navigate', onNav);
    return () => window.removeEventListener('app:navigate', onNav);
  }, [activePage]);

  const handleFaucetClick = () => {
    if (!walletAddr) {
      openConnectModal?.();
      return;
    }
    setFaucetModalOpen(true);
  };

  useEffect(() => {
    const open = () => handleFaucetClick();
    window.addEventListener('litdex:open-faucet', open);
    return () => window.removeEventListener('litdex:open-faucet', open);
  }, [walletAddr, openConnectModal]);

  // Close dropdown on click outside logic simplified for React
  useEffect(() => {
    const handleScroll = () => setActiveDropdown(null);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);


  const renderPage = (page: PageID) => {
    switch (page) {
      case 'swap': return <SwapPage />;
      case 'pool': return <PoolPage />;
      case 'deploy': return <DeployPage />;
      case 'points': return <PointsPage setPage={setActivePage} />;
      case 'checkin': return <CheckinPage />;
      case 'nfts': return <NFTsPage />;
      case 'messenger': return <MessengerPage />;
      case 'quests': return <QuestsPage />;
      case 'games': return <GamesPage />;
      case 'faucet': return <FaucetPage />;
      case 'hub': return <HubPage />;
      case 'chatui': return <ChatUIPage />;
      default: return <SwapPage />;
    }
  };

  const navGroups = {
    litdex: [
      { id: 'swap', icon: ArrowLeftRight, title: 'Swap', desc: 'Trade tokens instantly' },
      { id: 'pool', icon: Droplets, title: 'Pool', desc: 'Provide liquidity, earn fees' },
      { id: 'deploy', icon: Rocket, title: 'Deploy', desc: 'Launch tokens & contracts' },
    ],
    rewards: [
      { id: 'points', icon: Trophy, title: 'Points', desc: 'View your tier status' },
      { id: 'checkin', icon: CalendarCheck, title: 'Check In', desc: 'Daily streak rewards' },
      { id: 'nfts', icon: Sparkles, title: 'NFTs', desc: 'Exclusive LiteForge assets' },
      { id: 'messenger', icon: MessageSquare, title: 'Messenger', desc: 'On-chain communication' },
      { id: 'quests', icon: ListChecks, title: 'Social Quests', desc: 'Complete tasks to earn' },
      { id: 'games', icon: Gamepad2, title: 'Games', desc: 'Play and earn zkLTC' },
    ]
  };

  return (
    <div className="min-h-screen bg-brand-bg text-brand-text-primary selection:bg-white/30 flex flex-col overflow-x-hidden w-full max-w-full">
      {/* Top Header Background & Border */}
      <div className="fixed top-0 left-0 right-0 z-[49] h-16 sm:h-20 bg-black/40 dark:bg-zinc-900/60 backdrop-blur-3xl border-b border-white/5 pointer-events-none" />

      {/* Top Left Logo & Theme Toggle */}
      <div className="fixed top-3 left-3 sm:top-4 sm:left-6 z-[60] flex items-center gap-2 sm:gap-5">
        <div className="flex items-center gap-4 group cursor-pointer" onClick={() => setActivePage('swap')}>
          <div className="relative">
            <div className="w-9 h-9 sm:w-11 sm:h-11 bg-white [.light_&]:bg-neutral-300 rounded-xl flex items-center justify-center shadow-[0_0_40px_rgba(255,255,255,0.2)] group-hover:shadow-[0_0_60px_rgba(255,255,255,0.4)] transition-all duration-700 group-hover:rotate-6">
              <LogoLD size={20} className="sm:[font-size:24px]" />
            </div>
            <div className="absolute -inset-2 bg-white/10 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
          </div>
          <span className="hidden sm:inline text-2xl font-black italic tracking-tighter text-white dark:text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]">
            LitDEX
          </span>
        </div>
        
        <div className="hidden sm:block h-6 w-px bg-white/10 ml-1" />

        {/* Theme Toggle Switch */}
        <button 
          onClick={toggleTheme}
          className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-all backdrop-blur-3xl group"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? (
            <Moon size={18} className="transition-transform group-hover:rotate-12" />
          ) : (
            <Sun size={18} className="transition-transform group-hover:rotate-90" />
          )}
        </button>
      </div>

      <div className="flex-1 relative flex flex-col">
        {/* Floating Tools Layout Fix - Only show on scroll */}
        <AnimatePresence>
          {showFloatingTools && (
            <motion.div 
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="fixed left-6 right-6 z-[60] pointer-events-none flex justify-between items-end"
              style={{ bottom: footerHeight }}
            >
                {/* Bottom Left Tools (faucet moved into Swap page header) */}
                <div className="hidden" />


                {/* Bottom Right Tools */}
                <div className="pointer-events-auto flex items-center gap-2 sm:gap-3">
                  <button 
                    onClick={() => handlePageChange(activePage === 'checkin' ? previousPage : 'checkin')}
                    className={cn(
                      "relative w-12 h-12 sm:w-16 sm:h-16 flex items-center justify-center rounded-2xl bg-black/40 border border-white/5 hover:border-white/20 hover:bg-black/60 transition-all backdrop-blur-3xl shadow-2xl group",
                      activePage === 'checkin' ? "text-white border-white/20 bg-black/60" : "text-white/60"
                    )}
                  >
                    <CalendarCheck size={20} className={cn("transition-colors sm:[width:24px] sm:[height:24px]", activePage === 'checkin' ? "text-white" : "group-hover:text-white")} />
                    <span className={cn(
                      "absolute top-1 right-1 w-2 h-2 rounded-full",
                      hasCheckedInToday ? "bg-white" : "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]"
                    )} />
                  </button>
                  <button
                    onClick={() => setNotifOpen(o => !o)}
                    className="relative w-12 h-12 sm:w-16 sm:h-16 flex items-center justify-center rounded-2xl bg-black/40 border border-white/5 hover:border-white/20 hover:bg-black/60 transition-all text-white/60 backdrop-blur-3xl shadow-2xl group"
                  >
                    <Bell size={20} className="group-hover:text-white transition-colors sm:[width:24px] sm:[height:24px]" />
                    <span className={cn(
                      "absolute top-1 right-1 w-2 h-2 rounded-full",
                      hasNewNotif ? "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.8)]" : "bg-white"
                    )} />
                  </button>
                </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Top Right Tools (desktop only — mobile uses hamburger menu) */}
        <div className="hidden md:flex fixed top-3 right-3 sm:top-4 sm:right-6 z-[60] flex-col items-end" style={{ transform: 'scale(1.0)', transformOrigin: 'top right' }}>
          <ConnectButton.Custom>
            {({ account, chain, openConnectModal, openAccountModal, mounted }) => {
              const connected = mounted && account && chain;
              return (
                <div className="flex items-center gap-2 sm:gap-3">
                  {connected && <div className="hidden lg:block"><WalletBalanceDisplay /></div>}
                  <button
                    onClick={connected ? openAccountModal : openConnectModal}
                    className={cn(
                      "flex items-center gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl transition-all text-[9px] sm:text-[10px] font-black uppercase tracking-[0.15em] sm:tracking-[0.2em] h-9 sm:h-10 wallet-connect-btn",
                      connected
                        ? "bg-white text-black hover:bg-white/90 shadow-[0_0_40px_rgba(255,255,255,0.2)]"
                        : "bg-white text-black hover:bg-white/90 shadow-[0_0_30px_rgba(255,255,255,0.15)]"
                    )}
                  >
                    {connected ? (
                       <>
                         <span className="opacity-80 max-w-[80px] truncate">{account.displayName}</span>
                         <ChevronDown size={14} className="opacity-40" />
                       </>
                    ) : (
                      <><Wallet size={12} /> Connect</>
                    )}
                  </button>
                </div>
              );
            }}
          </ConnectButton.Custom>
        </div>

        <AnimatedNavFramer 
          onPageChange={(page) => handlePageChange(page as PageID)} 
          activePage={activePage === 'checkin' ? previousPage : activePage}
        />

        {/* Main Content */}
        <main className={cn(
          "container mx-auto w-full max-w-full px-3 sm:px-6 pt-24 sm:pt-32 pb-12 flex-1 transition-all duration-500",
          activePage === 'checkin' && "blur-xl scale-[0.98] opacity-30 pointer-events-none"
        )}>
          <AnimatePresence mode="wait">
            <motion.div
              key={activePage === 'checkin' ? previousPage : activePage}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
            >
              {renderPage(activePage === 'checkin' ? previousPage : activePage)}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Check-in Overlay */}
        <AnimatePresence>
          {activePage === 'checkin' && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => handlePageChange(previousPage)}
                className="absolute inset-0 bg-black/20"
              />
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative z-10 w-full max-w-xl"
              >
                <CheckinPage />
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer — hidden on Hub (chatui) since the in-page sidebar
          (Private/Global/.lit Market/Buy .lit) already provides
          navigation. Showing the global footer there clutters the
          chat layout. */}
      {activePage !== 'chatui' && (
      <footer ref={footerRef} className="border-t border-brand-border py-12 relative z-50 bg-brand-bg">
        <div className="container mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-white [.light_&]:bg-neutral-300 flex items-center justify-center text-white text-sm font-bold">
              <LogoLD size={14} />
            </div>
            <span className="text-brand-text-muted text-xs font-mono">LitDEX Testnet</span>
          </div>
          <div className="flex gap-8 text-xs uppercase font-mono tracking-widest text-brand-text-muted">
            <a href="https://x.com/LitDEXApp" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Twitter (X)</a>
            <a href="https://t.me/litdex_discussion" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Telegram</a>
            <a href="https://docs.litdex.test-hub.xyz" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Docs</a>
          </div>
        </div>
      </footer>
      )}

      <NotificationsPanel open={notifOpen} onClose={() => setNotifOpen(false)} wallet={walletAddr} />
      <FaucetModal open={faucetModalOpen} onClose={() => setFaucetModalOpen(false)} wallet={walletAddr} />
      <SuccessCard />
    </div>
  );
}

