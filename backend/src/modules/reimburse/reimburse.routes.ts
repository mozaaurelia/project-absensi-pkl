import { Router } from 'express';
import * as ctrl from './reimburse.controller';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';

const router = Router();
router.post('/requests', authenticate, ctrl.createReimburseRequest);
router.get('/requests/me', authenticate, ctrl.myReimburseRequests);
router.get('/requests/team', authenticate, authorize('supervisor', 'admin'), ctrl.teamReimburseRequests);
router.get('/requests', authenticate, authorize('admin'), ctrl.adminReimburseRequests);
router.patch('/requests/:id/approve', authenticate, authorize('supervisor', 'admin'), ctrl.approveReimburseRequest);
router.patch('/requests/:id/reject', authenticate, authorize('supervisor', 'admin'), ctrl.rejectReimburseRequest);

export default router;