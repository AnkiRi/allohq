"use client";

import { useUser } from "@clerk/nextjs";
import { Settings, Store, User, Bell, CreditCard } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function SettingsPage() {
  const { user } = useUser();
  const { data: stores, isLoading } = trpc.stores.list.useQuery();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 font-mono tracking-tight">
          SETTINGS
        </h1>
        <p className="text-sm text-gray-400 font-mono mt-1">
          Manage your workspace and account settings
        </p>
      </div>

      {/* Profile */}
      <div className="border border-gray-200 rounded-xl p-6 bg-white">
        <div className="flex items-center gap-3 mb-6">
          <User className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-bold text-gray-900 font-mono">PROFILE</h2>
        </div>
        <div className="flex items-center gap-4">
          {user?.imageUrl ? (
            <img src={user.imageUrl} alt="" className="w-14 h-14 rounded-full" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-gray-900 flex items-center justify-center text-lg font-bold text-white font-mono">
              {(user?.firstName?.[0] || user?.emailAddresses[0]?.emailAddress?.[0] || "U").toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-sm font-bold text-gray-900 font-mono">
              {user?.fullName || "User"}
            </p>
            <p className="text-xs text-gray-400 font-mono mt-0.5">
              {user?.emailAddresses[0]?.emailAddress || ""}
            </p>
            <p className="text-xs text-gray-300 font-mono mt-0.5">
              Member since {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—"}
            </p>
          </div>
        </div>
      </div>

      {/* Connected Stores */}
      <div className="border border-gray-200 rounded-xl p-6 bg-white">
        <div className="flex items-center gap-3 mb-6">
          <Store className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-bold text-gray-900 font-mono">CONNECTED STORES</h2>
        </div>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : stores && stores.length > 0 ? (
          <div className="space-y-3">
            {stores.map((store) => (
              <div
                key={store.id}
                className="flex items-center justify-between p-4 border border-gray-100 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#96BF48] flex items-center justify-center">
                    <Store className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 font-mono">
                      {store.shopDomain}
                    </p>
                    <p className="text-xs text-gray-400 font-mono">
                      {store.platform} · {store._count.products} products · {store._count.customers} customers
                    </p>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-green-50 text-green-600">
                  Active
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 font-mono">
            No stores connected. Go to Integrations to connect a store.
          </p>
        )}
      </div>

      {/* Placeholder sections */}
      {[
        {
          icon: Bell,
          title: "NOTIFICATIONS",
          description: "Configure email and in-app notification preferences",
        },
        {
          icon: CreditCard,
          title: "BILLING",
          description: "Manage your subscription and payment methods",
        },
      ].map((section) => (
        <div key={section.title} className="border border-gray-200 rounded-xl p-6 bg-white">
          <div className="flex items-center gap-3 mb-4">
            <section.icon className="w-4 h-4 text-gray-400" />
            <h2 className="text-sm font-bold text-gray-900 font-mono">{section.title}</h2>
          </div>
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <Settings className="w-6 h-6 text-gray-300 mx-auto mb-2" />
              <p className="text-xs text-gray-400 font-mono">{section.description}</p>
              <p className="text-[10px] text-gray-300 font-mono mt-1">Coming soon</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
