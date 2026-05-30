import { toast } from "sonner";

export type SuccessRow = { label: string; value: string; href?: string };
export type SuccessPayload = {
  title: string;
  subtitle?: string;
  rows: SuccessRow[];
};

export function showSuccess(payload: SuccessPayload) {
  try {
    window.dispatchEvent(new CustomEvent("litdex:success", { detail: payload }));
  } catch { /* ignore */ }
}

export function showError(message: string) {
  try {
    toast.error(message, {
      duration: 4000,
      style: {
        background: "#0F1115",
        border: "1px solid rgba(255,255,255,0.05)",
        color: "#fff",
        borderRadius: "16px",
      },
    });
  } catch { /* ignore */ }
}

export function showInfo(message: string) {
  try {
    toast(message, {
      duration: 3000,
      style: { background: "#161B22", color: "#fff" },
    });
  } catch { /* ignore */ }
}

export function refreshPoints() {
  try {
    window.dispatchEvent(new CustomEvent("litdex:points-refresh"));
  } catch { /* ignore */ }
}

/**
 * Award activity points for swap / pool / deploy / nft mint. The backend
 * (api.test-hub.xyz/activity/award) verifies the tx on chain, enforces
 * the per-day caps and the exact point amounts, and is idempotent per
 * txHash — so calling this is always safe and never inflates rewards.
 *
 * Fire-and-forget: failures are swallowed because the underlying action
 * (the swap/deploy/etc.) has already succeeded. We refresh the points
 * HUD shortly after so the new balance shows up.
 *
 *   awardActivity({ wallet, action: 'swap', txHash })
 *   awardActivity({ wallet, action: 'pool', txHash })
 *   awardActivity({ wallet, action: 'deploy', txHash, meta: { type: 'nft' } })
 *   awardActivity({ wallet, action: 'nft_mint', txHash, meta: { tier: 'litgod' } })
 */
export async function awardActivity(opts: {
  wallet?: string | null;
  action: "swap" | "pool" | "deploy" | "nft_mint";
  txHash?: string | null;
  meta?: Record<string, unknown>;
}): Promise<{ credited: number; capped: boolean } | null> {
  try {
    const wallet = (opts.wallet || "").toLowerCase();
    if (!wallet || !opts.txHash) return null;
    const r = await fetch("https://api.test-hub.xyz/activity/award", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        wallet,
        action: opts.action,
        txHash: opts.txHash,
        meta: opts.meta || {},
      }),
    });
    let out: { credited: number; capped: boolean } | null = null;
    try {
      const d = await r.json();
      out = { credited: Number(d?.credited ?? 0), capped: !!d?.capped };
    } catch { /* ignore parse */ }
    // Give the relayer a moment, then refresh the on-chain points HUD + counts.
    setTimeout(() => {
      try { window.dispatchEvent(new CustomEvent("litdex:points-refresh")); } catch { /* ignore */ }
      try { window.dispatchEvent(new CustomEvent("litdex:activity-refresh")); } catch { /* ignore */ }
    }, 4000);
    return out;
  } catch { return null; }
}

export function shortHex(addr: string, l = 4, r = 4): string {
  if (!addr) return "";
  return `${addr.slice(0, 2 + l)}...${addr.slice(-r)}`;
}
