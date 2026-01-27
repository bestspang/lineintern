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
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Overview from "./pages/Overview";
import Groups from "./pages/Groups";
import GroupDetail from "./pages/GroupDetail";
import Users from "./pages/Users";
import UserDetail from "./pages/UserDetail";
import KnowledgeBase from "./pages/KnowledgeBase";
import Tasks from "./pages/Tasks";
import Analytics from "./pages/Analytics";
import MemoryAnalytics from "./pages/MemoryAnalytics";
import BotLogs from "./pages/BotLogs";
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
import Broadcast from "./pages/Broadcast";
import DirectMessages from "./pages/DirectMessages";
import SettingsLayout from "./pages/SettingsLayout";
import UserManagement from "./pages/settings/UserManagement";
import RoleManagement from "./pages/settings/RoleManagement";
import APIKeys from "./pages/settings/APIKeys";
import CuteQuotesSettings from "./pages/settings/CuteQuotesSettings";
import NotFound from "./pages/NotFound";
import NetworkError from "./pages/NetworkError";
import ServerError from "./pages/ServerError";
import SessionExpired from "./pages/SessionExpired";
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
import EmployeeSettings from "./pages/attendance/EmployeeSettings";
import AttendanceReminderLogs from "./pages/attendance/ReminderLogs";
import AttendanceLiveTracking from "./pages/attendance/LiveTracking";
import AttendanceDashboard from "./pages/attendance/Dashboard";
import OvertimeManagement from "./pages/attendance/OvertimeManagement";
import OvertimeSummary from "./pages/attendance/OvertimeSummary";
import OvertimeRequests from "./pages/attendance/OvertimeRequests";
import EarlyLeaveRequests from "./pages/attendance/EarlyLeaveRequests";
import FlexibleDayOff from "./pages/attendance/FlexibleDayOff";
import FlexibleDayOffRequests from "./pages/attendance/FlexibleDayOffRequests";
import AttendanceBirthdays from "./pages/attendance/Birthdays";

import WorkHistory from "./pages/attendance/WorkHistory";
import LeaveBalance from "./pages/attendance/LeaveBalance";
import AttendanceRoles from "./pages/attendance/Roles";
import Payroll from "./pages/attendance/Payroll";
import PayrollYTD from "./pages/attendance/PayrollYTD";
import AttendanceHolidays from "./pages/attendance/Holidays";
import EmployeeMenu from "./pages/EmployeeMenu";
import HealthMonitoring from "./pages/HealthMonitoring";
import ConfigurationValidator from "./pages/ConfigurationValidator";
import PreDeployChecklist from "./pages/PreDeployChecklist";
import FeatureFlags from "./pages/FeatureFlags";
import BranchReportsPage from "./pages/branch-reports";
import { RootRedirect } from "./components/RootRedirect";

// Portal pages
import { 
  PortalHome, PortalPlaceholder, CheckInOut,
  MyLeaveBalance, MyWorkHistory, RequestOT, RequestLeave, MyProfile,
  Status, Help,
  Approvals, ApproveOT, ApproveLeave, ApproveEarlyLeave, TeamSummary, DepositReviewList,
  TodayPhotos, DailySummary, ApproveRedemptions,
  MyReceipts, ReceiptDetail, ReceiptBusinesses, ReceiptNew,
  PayrollReport, MySchedule, MyPayroll, PointLeaderboard,
  PortalEmployees, PortalEmployeeDetail, PortalReceiptManagement, PortalReceiptAnalytics,
  PortalBranchReport
} from "./pages/portal";
import ApproveRemoteCheckout from "./pages/portal/ApproveRemoteCheckout";
import DepositUpload from "./pages/portal/DepositUpload";
import DepositReview from "./pages/portal/DepositReview";
import Deposits from "./pages/attendance/Deposits";
import DepositSettings from "./pages/attendance/DepositSettings";
import HappyPoints from "./pages/attendance/HappyPoints";
import AttendanceRewards from "./pages/attendance/Rewards";
import PointTransactions from "./pages/attendance/PointTransactions";
import PointRules from "./pages/attendance/PointRules";
import MyPoints from "./pages/portal/MyPoints";
import RewardShop from "./pages/portal/RewardShop";
import MyRedemptions from "./pages/portal/MyRedemptions";
import RedemptionApprovals from "./pages/attendance/RedemptionApprovals";
import ShiftTemplates from "./pages/attendance/ShiftTemplates";
import Schedules from "./pages/attendance/Schedules";
// Receipt admin pages
import ReceiptsAdmin from "./pages/receipts/Receipts";
import ReceiptBusinessesAdmin from "./pages/receipts/ReceiptBusinessesAdmin";
import ReceiptExport from "./pages/receipts/ReceiptExport";
import ReceiptAnalytics from "./pages/receipts/ReceiptAnalytics";
import ReceiptSettings from "./pages/receipts/ReceiptSettings";
import ReceiptApprovalLogs from "./pages/receipts/ReceiptApprovalLogs";
import ReceiptQuota from "./pages/receipts/ReceiptQuota";
import PortalFaqAdmin from "./pages/PortalFaqAdmin";

