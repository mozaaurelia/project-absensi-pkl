import { Router } from 'express';
import * as ctrl from './workingDayPattern.controller';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';

const router = Router();
router.get('/', authenticate, authorize('admin'), ctrl.listWorkingDayPatterns);
router.post('/', authenticate, authorize('admin'), ctrl.createWorkingDayPattern);
router.put('/:id', authenticate, authorize('admin'), ctrl.updateWorkingDayPattern);

export default router;