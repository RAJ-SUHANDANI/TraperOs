import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { INITIAL_CASH } from './config';
import type { Portfolio, Position } from './types';
let cached:SupabaseClient|null=null;
export function admin():SupabaseClient {
  if(!cached){
    const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
    if(!url||!key)throw new Error('Supabase service configuration missing');
    cached=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  }
  return cached;
}
export function publicSupabase():SupabaseClient{
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key)throw new Error('Supabase public configuration missing');
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
export async function authorizedUser(request:Request):Promise<{id:string;email:string}>{
 const match=/^Bearer (.+)$/i.exec(request.headers.get('authorization')||'');
 if(!match)throw new Error('Authentication required');
 const {data,error}=await publicSupabase().auth.getUser(match[1]);
 const owner=(process.env.OWNER_EMAIL||'').trim().toLowerCase();
 if(error||!data.user||!data.user.email||!owner||data.user.email.toLowerCase()!==owner)throw new Error('Unauthorized account');
 return {id:data.user.id,email:data.user.email};
}
export async function ensurePortfolios(userId:string):Promise<void>{
 const db=admin();
 for(const kind of ['ai','rules'] as const){
   const {data,error}=await db.from('portfolios').select('id').eq('user_id',userId).eq('kind',kind).limit(1);
   if(error)throw error;
   if(!data?.length){
     const {error:createError}=await db.from('portfolios').insert({user_id:userId,kind,cash:INITIAL_CASH,initial_cash:INITIAL_CASH,day_start_equity:INITIAL_CASH});
     // A second concurrent first-login request can lose the unique-index race.
     if(createError&&!createError.message.toLowerCase().includes('duplicate'))throw createError;
   }
 }
}
export async function getPositions(portfolioId:string):Promise<Position[]>{
 const {data,error}=await admin().from('positions').select('*').eq('portfolio_id',portfolioId);
 if(error)throw error;return (data||[]) as Position[];
}
export async function getPortfolios():Promise<Portfolio[]>{
 const {data,error}=await admin().from('portfolios').select('*').order('created_at',{ascending:true});
 if(error)throw error;return (data||[]) as Portfolio[];
}
export async function event(portfolioId:string|null,severity:string,code:string,message:string,details?:unknown):Promise<void>{
 const {error}=await admin().from('system_events').insert({portfolio_id:portfolioId,severity,code,message,details:details??null});
 if(error)console.error('Audit event write failed:',error.message);
}
export function checkDb(error:unknown,label:string):void{
 if(error)throw new Error(label+': '+(error instanceof Error?error.message:String(error)));
}
