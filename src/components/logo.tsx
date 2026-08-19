import Image from "next/image";
import { cn } from "@/lib/utils";

export function Logo({
  size = 40,
  className,
  priority = false,
}: {
  size?: number;
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/logo-original-white.png"
      alt="Festi"
      width={size}
      height={size}
      priority={priority}
      unoptimized
      className={cn("object-contain", className)}
    />
  );
}
