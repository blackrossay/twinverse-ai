"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { resetDemo } from "@/lib/api";

/** Discreet demo reset: wipe runtime data and reseed personas between runs. */
export default function DemoReset() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function reset() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    try {
      await resetDemo();
      sessionStorage.setItem("twinverse-seeded", "1");
      setConfirming(false);
      router.push("/");
      router.refresh();
    } catch {
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={reset}
      onBlur={() => setConfirming(false)}
      className="ml-auto min-h-11 rounded-full px-3 text-xs text-zinc-400 transition hover:text-zinc-200"
    >
      {busy ? "Resetting…" : confirming ? "Confirm reset demo data?" : "Reset demo"}
    </button>
  );
}
