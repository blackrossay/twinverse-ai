import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-center">
      <h1 className="text-4xl font-bold tracking-tight text-white">Not found</h1>
      <p className="mt-3 text-zinc-400">That page, twin, or session doesn&apos;t exist.</p>
      <Link
        href="/"
        className="mt-8 inline-block rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-zinc-200"
      >
        Back to overview
      </Link>
    </main>
  );
}
