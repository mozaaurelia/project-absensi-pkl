import { Router } from 'express';
import * as ctrl from './employeeSchedule.controller';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';

const router = Router();
router.get('/employee/:employeeId', authenticate, ctrl.getEmployeeSchedule);
router.post('/', authenticate, authorize('admin'), ctrl.assignSchedule);
router.put('/:id/end', authenticate, authorize('admin'), ctrl.endSchedule);

export default router;