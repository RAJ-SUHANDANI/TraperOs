import Link from 'next/link';
import DemoTerminal from '@/components/DemoTerminal';
export default function Demo(){
 return <div className="site"><header className="site-header"><Link className="logo" href="/"><span className="mark">T</span>TraperOS</Link><div className="nav"><Link href="/">Overview</Link><Link className="button tiny" href="/login">Private ledger</Link></div></header>
 <div className="lead-section" style={{paddingTop:54}}><div className="micro muted">Public interactive demonstration / Synthetic environment</div><h1 className="section-title" style={{fontSize:64,marginBottom:10}}>A trading desk without a trade.</h1><p className="muted" style={{fontSize:16,lineHeight:1.7,maxWidth:780}}>Advance fictional market candles, open simulated positions and inspect virtual fills. This demo runs locally in your browser and does not contact Binance, OpenRouter or your private database.</p></div>
 <div style={{padding:'34px 0 60px'}}><DemoTerminal/></div>
 <footer className="footer"><span>DEMO MODE / NO CONNECTIONS</span><Link href="/">Return to overview</Link></footer>
 </div>;
}
