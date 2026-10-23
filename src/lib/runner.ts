import {admin,event,getPortfolios,getPositions} from './db';
import {SYMBOLS,DAILY_LOSS_LIMIT,DEFAULT_SLIPPAGE_RATE,SIGNAL_INTERVAL_MS,utcDay} from './config';
import {candles,quote,requireFreshCandle,requireFreshQuote} from './market';
import {deriveFeatures} from './indicators';
import {aiDecision} from './ai';
import {buyPaper,sellPaper} from './execution';
import {checkRisk,markEquity} from './risk';
import {deterministicDecision,qualifies,eligibleAfterCooldown} from './strategies';
import type {Features,Portfolio,Position,Quote,Candle,Decision} from './types';

type RunResult={status:string;message:string;durationMs:number};
const db=()=>admin();
async function pause(portfolio:Portfolio,code:string,message:string){
  await db().from('portfolios').update({is_paused:true,pause_reason:message}).eq('id',portfolio.id);
  portfolio.is_paused=true;portfolio.pause_reason=message;
  await event(portfolio.id,'error',code,message);
}
function candleExit(p:Position,c:Candle):{price:number;reason:string}|null{
  // A candle does not reveal intrabar ordering; stop wins ambiguous bars.
  if(c.low<=p.stop_price)return {price:Math.min(p.stop_price,c.open)*(1-DEFAULT_SLIPPAGE_RATE),reason:'stop_loss_reconstructed'};
  if(c.high>=p.target_price)return {price:p.target_price*(1-DEFAULT_SLIPPAGE_RATE),reason:'take_profit_reconstructed'};
  return null;
}
async function managePosition(p:Position,q:Quote,portfolio:Portfolio){
  const from=Math.max(Date.parse(p.opened_at),p.last_observed_at?Date.parse(p.last_observed_at):0);
  const age=Date.now()-from;
  if(age>498*60*1000){
    await pause(portfolio,'MONITORING_GAP','Stop reconstruction exceeds available 1-minute candle window');
    return;
  }
  let reconstructed:false|{price:number;reason:string;eventId:string}=false;
  const start=Math.ceil(from/60000)*60000;
  if(start<Date.now()-60000){
    const history=await candles(p.symbol,'1m',Math.min(500,Math.max(2,Math.ceil((Date.now()-start)/60000)+2)),start);
    let expected=start;
    for(const c of history){
      if(c.openTime>expected){await pause(portfolio,'MISSING_CANDLES','Missing 1-minute execution evidence for '+p.symbol);return;}
      if(c.openTime<start)continue;
      expected=c.openTime+60000;
      const result=candleExit(p,c);
      if(result){reconstructed={...result,eventId:String(c.openTime)};break;}
    }
    if(!history.length||history.at(-1)!.openTime+120000<Date.now()){
      await pause(portfolio,'MISSING_CANDLES','1-minute history too old for '+p.symbol);return;
    }
  }
  if(reconstructed){
    const exit=reconstructed as {price:number;reason:string;eventId:string};
    await sellPaper(p,exit.price,exit.reason,'reconstructed_1m_candle',exit.eventId+':'+exit.reason);
    await event(portfolio.id,'info','PAPER_EXIT',p.symbol+' '+exit.reason,{fill:exit.price,mode:'reconstructed'});
    return;
  }
  let exitPrice=0,reason='';
  if(p.stop_price>=q.bid){exitPrice=q.bid*(1-DEFAULT_SLIPPAGE_RATE);reason='stop_loss_observed';}
  else if(p.target_price<=q.bid){exitPrice=p.target_price*(1-DEFAULT_SLIPPAGE_RATE);reason='take_profit_observed';}
  else if(portfolio.challenge_ends_at&&Date.now()>=Date.parse(portfolio.challenge_ends_at)){
    exitPrice=q.bid*(1-DEFAULT_SLIPPAGE_RATE);reason='challenge_expiry';
  }
  if(exitPrice){
    await sellPaper(p,exitPrice,reason,'observed_bid',String(Math.floor(Date.now()/60000))+':'+reason);
    await event(portfolio.id,'info','PAPER_EXIT',p.symbol+' '+reason,{fill:exitPrice});
  }else{
    await db().from('positions').update({last_observed_at:new Date().toISOString()}).eq('id',p.id);
  }
}
async function recordSnapshot(portfolio:Portfolio,positions:Position[],quotes:Record<string,Quote>,minute:string){
  const prices=Object.fromEntries(Object.values(quotes).map(q=>[q.symbol,q.bid]));
  const exposure=positions.reduce((sum,p)=>sum+p.quantity*prices[p.symbol],0);
  const equity=markEquity(portfolio,positions,prices);
  const {error}=await db().from('equity_snapshots').upsert({
    portfolio_id:portfolio.id,observed_minute:minute,cash:portfolio.cash,equity,exposure
  },{onConflict:'portfolio_id,observed_minute'});
  if(error)throw error;
  const {data:anchors,error:anchorError}=await db().from('benchmark_anchors').select('benchmark,symbol,quantity').eq('portfolio_id',portfolio.id);
  if(anchorError)throw anchorError;
  if(!anchors?.length){
    const btc=quotes.BTCUSDT;
    if(!btc)return;
    const generated=[
      {portfolio_id:portfolio.id,benchmark:'btc',symbol:'BTCUSDT',quantity:portfolio.initial_cash/btc.ask},
      ...SYMBOLS.filter(s=>quotes[s]).map(s=>({portfolio_id:portfolio.id,benchmark:'basket',symbol:s,quantity:(portfolio.initial_cash/SYMBOLS.length)/quotes[s].ask}))
    ];
    if(generated.length!==SYMBOLS.length+1)return; // don't anchor to incomplete universe
    const {error:insertErr}=await db().from('benchmark_anchors').upsert(generated,{onConflict:'portfolio_id,benchmark,symbol',ignoreDuplicates:true});
    if(insertErr)throw insertErr;
    anchors.push(...generated);
  }
  const btcEquity=anchors.filter(a=>a.benchmark==='btc').reduce((n,a)=>n+Number(a.quantity)*(prices[a.symbol]??0),0);
  const basketEquity=anchors.filter(a=>a.benchmark==='basket').reduce((n,a)=>n+Number(a.quantity)*(prices[a.symbol]??0),0);
  if(btcEquity>0&&basketEquity>0){
    const {error:benchmarkErr}=await db().from('benchmark_snapshots').upsert({
      portfolio_id:portfolio.id,observed_minute:minute,btc_equity:btcEquity,basket_equity:basketEquity
    },{onConflict:'portfolio_id,observed_minute'});
    if(benchmarkErr)throw benchmarkErr;
  }
}
async function evaluatePortfolio(p:Portfolio,ranked:Features[],quotes:Record<string,Quote>){
  const now=Date.now(),minute=new Date(Math.floor(now/60000)*60000).toISOString();
  let positions=await getPositions(p.id);
  // Exit reconciliation proceeds even when entries are manually/automatically paused.
  for(const pos of positions){
    const q=quotes[pos.symbol];
    if(!q){await event(p.id,'error','NO_EXIT_QUOTE','No valid quote for open '+pos.symbol);continue;}
    try{await managePosition(pos,q,p);}
    catch(e){await event(p.id,'error','EXIT_MONITOR_ERROR',e instanceof Error?e.message:String(e));}
  }
  positions=await getPositions(p.id);
  // A stop/target sell changes cash; refresh the ledger before marking equity or sizing entries.
  const {data:updated,error:refreshError}=await db().from('portfolios').select('*').eq('id',p.id).single();
  if(refreshError)throw refreshError;
  Object.assign(p,updated);
  if(positions.some(x=>!quotes[x.symbol])){
    await event(p.id,'error','INCOMPLETE_MARK','Unable to mark every open position; new entries disabled');
    return;
  }
  const prices=Object.fromEntries(Object.values(quotes).map(q=>[q.symbol,q.bid]));
  const equity=markEquity(p,positions,prices);
  const day=utcDay();
  if(p.day_key!==day){
    const resumeDailyPause=p.is_paused&&p.pause_reason==='Marked-to-market daily loss reached 4%';
    const change={day_key:day,day_start_equity:equity,...(resumeDailyPause?{is_paused:false,pause_reason:null}:{})};
    const {error}=await db().from('portfolios').update(change).eq('id',p.id);
    if(error)throw error;p.day_key=day;p.day_start_equity=equity;
    if(resumeDailyPause){p.is_paused=false;p.pause_reason=null;await event(p.id,'info','DAILY_RESET','New UTC risk day; daily loss pause lifted');}
  }
  if(equity<=p.day_start_equity*(1-DAILY_LOSS_LIMIT)&&!p.is_paused)
    await pause(p,'DAILY_LOSS_LIMIT','Marked-to-market daily loss reached 4%');
  await recordSnapshot(p,positions,quotes,minute);
  if(p.is_paused||p.challenge_ends_at&&Date.now()>=Date.parse(p.challenge_ends_at))return;

  // A two-candle cooldown limits immediate churn after a completed position closes.
  const {data:recentExits,error:cooldownError}=await db().from('fills').select('symbol,executed_at')
    .eq('portfolio_id',p.id).eq('side','SELL')
    .gte('executed_at',new Date(now-2*SIGNAL_INTERVAL_MS).toISOString());
  if(cooldownError)throw cooldownError;
  const lastExit=new Map<string,number>();
  for(const fill of recentExits||[])lastExit.set(fill.symbol,Math.max(lastExit.get(fill.symbol)||0,Date.parse(fill.executed_at)));
  // The rules baseline and AI arm evaluate the SAME ranked completed-candle snapshots.
  const eligible=ranked.filter(f=>qualifies(f)&&eligibleAfterCooldown(now,lastExit.get(f.symbol))).slice(0,2);
  for(const f of eligible){
    if(positions.length>=3)break;
    const q=quotes[f.symbol];
    if(!q||now-f.closedAt>3*60*1000)continue;
    if((q.ask-q.bid)/q.ask>0.0015)continue;
    const candidateId=f.symbol+':'+f.closedAt;
    const {error:signalError}=await db().from('signals').insert({
      portfolio_id:p.id,candidate_id:candidateId,symbol:f.symbol,
      candle_closed_at:new Date(f.closedAt).toISOString(),features:f
    });
    if(signalError){
      if(signalError.code==='23505')continue; // Exactly-once evaluation across retries
      throw signalError;
    }
    const choice:{decision:Decision|null;reason:string}=p.kind==='rules'
      ?{decision:deterministicDecision(f,candidateId),reason:'Deterministic signal rules'}
      :await aiDecision(p,f,candidateId);
    let result='skipped',reason=choice.reason;
    if(choice.decision?.action==='HOLD'){result='hold';reason=choice.decision.reason;}
    if(choice.decision?.action==='BUY'){
      const risk=checkRisk({portfolio:p,positions,quote:q,otherQuotes:prices,
        proposedAllocationPct:choice.decision.allocation_pct,proposedStopPct:choice.decision.stop_loss_pct,
        proposedTargetPct:choice.decision.take_profit_pct,dayStartEquity:p.day_start_equity});
      const {error:re}=await db().from('risk_evaluations').insert({
        portfolio_id:p.id,candidate_id:candidateId,accepted:risk.ok,
        reason:risk.ok?'Within deterministic limits':risk.reason,sizing:risk.ok?risk:null
      });
      if(re)throw re;
      if(risk.ok){
        try{
          await buyPaper(p.id,f.symbol,q,risk,candidateId,p.kind);
          result='filled';reason=choice.decision.reason;
          const {data:latest,error}=await db().from('portfolios').select('*').eq('id',p.id).single();
          if(error)throw error;Object.assign(p,latest);
          positions=await getPositions(p.id);
          await event(p.id,'info','PAPER_ENTRY',f.symbol+' paper BUY',{notional:risk.notional,risk:risk.risk,source:p.kind});
        }catch(e){result='rejected';reason=e instanceof Error?e.message:String(e);}
      }else{result='rejected';reason=risk.reason;}
    }
    const {error:updateError}=await db().from('signals').update({action:choice.decision?.action??'NO_DECISION',result,reason}).eq('portfolio_id',p.id).eq('candidate_id',candidateId);
    if(updateError)throw updateError;
  }
}
export async function runTradingCycle():Promise<RunResult>{
  const start=Date.now(),owner=crypto.randomUUID();
  const {data:leased,error:leaseError}=await db().rpc('acquire_worker_lease',{p_key:'trade_cycle',p_owner:owner,p_seconds:110});
  if(leaseError)throw leaseError;
  if(!leased)return {status:'skipped',message:'Another worker holds the lease',durationMs:0};
  const {data:job,error:jobError}=await db().from('scheduler_runs').insert({status:'running'}).select('id').single();
  if(jobError)throw jobError;
  try{
    const results=await Promise.allSettled(SYMBOLS.map(s=>quote(s)));
    const quotes:Record<string,Quote>={};
    results.forEach((result,i)=>{if(result.status==='fulfilled'){
      try{requireFreshQuote(result.value);quotes[SYMBOLS[i]]=result.value;}catch{}
    }});
    const portfolios=await getPortfolios();
    if(!portfolios.length)return {status:'idle',message:'Waiting for authenticated owner to initialize portfolios',durationMs:Date.now()-start};
    // No entries if even one asset quote is missing; missing quotes are still logged.
    if(Object.keys(quotes).length!==SYMBOLS.length)
      await event(null,'warning','MARKET_PARTIAL','Only '+Object.keys(quotes).length+' of 10 quotes available');
    const ranked:Features[]=[];
    // The 15-minute signal is actionable only in the first three minutes after close.
    if(Date.now()%SIGNAL_INTERVAL_MS<3*60*1000){
      const histories=await Promise.allSettled(SYMBOLS.map(s=>candles(s,'15m',120)));
      histories.forEach((result,i)=>{
        if(result.status!=='fulfilled')return;
        const history=result.value;
        if(!history.length)return;
        try{requireFreshCandle(history[history.length-1]);const f=deriveFeatures(SYMBOLS[i],history);if(f)ranked.push(f);}catch{}
      });
    }
    ranked.sort((a,b)=>b.score-a.score||b.volumeRatio-a.volumeRatio);
    // Portfolio processing is independent, but all new entries are fail-closed on incomplete quote coverage.
    for(const p of portfolios){
      try{await evaluatePortfolio(p,Object.keys(quotes).length===SYMBOLS.length?ranked:[],quotes);}
      catch(e){await event(p.id,'error','PORTFOLIO_RUN_ERROR',e instanceof Error?e.message:String(e));}
    }
    await db().from('scheduler_runs').update({status:'ok',finished_at:new Date().toISOString(),duration_ms:Date.now()-start}).eq('id',job.id);
    return {status:'ok',message:'Processed '+portfolios.length+' portfolios and '+ranked.length+' valid indicators',durationMs:Date.now()-start};
  }catch(e){
    const message=e instanceof Error?e.message:String(e);
    await db().from('scheduler_runs').update({status:'error',finished_at:new Date().toISOString(),duration_ms:Date.now()-start,message}).eq('id',job.id);
    await event(null,'error','WORKER_FAILURE',message);throw e;
  }finally{
    await db().rpc('release_worker_lease',{p_key:'trade_cycle',p_owner:owner});
  }
}
