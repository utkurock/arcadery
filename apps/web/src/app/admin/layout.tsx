import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { Lock } from 'lucide-react';
import Link from 'next/link';
import { checkAdmin } from '@/lib/admin/auth';
import { AdminNav } from '@/components/admin/admin-nav';

// Server-component gate. The wallet allowlist lives in a non-public env var
// (ADMIN_WALLETS) so the list never enters the client bundle. Non-admins get
// either a redirect to /explore (when signed in) or a wallet-prompt screen
// (when signed out / wallet missing) — never the underlying admin chrome.

export const metadata = {
  title: 'Admin · arcadery',
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const check = await checkAdmin();
  if (!check.ok) {
    if (check.reason === 'unauthenticated') {
      return <SignInPrompt />;
    }
    if (check.reason === 'not_configured') {
      return <NotConfigured />;
    }
    // not_admin → hard redirect so we don't leak the existence of the panel.
    redirect('/explore');
  }
  return (
    <div className="flex min-h-screen bg-[#06070c] text-white">
      <AdminNav wallet={check.wallet} />
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}

function SignInPrompt() {
  return (
    <div className="min-h-screen bg-[#06070c] text-white flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        <Lock className="h-10 w-10 text-white/30 mx-auto mb-4" />
        <h1 className="text-2xl font-bold mb-2">Admin only</h1>
        <p className="text-sm text-white/60 font-mono mb-6">
          Connect with an authorized wallet to view the dashboard.
        </p>
        <Link
          href="/explore"
          className="inline-block rounded-full bg-white/10 hover:bg-white/15 px-5 py-2.5 text-sm font-mono"
        >
          Back to app
        </Link>
      </div>
    </div>
  );
}

function NotConfigured() {
  return (
    <div className="min-h-screen bg-[#06070c] text-white flex items-center justify-center px-6">
      <div className="max-w-lg w-full">
        <Lock className="h-10 w-10 text-amber-300/70 mx-auto mb-4" />
        <h1 className="text-2xl font-bold mb-2 text-center">
          Admin panel not configured
        </h1>
        <p className="text-sm text-white/60 font-mono leading-relaxed text-center">
          Set the{' '}
          <code className="rounded bg-white/10 px-1.5 py-0.5 text-amber-200">
            ADMIN_WALLETS
          </code>{' '}
          env var to a comma-separated list of base58 Solana addresses, then
          redeploy.
        </p>
      </div>
    </div>
  );
}
