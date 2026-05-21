import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";

export default async function HomePage() {
  const headersList = await headers();
  const host = headersList.get("host") || "";

  if (host.startsWith("agent.") || host.startsWith("localhost")) {
    const { userId } = await auth();
    if (userId) {
      redirect("/dashboard");
    } else {
      redirect("/sign-in");
    }
  }

  return <LandingPage />;
}

function LandingPage() {
  const agentUrl =
    process.env.NODE_ENV === "production"
      ? "https://agent.allohq.ai"
      : "http://localhost:3000";

  return (
    <div className="min-h-screen bg-[#09090b] text-white antialiased">
      {/* Nav — just the logo and a single link */}
      <nav className="flex items-center justify-between px-6 py-6 max-w-6xl mx-auto">
        <span className="text-[15px] font-medium tracking-[-0.02em] text-white/90">
          allo
        </span>
        <Link
          href={`${agentUrl}/sign-in`}
          className="text-[13px] text-white/50 hover:text-white transition-colors"
        >
          Sign in
        </Link>
      </nav>

      {/* Hero — all vertical rhythm, nothing else */}
      <main className="flex flex-col items-center px-6 pt-[18vh] pb-32 max-w-2xl mx-auto">
        <h1 className="text-[clamp(2.5rem,6vw,4.5rem)] font-medium tracking-[-0.04em] leading-[1.05] text-center text-balance">
          AI marketing
          <br />
          <span className="text-white/30">for e-commerce</span>
        </h1>

        <p className="mt-6 text-[15px] leading-relaxed text-white/40 text-center max-w-md">
          Connects to your store. Learns your brand.
          <br />
          Segments customers. Writes campaigns.
          <br />
          You approve. It ships.
        </p>

        <Link
          href={`${agentUrl}/sign-up`}
          className="mt-10 px-5 py-2.5 rounded-full bg-white text-[#09090b] text-[13px] font-medium hover:bg-white/90 transition-colors"
        >
          Start free
        </Link>

        {/* Three words */}
        <div className="mt-24 flex items-center gap-6 text-[13px] text-white/20 tracking-wide">
          <span>brand intelligence</span>
          <span className="w-1 h-1 rounded-full bg-white/10" />
          <span>smart segments</span>
          <span className="w-1 h-1 rounded-full bg-white/10" />
          <span>autonomous campaigns</span>
        </div>
      </main>

      {/* Footer — barely there */}
      <footer className="fixed bottom-0 w-full py-5 text-center text-[11px] text-white/15 tracking-wide">
        allohq.ai
      </footer>
    </div>
  );
}
