'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { AuthButton } from '@/components/auth/auth-button';
import { CreditBalance } from '@/components/credits/credit-balance';

const navLinks = [
  { href: '/explore', label: 'Explore' },
];

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/[0.06] bg-[#0a0a0f]/80 backdrop-blur-lg">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6 sm:px-8">
        <Link
          href="/"
          className="text-xl font-bold tracking-tight text-white"
          style={{ fontFamily: 'var(--font-vintage), serif' }}
        >
          arc
        </Link>

        <div className="hidden items-center gap-6 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-white/70 transition-colors hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <CreditBalance compact />
          <AuthButton />
        </div>

        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="text-white/60 hover:text-white md:hidden"
          aria-label="Menu"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-white/[0.06] bg-[#0a0a0f] px-6 py-4 md:hidden">
          <div className="flex flex-col gap-3">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="text-sm text-white/70 hover:text-white"
              >
                {link.label}
              </Link>
            ))}
            <hr className="border-white/[0.06]" />
            <div className="flex items-center gap-2">
              <CreditBalance compact />
              <AuthButton />
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
