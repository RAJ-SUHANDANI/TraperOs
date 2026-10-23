import {NextResponse} from 'next/server';
import {z} from 'zod';
import {admin,authorizedUser,event} from '@/lib/db';
import {INITIAL_CASH} from '@/lib/config';
export const dynamic='force-dynamic';
const input=z.discriminatedUnion('action',[
  z.object({action:z.literal('pause'),portfolioId:z.string().uuid()}),
  z.object({action:z.literal('resume'),portfolioId:z.string().uuid()}),
  z.object({action:z.literal('challenge'),balance:z.number().finite().min(100).max(100000).default(INITIAL_CASH)})
]);
export async function POST(request:Request){
  try{
    const user=await authorizedUser(request);
    const parsed=input.safeParse(await request.json());
    if(!parsed.success)return NextResponse.json({error:'Invalid control request'},{status:400});
    const db=admin(),value=parsed.data;
    if(value.action==='challenge'){
      const ends=new Date(Date.now()+48*3600000).toISOString();
      const {data,error}=await db.from('portfolios').insert({
        user_id:user.id,kind:'challenge',cash:value.balance,initial_cash:value.balance,
        day_start_equity:value.balance,challenge_ends_at:ends
      }).select('id').single();
      if(error)throw error;await event(data.id,'info','CHALLENGE_START','48-hour virtual challenge created');
      return NextResponse.json({ok:true,id:data.id,ends});
    }
    const {data:owned,error:ownError}=await db.from('portfolios').select('id,pause_reason').eq('id',value.portfolioId).eq('user_id',user.id).single();
    if(ownError||!owned)return NextResponse.json({error:'Portfolio not found'},{status:404});
    if(value.action==='resume'&&owned.pause_reason&&/(Monitoring|Missing|daily loss)/i.test(owned.pause_reason))
      return NextResponse.json({error:'Safety pause requires operator review and recovery; resuming is blocked through this endpoint'},{status:409});
    const paused=value.action==='pause';
    const {error}=await db.from('portfolios').update({is_paused:paused,pause_reason:paused?'Manual pause':null}).eq('id',owned.id);
    if(error)throw error;
    await event(owned.id,'info',paused?'MANUAL_PAUSE':'MANUAL_RESUME','Owner requested '+value.action);
    return NextResponse.json({ok:true});
  }catch(e){
    const msg=e instanceof Error?e.message:'Unknown';
    return NextResponse.json({error:msg==='Unauthorized account'||msg==='Authentication required'?'Unauthorized':msg},{status:msg==='Unauthorized account'||msg==='Authentication required'?401:503});
  }
}
