import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";

export default async function HomePage() {
  const headersList = await headers();
  const host = headersList.get("host") || "";

  // If on agent.allohq.ai (or localhost), redirect to dashboard/sign-in as before
  if (host.startsWith("agent.") || host.startsWith("localhost")) {
    const { userId } = await auth();
    if (userId) {
      redirect("/dashboard");
    } else {
      redirect("/sign-in");
    }
  }

  // Landing page for allohq.ai
  return <LandingPage />;
}

function LandingPage() {
  const agentUrl =
    process.env.NODE_ENV === "production"
      ? "https://agent.allohq.ai"
      : "http://localhost:3000";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-6 max-w-7xl mx-auto">
        <div className="text-2xl font-bold tracking-tight">
          <span className="text-indigo-400">allo</span>hq
        </div>
        <Link
          href={`${agentUrl}/sign-in`}
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium transition-colors"
        >
          Sign In
        </Link>
      </nav>

      {/* Hero */}
      <main className="flex flex-col items-center justify-center text-center px-8 pt-24 pb-32 max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-indigo-300 text-sm mb-8">
          <span className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse" />
          Now in early access
        </div>

        <h1 className="text-5xl sm:text-7xl font-bold tracking-tight leading-[1.1] mb-6">
          Your AI marketing
          <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">
            co-pilot for e-commerce
          </span>
        </h1>

        <p className="text-lg sm:text-xl text-slate-400 max-w-2xl mb-12 leading-relaxed">
          Allo understands your brand, your customers, and your products. It
          creates campaigns, discovers segments, and drives revenue —
          autonomously.
        </p>

        <div className="flex flex-col sm:flex-row gap-4">
          <Link
            href={`${agentUrl}/sign-up`}
            className="px-8 py-3.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-base font-semibold transition-colors shadow-lg shadow-indigo-500/25"
          >
            Get Started Free
          </Link>
          <a
            href="#features"
            className="px-8 py-3.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-base font-medium transition-colors"
          >
            See How It Works
          </a>
        </div>
      </main>

      {/* Features */}
      <section id="features" className="px-8 py-24 max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-16">
          Everything your brand needs to grow
        </h2>
        <div className="grid md:grid-cols-3 gap-8">
          {[
            {
              title: "Brand Intelligence",
              desc: "Upload your brand guidelines and Allo learns your voice, tone, and visual style. Every piece of copy sounds like you.",
              icon: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z",
            },
            {
              title: "Smart Segments",
              desc: "Auto-discover customer segments from your order data — loyalists, explorers, high-value repeaters, and more.",
              icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z",
            },
            {
              title: "Autonomous Campaigns",
              desc: "Allo drafts campaigns, builds email templates, and suggests automations. You approve, it executes.",
              icon: "M13 10V3L4 14h7v7l9-11h-7z",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="p-6 rounded-2xl bg-white/5 border border-white/10 hover:border-indigo-500/30 transition-colors"
            >
              <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center mb-4">
                <svg
                  className="w-6 h-6 text-indigo-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d={f.icon}
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 px-8 py-8 text-center text-sm text-slate-500">
        &copy; {new Date().getFullYear()} AlloHQ. All rights reserved.
      </footer>
    </div>
  );
}
