import { Router } from 'express';
import { employeeDashboard, supervisorDashboard, adminDashboard } from './dashboard.controller';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';

const router = Router();
router.get('/employee', authenticate, employeeDashboard);
router.get('/supervisor', authenticate, authorize('supervisor'), supervisorDashboard);
router.get('/admin', authenticate, authorize('admin'), adminDashboard);


export default router;