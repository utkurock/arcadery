import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#1e1f26] text-white flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">Game Not Found</h1>
        <p className="text-white/50 mb-6">
          This game doesn&apos;t exist or has been removed.
        </p>
        <Link
          href="/"
          className="inline-block px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition-colors"
        >
          Go Home
        </Link>
      </div>
    </div>
  );
}
