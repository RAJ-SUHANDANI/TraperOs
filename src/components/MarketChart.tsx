'use client';
import {useEffect,useMemo,useRef,useState} from 'react';
import {createChart,CandlestickSeries,LineSeries,ColorType,type UTCTimestamp} from 'lightweight-charts';
import {emaSeries} from '@/lib/indicators';
import type {Candle,Features} from '@/lib/types';
import {SYMBOLS} from '@/lib/config';
type MarketState={symbol:string;candles:Candle[];features:Features|null;asOf:string};
const n=(v:number,d=2)=>v.toLocaleString('en-US',{maximumFractionDigits:d,minimumFractionDigits:d});
export default function MarketChart({token}:{token:string}){
 const [symbol,setSymbol]=useState<string>('BTCUSDT'),[market,setMarket]=useState<MarketState|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 const host=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const abort=new AbortController();setLoading(true);
  fetch('/api/market?symbol='+encodeURIComponent(symbol),{headers:{Authorization:'Bearer '+token},signal:abort.signal,cache:'no-store'})
   .then(async r=>{const body=await r.json();if(!r.ok)throw new Error(body.error||'Market data unavailable');return body as MarketState;})
   .then(d=>{setMarket(d);setError('');}).catch(e=>{if(!abort.signal.aborted)setError(e instanceof Error?e.message:'Market data error');})
   .finally(()=>{if(!abort.signal.aborted)setLoading(false);});
  return ()=>abort.abort();
 },[symbol,token]);
 const series=useMemo(()=>market?.candles||[],[market]);
 useEffect(()=>{
  if(!host.current||!series.length)return;
  const chart=createChart(host.current,{width:host.current.clientWidth,height:350,
   layout:{background:{type:ColorType.Solid,color:'#fbfaf6'},textColor:'#73766d',fontFamily:'IBM Plex Mono, monospace',fontSize:11},
   grid:{vertLines:{color:'#edeae2'},horzLines:{color:'#edeae2'}},
   rightPriceScale:{borderColor:'#d1cdc0'},timeScale:{borderColor:'#d1cdc0',timeVisible:true,secondsVisible:false}});
  const candle=chart.addSeries(CandlestickSeries,{upColor:'#315d47',downColor:'#9d4c39',borderVisible:false,wickUpColor:'#315d47',wickDownColor:'#9d4c39'});
  candle.setData(series.map(c=>({time:Math.floor(c.openTime/1000) as UTCTimestamp,open:c.open,high:c.high,low:c.low,close:c.close})));
  const closes=series.map(c=>c.close);
  const add=(period:number,color:string)=>{
   const values=emaSeries(closes,period),line=chart.addSeries(LineSeries,{color,lineWidth:1,priceLineVisible:false,lastValueVisible:false,title:'EMA '+period});
   line.setData(values.map((v,i)=>({time:Math.floor(series[i+period-1].openTime/1000) as UTCTimestamp,value:v})));
  };
  add(20,'#ae813e');add(50,'#767a74');chart.timeScale().fitContent();
  const observer=new ResizeObserver(()=>{if(host.current)chart.applyOptions({width:host.current.clientWidth});});
  observer.observe(host.current);return ()=>{observer.disconnect();chart.remove();};
 },[series]);
 const f=market?.features;
 return <div className="panel">
  <div className="hstack" style={{flexWrap:'wrap',marginBottom:20}}>
   <div><div className="micro muted">Spot market observation / 15-minute completed candles</div><h2 className="serif" style={{fontSize:34,margin:'6px 0 0'}}>{symbol.replace('USDT',' / USDT')}</h2></div>
   <select className="field" style={{width:190,margin:0}} value={symbol} onChange={e=>setSymbol(e.target.value)} aria-label="Select crypto pair">{SYMBOLS.map(s=><option key={s} value={s}>{s.replace('USDT',' / USDT')}</option>)}</select>
  </div>
  {error&&<div className="alert">{error}</div>}
  {loading&&<div className="micro muted">Refreshing Binance market history…</div>}
  <div ref={host} style={{height:350,minWidth:0}}/>
  {f&&<div className="stats" style={{marginTop:18}}>
    <div className="stat"><div className="micro muted label">Last completed close</div><div className="mono">{n(f.price,4)}</div></div>
    <div className="stat"><div className="micro muted label">RSI / 14</div><div className="mono">{n(f.rsi14)}</div></div>
    <div className="stat"><div className="micro muted label">ATR / 14</div><div className="mono">{n(f.atr14,4)}</div></div>
    <div className="stat"><div className="micro muted label">Volume versus avg.</div><div className="mono">{n(f.volumeRatio)}×</div></div>
  </div>}
  <p className="footnote">Indicators are calculated from Binance completed market candles. These charts do not imply executable real-time prices. No direct order placement.</p>
 </div>;
}
