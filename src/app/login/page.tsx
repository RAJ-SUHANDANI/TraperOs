'use client';
import Link from 'next/link';
import {useMemo,useState} from 'react';
import {createClient} from '@supabase/supabase-js';
export default function Login(){
 const [email,setEmail]=useState(''),[message,setMessage]=useState(''),[pending,setPending]=useState(false);
 const client=useMemo(()=>{
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url&&key?createClient(url,key):null;
 },[]);
 async function signIn(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();setPending(true);setMessage('');
  if(!client){setMessage('Supabase is not configured. Follow README deployment steps.');setPending(false);return;}
  const {error}=await client.auth.signInWithOtp({email,emailRedirectTo:window.location.origin+'/dashboard'});
  setMessage(error?error.message:'Check your inbox for a secure sign-in link. Only the configured owner can read the ledger.');
  setPending(false);
 }
 return <div className="site"><header className="site-header"><Link className="logo" href="/"><span className="mark">T</span>TraperOS</Link><div className="nav"><Link href="/">Overview</Link><Link href="/demo">Public demo</Link></div></header>
 <main className="login-wrap"><div className="login-card"><div className="micro muted">Restricted access / Owner only</div><h1 className="serif">Enter the ledger.</h1><p style={{color:'var(--muted)',lineHeight:1.7}}>Sign in using a one-time email link. The private account requires the approved owner address.</p>
 <form onSubmit={signIn}><label className="micro" htmlFor="email">Your email</label><input className="field" id="email" required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/><button className="button" type="submit" disabled={pending}>{pending?'Sending…':'Send sign-in link'}</button></form>
 {message&&<p className="notice" role="status" style={{marginTop:20}}>{message}</p>}
 </div></main><footer className="footer"><span>OWNER ACCESS ONLY</span><span>Paper trading · No real funds</span></footer></div>;
}
