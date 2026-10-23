import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'TraperOS — The Market Ledger',description:'Private, cost-aware crypto paper-trading research. No real-money orders.'};
export default function RootLayout({children}:{children:React.ReactNode}){
 return <html lang="en"><body>{children}</body></html>;
}
