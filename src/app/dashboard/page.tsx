'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {createClient,type Session} from '@supabase/supabase-js';
import {Activity,ArrowLeftRight,BookOpen,ChartNoAxesCombined,CirclePause,LockKeyhole,Play,Plus,Shield,SignOut} from 'lucide-react';
import EquityChart,{type SeriesPoint} from '@/components/EquityChart';

type Portfolio={id:string;kind:string;cash:number;initial_cash:number;is_paused:boolean;pause_reason:string|null;day_start_equity:number;challenge_ends_at:string|null};
type Position={id:string;portfolio_id:string;symbol:string;quantity:number;entry_price:number;stop_price:number;target_price:number};
type Fill={id:string;portfolio_id:string;symbol:string;side:string;quantity:number;price:number;fee:number;pnl:number|null;reason:string;executed_at:string};
type Equity={portfolio_id:string;observed_minute:string;equity:number;cash:number;exposure:number};
type Benchmark={portfolio_id:string;observed_minute:string;btc_equity:number;basket_equity:number};
type Decision={portfolio_id:string;symbol:string;model:string;status:string;error:string|null;created_at:string;response_payload:unknown};
type Signal={portfolio_id:string;symbol:string;action:string;result:string;reason:string;created_at:string};
type Event={portfolio_id:string|null;severity:string;code:string;message:string;created_at:string};
type State={portfolios:Portfolio[];positions:Position[];fills:Fill[];equity:Equity[];benchmarks:Benchmark[];aiDecisions:Decision[];signals:Signal[];events:Event[];scheduler:{status:string;started_at:string}|null;asOf:string};
const num=(n:number,d=2)=>Number(n||0).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const signed=(n:number)=> (n>=0?'+':'')+num(n);
const time=(s:string)=>new Date(s).toLocaleString('en-IN',{timeZone:'UTC',hour12:false,month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit'})+' UTC';

export default function Dashboard(){
 const supabase=useMemo(()=>{const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;return url&&key?createClient(url,key):null;},[]);
 const [session,setSession]=useState<Session|null>(null),[state,setState]=useState<State|null>(null);
 const [selected,setSelected]=useState(''),[tab,setTab]=useState('Overview'),[error,setError]=useState(''),[busy,setBusy]=useState(false),[authChecked,setAuthChecked]=useState(false);
 useEffect(()=>{
   if(!supabase){setAuthChecked(true);setError('Supabase is not configured; deployment setup is required.');return;}
   supabase.auth.getSession().then(({data})=>{setSession(data.session);setAuthChecked(true);});
   const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,next)=>{setSession(next);setAuthChecked(true);});
   return ()=>subscription.unsubscribe();
 },[supabase]);
 const load=useCallback(async()=>{
   if(!session)return;
   try{
     const response=await fetch('/api/state',{headers:{Authorization:'Bearer '+session.access_token},cache:'no-store'});
     const payload=await response.json();
     if(!response.ok)throw new Error(payload.error||'Could not load portfolio');
     setState(payload);setSelected(current=>payload.portfolios.some((p:Portfolio)=>p.id===current)?current:(payload.portfolios[0]?.id||''));setError('');
   }catch(e){setError(e instanceof Error?e.message:'Dashboard request failed');}
 },[session]);
 useEffect(()=>{if(!session)return;void load();const poll=setInterval(()=>void load(),30000);return ()=>clearInterval(poll);},[session,load]);
 async function control(action:'pause'|'resume'|'challenge'){
   if(!session)return;setBusy(true);
   try{
     const request=action==='challenge'?{action,balance:10000}:{action,portfolioId:selected};
     const res=await fetch('/api/control',{method:'POST',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify(request)});
     const body=await res.json();if(!res.ok)throw new Error(body.error||'Request failed');
     if(action==='challenge'&&body.id)setSelected(body.id);
     await load();
   }catch(e){setError(e instanceof Error?e.message:'Could not update account');}
   finally{setBusy(false);}
 }
 const portfolio=state?.portfolios.find(p=>p.id===selected);
 const positions=state?.positions.filter(p=>p.portfolio_id===selected)||[];
 const fills=state?.fills.filter(f=>f.portfolio_id===selected)||[];
 const decisions=state?.aiDecisions.filter(d=>d.portfolio_id===selected)||[];
 const signals=state?.signals.filter(s=>s.portfolio_id===selected)||[];
 const observations=(state?.equity.filter(e=>e.portfolio_id===selected)||[]).slice().reverse();
 const benchmarks=(state?.benchmarks.filter(b=>b.portfolio_id===selected)||[]).slice().reverse();
 const latest=observations.at(-1);const currentEquity=Number(latest?.equity??portfolio?.cash??0);
 const initial=Number(portfolio?.initial_cash??10000);const net=currentEquity-initial;
 const closed=fills.filter(f=>f.side==='SELL'),wins=closed.filter(f=>Number(f.pnl)>0);
 const grossWins=closed.reduce((a,f)=>a+Math.max(0,Number(f.pnl)),0);
 const grossLosses=closed.reduce((a,f)=>a+Math.max(0,-Number(f.pnl)),0);
 const equityPts=useMemo<SeriesPoint[]>(()=>observations.map(o=>({time:o.observed_minute,value:Number(o.equity)})),[state,selected]); // stable across unrelated local interactions
 const btcPts=useMemo<SeriesPoint[]>(()=>benchmarks.map(o=>({time:o.observed_minute,value:Number(o.btc_equity)})),[state,selected]);
 const basketPts=useMemo<SeriesPoint[]>(()=>benchmarks.map(o=>({time:o.observed_minute,value:Number(o.basket_equity)})),[state,selected]);
 if(!authChecked)return <div className="site"><div className="empty">Checking private session…</div></div>;
 if(!session)return <div className="site"><header className="site-header"><Link href="/" className="logo"><span className="mark">T</span>TraperOS</Link></header><div className="login-wrap"><div className="login-card"><LockKeyhole size={24}/><h1 className="serif">Private ledger.</h1><p className="muted">This account requires owner authentication.</p>{error&&<p className="alert">{error}</p>}<Link className="button" href="/login">Sign in to continue</Link></div></div></div>;
 return <div className="app-shell">
  <aside className="sidebar">
   <Link href="/" className="logo"><span className="mark">T</span>TraperOS</Link>
   <nav>{[{name:'Overview',icon:ChartNoAxesCombined},{name:'Positions',icon:Activity},{name:'Journal',icon:ArrowLeftRight},{name:'AI decisions',icon:BookOpen},{name:'Operations',icon:Shield}].map(item=><button key={item.name} className={'side-link '+(tab===item.name?'active':'')} onClick={()=>setTab(item.name)} style={{background:tab===item.name?'#e1e5db':'transparent',borderTop:0,borderRight:0,borderBottom:0,textAlign:'left',width:'100%',cursor:'pointer'}}><item.icon size={15}/>{item.name}</button>)}</nav>
   <div className="side-bottom"><button className="side-link" onClick={async()=>{await supabase?.auth.signOut();setSession(null);}} style={{border:0,background:'transparent'}}><SignOut size={15}/> Sign out</button><div className="micro muted" style={{marginTop:12}}>PAPER ONLY · NO LEVERAGE</div></div>
  </aside>
  <main className="main">
   <div className="main-top"><span className="micro muted">TRADING OPERATIONS / PRIVATE</span><span className="pill"><span className={'dot '+(portfolio?.is_paused?'red':'')}/>{portfolio?.is_paused?'ENTRIES PAUSED':'PAPER ACCOUNT'}</span></div>
   <div className="account-header"><div><h1 className="serif">{tab==='Overview'?'The account ledger':tab}</h1><div className="micro muted">Autonomous market research · 15-minute signals · best-effort minute polling</div></div><div className="hstack" style={{alignSelf:'center',flexWrap:'wrap'}}><button className="button secondary tiny" disabled={busy} onClick={()=>void load()}>Refresh</button><button className="button tiny" disabled={busy} onClick={()=>void control('challenge')}><Plus size={14}/> New 48h challenge</button></div></div>
   <div className="tabs">{state?.portfolios.map(p=><button className={'tab '+(selected===p.id?'selected':'')} key={p.id} onClick={()=>setSelected(p.id)}>{p.kind==='ai'?'AI / MAIN':p.kind==='rules'?'RULES / BASELINE':'CHALLENGE / '+p.id.slice(0,5)}</button>)}</div>
   {error&&<div className="alert" role="alert" style={{marginBottom:18}}>{error}</div>}
   {portfolio&&<div className="hstack" style={{margin:'0 0 20px',flexWrap:'wrap'}}><div className="micro muted">{portfolio.challenge_ends_at?'CHALLENGE ENDS '+time(portfolio.challenge_ends_at):'ACTIVE RESEARCH PORTFOLIO'}</div><div className="hstack">{portfolio.is_paused?<button className="button tiny" disabled={busy} onClick={()=>void control('resume')}><Play size={12}/> Resume entries</button>:<button className="button secondary tiny" disabled={busy} onClick={()=>void control('pause')}><CirclePause size={12}/> Pause entries</button>}</div></div>}
   {!state?<div className="empty">Loading authenticated account data…</div>:!portfolio?<div className="empty">No portfolio initialized.</div>:<>
   <div className="stats">
    <div className="stat"><div className="micro muted label">Net account equity</div><div className="value">{num(currentEquity)} <small style={{fontSize:10}}>USDT</small></div><span className={net>=0?'positive mono':'negative mono'}>{signed(net)} ({(net/initial*100).toFixed(2)}%)</span></div>
    <div className="stat"><div className="micro muted label">Available cash</div><div className="value">{num(Number(portfolio.cash))}</div><span className="footnote">Spot only</span></div>
    <div className="stat"><div className="micro muted label">Open positions</div><div className="value">{positions.length} / 3</div><span className="footnote">Maximum planned risk 1.5% / trade</span></div>
    <div className="stat"><div className="micro muted label">Closed trades</div><div className="value">{closed.length}</div><span className="footnote">{closed.length?num(wins.length/closed.length*100,1)+'% win rate':'No realized P&L yet'}</span></div>
   </div>
   {tab==='Overview'&&<>
    <div className="section-head"><div><div className="micro muted">Account value versus passive alternatives</div><h2 className="section-title" style={{fontSize:37}}>Equity and benchmarks</h2></div><div className="micro muted">USDT / UTC</div></div>
    <div className="panel">{equityPts.length>=2?<EquityChart ai={equityPts} btc={btcPts} basket={basketPts}/>:<div className="empty">Waiting for scheduled equity observations. Charts appear after the worker begins monitoring.</div>}</div>
    <div className="cols-2" style={{marginTop:17}}><div className="panel"><div className="micro muted">LATEST SIGNALS</div><div className="table-scroll"><table className="datatable"><thead><tr><th>Asset</th><th>Decision</th><th>Result</th><th>Time</th></tr></thead><tbody>{signals.slice(0,7).map((s,i)=><tr key={i}><td>{s.symbol}</td><td>{s.action}</td><td>{s.result}</td><td>{time(s.created_at)}</td></tr>)}</tbody></table>{!signals.length&&<div className="empty">No eligible signals recorded.</div>}</div></div><div className="panel"><div className="micro muted">RISK AND OPERATIONS</div><div className="divider"/><p className="micro muted">Daily start equity</p><p className="mono">{num(Number(portfolio.day_start_equity))} USDT</p><p className="micro muted">Pause threshold</p><p className="mono negative">{num(Number(portfolio.day_start_equity)*.96)} USDT</p><p className="micro muted">Profit factor</p><p className="mono">{grossLosses?num(grossWins/grossLosses):'Not established'}</p><p className="micro muted">Latest scheduler run</p><p className="mono">{state.scheduler?state.scheduler.status+' · '+time(state.scheduler.started_at):'Not connected'}</p>{portfolio.pause_reason&&<div className="alert">{portfolio.pause_reason}</div>}</div></div>
   </>}
   {tab==='Positions'&&<div className="panel"><div className="micro muted">LIVE PAPER POSITIONS / DEFINED EXITS</div><div className="table-scroll"><table className="datatable"><thead><tr><th>Asset</th><th>Quantity</th><th>Entry</th><th>Stop</th><th>Target</th></tr></thead><tbody>{positions.map(p=><tr key={p.id}><td>{p.symbol}</td><td>{num(Number(p.quantity),6)}</td><td>{num(Number(p.entry_price),4)}</td><td className="negative">{num(Number(p.stop_price),4)}</td><td className="positive">{num(Number(p.target_price),4)}</td></tr>)}</tbody></table>{!positions.length&&<div className="empty">No open paper positions.</div>}</div></div>}
   {tab==='Journal'&&<div className="panel"><div className="micro muted">IMMUTABLE FILL HISTORY / INCLUDES FEES</div><div className="table-scroll"><table className="datatable"><thead><tr><th>Time</th><th>Asset</th><th>Side</th><th>Fill</th><th>Fee</th><th>Realized P&L</th></tr></thead><tbody>{fills.map(f=><tr key={f.id}><td>{time(f.executed_at)}</td><td>{f.symbol}</td><td>{f.side}</td><td>{num(Number(f.price),4)}</td><td>{num(Number(f.fee),4)}</td><td className={Number(f.pnl)>=0?'positive':'negative'}>{f.pnl===null?'—':signed(Number(f.pnl))}</td></tr>)}</tbody></table>{!fills.length&&<div className="empty">No paper fills recorded yet.</div>}</div></div>}
   {tab==='AI decisions'&&<div className="panel"><div className="micro muted">MODEL RESPONSES / AUDIT LOG</div><div className="table-scroll"><table className="datatable"><thead><tr><th>Time</th><th>Asset</th><th>Model</th><th>Status</th><th>Reason</th></tr></thead><tbody>{decisions.map((d,i)=><tr key={i}><td>{time(d.created_at)}</td><td>{d.symbol}</td><td style={{maxWidth:190,overflowWrap:'anywhere'}}>{d.model}</td><td>{d.status}</td><td style={{maxWidth:290,textAlign:'left',whiteSpace:'normal'}}>{d.error||'Stored in full private audit record'}</td></tr>)}</tbody></table>{!decisions.length&&<div className="empty">No AI requests yet. The rules-only account does not call the LLM.</div>}</div></div>}
   {tab==='Operations'&&<div className="panel"><div className="micro muted">SYSTEM HEALTH / MISSED JOBS AND PAUSES</div><div className="notice" style={{marginTop:14}}>This system relies on best-effort one-minute scheduling. Stop-loss fills are simulated; minute-candle reconstruction may be approximate. Missing data can pause new entries.</div><div className="table-scroll"><table className="datatable"><thead><tr><th>Time</th><th>Severity</th><th>Code</th><th>Message</th></tr></thead><tbody>{state.events.filter(e=>!e.portfolio_id||e.portfolio_id===selected).map((e,i)=><tr key={i}><td>{time(e.created_at)}</td><td>{e.severity}</td><td>{e.code}</td><td style={{textAlign:'left',whiteSpace:'normal'}}>{e.message}</td></tr>)}</tbody></table></div></div>}
   </>}
   <p className="footnote" style={{marginTop:28}}>Paper trading only. Open position values are last measured snapshots, not guaranteed executable prices. No leverage, futures or real orders. Historical figures do not predict future performance.</p>
  </main>
 </div>;
}
