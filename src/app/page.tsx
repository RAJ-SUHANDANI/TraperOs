import Link from 'next/link';
import {ArrowUpRight,BookOpen,LockKeyhole,ShieldCheck,Waypoints} from 'lucide-react';
import DemoTerminal from '@/components/DemoTerminal';
export default function Home(){
 return <div className="site">
  <header className="site-header">
   <Link className="logo" href="/"><span className="mark">T</span>TraperOS</Link>
   <nav className="nav"><a href="#demo">Test demo</a><Link href="/login">Private access</Link><Link className="button tiny" href="/dashboard">Open ledger <ArrowUpRight size={13}/></Link></nav>
  </header>
  <section className="hero">
   <div className="hero-content">
    <span className="micro muted">A private market experiment · paper trades only</span>
    <h1 className="serif">Risk first.<br/><em>Reasons on</em><br/>the record.</h1>
    <p>Ten crypto markets. Fifteen-minute signals. An AI that proposes, a rules engine that decides what is permissible, and a ledger that accounts for every virtual dollar.</p>
    <div style={{display:'flex',gap:12,flexWrap:'wrap'}}><a className="button" href="#demo">Try the demo <ArrowUpRight size={15}/></a><Link className="button secondary" href="/login">Sign in privately</Link></div>
   </div>
   <div className="hero-side">
    <div className="micro muted" style={{marginBottom:10}}>Illustrative account · not live performance</div>
    <div className="hero-sample">
     <div className="hstack"><span className="micro muted">VIRTUAL STARTING EQUITY</span><span className="pill">0 REAL FUNDS</span></div>
     <div className="metric-big">10,000.00 <span style={{fontSize:15}}>USDT</span></div>
     <div className="divider"/>
     <div className="hstack"><span className="micro muted">PLANNED RISK / TRADE</span><span className="mono">≤ 1.5%</span></div>
     <div className="divider"/>
     <div className="hstack"><span className="micro muted">MAX POSITIONS</span><span className="mono">03</span></div>
     <div className="divider"/>
     <div className="hstack"><span className="micro muted">DAILY LOSS PAUSE</span><span className="mono">−4.0%</span></div>
     <div className="divider"/>
     <div className="micro muted">Every number has an origin. Every order has an audit trail.</div>
    </div>
   </div>
  </section>
  <section className="lead-section">
   <div className="micro muted">Operating principles / 001—003</div>
   <div className="grid-3">
    <div className="fact"><ShieldCheck size={25} strokeWidth={1.5}/><h3>Models never place trades</h3><p>The AI suggests an entry. Hard-coded exposure, position sizing and stop rules retain final control.</p></div>
    <div className="fact"><Waypoints size={25} strokeWidth={1.5}/><h3>Two portfolios, one market</h3><p>Compare AI-assisted entries with indicator rules, on the same market window and cost assumptions.</p></div>
    <div className="fact"><BookOpen size={25} strokeWidth={1.5}/><h3>Audit the losing days too</h3><p>Fees, slippage, missed monitoring runs, rejected decisions and benchmark underperformance stay visible.</p></div>
   </div>
  </section>
  <section id="demo" className="lead-section">
   <div className="section-head"><div><div className="micro muted">Open demonstration / No sign-in required</div><h2 className="section-title">Move the market. Inspect the ledger.</h2></div><Link href="/demo" className="button secondary">Full demo <ArrowUpRight size={14}/></Link></div>
   <DemoTerminal compact/>
  </section>
  <section className="lead-section">
   <div className="micro muted">Privacy and constraints</div>
   <h2 className="section-title">No brokerage credentials.<br/>No actual orders.</h2>
   <p style={{maxWidth:720,lineHeight:1.8,color:'var(--muted)'}}>TraperOS is a personal research tool. Public demo mode uses fictional data. The authenticated dashboard requires your own free service configuration. Scheduled polling is best-effort and cannot guarantee real-time fills or profits.</p>
   <div className="hstack" style={{justifyContent:'flex-start'}}><LockKeyhole size={18}/><span className="micro">PRIVATE LEDGER · AUTHENTICATED ACCOUNT · NO LEVERAGE</span></div>
  </section>
  <footer className="footer"><span>TRAPEROS / PAPER-TRADING RESEARCH</span><span>Not investment advice. Simulated execution is not real execution.</span></footer>
 </div>;
}
