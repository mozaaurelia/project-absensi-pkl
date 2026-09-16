import { Router } from 'express';
import { clockIn, clockOut, myAttendance, teamAttendance, allAttendance, adminAttendanceReport, assignedLocations } from './attendance.controller';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';

const router = Router();
router.get('/locations', authenticate, assignedLocations);
router.post('/clock-in', authenticate, clockIn);
router.post('/clock-out', authenticate, clockOut);
router.get('/me', authenticate, myAttendance);
router.get('/team', authenticate, authorize('supervisor'), teamAttendance);
router.get('/admin/report', authenticate, authorize('admin'), adminAttendanceReport);
router.get('/admin/all', authenticate, authorize('admin'), allAttendance);
router.get('/', authenticate, authorize('admin'), allAttendance);

export default router;