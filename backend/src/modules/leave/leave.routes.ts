import { Router } from 'express';
import * as ctrl from './leave.controller';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';

const router = Router();
router.get('/types', authenticate, ctrl.listLeaveTypes);
router.post('/requests', authenticate, ctrl.createLeaveRequest);
router.get('/requests/me', authenticate, ctrl.myLeaveRequests);
router.patch('/requests/:id/approve', authenticate, authorize('supervisor', 'admin'), ctrl.approveLeaveRequest);
router.patch('/requests/:id/reject', authenticate, authorize('supervisor', 'admin'), ctrl.rejectLeaveRequest);
router.get('/quota/:employeeId', authenticate, ctrl.getLeaveQuota);
router.post('/quota/:employeeId/adjust', authenticate, authorize('admin'), ctrl.adjustLeaveQuota);

export default router;