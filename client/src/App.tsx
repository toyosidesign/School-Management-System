import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Shell from './components/Shell';
import SiteChrome from './components/SiteChrome';
import SiteHome from './pages/site/Home';
import SiteAbout from './pages/site/About';
import SiteLearning from './pages/site/Learning';
import SiteWhy from './pages/site/Why';
import SiteCommunity from './pages/site/Community';
import SiteCampaign from './pages/site/Campaign';
import SiteSafeguarding from './pages/site/Safeguarding';
import SiteFaqs from './pages/site/Faqs';
import SitePolicy from './pages/site/Policy';
import SiteAdmissions from './pages/site/Admissions';
import SiteContact from './pages/site/Contact';
import { NewsList, NewsArticle } from './pages/site/News';
import Login from './pages/Login';
import SetUpSchool from './pages/SetUpSchool';
import SignUpSchool from './pages/SignUpSchool';
import Activate from './pages/Activate';
import Calendar from './pages/Calendar';
import Messages from './pages/Messages';
import Settings from './pages/Settings';
import NotFound from './pages/NotFound';

import AdminDashboard from './pages/admin/Dashboard';
import AdminStudents from './pages/admin/Students';
import AdminStudentDetail from './pages/admin/StudentDetail';
import AdminStaff from './pages/admin/Staff';
import AdminClasses from './pages/admin/Classes';
import AdminSen from './pages/admin/SenRegister';
import AdminFees from './pages/admin/Fees';
import AdminAudit from './pages/admin/AuditLog';
import AdminRequests from './pages/admin/Requests';
import AdminLeave from './pages/admin/Leave';
import AdminStaffLeave from './pages/admin/StaffLeave';
import AdminInvitations from './pages/admin/Invitations';
import AdminSubjects from './pages/admin/Subjects';
import AdminSections from './pages/admin/Sections';
import AdminTimetable from './pages/admin/Timetable';
import FinanceOverview from './pages/admin/finance/Overview';
import FinanceAccounts from './pages/admin/finance/Accounts';
import FinanceAccountLedger from './pages/admin/finance/AccountLedger';
import FinanceJournals from './pages/admin/finance/Journals';
import FinanceExpenses from './pages/admin/finance/Expenses';
import FinanceReports from './pages/admin/finance/Reports';
import AdminWebsite from './pages/admin/Website';
import AdminAdmissions from './pages/admin/Admissions';

import TeacherDashboard from './pages/teacher/Dashboard';
import TeacherAttendance from './pages/teacher/Attendance';
import TeacherAssignments from './pages/teacher/Assignments';
import TeacherAssignmentDetail from './pages/teacher/AssignmentDetail';
import TeacherMaterials from './pages/teacher/Materials';
import TeacherStudents from './pages/teacher/Students';
import TeacherLeave from './pages/teacher/Leave';
import TeacherNursery from './pages/teacher/NurseryLog';
import TeacherFeedback from './pages/teacher/Feedback';
import TeacherMyLeave from './pages/teacher/MyLeave';

import StudentDashboard from './pages/student/Dashboard';
import StudentCatchUp from './pages/student/CatchUp';
import StudentAssignments from './pages/student/Assignments';
import StudentAssignmentDetail from './pages/student/AssignmentDetail';
import StudentSubjects from './pages/student/Subjects';
import StudentLibrary from './pages/student/Library';
import StudentReader from './pages/student/Reader';

import ParentDashboard from './pages/parent/Dashboard';
import ParentProgress from './pages/parent/Progress';
import ParentTimeline from './pages/parent/Timeline';
import ParentCatchUp from './pages/parent/CatchUp';
import ParentFees from './pages/parent/Fees';
import ParentSlips from './pages/parent/Slips';
import ParentLeave from './pages/parent/Leave';
import ParentFeedback from './pages/parent/Feedback';

