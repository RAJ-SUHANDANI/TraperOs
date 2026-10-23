import {NextResponse} from 'next/server';
import {runTradingCycle} from '@/lib/runner';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;
export async function POST(request:Request){
  const secret=process.env.CRON_SECRET;
  if(!secret||secret.length<24||request.headers.get('authorization')!=='Bearer '+secret)
    return NextResponse.json({error:'Unauthorized'},{status:401});
  try{return NextResponse.json(await runTradingCycle(),{headers:{'Cache-Control':'no-store'}});}
  catch(e){console.error('Worker error',e);return NextResponse.json({error:'Worker failed; inspect private audit logs'},{status:500});}
}
