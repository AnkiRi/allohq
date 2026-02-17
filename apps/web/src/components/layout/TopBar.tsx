"use client";

import { Search, Bell } from "lucide-react";

export function TopBar() {
  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      {/* Search */}
      <div className="flex-1 max-w-lg">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search..."
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm font-mono text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-900 focus:shadow-[0_0_0_1px_rgba(0,0,0,1)] transition-all"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 ml-6">
        <button className="relative p-2 rounded-lg hover:bg-gray-50 transition-colors">
          <Bell className="w-4 h-4 text-gray-500" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-gray-900 rounded-full" />
        </button>
        <button className="px-4 py-2 bg-gray-900 text-white rounded-lg text-sm font-mono hover:bg-gray-800 transition-colors">
          New Campaign
        </button>
      </div>
    </header>
  );
}
