import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { PortalProvider } from "./contexts/PortalContext";
import { LocaleProvider } from "./contexts/LocaleContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { DashboardLayout } from "./components/DashboardLayout";
import { PortalLayout } from "./components/portal/PortalLayout";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { LiffDebugOverlay } from "./components/LiffDebugOverlay";
import { RootRedirect } from "./components/RootRedirect";
import { LiffProvider } from "./contexts/LiffContext";
import { Loader2 } from "lucide-react";

// Lazy-loaded pages - Admin
const Auth = lazy(() => import("./pages/Auth"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Overview = lazy(() => import("./pages/Overview"));
const Groups = lazy(() => import("./pages/Groups"));
const GroupDetail = lazy(() => import("./pages/GroupDetail"));
const Users = lazy(() => import("./pages/Users"));
const UserDetail = lazy(() => import("./pages/UserDetail"));
const KnowledgeBase = lazy(() => import("./pages/KnowledgeBase"));
const Tasks = lazy(() => import("./pages/Tasks"));
const Analytics = lazy(() => import("./pages/Analytics"));
const MemoryAnalytics = lazy(() => import("./pages/MemoryAnalytics"));
const BotLogs = lazy(() => import("./pages/BotLogs"));
const Reports = lazy(() => import("./pages/Reports"));
const Alerts = lazy(() => import("./pages/Alerts"));
const FaqLogs = lazy(() => import("./pages/FaqLogs"));
const Training = lazy(() => import("./pages/Training"));
const SafetyRules = lazy(() => import("./pages/SafetyRules"));
const Integrations = lazy(() => import("./pages/Integrations"));
const Settings = lazy(() => import("./pages/Settings"));
const TestBot = lazy(() => import("./pages/TestBot"));
const Memory = lazy(() => import("./pages/Memory"));
const CronJobs = lazy(() => import("./pages/CronJobs"));
const Commands = lazy(() => import("./pages/Commands"));
const Summaries = lazy(() => import("./pages/Summaries"));
const Personality = lazy(() => import("./pages/Personality"));
const Broadcast = lazy(() => import("./pages/Broadcast"));
const DirectMessages = lazy(() => import("./pages/DirectMessages"));
const SettingsLayout = lazy(() => import("./pages/SettingsLayout"));
const UserManagement = lazy(() => import("./pages/settings/UserManagement"));
const RoleManagement = lazy(() => import("./pages/settings/RoleManagement"));
const APIKeys = lazy(() => import("./pages/settings/APIKeys"));
const CuteQuotesSettings = lazy(() => import("./pages/settings/CuteQuotesSettings"));
const AIQueryControl = lazy(() => import("./pages/settings/AIQueryControl"));
const NotFound = lazy(() => import("./pages/NotFound"));
const NetworkError = lazy(() => import("./pages/NetworkError"));
const ServerError = lazy(() => import("./pages/ServerError"));
const SessionExpired = lazy(() => import("./pages/SessionExpired"));
const Attendance = lazy(() => import("./pages/Attendance"));
const AttendanceEmployees = lazy(() => import("./pages/attendance/Employees"));
const EmployeeDetail = lazy(() => import("./pages/attendance/EmployeeDetail"));
const EmployeeDocuments = lazy(() => import("./pages/attendance/EmployeeDocuments"));
const AttendanceBranches = lazy(() => import("./pages/attendance/Branches"));
const AttendanceLogs = lazy(() => import("./pages/attendance/Logs"));
const AttendanceSummaries = lazy(() => import("./pages/attendance/Summaries"));
const AttendanceSettings = lazy(() => import("./pages/attendance/Settings"));
const AttendanceAnalytics = lazy(() => import("./pages/attendance/Analytics"));
const AttendancePhotos = lazy(() => import("./pages/attendance/Photos"));
const AttendanceFraudDetection = lazy(() => import("./pages/attendance/FraudDetection"));
const EmployeeHistory = lazy(() => import("./pages/attendance/EmployeeHistory"));
const EmployeeSettings = lazy(() => import("./pages/attendance/EmployeeSettings"));
const AttendanceReminderLogs = lazy(() => import("./pages/attendance/ReminderLogs"));
const AttendanceLiveTracking = lazy(() => import("./pages/attendance/LiveTracking"));
const AttendanceDashboard = lazy(() => import("./pages/attendance/Dashboard"));
const OvertimeManagement = lazy(() => import("./pages/attendance/OvertimeManagement"));
const OvertimeSummary = lazy(() => import("./pages/attendance/OvertimeSummary"));
const OvertimeRequests = lazy(() => import("./pages/attendance/OvertimeRequests"));
const EarlyLeaveRequests = lazy(() => import("./pages/attendance/EarlyLeaveRequests"));
const FlexibleDayOff = lazy(() => import("./pages/attendance/FlexibleDayOff"));
const FlexibleDayOffRequests = lazy(() => import("./pages/attendance/FlexibleDayOffRequests"));
const AttendanceBirthdays = lazy(() => import("./pages/attendance/Birthdays"));
const WorkHistory = lazy(() => import("./pages/attendance/WorkHistory"));
const LeaveBalance = lazy(() => import("./pages/attendance/LeaveBalance"));
const AttendanceRoles = lazy(() => import("./pages/attendance/Roles"));
const Payroll = lazy(() => import("./pages/attendance/Payroll"));
const PayrollYTD = lazy(() => import("./pages/attendance/PayrollYTD"));
const AttendanceHolidays = lazy(() => import("./pages/attendance/Holidays"));
const EmployeeMenu = lazy(() => import("./pages/EmployeeMenu"));
const HealthMonitoring = lazy(() => import("./pages/HealthMonitoring"));
const ConfigurationValidator = lazy(() => import("./pages/ConfigurationValidator"));
const PreDeployChecklist = lazy(() => import("./pages/PreDeployChecklist"));
const FeatureFlags = lazy(() => import("./pages/FeatureFlags"));
const AuditLogs = lazy(() => import("./pages/AuditLogs"));
const BranchReportsPage = lazy(() => import("./pages/branch-reports"));
const HappyPoints = lazy(() => import("./pages/attendance/HappyPoints"));
const AttendanceRewards = lazy(() => import("./pages/attendance/Rewards"));
const PointTransactions = lazy(() => import("./pages/attendance/PointTransactions"));
const PointRules = lazy(() => import("./pages/attendance/PointRules"));
const RedemptionApprovals = lazy(() => import("./pages/attendance/RedemptionApprovals"));
const BagManagement = lazy(() => import("./pages/attendance/BagManagement"));
const ShiftTemplates = lazy(() => import("./pages/attendance/ShiftTemplates"));
const Schedules = lazy(() => import("./pages/attendance/Schedules"));
const AttendanceOpsCenter = lazy(() => import("./pages/attendance/OpsCenter"));
const AttendancePortalPerformance = lazy(() => import("./pages/attendance/PortalPerformance"));
const PortalFaqAdmin = lazy(() => import("./pages/PortalFaqAdmin"));
const ProfileSyncHealth = lazy(() => import("./pages/ProfileSyncHealth"));

// Lazy-loaded pages - Portal
const PortalHome = lazy(() => import("./pages/portal/PortalHome"));
const PortalPlaceholder = lazy(() => import("./pages/portal/PortalPlaceholder"));
const CheckInOut = lazy(() => import("./pages/portal/CheckInOut"));
const MyLeaveBalance = lazy(() => import("./pages/portal/MyLeaveBalance"));
const MyWorkHistory = lazy(() => import("./pages/portal/MyWorkHistory"));
const RequestOT = lazy(() => import("./pages/portal/RequestOT"));
const RequestLeave = lazy(() => import("./pages/portal/RequestLeave"));
const MyProfile = lazy(() => import("./pages/portal/MyProfile"));
const Status = lazy(() => import("./pages/portal/Status"));
const Help = lazy(() => import("./pages/portal/Help"));
const Approvals = lazy(() => import("./pages/portal/Approvals"));
const ApproveOT = lazy(() => import("./pages/portal/ApproveOT"));
const ApproveLeave = lazy(() => import("./pages/portal/ApproveLeave"));
const ApproveEarlyLeave = lazy(() => import("./pages/portal/ApproveEarlyLeave"));
const TeamSummary = lazy(() => import("./pages/portal/TeamSummary"));

const TodayPhotos = lazy(() => import("./pages/portal/TodayPhotos"));
const DailySummary = lazy(() => import("./pages/portal/DailySummary"));
const ApproveRedemptions = lazy(() => import("./pages/portal/ApproveRedemptions"));
const PayrollReport = lazy(() => import("./pages/portal/PayrollReport"));
const MySchedule = lazy(() => import("./pages/portal/MySchedule"));
const MyPayroll = lazy(() => import("./pages/portal/MyPayroll"));
const PointLeaderboard = lazy(() => import("./pages/portal/PointLeaderboard"));
const PortalEmployees = lazy(() => import("./pages/portal/PortalEmployees"));
const PortalEmployeeDetail = lazy(() => import("./pages/portal/PortalEmployeeDetail"));
const PortalBranchReport = lazy(() => import("./pages/portal/PortalBranchReport"));
const MyBag = lazy(() => import("./pages/portal/MyBag"));
const GachaBox = lazy(() => import("./pages/portal/GachaBox"));
const GachaHistory = lazy(() => import("./pages/portal/GachaHistory"));
const Notifications = lazy(() => import("./pages/portal/Notifications"));
const ManagerDashboard = lazy(() => import("./pages/portal/ManagerDashboard"));
const ApproveRemoteCheckout = lazy(() => import("./pages/portal/ApproveRemoteCheckout"));
const MyPoints = lazy(() => import("./pages/portal/MyPoints"));
const RewardShop = lazy(() => import("./pages/portal/RewardShop"));
const MyRedemptions = lazy(() => import("./pages/portal/MyRedemptions"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <LocaleProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <ErrorBoundary>
            <AuthProvider>
            <Suspense fallback={<PageLoader />}>
            <main>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              {/* Legacy route - kept for backward compatibility, redirects to portal */}
              <Route path="/employee-menu" element={<EmployeeMenu />} />
              <Route path="/attendance" element={<Attendance />} />
              <Route path="/attendance/flexible-day-off" element={<FlexibleDayOff />} />
              <Route path="/error/network" element={<NetworkError />} />
              <Route path="/error/server" element={<ServerError />} />
              <Route path="/error/session-expired" element={<SessionExpired />} />
              
              {/* Portal Routes - Employee Mini App */}
              <Route path="/portal/*" element={
                <LiffProvider>
                  <LiffDebugOverlay />
                  <PortalProvider>
                    <PortalLayout>
                      <Suspense fallback={<PageLoader />}>
                        <Routes>
                        <Route path="/" element={<PortalHome />} />
                        <Route path="/checkin" element={<CheckInOut />} />
                        <Route path="/my-history" element={<MyWorkHistory />} />
                        <Route path="/my-leave" element={<MyLeaveBalance />} />
                        <Route path="/request-leave" element={<RequestLeave />} />
                        <Route path="/request-ot" element={<RequestOT />} />
                        <Route path="/my-profile" element={<MyProfile />} />
                        <Route path="/status" element={<Status />} />
                        <Route path="/help" element={<Help />} />
                        <Route path="/approvals" element={<Approvals />} />
                        <Route path="/approvals/ot" element={<ApproveOT />} />
                        <Route path="/approvals/leave" element={<ApproveLeave />} />
                        <Route path="/approvals/early-leave" element={<ApproveEarlyLeave />} />
                        <Route path="/approvals/remote-checkout" element={<ApproveRemoteCheckout />} />
                        <Route path="/team-summary" element={<TeamSummary />} />
                        <Route path="/photos" element={<TodayPhotos />} />
                        <Route path="/daily-summary" element={<DailySummary />} />
                        <Route path="/my-points" element={<MyPoints />} />
                        <Route path="/rewards" element={<RewardShop />} />
                        <Route path="/my-redemptions" element={<MyRedemptions />} />
                        <Route path="/my-bag" element={<MyBag />} />
                        <Route path="/gacha" element={<GachaBox />} />
                        <Route path="/gacha-history" element={<GachaHistory />} />
                        <Route path="/approve-redemptions" element={<ApproveRedemptions />} />
                        <Route path="/payroll-report" element={<PayrollReport />} />
                        <Route path="/my-schedule" element={<MySchedule />} />
                        <Route path="/my-payroll" element={<MyPayroll />} />
                        <Route path="/leaderboard" element={<PointLeaderboard />} />
                        <Route path="/employees" element={<PortalEmployees />} />
                        <Route path="/employees/:id" element={<PortalEmployeeDetail />} />
                        <Route path="/branch-report" element={<PortalBranchReport />} />
                        <Route path="/notifications" element={<Notifications />} />
                        <Route path="/manager-dashboard" element={<ManagerDashboard />} />
                          <Route path="*" element={<NotFound />} />
                        </Routes>
                      </Suspense>
                    </PortalLayout>
                  </PortalProvider>
                </LiffProvider>
              } />

              {/* Root redirect - detects LINE context, wrapped in LiffProvider */}
              <Route path="/" element={
                <LiffProvider>
                  <LiffDebugOverlay />
                  <RootRedirect />
                </LiffProvider>
              } />

              {/* Admin Dashboard - Protected Routes */}
              <Route path="/overview" element={
                <ProtectedRoute>
                  <DashboardLayout>
                    <Overview />
                  </DashboardLayout>
                </ProtectedRoute>
              } />
              
              <Route path="/*" element={
                <ProtectedRoute>
                  <DashboardLayout>
                    <Suspense fallback={<PageLoader />}>
                      <Routes>
                        <Route path="/groups" element={<Groups />} />
                        <Route path="/groups/:id" element={<GroupDetail />} />
                        <Route path="/users" element={<Users />} />
                        <Route path="/users/:id" element={<UserDetail />} />
                        <Route path="/knowledge" element={<KnowledgeBase />} />
                        <Route path="/faq-logs" element={<FaqLogs />} />
                        <Route path="/portal-faq-admin" element={<PortalFaqAdmin />} />
                        <Route path="/training" element={<Training />} />
                        <Route path="/tasks" element={<Tasks />} />
                        <Route path="/cron-jobs" element={<CronJobs />} />
                        <Route path="/memory" element={<Memory />} />
                        <Route path="/commands" element={<Commands />} />
                        <Route path="/summaries" element={<Summaries />} />
                        <Route path="/bot-logs" element={<BotLogs />} />
                        <Route path="/personality" element={<Personality />} />
                        <Route path="/broadcast" element={<Broadcast />} />
                        <Route path="/direct-messages" element={<DirectMessages />} />
                        <Route path="/analytics" element={<Analytics />} />
                        <Route path="/memory-analytics" element={<MemoryAnalytics />} />
                        <Route path="/profile-sync-health" element={<ProfileSyncHealth />} />
                        <Route path="/attendance/dashboard" element={<AttendanceDashboard />} />
                        <Route path="/attendance/employees" element={<AttendanceEmployees />} />
                        <Route path="/attendance/employee-documents" element={<EmployeeDocuments />} />
                        <Route path="/attendance/employees/:id" element={<EmployeeDetail />} />
                        <Route path="/attendance/employees/:id/history" element={<EmployeeHistory />} />
                        <Route path="/attendance/employees/:id/settings" element={<EmployeeSettings />} />
                        <Route path="/attendance/branches" element={<AttendanceBranches />} />
                        <Route path="/attendance/logs" element={<AttendanceLogs />} />
                        <Route path="/attendance/photos" element={<AttendancePhotos />} />
                        <Route path="/attendance/fraud-detection" element={<AttendanceFraudDetection />} />
                        <Route path="/attendance/summaries" element={<AttendanceSummaries />} />
                        <Route path="/attendance/reminder-logs" element={<AttendanceReminderLogs />} />
                        <Route path="/attendance/live-tracking" element={<AttendanceLiveTracking />} />
                        <Route path="/attendance/overtime-management" element={<OvertimeManagement />} />
                        <Route path="/attendance/overtime-summary" element={<OvertimeSummary />} />
                        <Route path="/attendance/overtime-requests" element={<OvertimeRequests />} />
                        <Route path="/attendance/early-leave-requests" element={<EarlyLeaveRequests />} />
                        <Route path="/attendance/flexible-day-off-requests" element={<FlexibleDayOffRequests />} />
                        <Route path="/attendance/birthdays" element={<AttendanceBirthdays />} />
                        
                        <Route path="/attendance/work-history" element={<WorkHistory />} />
                        <Route path="/attendance/work-history/:id" element={<WorkHistory />} />
                        <Route path="/attendance/leave-balance" element={<LeaveBalance />} />
                        <Route path="/attendance/roles" element={<AttendanceRoles />} />
                        <Route path="/attendance/payroll" element={<Payroll />} />
                        <Route path="/attendance/payroll-ytd" element={<PayrollYTD />} />
                        <Route path="/attendance/holidays" element={<AttendanceHolidays />} />
                        <Route path="/attendance/happy-points" element={<HappyPoints />} />
                        <Route path="/attendance/rewards" element={<AttendanceRewards />} />
                        <Route path="/attendance/point-transactions" element={<PointTransactions />} />
                        <Route path="/attendance/point-rules" element={<PointRules />} />
                        <Route path="/attendance/redemption-approvals" element={<RedemptionApprovals />} />
                        <Route path="/attendance/bag-management" element={<BagManagement />} />
                        <Route path="/attendance/shift-templates" element={<ShiftTemplates />} />
                        <Route path="/attendance/schedules" element={<Schedules />} />
                        <Route path="/attendance/settings" element={<AttendanceSettings />} />
                        <Route path="/attendance/analytics" element={<AttendanceAnalytics />} />
                        <Route path="/attendance/ops-center" element={<AttendanceOpsCenter />} />
                        <Route path="/health-monitoring" element={<HealthMonitoring />} />
                        <Route path="/config-validator" element={<ConfigurationValidator />} />
                        <Route path="/pre-deploy-checklist" element={<PreDeployChecklist />} />
                        <Route path="/feature-flags" element={<FeatureFlags />} />
                        <Route path="/audit-logs" element={<AuditLogs />} />
                        <Route path="/branch-report" element={<BranchReportsPage />} />
                        <Route path="/settings" element={<SettingsLayout />}>
                          <Route index element={<Settings />} />
                          <Route path="api-keys" element={<APIKeys />} />
                          <Route path="users" element={<UserManagement />} />
                          <Route path="roles" element={<RoleManagement />} />
                          <Route path="cute-quotes" element={<CuteQuotesSettings />} />
                          <Route path="ai-cross-group" element={<AIQueryControl />} />
                          <Route path="safety" element={<SafetyRules />} />
                          <Route path="integrations" element={<Integrations />} />
                          <Route path="alerts" element={<Alerts />} />
                          <Route path="reports" element={<Reports />} />
                        </Route>
                        <Route path="/test-bot" element={<TestBot />} />
                        <Route path="*" element={<NotFound />} />
                      </Routes>
                    </Suspense>
                  </DashboardLayout>
                </ProtectedRoute>
              } />
            </Routes>
            </main>
            </Suspense>
            </AuthProvider>
          </ErrorBoundary>
        </BrowserRouter>
      </TooltipProvider>
    </LocaleProvider>
  </QueryClientProvider>
);

export default App;
