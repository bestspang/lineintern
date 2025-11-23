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
import MemoryAnalytics from "./pages/MemoryAnalytics";
import Reports from "./pages/Reports";
import Alerts from "./pages/Alerts";
import FaqLogs from "./pages/FaqLogs";
import Training from "./pages/Training";
import SafetyRules from "./pages/SafetyRules";
import Integrations from "./pages/Integrations";
import Settings from "./pages/Settings";
import TestBot from "./pages/TestBot";
import Memory from "./pages/Memory";
import CronJobs from "./pages/CronJobs";
import Commands from "./pages/Commands";
import Summaries from "./pages/Summaries";
import Personality from "./pages/Personality";
import SettingsLayout from "./pages/SettingsLayout";
import NotFound from "./pages/NotFound";
import Attendance from "./pages/Attendance";
import AttendanceEmployees from "./pages/attendance/Employees";
import EmployeeDetail from "./pages/attendance/EmployeeDetail";
import AttendanceBranches from "./pages/attendance/Branches";
import AttendanceLogs from "./pages/attendance/Logs";
import AttendanceSummaries from "./pages/attendance/Summaries";
import AttendanceSettings from "./pages/attendance/Settings";
import AttendanceAnalytics from "./pages/attendance/Analytics";
import AttendancePhotos from "./pages/attendance/Photos";
import AttendanceFraudDetection from "./pages/attendance/FraudDetection";
import EmployeeHistory from "./pages/attendance/EmployeeHistory";
import AttendanceReminderLogs from "./pages/attendance/ReminderLogs";

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
            <Route path="/attendance" element={<Attendance />} />
            <Route path="/attendance/employee-history" element={<EmployeeHistory />} />
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
              <Route path="/cron-jobs" element={<CronJobs />} />
              <Route path="/memory" element={<Memory />} />
                    <Route path="/commands" element={<Commands />} />
                    <Route path="/summaries" element={<Summaries />} />
                    <Route path="/personality" element={<Personality />} />
                    <Route path="/analytics" element={<Analytics />} />
                    <Route path="/memory-analytics" element={<MemoryAnalytics />} />
                    <Route path="/attendance/employees" element={<AttendanceEmployees />} />
                    <Route path="/attendance/employees/:id" element={<EmployeeDetail />} />
                    <Route path="/attendance/branches" element={<AttendanceBranches />} />
                    <Route path="/attendance/logs" element={<AttendanceLogs />} />
                    <Route path="/attendance/photos" element={<AttendancePhotos />} />
                    <Route path="/attendance/fraud-detection" element={<AttendanceFraudDetection />} />
                    <Route path="/attendance/summaries" element={<AttendanceSummaries />} />
                    <Route path="/attendance/reminder-logs" element={<AttendanceReminderLogs />} />
                    <Route path="/attendance/settings" element={<AttendanceSettings />} />
                    <Route path="/attendance/analytics" element={<AttendanceAnalytics />} />
                    <Route path="/settings" element={<SettingsLayout />}>
                      <Route index element={<Settings />} />
                      <Route path="safety" element={<SafetyRules />} />
                      <Route path="integrations" element={<Integrations />} />
                      <Route path="alerts" element={<Alerts />} />
                      <Route path="reports" element={<Reports />} />
                    </Route>
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
