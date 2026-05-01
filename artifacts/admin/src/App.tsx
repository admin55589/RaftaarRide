import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider, QueryCache } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { triggerGlobalLogout } from "@/context/logout";
import { Sidebar } from "@/components/Sidebar";
import { LoginPage } from "@/pages/LoginPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { UsersPage } from "@/pages/UsersPage";
import { DriversPage } from "@/pages/DriversPage";
import { RidesPage } from "@/pages/RidesPage";
import { KYCPage } from "@/pages/KYCPage";
import { WithdrawalsPage } from "@/pages/WithdrawalsPage";
import { PromoCodesPage } from "@/pages/PromoCodesPage";
import { LiveMapPage } from "@/pages/LiveMapPage";
import { ChatHistoryPage } from "@/pages/ChatHistoryPage";
import { BroadcastPage } from "@/pages/BroadcastPage";
import { TermsPage } from "@/pages/TermsPage";
import { PrivacyPage } from "@/pages/PrivacyPage";
import NotFound from "@/pages/not-found";
import { useAdminRealtime } from "@/hooks/useAdminRealtime";

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error: unknown) => {
      const status = (error as any)?.status;
      if (status === 401) {
        triggerGlobalLogout();
        queryClient.clear();
      }
    },
  }),
  defaultOptions: {
    queries: {
      retry: (failureCount, error: unknown) => {
        if ((error as any)?.status === 401) return false;
        return failureCount < 1;
      },
      staleTime: 30000,
    },
  },
});

function AppLayout() {
  const { isAuthenticated } = useAuth();
  const { isConnected } = useAdminRealtime();

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar isLive={isConnected} />
      <main className="flex-1 overflow-y-auto">
        <Switch>
          <Route path="/" component={DashboardPage} />
          <Route path="/users" component={UsersPage} />
          <Route path="/drivers" component={DriversPage} />
          <Route path="/rides" component={RidesPage} />
          <Route path="/kyc" component={KYCPage} />
          <Route path="/withdrawals" component={WithdrawalsPage} />
          <Route path="/promo-codes" component={PromoCodesPage} />
          <Route path="/live-map" component={LiveMapPage} />
          <Route path="/chat-history" component={ChatHistoryPage} />
          <Route path="/broadcast" component={BroadcastPage} />
          <Route component={NotFound} />
        </Switch>
      </main>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Switch>
              <Route path="/terms" component={TermsPage} />
              <Route path="/privacy" component={PrivacyPage} />
              <Route component={AppLayout} />
            </Switch>
          </WouterRouter>
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
