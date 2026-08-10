import { Router } from 'express';
import { triggerCronManual } from '../../modules/dashboard/dashboard.controller';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';

const router = Router();
router.post('/cron/:job/trigger', authenticate, authorize('admin'), triggerCronManual);

export default router;