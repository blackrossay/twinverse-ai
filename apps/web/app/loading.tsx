import { Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <Skeleton lines={6} />
    </main>
  );
}
