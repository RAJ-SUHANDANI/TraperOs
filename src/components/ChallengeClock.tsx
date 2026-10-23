'use client';
import {useEffect,useState} from 'react';
export default function ChallengeClock({endsAt,equity,initial}:{endsAt:string;equity:number;initial:number}){
 const [now,setNow]=useState(Date.now());
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return ()=>clearInterval(timer);},[]);
 const remaining=Math.max(0,Date.parse(endsAt)-now),ended=remaining<=0;
 const time=[Math.floor(remaining/3600000),Math.floor((remaining%3600000)/60000),Math.floor((remaining%60000)/1000)]
  .map(n=>String(n).padStart(2,'0')).join(':');
 const pnl=equity-initial;
 return <div className="notice" style={{marginBottom:20,display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:14}}>
   <div><div className="micro muted">{ended?'CHALLENGE PERIOD CLOSED':'48-HOUR EXPERIMENT / TIME REMAINING'}</div>
     <div className="mono" style={{fontSize:25,marginTop:5}}>{ended?'00:00:00':time}</div></div>
   <div style={{textAlign:'right'}}><div className="micro muted">{ended?'LATEST REPORTED RESULT':'CURRENT VIRTUAL RESULT'}</div>
     <div className={'mono '+(pnl>=0?'positive':'negative')} style={{fontSize:20,marginTop:5}}>{pnl>=0?'+':''}{pnl.toFixed(2)} USDT</div>
     <div className="micro muted">{ended?'Final valuation may lag the cutoff if scheduler execution was delayed.':'Unrealized value included; modeled costs apply.'}</div>
   </div>
 </div>;
}
