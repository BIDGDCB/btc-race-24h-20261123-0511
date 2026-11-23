# Momentum-breakout BTC bot — btc-race-24h-20261123-0511

[![make.fun · btc-race-24h-20261123-0511](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/BIDGDCB/btc-race-24h-20261123-0511/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511/leaderboard)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/BIDGDCB/btc-race-24h-20261123-0511/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511)

A bot that trades Coinbase Wrapped BTC (cbBTC) against USDC on 1-minute bars,
entered in make.fun's "Race a BTC trading bot live for 24 hours" bounty. It
starts with $1,000 of paper money, trades long only, and speaks the
`agent-fun/bars-replay/v1` protocol: it reads newline-delimited JSON bars on
stdin and answers each batch with buy/sell orders that fill at the next bar's
open.

## Strategy

Momentum breakout with a trend filter and wide stops:

- **Enter long, full size**, when the 5-bar close-to-close return is at least
  +30 bps **and** the latest close sits above the 50-bar EMA of closes. A
  short burst of momentum, confirmed by the medium-term trend.
- **Exit** on a 3% stop-loss from the entry fill price, or a 3% trailing stop
  from the highest close since entry. The stops are wide on purpose: on
  1-minute bars most pullbacks are noise, and a full round trip costs about
  26 bps in fees, slippage and price impact, so exits have to earn their keep.
- **Cooldown**: after an exit, wait 30 bars before re-entering, so a whipsaw
  does not immediately buy the same bounce back.

Everything is deterministic: no randomness, no wall clock, no network, no
files outside this repository. The same bars always produce the same orders.

## Run it

```sh
# Node 22.18+ runs the TypeScript entrypoint directly:
node main.ts
```

The bot is graded on a frozen 24-hour dev window of cbBTC 1-minute bars; it
must finish that window with a net PnL above $0 to race live.

## Layout

- `main.ts` — the bot (strategy + protocol loop entrypoint)
- `vendor/makefun-bars.ts` — the kit's bars-replay SDK shim, copied unchanged
- `LICENSE` — MIT
