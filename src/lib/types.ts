export type Candle = { openTime: number; closeTime: number; open: number; high: number; low: number; close: number; volume: number };
export type Quote = { symbol: string; bid: number; ask: number; receivedAt: number };
export type Features = {
  symbol: string; closedAt: number; price: number; sma20: number; ema20: number; ema50: number;
  rsi14: number; macd: number; macdSignal: number; macdHistogram: number;
  bbUpper: number; bbLower: number; atr14: number; volumeRatio: number;
  support: number; resistance: number; score: number;
};
export type Decision = {
  schema_version: '1.0'; candidate_id: string; asset: string; action: 'BUY' | 'HOLD';
  allocation_pct: number; stop_loss_pct: number; take_profit_pct: number;
  reason: string; invalidation: string; signal_tags: string[];
};
export type Portfolio = {
  id: string; user_id: string; kind: 'ai' | 'rules' | 'challenge'; cash: number;
  initial_cash: number; created_at: string; is_paused: boolean; pause_reason: string | null;
  day_key: string | null; day_start_equity: number; challenge_ends_at: string | null;
};
export type Position = {
  id: string; portfolio_id: string; symbol: string; quantity: number; entry_price: number;
  stop_price: number; target_price: number; entry_fee: number; opened_at: string;
  last_observed_at: string | null; signal_key: string;
};
export type RiskResult = { ok: true; quantity: number; risk: number; stop: number; target: number; notional: number } |
  { ok: false; reason: string };
