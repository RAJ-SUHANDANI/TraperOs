import {test} from 'node:test';
import assert from 'node:assert/strict';
import {checkRisk,markEquity} from '../src/lib/risk';
import type {Portfolio,Position,Quote} from '../src/lib/types';
const base:Portfolio={id:'p',user_id:'u',kind:'ai',cash:10000,initial_cash:10000,created_at:'2026-01-01',is_paused:false,pause_reason:null,day_key:null,day_start_equity:10000,challenge_ends_at:null};
const q:Quote={symbol:'BTCUSDT',bid:99.99,ask:100,receivedAt:Date.now()};
const proposal=()=>({portfolio:{...base},positions:[] as Position[],quote:q,proposedAllocationPct:20,proposedStopPct:2,proposedTargetPct:6,otherQuotes:{BTCUSDT:99.99},dayStartEquity:10000});
test('Limits risk, allocation, and cash without trusting requested size',()=>{
 const r=checkRisk(proposal());assert.equal(r.ok,true);
 if(r.ok){assert.ok(r.risk<=150.0001);assert.ok(r.notional<=2000.01);assert.ok(r.quantity>0);}
});
test('Refuses entries at daily loss threshold',()=>{
 const r=checkRisk({...proposal(),portfolio:{...base,cash:9600},dayStartEquity:10000});
 assert.equal(r.ok,false);
});
test('Refuses bad net reward-to-risk after costs',()=>{
 const r=checkRisk({...proposal(),proposedStopPct:1.4,proposedTargetPct:1});
 assert.equal(r.ok,false);
});
test('Rejects manually paused accounts and challenge expiry',()=>{
 assert.equal(checkRisk({...proposal(),portfolio:{...base,is_paused:true}}).ok,false);
 assert.equal(checkRisk({...proposal(),portfolio:{...base,challenge_ends_at:'2020-01-01T00:00:00Z'}}).ok,false);
});
test('Equity includes open holdings',()=>{
 const p:Position={id:'x',portfolio_id:'p',symbol:'BTCUSDT',quantity:2,entry_price:100,stop_price:98,target_price:106,entry_fee:.2,opened_at:'2026-01-01',last_observed_at:null,signal_key:'s'};
 assert.equal(markEquity({cash:800},[p],{BTCUSDT:110}),1020);
});

test('Two-candle cooldown prevents immediate re-entry',async()=>{
 const {eligibleAfterCooldown}=await import('../src/lib/strategies');
 const exit=1000000,bar=15*60*1000;
 assert.equal(eligibleAfterCooldown(exit+bar,exit),false);
 assert.equal(eligibleAfterCooldown(exit+2*bar,exit),true);
 assert.equal(eligibleAfterCooldown(exit+bar,undefined),true);
});
