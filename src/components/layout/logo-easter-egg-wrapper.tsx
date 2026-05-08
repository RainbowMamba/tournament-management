"use client";

import { triggerLogoEasterEgg } from "@/lib/logo-easter-egg";

export function LogoEasterEggWrapper({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ display: "contents" }} onClick={triggerLogoEasterEgg}>
      {children}
    </span>
  );
}
