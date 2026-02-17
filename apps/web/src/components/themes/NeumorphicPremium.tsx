"use client";

import { TrendingUp, Users, DollarSign, Target } from "lucide-react";

export function NeumorphicPremium() {
  return (
    <div className="min-h-screen bg-gray-200 p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header with strong neuro shadows */}
        <div className="bg-gray-200 rounded-3xl p-8 shadow-[20px_20px_60px_#bebebe,-20px_-20px_60px_#ffffff]">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent mb-2">
            3D Neumorphic Premium
          </h1>
          <p className="text-gray-700 text-lg">
            Strong shadows, depth, and tactile feel with subtle animations
          </p>
        </div>

        {/* Neumorphic stats */}
        <div className="grid grid-cols-4 gap-6">
          {[
            { icon: DollarSign, label: "Revenue", value: "$124.5K", color: "from-green-500 to-emerald-600" },
            { icon: Users, label: "Customers", value: "2,543", color: "from-blue-500 to-cyan-600" },
            { icon: TrendingUp, label: "Growth", value: "+12.5%", color: "from-purple-500 to-pink-600" },
            { icon: Target, label: "Goals", value: "48/50", color: "from-orange-500 to-red-600" },
          ].map((stat, i) => (
            <div
              key={i}
              className="bg-gray-200 rounded-2xl p-6 shadow-[12px_12px_24px_#bebebe,-12px_-12px_24px_#ffffff] hover:shadow-[inset_12px_12px_24px_#bebebe,inset_-12px_-12px_24px_#ffffff] transition-all duration-300 cursor-pointer"
            >
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center mb-4 shadow-lg`}>
                <stat.icon className="w-6 h-6 text-white" />
              </div>
              <div className="text-3xl font-bold text-gray-800 mb-1">{stat.value}</div>
              <div className="text-gray-600 font-medium">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Pressed/Inset cards */}
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-gray-200 rounded-3xl p-8 shadow-[inset_8px_8px_16px_#bebebe,inset_-8px_-8px_16px_#ffffff]">
            <h3 className="text-xl font-bold text-gray-800 mb-6">Campaign Performance</h3>
            <div className="space-y-4">
              {[
                { name: "Welcome Series", value: 85 },
                { name: "Abandoned Cart", value: 92 },
                { name: "Win-Back", value: 78 },
              ].map((item, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-700 font-medium">{item.name}</span>
                    <span className="text-gray-600">{item.value}%</span>
                  </div>
                  <div className="h-3 bg-gray-200 rounded-full shadow-[inset_4px_4px_8px_#bebebe,inset_-4px_-4px_8px_#ffffff] overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full"
                      style={{ width: `${item.value}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gray-200 rounded-3xl p-8 shadow-[12px_12px_24px_#bebebe,-12px_-12px_24px_#ffffff]">
            <h3 className="text-xl font-bold text-gray-800 mb-6">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-4">
              {["New Campaign", "View Analytics", "Edit Workflow", "Add Contacts"].map((action, i) => (
                <button
                  key={i}
                  className="bg-gray-200 rounded-xl p-4 shadow-[8px_8px_16px_#bebebe,-8px_-8px_16px_#ffffff] hover:shadow-[inset_8px_8px_16px_#bebebe,inset_-8px_-8px_16px_#ffffff] active:shadow-[inset_12px_12px_24px_#bebebe,inset_-12px_-12px_24px_#ffffff] transition-all font-medium text-gray-700"
                >
                  {action}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
