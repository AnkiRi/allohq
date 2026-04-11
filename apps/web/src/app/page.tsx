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
    <div className="min-h-screen bg-[#faf8f5] text-[#2c2418] selection:bg-[#C4704D]/20">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 sm:px-10 py-5 max-w-5xl mx-auto">
        <div className="text-xl font-semibold tracking-tight font-[family-name:var(--font-fraunces)]">
          allo
        </div>
        <Link
          href={`${agentUrl}/sign-in`}
          className="px-4 py-2 bg-[#3d3529] text-[#faf8f5] rounded-lg text-sm font-medium hover:bg-[#2c2418] transition-colors"
        >
          Sign in
        </Link>
      </nav>

      {/* Hero */}
      <main className="flex flex-col items-center text-center px-6 sm:px-10 pt-20 sm:pt-32 pb-24 max-w-3xl mx-auto">
        <p className="text-sm text-[#8a7e6d] tracking-wide uppercase mb-6">
          Early access
        </p>

        <h1 className="text-4xl sm:text-6xl font-semibold tracking-tight leading-[1.1] mb-5 font-[family-name:var(--font-fraunces)]">
          The AI agent that runs
          <br />
          your e-commerce marketing
        </h1>

        <p className="text-base sm:text-lg text-[#8a7e6d] max-w-xl mb-10 leading-relaxed">
          Connect your Shopify store. Allo learns your brand, segments your
          customers, and creates campaigns — all on autopilot.
        </p>

        <Link
          href={`${agentUrl}/sign-up`}
          className="px-7 py-3 bg-[#3d3529] text-[#faf8f5] rounded-lg text-sm font-semibold hover:bg-[#2c2418] transition-colors"
        >
          Get started
        </Link>
      </main>

      {/* Divider */}
      <div className="max-w-5xl mx-auto px-6 sm:px-10">
        <div className="border-t border-[#e8e2d8]" />
      </div>

      {/* What it does */}
      <section className="px-6 sm:px-10 py-20 max-w-5xl mx-auto">
        <div className="grid sm:grid-cols-3 gap-10">
          {[
            {
              label: "Learns your brand",
              text: "Paste your guidelines or let Allo analyze your store. It picks up your voice, tone, and visual identity.",
            },
            {
              label: "Finds your segments",
              text: "Loyalists, one-time buyers, at-risk customers — discovered automatically from your order history.",
            },
            {
              label: "Runs your campaigns",
              text: "Drafts emails, builds automations, suggests next actions. You approve what goes out.",
            },
          ].map((item) => (
            <div key={item.label}>
              <h3 className="text-sm font-semibold text-[#C4704D] uppercase tracking-wide mb-2">
                {item.label}
              </h3>
              <p className="text-[#8a7e6d] text-sm leading-relaxed">
                {item.text}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 sm:px-10 py-8 text-center text-xs text-[#8a7e6d]">
        AlloHQ
      </footer>
    </div>
  );
}
