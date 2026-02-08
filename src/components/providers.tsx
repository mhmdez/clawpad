"use client";

import { ThemeProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useState, useEffect } from "react";
import { useGatewayEvents } from "@/hooks/use-gateway-events";
import { useFileEvents } from "@/hooks/use-file-events";
import { useChangeEvents } from "@/hooks/use-change-events";
import { useGatewayStore } from "@/lib/stores/gateway";

/** Connects to gateway on mount and subscribes to real-time events */
function GatewayBridge() {
  const detect = useGatewayStore((s) => s.detect);
  const connect = useGatewayStore((s) => s.connect);

  // Auto-detect and connect to gateway
  useEffect(() => {
    detect().then(() => connect());
  }, [detect, connect]);

  // Subscribe to real-time gateway events via SSE
  useGatewayEvents();
  useFileEvents();
  useChangeEvents();

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={300}>
          <GatewayBridge />
          {children}
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
