"use client";

import { SessionProvider } from "./session-provider";
import { Toaster } from "sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {children}
      <Toaster position="top-right" richColors closeButton />
    </SessionProvider>
  );
}

