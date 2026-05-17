import type { Metadata } from 'next';
import { Public_Sans, Inter } from 'next/font/google';
import localFont from 'next/font/local';
import { SolanaProvider } from '@/providers/solana-provider';
import { CreditsProvider } from '@/lib/credits/context';
import { ClientModals } from '@/components/client-modals';
import { AuthListener } from '@/components/auth/auth-listener';
import { WalletAuthBridge } from '@/components/auth/wallet-auth-bridge';
import { Toaster } from 'sonner';
import './globals.css';

const publicSans = Public_Sans({
  subsets: ['latin'],
  variable: '--font-public-sans',
  weight: ['300', '400', '500', '600', '700', '800', '900'],
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  weight: ['300', '400', '500', '600', '700'],
});

const vintageLegacy = localFont({
  src: './fonts/VintageLegacy-Regular.otf',
  variable: '--font-vintage',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Arcadery — Prompt to Web3 Game',
  description: 'The no-code Web3 game platform. Describe your game, AI builds it, launch your token, and start earning — all from one editor.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${publicSans.variable} ${vintageLegacy.variable} ${inter.variable}`}>
      <head>
        {/* Suppress noisy errors thrown by wallet browser extensions (e.g. Phantom's evmAsk.js fighting MetaMask over window.ethereum). Not from our app. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){function isExt(e){var f=(e&&(e.filename||(e.error&&e.error.stack)))||'';var m=(e&&e.message)||'';return f.indexOf('chrome-extension://')>-1||f.indexOf('moz-extension://')>-1||f.indexOf('evmAsk.js')>-1||/Cannot redefine property:\\s*ethereum/.test(m);}window.addEventListener('error',function(e){if(isExt(e)){e.stopImmediatePropagation();e.preventDefault();}},true);window.addEventListener('unhandledrejection',function(e){var r=e&&e.reason;var m=(r&&r.message)||String(r||'');var s=(r&&r.stack)||'';if(/Cannot redefine property:\\s*ethereum/.test(m)||s.indexOf('chrome-extension://')>-1||s.indexOf('evmAsk.js')>-1){e.stopImmediatePropagation();e.preventDefault();}},true);})();`,
          }}
        />
      </head>
      <body className="antialiased font-[family-name:var(--font-public-sans)]">
        <SolanaProvider>
          <CreditsProvider>
            {children}
            <AuthListener />
            <WalletAuthBridge />
            <ClientModals />
            <Toaster
              theme="dark"
              position="bottom-right"
              toastOptions={{
                style: {
                  background: '#13141a',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: 'rgba(255,255,255,0.9)',
                },
                className: 'font-[family-name:var(--font-inter)]',
              }}
            />
          </CreditsProvider>
        </SolanaProvider>
      </body>
    </html>
  );
}
