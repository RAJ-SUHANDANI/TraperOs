import { DAILY_LOSS_LIMIT,DEFAULT_FEE_RATE,DEFAULT_SLIPPAGE_RATE,MAX_AGGREGATE_RISK,MAX_POSITION_FRACTION,MAX_POSITIONS,MAX_TOTAL_EXPOSURE,MIN_NET_REWARD_RISK,RISK_FRACTION } from './config';
import type { Portfolio,Position,Quote,RiskResult } from './types';
export type RiskInput={portfolio:Portfolio;positions:Position[];quote:Quote;proposedAllocationPct:number;proposedStopPct:number;proposedTargetPct:number;otherQuotes:Record<string,number>;dayStartEquity:number;now?:number};
export function markEquity(portfolio:Pick<Portfolio,'cash'>,positions:Position[],prices:Record<string,number>):number{
  return portfolio.cash+positions.reduce((v,p)=>v+p.quantity*(prices[p.symbol]??p.entry_price),0);
}
export function plannedRisk(p:Position):number{return Math.max(0,p.entry_price-p.stop_price)*p.quantity+p.entry_fee;}
export function checkRisk(input:RiskInput):RiskResult{
  const {portfolio,positions,quote,proposedAllocationPct,proposedStopPct,proposedTargetPct,otherQuotes,dayStartEquity}=input;
  const now=input.now??Date.now();
  if(portfolio.is_paused)return {ok:false,reason:'Portfolio paused'};
  if(portfolio.challenge_ends_at&&Date.parse(portfolio.challenge_ends_at)<=now)return {ok:false,reason:'Challenge ended'};
  if(positions.length>=MAX_POSITIONS)return {ok:false,reason:'Maximum concurrent positions reached'};
  if(positions.some(p=>p.symbol===quote.symbol))return {ok:false,reason:'Duplicate asset position'};
  if(!Number.isFinite(proposedAllocationPct)||!Number.isFinite(proposedStopPct)||!Number.isFinite(proposedTargetPct))return {ok:false,reason:'Invalid AI numeric output'};
  if(proposedAllocationPct<=0||proposedAllocationPct>20||proposedStopPct<=0||proposedStopPct>10||proposedTargetPct<=0||proposedTargetPct>20)return {ok:false,reason:'Proposal outside permitted range'};
  if(!(quote.bid>0&&quote.ask>=quote.bid))return {ok:false,reason:'Invalid quote'};
  const equity=markEquity(portfolio,positions,{...otherQuotes,[quote.symbol]:quote.bid});
  if(equity<=0||dayStartEquity<=0)return {ok:false,reason:'Invalid portfolio equity'};
  if(equity<=dayStartEquity*(1-DAILY_LOSS_LIMIT))return {ok:false,reason:'Daily loss circuit breaker'};
  const costBuy=quote.ask*(1+DEFAULT_SLIPPAGE_RATE);
  const stop=costBuy*(1-proposedStopPct/100);
  const target=costBuy*(1+proposedTargetPct/100);
  const entryFee=costBuy*DEFAULT_FEE_RATE,exitCost=stop*(DEFAULT_FEE_RATE+DEFAULT_SLIPPAGE_RATE);
  const riskPerUnit=costBuy-stop+entryFee+exitCost;
  const rewardPerUnit=target*(1-DEFAULT_FEE_RATE-DEFAULT_SLIPPAGE_RATE)-costBuy-entryFee;
  if(riskPerUnit<=0||rewardPerUnit/riskPerUnit<MIN_NET_REWARD_RISK)return {ok:false,reason:'Insufficient net reward-to-risk'};
  const riskExisting=positions.reduce((v,p)=>v+plannedRisk(p),0);
  const reservedExposure=positions.reduce((v,p)=>v+p.quantity*(otherQuotes[p.symbol]??p.entry_price),0);
  const allowedRisk=Math.max(0,Math.min(RISK_FRACTION*equity,MAX_AGGREGATE_RISK*equity-riskExisting,(equity-dayStartEquity*(1-DAILY_LOSS_LIMIT))*0.75));
  const byRisk=allowedRisk/riskPerUnit;
  const byAllocation=Math.min(proposedAllocationPct/100,MAX_POSITION_FRACTION)*equity/costBuy;
  const byTotalExposure=Math.max(0,MAX_TOTAL_EXPOSURE*equity-reservedExposure)/costBuy;
  const byCash=Math.max(0,portfolio.cash)/(costBuy*(1+DEFAULT_FEE_RATE));
  const quantity=Math.floor(Math.min(byRisk,byAllocation,byTotalExposure,byCash)*1e7)/1e7;
  if(!Number.isFinite(quantity)||quantity<=0||quantity*costBuy<10)return {ok:false,reason:'Insufficient permissible size'};
  return {ok:true,quantity,risk:quantity*riskPerUnit,stop,target,notional:quantity*costBuy};
}
