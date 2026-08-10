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
import companyRoutes from './src/modules/company/company.routes';
import holidayRoutes from './src/modules/holiday/holiday.routes';
import calendarEventRoutes from './src/modules/holiday/calendarEvent.routes';
import notificationRoutes from './src/modules/notification/notification.routes';
import dashboardRoutes from './src/modules/dashboard/dashboard.routes';
import faceRecognitionRoutes from "./src/modules/faceRecognition/faceRecognition.routes";
import adminRoutes from "./src/shared/constants/admin.routes"


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
app.use('/api/v1/companies', companyRoutes);
app.use('/api/v1/holidays', holidayRoutes);
app.use('/api/v1/calendar-events', calendarEventRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use("/api/v1/face-recognition", faceRecognitionRoutes);
app.use("/api/v1/admin", adminRoutes);


export default app;