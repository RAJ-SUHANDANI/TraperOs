import type { Candle, Quote } from './types';
import { MAX_CANDLE_AGE_MS, MAX_QUOTE_AGE_MS } from './config';

const BASE = process.env.BINANCE_API_BASE || 'https://data-api.binance.vision';
async function getJson(path:string):Promise<unknown>{
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),9000);
  try {const res=await fetch(BASE+path,{signal:controller.signal,cache:'no-store',headers:{Accept:'application/json'}});
    if(!res.ok)throw new Error('Market data HTTP '+res.status);
    return await res.json();
  } finally {clearTimeout(timer);}
}
function finitePositive(n:unknown):number{
  const v=Number(n);if(!Number.isFinite(v)||v<=0)throw new Error('Invalid market price');return v;
}
export async function candles(symbol:string,interval:'15m'|'1m'='15m',limit=120,startTime?:number):Promise<Candle[]>{
  const params=new URLSearchParams({symbol,interval,limit:String(limit)});
  if(startTime!==undefined)params.set('startTime',String(startTime));
  const raw=await getJson('/api/v3/klines?'+params.toString());
  if(!Array.isArray(raw))throw new Error('Unexpected candle payload');
  const output:Candle[]=raw.map((row:unknown)=>{
    if(!Array.isArray(row)||row.length<7)throw new Error('Bad candle');
    const c={openTime:Number(row[0]),closeTime:Number(row[6]),open:finitePositive(row[1]),high:finitePositive(row[2]),low:finitePositive(row[3]),close:finitePositive(row[4]),volume:Number(row[5])};
    if(!Number.isSafeInteger(c.openTime)||!Number.isSafeInteger(c.closeTime)||c.volume<0||!Number.isFinite(c.volume)||c.high<Math.max(c.open,c.close)||c.low>Math.min(c.open,c.close))throw new Error('Invalid OHLCV');
    return c;
  });
  for(let i=1;i<output.length;i++)if(output[i].openTime<=output[i-1].openTime)throw new Error('Unsorted or duplicate candles');
  return output.filter(c=>c.closeTime<Date.now()); // NEVER evaluate an unfinished candle
}
export async function quote(symbol:string):Promise<Quote>{
  const data=await getJson('/api/v3/ticker/bookTicker?symbol='+encodeURIComponent(symbol));
  if(typeof data!=='object'||!data)throw new Error('Invalid quote');
  const row=data as Record<string,unknown>;
  if(row.symbol!==symbol)throw new Error('Wrong quote symbol');
  const q={symbol,bid:finitePositive(row.bidPrice),ask:finitePositive(row.askPrice),receivedAt:Date.now()};
  if(q.bid>q.ask)throw new Error('Crossed quote');return q;
}
export function requireFreshQuote(q:Quote,now=Date.now()):void{
  if(now-q.receivedAt>MAX_QUOTE_AGE_MS||q.receivedAt>now+1000)throw new Error('Stale quote');
}
export function requireFreshCandle(c:Candle,now=Date.now()):void{
  if(now-c.closeTime>MAX_CANDLE_AGE_MS||c.closeTime>now)throw new Error('Stale candle');
}
