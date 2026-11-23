// Momentum-breakout BTC bot for btc-race-24h-20261123-0511.
//
// Strategy (written for this competition, 2026-11-23):
//   - Track the 5-bar close-to-close return of CBBTC and a 50-bar EMA of closes.
//   - Enter long (full cash) when the 5-bar return is at least +30 bps AND the
//     latest close sits above the 50-bar EMA: a short burst of momentum confirmed
//     by the medium-term trend. At most one position, long only, no leverage.
//   - Exit on a 3% stop-loss from the entry fill price, or a 3% trailing stop
//     from the highest close since entry. The stops are wide on purpose: on the
//     1-minute bars of this market most pullbacks are noise, and a round trip
//     costs ~26 bps in fees, slippage and impact, so exits must earn their keep.
//   - After an exit, wait 30 bars before re-entering, so a whipsaw does not
//     immediately buy the same bounce back.
//   - Orders fill at the next bar's open, so every decision uses only closes
//     already seen. No randomness, no clock, no network, no files: the same
//     bars always produce the same orders.
//
// makefun anchor 3110a6036a8c594317908c26f467c778c7e82a3d round 34208258

import { runBars } from './vendor/makefun-bars.ts';
import type { BarsState, Batch } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
// Entry: 5-bar return must clear this many basis points.
const ENTRY_BPS = 30;
// Trend filter: EMA length of closes.
const TREND_LEN = 50;
// Exit: stop-loss and trailing stop, both in basis points.
const STOP_BPS = 300;
const TRAIL_BPS = 300;
// Bars to wait after an exit before a new entry.
const COOLDOWN_BARS = 30;
// Max slippage vs the latest close an order tolerates (bps).
const MAX_SLIP_BPS = 300;

const closes: number[] = [];
let ema50: number | null = null;
let entryPrice = 0; // fill price of the open position, USDC
let peakClose = 0; // highest close since entry, USDC
let lastExitSeq = -1000000;
let pendingBuyId: string | null = null;
let pendingSellId: string | null = null;

function priceOf(state: BarsState, raw: string): number {
  const sym = state.symbols.get(SYMBOL);
  const scale = sym === undefined ? 5 : sym.price_scale;
  return Number(raw) / 10 ** scale;
}

await runBars({
  onBatch(state: BarsState, batch: Batch) {
    const bar = state.latest.get(SYMBOL);
    if (bar === undefined) return [];

    // Settle the fills of the orders decided on the previous batch.
    for (const fill of batch.fills) {
      if (fill.client_id === pendingBuyId) {
        pendingBuyId = null;
        if (fill.status === 'filled') {
          entryPrice = priceOf(state, fill.price);
          peakClose = entryPrice;
        }
      } else if (fill.client_id === pendingSellId) {
        pendingSellId = null;
        if (fill.status === 'filled') lastExitSeq = state.seq;
      }
    }

    const close = priceOf(state, bar.c);
    closes.push(close);
    if (ema50 === null) ema50 = close;
    else ema50 += (close - ema50) * (2 / (TREND_LEN + 1));

    // Warm-up bars build history only; trading on them is rejected anyway.
    if (state.warmingUp) return [];
    // An order decided on this batch is still in flight; wait for its fill.
    if (pendingBuyId !== null || pendingSellId !== null) return [];

    const pos = state.positions.get(SYMBOL);
    const qty = pos === undefined ? 0n : pos.qty;

    if (qty > 0n) {
      if (close > peakClose) peakClose = close;
      const downFromEntryBps = ((entryPrice - close) / entryPrice) * 10000;
      const downFromPeakBps = ((peakClose - close) / peakClose) * 10000;
      if (downFromEntryBps >= STOP_BPS || downFromPeakBps >= TRAIL_BPS) {
        const id = `s${state.seq}`;
        pendingSellId = id;
        return [{ side: 'sell', symbol: SYMBOL, qty, max_slippage_bps: MAX_SLIP_BPS, client_id: id }];
      }
      return [];
    }

    // Flat: look for a momentum entry.
    if (closes.length < 6) return [];
    if (state.seq - lastExitSeq < COOLDOWN_BARS) return [];
    const retBps = ((close - closes[closes.length - 6]) / closes[closes.length - 6]) * 10000;
    const aboveTrend = ema50 !== null && close > ema50;
    if (retBps < ENTRY_BPS || !aboveTrend) return [];

    const room = state.weightRoom(SYMBOL);
    const spend = room < state.cash ? room : state.cash;
    if (spend <= 1000000n) return []; // below the 1 USDC minimum notional
    const id = `b${state.seq}`;
    pendingBuyId = id;
    return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: spend, max_slippage_bps: MAX_SLIP_BPS, client_id: id }];
  },
});
