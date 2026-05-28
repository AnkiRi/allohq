import { Heart } from "lucide-react";

const footerLinks = [
  { label: "Privacy Policy", href: "#" },
  { label: "Terms of Service", href: "#" },
  { label: "Help Center", href: "#" },
  { label: "Documentation", href: "#" },
];

export function Footer() {
  return (
    <footer className="mt-8 pt-4 border-t border-[#e5e2db] dark:border-[rgba(200,180,150,0.08)]">
      <div className="flex items-center justify-between gap-4 text-[#6B7280] dark:text-[#6B6358]">
        {/* Left */}
        <span className="text-[10px] font-mono shrink-0">
          &copy; {new Date().getFullYear()} Allo
        </span>

        {/* Center links */}
        <nav className="flex items-center gap-4">
          {footerLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="text-[10px] font-mono hover:text-foreground transition-colors hidden sm:inline"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Right */}
        <span className="flex items-center gap-1 text-[10px] font-mono shrink-0">
          Made with
          <Heart className="w-2.5 h-2.5 text-[#1F7A4F] fill-[#1F7A4F]" />
          by Allo
        </span>
      </div>
    </footer>
  );
}
