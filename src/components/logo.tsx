import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Compact header/nav lockup: the UJRIS emblem (public/brand/ujris-emblem.jpg)
 * plus the wordmark. Use `BrandMark` (components/brand-mark.tsx) instead for
 * larger, standalone placements (auth screens, landing hero, footer).
 */
export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn("flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-black/10">
        <Image src="/brand/ujris-emblem.jpg" alt="" fill sizes="32px" className="object-cover" priority />
      </span>
      <span className="text-lg">UJRIS</span>
    </Link>
  );
}
