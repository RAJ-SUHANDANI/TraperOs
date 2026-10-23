import {admin} from './db';
import {DEFAULT_FEE_RATE,DEFAULT_SLIPPAGE_RATE} from './config';
import type {Position,Quote,RiskResult} from './types';
export async function buyPaper(portfolioId:string,symbol:string,q:Quote,risk:Extract<RiskResult,{ok:true}>,signalKey:string,source:string){
  const {data,error}=await admin().rpc('paper_buy',{
    p_portfolio:portfolioId,p_symbol:symbol,p_price:q.ask*(1+DEFAULT_SLIPPAGE_RATE),
    p_quantity:risk.quantity,p_fee_rate:DEFAULT_FEE_RATE,p_stop:risk.stop,p_target:risk.target,
    p_signal:signalKey,p_event:'buy:'+portfolioId+':'+signalKey,p_source:source
  });
  if(error)throw error;return data;
}
export async function sellPaper(position:Position,price:number,reason:string,source:string,eventId:string){
  const {data,error}=await admin().rpc('paper_sell',{
    p_position:position.id,p_price:price,p_fee_rate:DEFAULT_FEE_RATE,
    p_reason:reason,p_event:'sell:'+position.id+':'+eventId,p_source:source
  });
  if(error)throw error;return data;
}
