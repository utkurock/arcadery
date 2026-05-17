import { Loader2 } from 'lucide-react';

export default function GlobalLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0a0a0f] text-white">
      <div className="flex items-center gap-3 text-sm text-white/40">
        <Loader2 className="h-4 w-4 animate-spin text-[#8b7ec8]" />
        Loading…
      </div>
    </main>
  );
}
