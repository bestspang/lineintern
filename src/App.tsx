import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { DashboardLayout } from "./components/DashboardLayout";
import Auth from "./pages/Auth";
import Overview from "./pages/Overview";
import Groups from "./pages/Groups";
import GroupDetail from "./pages/GroupDetail";
import Users from "./pages/Users";
import KnowledgeBase from "./pages/KnowledgeBase";
import Tasks from "./pages/Tasks";
import Analytics from "./pages/Analytics";
import Reports from "./pages/Reports";
import Alerts from "./pages/Alerts";
import FaqLogs from "./pages/FaqLogs";
import Training from "./pages/Training";
import SafetyRules from "./pages/SafetyRules";
import Integrations from "./pages/Integrations";
import Settings from "./pages/Settings";
import TestBot from "./pages/TestBot";
import Memory from "./pages/Memory";
import Commands from "./pages/Commands";
import Summaries from "./pages/Summaries";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/*" element={
              <ProtectedRoute>
                <DashboardLayout>
                  <Routes>
                    <Route path="/" element={<Overview />} />
                    <Route path="/groups" element={<Groups />} />
                    <Route path="/groups/:id" element={<GroupDetail />} />
                    <Route path="/users" element={<Users />} />
                    <Route path="/knowledge" element={<KnowledgeBase />} />
                    <Route path="/faq-logs" element={<FaqLogs />} />
                    <Route path="/training" element={<Training />} />
                    <Route path="/tasks" element={<Tasks />} />
                    <Route path="/memory" element={<Memory />} />
                    <Route path="/commands" element={<Commands />} />
                    <Route path="/summaries" element={<Summaries />} />
                    <Route path="/analytics" element={<Analytics />} />
                    <Route path="/reports" element={<Reports />} />
                    <Route path="/alerts" element={<Alerts />} />
                    <Route path="/safety-rules" element={<SafetyRules />} />
                    <Route path="/integrations" element={<Integrations />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="/test-bot" element={<TestBot />} />
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </DashboardLayout>
              </ProtectedRoute>
            } />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
