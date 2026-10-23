'use client';
import {useEffect,useRef} from 'react';
import {createChart,ColorType,LineSeries,type UTCTimestamp} from 'lightweight-charts';
export type SeriesPoint={time:string;value:number};
export default function EquityChart({ai,btc,basket}:{ai:SeriesPoint[];btc?:SeriesPoint[];basket?:SeriesPoint[]}){
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{
   if(!ref.current)return;
   const chart=createChart(ref.current,{width:ref.current.clientWidth,height:280,
     layout:{background:{type:ColorType.Solid,color:'#fbfaf6'},textColor:'#73766d',fontFamily:'IBM Plex Mono, monospace',fontSize:11},
     grid:{vertLines:{color:'#edeae2'},horzLines:{color:'#edeae2'}},
     rightPriceScale:{borderColor:'#d1cdc0'},timeScale:{borderColor:'#d1cdc0',timeVisible:true,secondsVisible:false},
     localization:{priceFormatter:(n:number)=>n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}
   });
   const add=(points:SeriesPoint[],color:string,name:string)=>{
     const line=chart.addSeries(LineSeries,{color,lineWidth:2,title:name,priceLineVisible:false,lastValueVisible:true});
     const converted=points.map(p=>({time:Math.floor(Date.parse(p.time)/1000) as UTCTimestamp,value:Number(p.value)}))
       .filter(p=>Number.isFinite(p.value)&&Number.isFinite(p.time)).sort((a,b)=>Number(a.time)-Number(b.time));
     if(converted.length)line.setData(converted.filter((p,i)=>i===0||p.time!==converted[i-1].time));
   };
   add(ai,'#315d47','Portfolio');if(btc?.length)add(btc,'#ad813f','BTC hold');if(basket?.length)add(basket,'#8a8d87','10-asset hold');
   chart.timeScale().fitContent();
   const observer=new ResizeObserver(()=>{if(ref.current)chart.applyOptions({width:ref.current.clientWidth});});
   observer.observe(ref.current);return ()=>{observer.disconnect();chart.remove();};
 },[ai,btc,basket]);
 return <div ref={ref} className="chart-box" aria-label="Portfolio equity versus buy-and-hold benchmarks"/>;
}
