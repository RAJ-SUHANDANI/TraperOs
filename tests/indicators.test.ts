import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sma,rsi,atr,deriveFeatures} from '../src/lib/indicators';
import type {Candle} from '../src/lib/types';
test('SMA and RSI are deterministic and bounded',()=>{
 assert.equal(sma([1,2,3,4,5],3),4);
 assert.equal(rsi([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]),100);
 assert.equal(rsi(Array.from({length:15},()=>10)),50);
});
test('Indicators require a completed and valid candle history',()=>{
 const data:Candle[]=Array.from({length:100},(_,i)=>({
   openTime:i*900000,closeTime:(i+1)*900000-1,open:100+i*.14,
   high:101+i*.14,low:99+i*.14,close:100.1+i*.14,volume:1000+i
 }));
 const f=deriveFeatures('BTCUSDT',data);
 assert.ok(f);assert.ok(Number.isFinite(f.atr14));assert.ok(f.ema20>0);assert.ok(f.bbUpper>f.bbLower);assert.ok(f.rsi14>=0&&f.rsi14<=100);
 assert.equal(deriveFeatures('BTCUSDT',data.slice(0,30)),null);
 assert.ok(atr(data)>0);
});
