import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Full brand lockup (public/brand/ujris-lockup.jpg) for prominent, standalone
 * placements — auth screens, the landing hero, and the footer. For compact
 * inline nav use, use `Logo` (components/logo.tsx) instead.
 */
export function BrandMark({ className, size = 96 }: { className?: string; size?: number }) {
  return (
    <span
      className={cn("relative inline-block overflow-hidden rounded-2xl shadow-md ring-1 ring-black/10", className)}
      style={{ width: size, height: size }}
    >
      <Image
        src="/brand/ujris-lockup.jpg"
        alt="UJRIS — Justice Intelligence"
        fill
        sizes={`${size}px`}
        className="object-cover"
        priority
      />
    </span>
  );
}
