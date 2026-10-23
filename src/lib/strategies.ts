import type { Features,Decision } from './types';
export function qualifies(f:Features):boolean {
  return f.score>=4 && f.rsi14<70 && f.rsi14>40 && f.atr14>0 && f.price>f.ema50 && f.volumeRatio>=0.85;
}
export function deterministicDecision(f:Features,candidateId:string):Decision {
  const buy=qualifies(f);
  const stopPct=Math.min(3,Math.max(0.45,1.6*f.atr14/f.price*100));
  const targetPct=Math.min(8,stopPct*2.7);
  return {schema_version:'1.0',candidate_id:candidateId,asset:f.symbol,action:buy?'BUY':'HOLD',
    allocation_pct:buy?20:0,stop_loss_pct:buy?stopPct:0,take_profit_pct:buy?targetPct:0,
    reason:buy?'EMA trend, momentum, volume and volatility filters passed':'Entry filters did not pass',
    invalidation:buy?'Initial ATR stop breached':'No position initiated',
    signal_tags:buy?['uptrend','momentum']:['none']};
}
