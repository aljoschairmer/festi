import Link from "next/link";

const LINKS = [
  { href: "/imprint", label: "Imprint" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
];

export function SiteFooter({ className }: { className?: string }) {
  return (
    <footer
      className={`flex flex-col items-center gap-2 text-sm text-muted-foreground transition-[margin] duration-500 ease-out sm:flex-row sm:justify-between ${className ?? ""}`}
      style={{ marginBottom: "var(--cookie-banner-height, 0px)" }}
    >
      <p>&copy; {new Date().getFullYear()} Festi</p>
      <nav className="flex items-center gap-4">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="transition-colors hover:text-foreground"
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </footer>
  );
}
