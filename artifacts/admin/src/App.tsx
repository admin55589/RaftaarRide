import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider, QueryCache } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth, triggerGlobalLogout } from "@/context/AuthContext";
import { Sidebar } from "@/components/Sidebar";
import { LoginPage } from "@/pages/LoginPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { UsersPage } from "@/pages/UsersPage";
import { DriversPage } from "@/pages/DriversPage";
import { RidesPage } from "@/pages/RidesPage";
import { KYCPage } from "@/pages/KYCPage";
import { WithdrawalsPage } from "@/pages/WithdrawalsPage";
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
            <AppLayout />
          </WouterRouter>
        </AuthProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
