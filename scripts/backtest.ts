/* Reproducible, rules-only 15-minute historical replay.
 * Entries next candle open; conservative stop-first within candles.
 * Not a historical reproduction of live bid/ask liquidity. No LLM calls.
 * Run: npm run backtest -- 30
 */
import {candles} from '../src/lib/market';
import {deriveFeatures} from '../src/lib/indicators';
import {deterministicDecision,qualifies,eligibleAfterCooldown} from '../src/lib/strategies';
import {checkRisk,markEquity} from '../src/lib/risk';
import {DEFAULT_FEE_RATE,DEFAULT_SLIPPAGE_RATE,INITIAL_CASH,SYMBOLS} from '../src/lib/config';
import type {Candle,Portfolio,Position} from '../src/lib/types';

const days=Math.max(7,Math.min(90,Number(process.argv[2]||30)));
if(!Number.isFinite(days))throw new Error('Invalid backtest duration');
const end=Date.now(),start=end-days*86400000;
async function history(symbol:string):Promise<Candle[]>{
 let cursor=Math.floor((start-75*900000)/900000)*900000;const seen=new Map<number,Candle>();
 for(let page=0;page<15&&cursor<end;page++){
   const rows=await candles(symbol,'15m',1000,cursor);
   if(!rows.length)break;
   for(const c of rows)if(c.openTime<end)seen.set(c.openTime,c);
   const next=rows.at(-1)!.openTime+900000;
   if(next<=cursor)throw new Error('Historical pagination stalled');
   cursor=next;
   if(rows.length<1000)break;
 }
 return [...seen.values()].sort((a,b)=>a.openTime-b.openTime);
}
async function main(){
 const results=await Promise.all(SYMBOLS.map(async s=>({symbol:s,history:await history(s)})));
 const lookups=new Map(results.map(r=>[r.symbol,new Map(r.history.map(c=>[c.openTime,c]))]));
 const times=[...new Set(results.flatMap(r=>r.history.map(c=>c.openTime)))].filter(t=>t>=start&&t<end).sort((a,b)=>a-b);
 if(times.length<100)throw new Error('Insufficient historical data for replay');
 const portfolio:Portfolio={id:'offline',user_id:'offline',kind:'rules',cash:INITIAL_CASH,initial_cash:INITIAL_CASH,created_at:new Date(start).toISOString(),
    is_paused:false,pause_reason:null,day_key:null,day_start_equity:INITIAL_CASH,challenge_ends_at:null};
 let positions:Position[]=[],pending:string[]=[],closed=0,wins=0,grossProfit=0,grossLoss=0,peak=INITIAL_CASH,maxDrawdown=0,totalFees=0;
 const lastExit=new Map<string,number>();
 const equitySeries:{time:string;equity:number}[]=[];
 for(const t of times){
   const candlesNow=Object.fromEntries(SYMBOLS.map(s=>[s,lookups.get(s)?.get(t)]));
   const prices:Record<string,number>={};
   for(const symbol of SYMBOLS){const c=candlesNow[symbol];if(c)prices[symbol]=c.close;}
   if(Object.keys(prices).length!==SYMBOLS.length)continue;
   // Orders signaled on candle N may fill ONLY at the open of candle N+1.
   for(const symbol of pending){
     const c=candlesNow[symbol];
     if(!c||positions.some(p=>p.symbol===symbol))continue;
     const q={symbol,bid:c.open*.9999,ask:c.open*1.0001,receivedAt:t};
     const fake={...portfolio};
     const f=lookups.get(symbol as (typeof SYMBOLS)[number]);
     const prior=f?[...f.values()].filter(row=>row.openTime<t).slice(-80):[];
     const feature=deriveFeatures(symbol,prior);
     if(!feature)continue;
     const decision=deterministicDecision(feature,symbol+':'+t);
     if(decision.action!=='BUY')continue;
     const risk=checkRisk({portfolio:fake,positions,quote:q,otherQuotes:prices,
       proposedAllocationPct:decision.allocation_pct,proposedStopPct:decision.stop_loss_pct,
       proposedTargetPct:decision.take_profit_pct,dayStartEquity:portfolio.day_start_equity,now:t});
     if(!risk.ok)continue;
     const entry=q.ask*(1+DEFAULT_SLIPPAGE_RATE),fee=entry*risk.quantity*DEFAULT_FEE_RATE;
     portfolio.cash-=entry*risk.quantity+fee;totalFees+=fee;
     positions.push({id:symbol+':'+t,portfolio_id:'offline',symbol,quantity:risk.quantity,entry_price:entry,
       stop_price:risk.stop,target_price:risk.target,entry_fee:fee,opened_at:new Date(t).toISOString(),last_observed_at:null,signal_key:symbol+':'+t});
   }
   pending=[];
   for(const p of [...positions]){
     const c=candlesNow[p.symbol];if(!c)continue;
     let exit=0;
     if(c.low<=p.stop_price)exit=Math.min(p.stop_price,c.open)*(1-DEFAULT_SLIPPAGE_RATE);
     else if(c.high>=p.target_price)exit=p.target_price*(1-DEFAULT_SLIPPAGE_RATE);
     if(!exit)continue;
     const fee=exit*p.quantity*DEFAULT_FEE_RATE,pnl=(exit-p.entry_price)*p.quantity-fee-p.entry_fee;
     portfolio.cash+=exit*p.quantity-fee;totalFees+=fee;
     positions=positions.filter(x=>x.id!==p.id);lastExit.set(p.symbol,t);closed++;
     if(pnl>0){wins++;grossProfit+=pnl;}else grossLoss-=pnl;
   }
   const equity=markEquity(portfolio,positions,prices),day=new Date(t).toISOString().slice(0,10);
   if(portfolio.day_key!==day){portfolio.day_key=day;portfolio.day_start_equity=equity;portfolio.is_paused=false;}
   if(equity<=portfolio.day_start_equity*.96)portfolio.is_paused=true;
   peak=Math.max(peak,equity);maxDrawdown=Math.max(maxDrawdown,(peak-equity)/peak);
   equitySeries.push({time:new Date(t).toISOString(),equity});
   if(portfolio.is_paused)continue;
   const candidates=SYMBOLS.map(s=>{
     const hist=lookups.get(s);if(!hist)return null;
     const prior=[...hist.values()].filter(c=>c.openTime<=t).slice(-120);
     const f=deriveFeatures(s,prior);return f&&qualifies(f)&&eligibleAfterCooldown(t,lastExit.get(s))?f:null;
   }).filter(f=>f!==null).sort((a,b)=>b.score-a.score||b.volumeRatio-a.volumeRatio).slice(0,2);
   pending=candidates.filter(f=>!positions.some(p=>p.symbol===f.symbol)).map(f=>f.symbol);
 }
 const last=equitySeries.at(-1);
 if(!last)throw new Error('No completed portfolio observations');
 const btc=lookups.get('BTCUSDT')!;
 const firstC=[...btc.values()].find(c=>c.openTime>=start),lastC=[...btc.values()].filter(c=>c.openTime<=Date.parse(last.time)).at(-1);
 const btcHold=firstC&&lastC?INITIAL_CASH*(lastC.close*(1-.0015))/(firstC.open*(1+.0015)):null;
 const output={test:'rules-only historical 15m replay',source:'Binance public candles',from:new Date(start).toISOString(),to:last.time,
   startingUSDT:INITIAL_CASH,endingEquityUSDT:Number(last.equity.toFixed(2)),netReturnPct:Number(((last.equity/INITIAL_CASH-1)*100).toFixed(3)),
   btcBuyHoldUSDT:btcHold&&Number(btcHold.toFixed(2)),closedTrades:closed,winRatePct:closed?Number((wins/closed*100).toFixed(2)):null,
   profitFactor:grossLoss?Number((grossProfit/grossLoss).toFixed(3)):null,
   maxDrawdownPct:Number((maxDrawdown*100).toFixed(3)),totalFeesUSDT:Number(totalFees.toFixed(2)),
   assumptions:['No future candle used for entry','Stop-first if stop and target both hit','Fixed 0.1% fee per side','Fixed 0.05% slippage per side','Spread approximated','OHLCV cannot reconstruct intrabar execution ordering','Not an LLM strategy backtest']};
 console.log(JSON.stringify(output,null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
