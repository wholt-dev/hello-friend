// components/animated-nav-framer.tsx
"use client";

import * as React from "react";
import { motion, useScroll, useMotionValueEvent, AnimatePresence, Variants } from "framer-motion";
import { Navigation, Menu, X, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConnectButton } from "@rainbow-me/rainbowkit";

type NavItem = { name: string; id: string; locked?: boolean };

const navItems: NavItem[] = [
  { name: "Swap", id: "swap" },
  { name: "Pool", id: "pool" },
  { name: "Deploy", id: "deploy" },
  { name: "Points", id: "points" },
  { name: "NFTs", id: "nfts" },
  { name: "Messenger", id: "messenger" },
  { name: "Socials", id: "quests" },
  { name: "Games", id: "games" },
];

const EXPAND_SCROLL_THRESHOLD = 80;

const containerVariants: Variants = {
  expanded: {
    y: 0,
    opacity: 1,
    width: "auto",
    transition: {
      y: { type: "spring", damping: 20, stiffness: 300 },
      opacity: { duration: 0.2 },
      width: { type: "spring", damping: 25, stiffness: 300 },
      staggerChildren: 0.05,
      delayChildren: 0.1,
    } as any,
  },
  collapsed: {
    y: 0,
    opacity: 1,
    width: "4rem",
    transition: {
      type: "spring",
      damping: 25,
      stiffness: 400,
      when: "afterChildren",
      staggerChildren: 0.03,
      staggerDirection: -1,
    } as any,
  },
};

const logoVariants: Variants = {
  expanded: { opacity: 1, x: 0, rotate: 0, transition: { type: "spring", damping: 15 } as any },
  collapsed: { opacity: 0, x: -10, rotate: -90, transition: { duration: 0.2 } as any },
};

const itemVariants: Variants = {
  expanded: { opacity: 1, x: 0, scale: 1, transition: { type: "spring", damping: 20 } as any },
  collapsed: { opacity: 0, x: -10, scale: 0.8, transition: { duration: 0.15 } as any },
};

const collapsedIconVariants: Variants = {
    expanded: { opacity: 0, scale: 0.8, transition: { duration: 0.2 } as any },
    collapsed: { 
      opacity: 1, 
      scale: 1,
      transition: {
        type: "spring",
        damping: 15,
        stiffness: 300,
        delay: 0.15,
      } as any
    },
}

