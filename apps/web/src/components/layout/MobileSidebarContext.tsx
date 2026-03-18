"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

interface MobileSidebarContextType {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  /** Desktop sidebar collapsed to icon-only rail */
  collapsed: boolean;
  toggleCollapsed: () => void;
}

const MobileSidebarContext = createContext<MobileSidebarContextType>({
  isOpen: false,
  open: () => {},
  close: () => {},
  toggle: () => {},
  collapsed: false,
  toggleCollapsed: () => {},
});

export function MobileSidebarProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);
  const toggleCollapsed = useCallback(() => setCollapsed((v) => !v), []);

  return (
    <MobileSidebarContext.Provider value={{ isOpen, open, close, toggle, collapsed, toggleCollapsed }}>
      {children}
    </MobileSidebarContext.Provider>
  );
}

export function useMobileSidebar() {
  return useContext(MobileSidebarContext);
}
