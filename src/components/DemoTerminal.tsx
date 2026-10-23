'use client';
import {useMemo,useState} from 'react';
type DemoTrade={tick:number;side:'BUY'|'SELL';price:number;reason:string;pnl?:number};
type Position={qty:number;entry:number;stop:number;target:number;fee:number};
type DemoState={tick:number;cash:number;position:Position|null;trades:DemoTrade[]};
const initial=():DemoState=>({tick:0,cash:10000,position:null,trades:[]});
const px=(i:number)=>100+i*.09+Math.sin(i*.81)*1.8+Math.sin(i*.23)*4.4;
function advance(s:DemoState):DemoState{
  const tick=s.tick+1,price=px(tick);
  let cash=s.cash,position=s.position,trades=[...s.trades];
  if(position&&(price<=position.stop||price>=position.target)){
    const execution=(price<=position.stop?Math.min(price,position.stop):position.target)*.9995;
    const exitFee=execution*position.qty*.001;
    const pnl=(execution-position.entry)*position.qty-position.fee-exitFee;
    cash+=execution*position.qty-exitFee;
    trades=[{tick,side:'SELL',price:execution,reason:price<=position.stop?'Stop triggered':'Target reached',pnl},...trades];
    position=null;
  }
  if(!position&&tick%8===1){
    const entry=price*1.0005,notional=Math.min(cash*.18,1800),qty=notional/entry,fee=notional*.001;
    if(cash>=notional+fee){cash-=notional+fee;position={qty,entry,stop:entry*.98,target:entry*1.05,fee};
      trades=[{tick,side:'BUY',price:entry,reason:'Illustrative entry: simulated momentum signal'},...trades];}
  }
  return {tick,cash,position,trades:trades.slice(0,30)};
}
const fmt=(n:number)=>n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
export default function DemoTerminal({compact=false}:{compact?:boolean}){
 const [state,setState]=useState<DemoState>(initial);
 const equity=state.cash+(state.position?state.position.qty*px(state.tick):0);
 const lastPrice=px(state.tick),net=equity-10000;
 const points=useMemo(()=>{
   const from=Math.max(0,state.tick-38);const values=Array.from({length:state.tick-from+1},(_,i)=>px(from+i));
   const lo=Math.min(...values)-1,hi=Math.max(...values)+1;
   return values.map((v,i)=>[i/(Math.max(values.length-1,1))*600,140-((v-lo)/(hi-lo))*110].join(',')).join(' ');
 },[state.tick]);
 return <div className="panel" style={{background:'var(--white)'}}>
   <div className="hstack" style={{marginBottom:20}}>
     <div><div className="micro muted">Interactive simulator</div><h3 className="serif" style={{fontSize:compact?26:33,margin:'5px 0 0'}}>The paper desk</h3></div>
     <span className="pill"><span className="dot"/>SYNTHETIC DATA</span>
   </div>
   <div className="notice" style={{marginBottom:17}}>Demonstration only. Fictional prices, scripted signals and virtual trades. No exchange requests or AI calls are made.</div>
   <div className="demo-grid">
     <div>
       <div className="hstack"><span className="micro muted">SYNTH / USDT</span><span className="micro">CANDLE {String(state.tick).padStart(3,'0')} · 15M</span></div>
       <svg className="demo-svg" viewBox="0 0 600 160" preserveAspectRatio="none" role="img" aria-label="Synthetic price history">
         {[35,70,105,140].map(y=><line key={y} x1="0" x2="600" y1={y} y2={y} stroke="#d9d5c9" strokeWidth="1"/>)}
         <polyline points={points} fill="none" stroke="#315d47" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>
       </svg>
       <div className="hstack"><span className="micro muted">Last paper price</span><strong className="mono">{fmt(lastPrice)} USDT</strong></div>
       <div className="demo-actions">
         <button className="button" onClick={()=>setState(s=>advance(s))}>Advance one candle</button>
         <button className="button secondary" onClick={()=>setState(s=>{let next=s;for(let i=0;i<12;i++)next=advance(next);return next;})}>Run 12 candles</button>
         <button className="button secondary" onClick={()=>setState(initial())}>Reset</button>
       </div>
     </div>
     <div>
       <div className="micro muted">SIMULATED EQUITY</div>
       <div className="metric-big">{fmt(equity)}</div>
       <div className={'mono '+(net>=0?'positive':'negative')} style={{fontSize:12}}>{net>=0?'+':''}{fmt(net)} USDT ({(net/100).toFixed(2)}%)</div>
       <div className="divider"/>
       <div className="hstack"><span className="micro muted">Cash</span><span className="mono">{fmt(state.cash)}</span></div>
       <div className="hstack" style={{marginTop:12}}><span className="micro muted">Open position</span><span className="mono">{state.position?'1 / 3':'0 / 3'}</span></div>
       {state.position&&<div style={{marginTop:12}} className="notice">Stop {fmt(state.position.stop)} · Target {fmt(state.position.target)}</div>}
       <div className="divider"/>
       <div className="micro muted" style={{marginBottom:8}}>SIMULATED TRADE JOURNAL</div>
       {state.trades.length?<ul className="demo-ledger">{state.trades.slice(0,compact?3:9).map((t,i)=><li key={i}><strong className={t.side==='BUY'?'positive':'negative'}>{t.side}</strong> {fmt(t.price)} · #{t.tick}<div className="muted" style={{marginTop:3}}>{t.reason}{t.pnl===undefined?'':' · P&L '+fmt(t.pnl)}</div></li>)}</ul>:<div className="empty">Advance candles to simulate trades.</div>}
     </div>
   </div>
 </div>;
}
