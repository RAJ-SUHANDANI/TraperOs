export const SYMBOLS = ['BTCUSDT','ETHUSDT','SOLUSDT','XRPUSDT','BNBUSDT','DOGEUSDT','ADAUSDT','LINKUSDT','AVAXUSDT','LTCUSDT'] as const;
export type SymbolName = typeof SYMBOLS[number];
export const INITIAL_CASH = 10_000;
export const RISK_FRACTION = 0.015;
export const MAX_POSITION_FRACTION = 0.20;
export const MAX_TOTAL_EXPOSURE = 0.60;
export const MAX_AGGREGATE_RISK = 0.03;
export const DAILY_LOSS_LIMIT = 0.04;
export const MAX_POSITIONS = 3;
export const DEFAULT_FEE_RATE = 0.001;
export const DEFAULT_SLIPPAGE_RATE = 0.0005;
export const MIN_NET_REWARD_RISK = 1.5;
export const SIGNAL_INTERVAL_MS = 15 * 60 * 1000;
export const MAX_QUOTE_AGE_MS = 1000 * 90;
export const MAX_CANDLE_AGE_MS = 1000 * 60 * 35;
export const TOTAL_DAILY_AI_REQUESTS = 48; // reserve 2 requests under public 50/day limit
export const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'nvidia/nemotron-3-super-120b-a12b:free';
export function isSymbol(value: string): value is SymbolName {
  return (SYMBOLS as readonly string[]).includes(value);
}
export function utcDay(timestamp = Date.now()): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}
