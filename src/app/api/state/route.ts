import {NextResponse} from 'next/server';
import {admin,authorizedUser,ensurePortfolios} from '@/lib/db';
import {SYMBOLS} from '@/lib/config';
export const dynamic='force-dynamic';
export async function GET(request:Request){
  try{
    const user=await authorizedUser(request);await ensurePortfolios(user.id);
    const db=admin();
    const {data:portfolios,error}=await db.from('portfolios').select('*').eq('user_id',user.id).order('created_at',{ascending:true});
    if(error)throw error;
    const ids=(portfolios||[]).map(p=>p.id);
    if(!ids.length)return NextResponse.json({portfolios:[]});
    const tables=[
      db.from('positions').select('*').in('portfolio_id',ids).order('opened_at',{ascending:false}).limit(100),
      db.from('fills').select('*').in('portfolio_id',ids).order('executed_at',{ascending:false}).limit(150),
      db.from('ai_decisions').select('id,portfolio_id,symbol,candidate_id,model,status,error,created_at,response_payload').in('portfolio_id',ids).order('created_at',{ascending:false}).limit(70),
      db.from('signals').select('portfolio_id,candidate_id,symbol,action,result,reason,created_at').in('portfolio_id',ids).order('created_at',{ascending:false}).limit(150),
      db.from('equity_snapshots').select('portfolio_id,observed_minute,equity,cash,exposure').in('portfolio_id',ids).order('observed_minute',{ascending:false}).limit(1200),
      db.from('benchmark_snapshots').select('portfolio_id,observed_minute,btc_equity,basket_equity').in('portfolio_id',ids).order('observed_minute',{ascending:false}).limit(1200),
      db.from('system_events').select('portfolio_id,severity,code,message,created_at').or('portfolio_id.is.null,portfolio_id.in.('+ids.join(',')+')').order('created_at',{ascending:false}).limit(100),
      db.from('scheduler_runs').select('status,started_at,finished_at,duration_ms').order('started_at',{ascending:false}).limit(1)
    ];
    const data=await Promise.all(tables);
    for(const item of data)if(item.error)throw item.error;
    return NextResponse.json({portfolios,positions:data[0].data,fills:data[1].data,aiDecisions:data[2].data,
      signals:data[3].data,equity:data[4].data,benchmarks:data[5].data,events:data[6].data,
      scheduler:data[7].data?.[0]??null,symbols:SYMBOLS,asOf:new Date().toISOString()},{headers:{'Cache-Control':'private, no-store'}});
  }catch(e){
    const message=e instanceof Error?e.message:'Unknown error';
    return NextResponse.json({error:message==='Authentication required'||message==='Unauthorized account'?'Unauthorized':message},{status:message==='Authentication required'||message==='Unauthorized account'?401:503});
  }
}
