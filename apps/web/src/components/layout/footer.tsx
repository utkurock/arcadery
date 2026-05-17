import Link from 'next/link';

const footerLinks = [
  { label: 'Create', href: '/create/new' },
  { label: 'Docs', href: '/docs' },
];

export function Footer() {
  return (
    <footer className="border-t border-white/[0.06] bg-[#0a0a0f]">
      <div className="mx-auto max-w-7xl px-6 sm:px-8 py-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="flex items-center gap-2">
            <span
              className="text-lg font-bold text-white"
              style={{ fontFamily: 'var(--font-vintage), serif' }}
            >
              arc
            </span>
            <span className="text-xs text-white/30">Arcadery</span>
          </Link>

          <div className="flex flex-wrap items-center gap-5">
            {footerLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm text-white/50 transition-colors hover:text-white"
              >
                {link.label}
              </Link>
            ))}
          </div>

          <p className="text-xs text-white/30">
            Built on <span className="text-[#8b7ec8]">Solana</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