const HOME: Record<string, string> = {
  admin: '/admin', teacher: '/teacher', student: '/student', parent: '/parent',
};

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-[color:var(--page)]" role="status" aria-live="polite">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
          <p className="mt-4 text-sm text-ink-soft">Loading your portal…</p>
        </div>
      </div>
    );
  }

  // The public website is always reachable, signed in or not.
  const publicRoutes = (
    <Route element={<SiteChrome />}>
      <Route path="/" element={<SiteHome />} />
      <Route path="/about" element={<SiteAbout />} />
      <Route path="/learning" element={<SiteLearning />} />
      <Route path="/academics" element={<Navigate to="/learning" replace />} />
      <Route path="/why" element={<SiteWhy />} />
      <Route path="/community" element={<SiteCommunity />} />
      <Route path="/campaign" element={<SiteCampaign />} />
      <Route path="/safeguarding" element={<SiteSafeguarding />} />
      <Route path="/faqs" element={<SiteFaqs />} />
      <Route path="/privacy" element={<SitePolicy page="privacy" />} />
      <Route path="/terms" element={<SitePolicy page="terms" />} />
      <Route path="/admissions" element={<SiteAdmissions />} />
      <Route path="/news" element={<NewsList />} />
      <Route path="/news/:slug" element={<NewsArticle />} />
      <Route path="/contact" element={<SiteContact />} />
    </Route>
  );

  if (!user) {
    return (
      <Routes>
        {publicRoutes}
        <Route path="/login" element={<Login />} />
        <Route path="/set-up" element={<SetUpSchool />} />
        <Route path="/sign-up" element={<SignUpSchool />} />
        <Route path="/activate/:token" element={<Activate />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  const home = HOME[user.role] ?? '/login';

  return (
    <Routes>
      {publicRoutes}
      <Route path="/login" element={<Navigate to={home} replace />} />
      <Route path="/activate/:token" element={<Activate />} />
      <Route element={<Shell />}>
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/settings" element={<Settings />} />

        {user.role === 'admin' && (
          <>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/students" element={<AdminStudents />} />
            <Route path="/admin/students/:id" element={<AdminStudentDetail />} />
            <Route path="/admin/staff" element={<AdminStaff />} />
            <Route path="/admin/classes" element={<AdminClasses />} />
            <Route path="/admin/sen" element={<AdminSen />} />
            <Route path="/admin/fees" element={<AdminFees />} />
            <Route path="/admin/requests" element={<AdminRequests />} />
            <Route path="/admin/leave" element={<AdminLeave />} />
            <Route path="/admin/staff-leave" element={<AdminStaffLeave />} />
            <Route path="/admin/invitations" element={<AdminInvitations />} />
            <Route path="/admin/subjects" element={<AdminSubjects />} />
            <Route path="/admin/sections" element={<AdminSections />} />
            <Route path="/admin/timetable" element={<AdminTimetable />} />
            <Route path="/admin/finance" element={<FinanceOverview />} />
            <Route path="/admin/finance/accounts" element={<FinanceAccounts />} />
            <Route path="/admin/finance/accounts/:id" element={<FinanceAccountLedger />} />
            <Route path="/admin/finance/journals" element={<FinanceJournals />} />
            <Route path="/admin/finance/expenses" element={<FinanceExpenses />} />
            <Route path="/admin/finance/reports" element={<FinanceReports />} />
            <Route path="/admin/audit" element={<AdminAudit />} />
            <Route path="/admin/website" element={<AdminWebsite />} />
            <Route path="/admin/admissions" element={<AdminAdmissions />} />
          </>
        )}

        {user.role === 'teacher' && (
          <>
            <Route path="/teacher" element={<TeacherDashboard />} />
            <Route path="/teacher/attendance" element={<TeacherAttendance />} />
            <Route path="/teacher/assignments" element={<TeacherAssignments />} />
            <Route path="/teacher/assignments/:id" element={<TeacherAssignmentDetail />} />
            <Route path="/teacher/materials" element={<TeacherMaterials />} />
            <Route path="/teacher/students" element={<TeacherStudents />} />
            <Route path="/teacher/students/:id" element={<AdminStudentDetail />} />
            <Route path="/teacher/leave" element={<TeacherLeave />} />
            <Route path="/teacher/nursery" element={<TeacherNursery />} />
            <Route path="/teacher/feedback" element={<TeacherFeedback />} />
            <Route path="/teacher/my-leave" element={<TeacherMyLeave />} />
          </>
        )}

        {user.role === 'student' && (
          <>
            <Route path="/student" element={<StudentDashboard />} />
            <Route path="/student/catch-up" element={<StudentCatchUp />} />
            <Route path="/student/assignments" element={<StudentAssignments />} />
            <Route path="/student/assignments/:id" element={<StudentAssignmentDetail />} />
            <Route path="/student/subjects" element={<StudentSubjects />} />
            <Route path="/student/library" element={<StudentLibrary />} />
            <Route path="/student/library/:id" element={<StudentReader />} />
          </>
        )}

        {user.role === 'parent' && (
          <>
            <Route path="/parent" element={<ParentDashboard />} />
            <Route path="/parent/progress" element={<ParentProgress />} />
            <Route path="/parent/timeline" element={<ParentTimeline />} />
            <Route path="/parent/catch-up" element={<ParentCatchUp />} />
            <Route path="/parent/fees" element={<ParentFees />} />
            <Route path="/parent/slips" element={<ParentSlips />} />
            <Route path="/parent/leave" element={<ParentLeave />} />
            <Route path="/parent/feedback" element={<ParentFeedback />} />
          </>
        )}

        <Route path="*" element={<NotFound home={home} />} />
      </Route>
    </Routes>
  );
}
