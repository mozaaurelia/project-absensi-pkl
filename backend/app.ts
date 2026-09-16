import express from 'express';
import cors from 'cors';
import authRoutes from './src/modules/auth/auth.routes';
import employeeRoutes from './src/modules/employee/employee.routes'
import departmentRoutes from './src/modules/department/department.routes';
import positionRoutes from './src/modules/position/position.routes';
import shiftRoutes from './src/modules/shift/shift.routes';
import locationRoutes from './src/modules/location/location.routes';
import workingDayPatternRoutes from './src/modules/schedule/workingDayPattern.routes';
import employeeScheduleRoutes from './src/modules/schedule/employeeSchedule.routes';
import attendanceRoutes from './src/modules/attendance/attendance.routes';
import leaveRoutes from './src/modules/leave/leave.routes';
import reimburseRoutes from './src/modules/reimburse/reimburse.routes';
import announcementRoutes from './src/modules/announcement/announcement.routes';
import companyRoutes from './src/modules/company/company.routes';
import holidayRoutes from './src/modules/holiday/holiday.routes';
import calendarEventRoutes from './src/modules/holiday/calendarEvent.routes';
import notificationRoutes from './src/modules/notification/notification.routes';
import overtimeRoutes from './src/modules/overtime/overtime.routes';
import personalAgendaRoutes from './src/modules/personalAgenda/personalAgenda.routes';
import rolesRoutes from './src/modules/roles/roles.routes';
import dashboardRoutes from './src/modules/dashboard/dashboard.routes';
import faceRecognitionRoutes from "./src/modules/faceRecognition/faceRecognition.routes";
import messageRoutes from "./src/modules/message/message.routes";
import taskRoutes from "./src/modules/task/task.routes";
import adminRoutes from "./src/shared/constants/admin.routes"
import onboardingRoutes from './src/modules/onboarding/onboarding.routes';


const app = express();
app.use(cors());

// app.use(express.json());

app.use(express.json({ limit: '1000mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }))

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/employees', employeeRoutes);
app.use('/api/v1/departments', departmentRoutes);
app.use('/api/v1/positions', positionRoutes);
app.use('/api/v1/shifts', shiftRoutes);
app.use('/api/v1/locations', locationRoutes);
app.use('/api/v1/working-day-patterns', workingDayPatternRoutes);
app.use('/api/v1/schedules', employeeScheduleRoutes);
app.use('/api/v1/attendance', attendanceRoutes);
app.use('/api/v1/leave', leaveRoutes);
app.use('/api/v1/reimburse', reimburseRoutes);
app.use('/api/v1/announcements', announcementRoutes);
app.use('/api/v1/companies', companyRoutes);
app.use('/api/v1/holidays', holidayRoutes);
app.use('/api/v1/calendar-events', calendarEventRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/overtime', overtimeRoutes);
app.use('/api/v1/personal-agendas', personalAgendaRoutes);
app.use('/api/v1/roles', rolesRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use("/api/v1/face-recognition", faceRecognitionRoutes);
app.use("/api/v1/messages", messageRoutes);
app.use("/api/v1/tasks", taskRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/onboarding", onboardingRoutes);

// global error handler: keep body-parser/JSON failures as clean 400 JSON
interface ErrorWithStatus extends Error {
  status?: number;
  statusCode?: number;
  type?: string;
}

app.use((err: ErrorWithStatus, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const isJsonParseError =
    err instanceof SyntaxError &&
    (err.status === 400 || err.type === "entity.parse.failed");
  if (isJsonParseError) {
    console.warn(`[bad-json] ${req.method} ${req.originalUrl}: ${err.message}`);
    return res.status(400).json({
      success: false,
      error: {
        code: "BAD_JSON",
        message: "Request body is not valid JSON.",
      },
    });
  }
  console.error(`[error] ${req.method} ${req.originalUrl}:`, err);
  return res.status(err.statusCode || err.status || 500).json({
    success: false,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "Something went wrong. Please try again later.",
    },
  });
});

export default app;