export function AnimatedNavFramer({ activePage, onPageChange }: { activePage: string, onPageChange: (id: any) => void }) {
  const isTouchDevice = React.useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(hover: none) and (pointer: coarse)").matches,
    []
  );
  const [isExpanded, setExpanded] = React.useState(!isTouchDevice);
  const [isMenuOpen, setMenuOpen] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  
  const { scrollY } = useScroll();
  const lastScrollY = React.useRef(0);
  const scrollPositionOnCollapse = React.useRef(0);

  useMotionValueEvent(scrollY, "change", (latest) => {
    if (isTouchDevice) {
      lastScrollY.current = latest;
      return;
    }
    const previous = lastScrollY.current;
    
    if (isExpanded && latest > previous && latest > 150) {
      setExpanded(false);
      scrollPositionOnCollapse.current = latest; 
    } 
    else if (!isExpanded && latest < previous && (scrollPositionOnCollapse.current - latest > EXPAND_SCROLL_THRESHOLD)) {
      setExpanded(true);
    }
    
    lastScrollY.current = latest;
  });

  const handleNavClick = (e: React.MouseEvent) => {
    if (!isExpanded) {
      e.preventDefault();
      setExpanded(true);
    }
  };


  return (
    <>
    {/* Desktop nav — hidden only on actual touch devices below 768px */}
    <div className="litdex-desktop-nav fixed top-4 left-1/2 -translate-x-1/2 z-[9999] w-auto max-w-[90vw] md:max-w-none">
      <motion.nav
        initial={{ y: -80, opacity: 0 }}
        animate={isExpanded ? "expanded" : "collapsed"}
        variants={containerVariants}
        whileHover={!isExpanded ? { scale: 1.1 } : {}}
        whileTap={!isExpanded ? { scale: 0.95 } : {}}
        onClick={handleNavClick}
        className={cn(
          "flex items-center overflow-hidden rounded-full border bg-black/40 dark:bg-zinc-900/90 shadow-2xl dark:shadow-[0_0_20px_rgba(0,0,0,0.5)] backdrop-blur-xl h-14 sm:h-16 border-white/5 dark:border-white/10 px-2 sm:px-4",
          !isExpanded && "cursor-pointer justify-center"
        )}
      >
        <motion.div
          variants={logoVariants}
          className="flex-shrink-0 flex items-center font-bold pl-5 pr-3 text-white"
        >
          <Navigation className="h-6 w-6" />
        </motion.div>
        
        <motion.div
          className={cn(
            "flex items-center gap-1 sm:gap-2 pr-3 overflow-x-auto no-scrollbar scroll-smooth",
            !isExpanded && "pointer-events-none overflow-hidden" 
          )}
        >
          {navItems.map((item) => (
            <motion.button
              key={item.id}
              variants={itemVariants}
              onClick={(e) => {
                  e.stopPropagation();
                  if (item.locked) return;
                  onPageChange(item.id);
                  if (isTouchDevice) setExpanded(false);
              }}
              className={cn(
                "relative text-[10px] sm:text-[11px] font-bold uppercase tracking-[0.15em] sm:tracking-[0.2em] transition-all px-3 py-2 whitespace-nowrap rounded-lg flex items-center gap-1.5",
                activePage === item.id ? "text-white" : "text-brand-text-muted hover:text-white",
                item.locked && "cursor-default opacity-50 grayscale"
              )}
            >
              {activePage === item.id && (
                <motion.div 
                  layoutId="nav-pill"
                  className="absolute inset-0 bg-white/10 rounded-lg -z-10"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
              {item.name}
              {item.locked && <Lock size={10} className="opacity-40" />}
            </motion.button>
          ))}
        </motion.div>
        
        <div className="absolute inset-x-0 inset-y-0 flex items-center justify-center pointer-events-none">
          <motion.div
            variants={collapsedIconVariants}
            animate={isExpanded ? "expanded" : "collapsed"}
            className="text-white"
          >
            <Menu className="h-5 w-5" />
          </motion.div>
        </div>
      </motion.nav>
    </div>

    <button
      onClick={() => setMobileOpen(true)}
      aria-label="Open menu"
      className="litdex-mobile-hamburger fixed top-4 right-4 z-[9999] w-12 h-12 rounded-full bg-white/80 dark:bg-black/60 border border-black/10 dark:border-white/10 backdrop-blur-xl items-center justify-center text-gray-900 dark:text-white shadow-2xl"
    >
      <Menu className="h-5 w-5" />
    </button>

    {/* Mobile slide-in menu */}
    <AnimatePresence>
      {mobileOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="litdex-mobile-menu fixed inset-0 z-[10000] bg-white dark:bg-black backdrop-blur-xl flex-col"
          onClick={() => setMobileOpen(false)}
        >
          <div className="flex justify-end p-4">
            <button
              onClick={(e) => { e.stopPropagation(); setMobileOpen(false); }}
              aria-label="Close menu"
              className="w-11 h-11 rounded-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 flex items-center justify-center text-gray-900 dark:text-white"
            >
              <X size={22} />
            </button>
          </div>
          <div
            className="flex-1 flex flex-col items-center justify-center gap-5 px-6"
            onClick={(e) => e.stopPropagation()}
          >
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  if (item.locked) return;
                  onPageChange(item.id);
                  setMobileOpen(false);
                }}
                className={cn(
                  "text-2xl font-bold uppercase tracking-[0.2em] flex items-center gap-3 transition-colors",
                  activePage === item.id
                    ? "text-black dark:text-white font-bold"
                    : "text-gray-900 dark:text-white/50",
                  item.locked && "opacity-40 grayscale cursor-default"
                )}
              >
                {item.name}
                {item.locked && <Lock size={16} className="opacity-40" />}
              </button>
            ))}
          </div>
          <div
            className="p-6 border-t border-black/10 dark:border-white/10 flex justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <ConnectButton />
          </div>
        </motion.div>
      )}
    </AnimatePresence>

    {/* Simple Overlay Menu (just for effect when clicking 3 lines) */}
    <AnimatePresence>
        {isMenuOpen && isExpanded && (
            <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="fixed inset-0 z-[60] bg-black/90 backdrop-blur-xl flex flex-col items-center justify-center pointer-events-auto"
                onClick={() => setMenuOpen(false)}
            >
                <div className="absolute top-8 right-8">
                    <button className="text-white hover:rotate-90 transition-transform"><X size={32} /></button>
                </div>
                <div className="flex flex-col gap-8 text-center">
                    {navItems.map((item) => (
                        <button 
                            key={item.id} 
                            onClick={(e) => {
                                e.stopPropagation();
                                if (item.locked) return;
                                onPageChange(item.id);
                                setMenuOpen(false);
                            }}
                            className={cn(
                                "text-4xl font-bold tracking-tighter uppercase hover:scale-110 transition-transform flex items-center justify-center gap-4",
                                activePage === item.id ? "text-white" : "text-brand-text-muted",
                                item.locked && "opacity-30 grayscale cursor-default scale-90 hover:scale-90"
                            )}
                        >
                            {item.name}
                            {item.locked && <Lock size={24} className="opacity-40" />}
                        </button>
                    ))}
                </div>
            </motion.div>
        )}
    </AnimatePresence>
    </>
  );
}
