import {NextResponse} from 'next/server';
import {authorizedUser} from '@/lib/db';
import {isSymbol} from '@/lib/config';
import {candles} from '@/lib/market';
import {deriveFeatures} from '@/lib/indicators';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 try{
  await authorizedUser(request);
  const symbol=new URL(request.url).searchParams.get('symbol')||'BTCUSDT';
  if(!isSymbol(symbol))return NextResponse.json({error:'Asset not in fixed trading universe'},{status:400});
  const data=await candles(symbol,'15m',160);
  const features=deriveFeatures(symbol,data);
  return NextResponse.json({symbol,candles:data,features,asOf:new Date().toISOString()},
    {headers:{'Cache-Control':'private, no-store'}});
 }catch(e){
  const message=e instanceof Error?e.message:'Market request failed';
  return NextResponse.json({error:message},{status:message==='Unauthorized account'||message==='Authentication required'?401:503});
 }
}
