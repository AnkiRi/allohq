"use client";

import { Sparkles, Zap, Star, Heart } from "lucide-react";

export function GradientParadise() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-500 via-purple-500 to-blue-500 p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header with animated gradient */}
        <div className="relative overflow-hidden rounded-3xl">
          <div className="absolute inset-0 bg-gradient-to-r from-pink-600 via-purple-600 to-blue-600 animate-gradient" />

          <div className="relative backdrop-blur-2xl bg-white/20 p-8 border border-white/30">
            <h1 className="text-5xl font-bold text-white mb-2">
              Gradient Paradise
            </h1>
            <p className="text-white/90 text-lg">
              Bold gradients with frosted overlays and vibrant colors
            </p>
          </div>
        </div>

        {/* Floating cards */}
        <div className="grid grid-cols-4 gap-6">
          {[
            { icon: Sparkles, label: "Magic", value: "100%" },
            { icon: Zap, label: "Power", value: "⚡" },
            { icon: Star, label: "Rating", value: "5.0" },
            { icon: Heart, label: "Loved", value: "999+" },
          ].map((item, i) => (
            <div
              key={i}
              className="group relative"
              style={{
                animation: `float ${3 + i * 0.5}s ease-in-out infinite`,
              }}
            >
              <div className="backdrop-blur-xl bg-white/25 rounded-2xl p-6 border-2 border-white/40 shadow-2xl group-hover:scale-105 transition-transform">
                <item.icon className="w-12 h-12 text-white mb-4" />
                <div className="text-4xl font-bold text-white mb-2">{item.value}</div>
                <div className="text-white/80 font-medium">{item.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Main content with gradient borders */}
        <div className="grid grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="relative p-[2px] rounded-2xl bg-gradient-to-br from-pink-500 via-purple-500 to-blue-500">
              <div className="backdrop-blur-xl bg-white/20 rounded-2xl p-6 h-full">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-400 to-purple-400 mb-4" />
                <h3 className="text-xl font-bold text-white mb-2">Feature {i}</h3>
                <p className="text-white/80">
                  Beautiful gradient cards with frosted glass effects and vibrant colors
                </p>
              </div>
            </div>
          ))}
        </div>

        <style jsx>{`
          @keyframes float {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-10px); }
          }
          @keyframes gradient {
            0%, 100% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
          }
          .animate-gradient {
            background-size: 200% 200%;
            animation: gradient 3s ease infinite;
          }
        `}</style>
      </div>
    </div>
  );
}
