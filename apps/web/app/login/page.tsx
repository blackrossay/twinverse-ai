"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { getMe, login, setToken, signup, type User } from "@/lib/api";
import Logo from "@/components/Logo";
import { BackLink, Banner, PrimaryButton } from "@/components/ui";
import { useEffect } from "react";

const inputCls =
  "mt-1.5 min-h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-zinc-400 focus:border-white/40";

export default function LoginPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getMe().then(setUser).catch(() => setUser(null));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result =
        mode === "signup"
          ? await signup({ email: email.trim(), password, name: name.trim() })
          : await login({ email: email.trim(), password });
      setToken(result.token);
      setUser(result.user);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong — try again");
    } finally {
      setBusy(false);
    }
  }

  if (user) {
    return (
      <main className="mx-auto max-w-md px-6 py-12">
        <BackLink />
        <Logo size={40} glow className="mb-5" />
      <h1 className="display mt-4 text-4xl text-white">You&apos;re in</h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">
          Signed in as <span className="font-semibold text-white">{user.email}</span>.
          Your twins, sessions, and streams are one tap away.
        </p>
        <div className="mt-6 flex gap-3">
          <button
            onClick={() => router.push("/")}
            className="inline-flex min-h-11 items-center rounded-full bg-white px-6 text-sm font-semibold text-black transition hover:bg-zinc-200"
          >
            Open overview
          </button>
          <button
            onClick={() => {
              setToken(null);
              setUser(null);
            }}
            className="inline-flex min-h-11 items-center rounded-full border border-white/15 px-5 text-sm font-semibold text-white hover:border-white/40"
          >
            Sign out
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-6 py-12">
      <BackLink />
      <h1 className="display mt-4 text-4xl text-white">
        {mode === "signup" ? "Create your account" : "Welcome back"}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-zinc-400">
        One account for your twins on every device — phone, desktop, and your
        cloud streams. Your likeness stays under your control.
      </p>
      {error && (
        <div className="mt-5">
          <Banner tone="red">{error}</Banner>
        </div>
      )}
      <div className="mt-6 grid grid-cols-2 gap-2" role="tablist" aria-label="Account">
        {(["signup", "login"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`min-h-11 rounded-full border text-sm font-semibold transition ${
              mode === m ? "border-white bg-white text-black" : "border-white/15 text-zinc-300 hover:border-white/40"
            }`}
          >
            {m === "signup" ? "Sign up" : "Log in"}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="mt-6 space-y-4">
        {mode === "signup" && (
          <div>
            <label htmlFor="name" className="text-sm font-semibold text-white">Name</label>
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name"
              placeholder="Maya Chen" className={inputCls} />
          </div>
        )}
        <div>
          <label htmlFor="email" className="text-sm font-semibold text-white">Email</label>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            autoComplete="email" placeholder="you@example.com" className={inputCls} />
        </div>
        <div>
          <label htmlFor="password" className="text-sm font-semibold text-white">Password</label>
          <input id="password" type="password" required minLength={mode === "signup" ? 8 : 1}
            value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            placeholder={mode === "signup" ? "8+ characters" : "Your password"} className={inputCls} />
        </div>
        <PrimaryButton disabled={busy}>
          {busy ? "One moment…" : mode === "signup" ? "Create account" : "Log in"}
        </PrimaryButton>
      </form>
    </main>
  );
}