// LIFF pages
import { LiffProvider } from "./contexts/LiffContext";
import LiffLayout from "./pages/liff/LiffLayout";
import LiffReceiptEdit from "./pages/liff/LiffReceiptEdit";
import LiffReceiptList from "./pages/liff/LiffReceiptList";
import LiffBusinesses from "./pages/liff/LiffBusinesses";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <LocaleProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <ErrorBoundary>
            <AuthProvider>
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
              
              {/* LIFF Routes - LINE In-App Mini App */}
              <Route path="/liff/*" element={
                <LiffProvider>
                  <LiffDebugOverlay />
                  <LiffLayout>
                    <Routes>
                      <Route path="/receipts" element={<LiffReceiptList />} />
                      <Route path="/receipts/:id" element={<LiffReceiptEdit />} />
                      <Route path="/businesses" element={<LiffBusinesses />} />
                      <Route path="*" element={<LiffReceiptList />} />
                    </Routes>
                  </LiffLayout>
                </LiffProvider>
              } />
              
              {/* Portal Routes - Employee Mini App */}
              <Route path="/portal/*" element={
                <LiffProvider>
                  <LiffDebugOverlay />
                  <PortalProvider>
                    <PortalLayout>
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
                      <Route path="/deposit-upload" element={<DepositUpload />} />
                      <Route path="/deposit-review/:id" element={<DepositReview />} />
                      <Route path="/my-points" element={<MyPoints />} />
                      <Route path="/rewards" element={<RewardShop />} />
                      <Route path="/my-redemptions" element={<MyRedemptions />} />
                      <Route path="/my-receipts" element={<MyReceipts />} />
                      <Route path="/receipts/:id" element={<ReceiptDetail />} />
                      <Route path="/receipt-businesses" element={<ReceiptBusinesses />} />
                      <Route path="/receipt-new" element={<ReceiptNew />} />
                      <Route path="/approve-redemptions" element={<ApproveRedemptions />} />
                      <Route path="/deposit-review-list" element={<DepositReviewList />} />
                      <Route path="/payroll-report" element={<PayrollReport />} />
                      <Route path="/my-schedule" element={<MySchedule />} />
                      <Route path="/my-payroll" element={<MyPayroll />} />
                      <Route path="/leaderboard" element={<PointLeaderboard />} />
                      <Route path="/employees" element={<PortalEmployees />} />
                      <Route path="/employees/:id" element={<PortalEmployeeDetail />} />
                      <Route path="/receipt-management" element={<PortalReceiptManagement />} />
                      <Route path="/receipt-analytics" element={<PortalReceiptAnalytics />} />
                      <Route path="/branch-report" element={<PortalBranchReport />} />
                        <Route path="*" element={<NotFound />} />
                      </Routes>
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
                      <Route path="/attendance/dashboard" element={<AttendanceDashboard />} />
                      <Route path="/attendance/employees" element={<AttendanceEmployees />} />
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
                      <Route path="/attendance/deposits" element={<Deposits />} />
                      <Route path="/attendance/deposit-settings" element={<DepositSettings />} />
                      <Route path="/attendance/happy-points" element={<HappyPoints />} />
                      <Route path="/attendance/rewards" element={<AttendanceRewards />} />
                      <Route path="/attendance/point-transactions" element={<PointTransactions />} />
                      <Route path="/attendance/point-rules" element={<PointRules />} />
                      <Route path="/attendance/redemption-approvals" element={<RedemptionApprovals />} />
                      <Route path="/attendance/shift-templates" element={<ShiftTemplates />} />
                      <Route path="/attendance/schedules" element={<Schedules />} />
                      <Route path="/attendance/settings" element={<AttendanceSettings />} />
                      <Route path="/attendance/analytics" element={<AttendanceAnalytics />} />
                      <Route path="/receipts" element={<ReceiptsAdmin />} />
                      <Route path="/receipts/businesses" element={<ReceiptBusinessesAdmin />} />
                      <Route path="/receipts/export" element={<ReceiptExport />} />
                      <Route path="/receipts/analytics" element={<ReceiptAnalytics />} />
                      <Route path="/receipts/settings" element={<ReceiptSettings />} />
                      <Route path="/receipts/approval-logs" element={<ReceiptApprovalLogs />} />
                      <Route path="/receipts/quota" element={<ReceiptQuota />} />
                      <Route path="/health-monitoring" element={<HealthMonitoring />} />
                      <Route path="/config-validator" element={<ConfigurationValidator />} />
                      <Route path="/pre-deploy-checklist" element={<PreDeployChecklist />} />
                      <Route path="/feature-flags" element={<FeatureFlags />} />
                      <Route path="/branch-report" element={<BranchReportsPage />} />
                      <Route path="/settings" element={<SettingsLayout />}>
                        <Route index element={<Settings />} />
                        <Route path="api-keys" element={<APIKeys />} />
                        <Route path="users" element={<UserManagement />} />
                        <Route path="roles" element={<RoleManagement />} />
                        <Route path="cute-quotes" element={<CuteQuotesSettings />} />
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
          </ErrorBoundary>
        </BrowserRouter>
      </TooltipProvider>
    </LocaleProvider>
  </QueryClientProvider>
);

export default App;
