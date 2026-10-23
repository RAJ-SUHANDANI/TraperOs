import type { Candle, Features } from './types';

export function sma(values: number[], period: number): number {
  if (values.length < period) return NaN;
  return values.slice(-period).reduce((a,b)=>a+b,0)/period;
}
export function emaSeries(values: number[], period: number): number[] {
  if (values.length < period) return [];
  let v = values.slice(0,period).reduce((a,b)=>a+b,0)/period;
  const output = [v];
  const factor = 2/(period+1);
  for (let i=period;i<values.length;i++) { v = values[i]*factor+v*(1-factor); output.push(v); }
  return output;
}
export function rsi(values: number[], period=14): number {
  if(values.length<period+1) return NaN;
  let gain=0,loss=0;
  for(let i=1;i<=period;i++){const d=values[i]-values[i-1];gain+=Math.max(d,0);loss+=Math.max(-d,0);}
  gain/=period;loss/=period;
  for(let i=period+1;i<values.length;i++){const d=values[i]-values[i-1];gain=(gain*(period-1)+Math.max(d,0))/period;loss=(loss*(period-1)+Math.max(-d,0))/period;}
  if(loss===0) return gain===0?50:100;
  return 100-100/(1+gain/loss);
}
export function atr(candles: Candle[], period=14): number {
  if(candles.length<period+1)return NaN;
  const ranges:number[]=[];
  for(let i=1;i<candles.length;i++){const c=candles[i],p=candles[i-1];ranges.push(Math.max(c.high-c.low,Math.abs(c.high-p.close),Math.abs(c.low-p.close)));}
  let current=ranges.slice(0,period).reduce((a,b)=>a+b,0)/period;
  for(let i=period;i<ranges.length;i++)current=(current*(period-1)+ranges[i])/period;
  return current;
}
export function deriveFeatures(symbol:string,candles:Candle[]):Features|null {
  if(candles.length<70 || !candles.every(c=>c.high>=Math.max(c.open,c.close)&&c.low<=Math.min(c.open,c.close)&&c.close>0&&c.volume>=0)) return null;
  const closes=candles.map(c=>c.close), volumes=candles.map(c=>c.volume), last=candles[candles.length-1];
  const fast=emaSeries(closes,12),slow=emaSeries(closes,26);
  const macdValues=fast.slice(fast.length-slow.length).map((v,i)=>v-slow[i]);
  const signal=emaSeries(macdValues,9);
  if(!signal.length)return null;
  const mean=sma(closes,20),variance=closes.slice(-20).reduce((sum,v)=>sum+(v-mean)**2,0)/20,sd=Math.sqrt(variance);
  const volBase=sma(volumes.slice(0,-1),20);
  const support=Math.min(...candles.slice(-20).map(c=>c.low));
  const resistance=Math.max(...candles.slice(-20).map(c=>c.high));
  const ema20=emaSeries(closes,20).at(-1)!,ema50=emaSeries(closes,50).at(-1)!;
  const rsi14=rsi(closes), macd=macdValues.at(-1)!,macdSignal=signal.at(-1)!,macdHistogram=macd-macdSignal;
  const volumeRatio=volBase>0?last.volume/volBase:0;
  const score=(last.close>ema20?1:0)+(ema20>ema50?1:0)+(rsi14>=45&&rsi14<=70?1:0)+(macdHistogram>0?1:0)+(volumeRatio>=0.85?1:0);
  return {symbol,closedAt:last.closeTime,price:last.close,sma20:mean,ema20,ema50,rsi14,macd,macdSignal,macdHistogram,
    bbUpper:mean+2*sd,bbLower:mean-2*sd,atr14:atr(candles),volumeRatio,support,resistance,score};
}
