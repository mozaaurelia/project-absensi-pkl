import { Router } from 'express';
import * as ctrl from './shift.controller';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';

const router = Router();
router.get('/', authenticate, authorize('admin'), ctrl.listShifts);
router.post('/', authenticate, authorize('admin'), ctrl.createShift);
router.put('/:id', authenticate, authorize('admin'), ctrl.updateShift);
router.delete('/:id', authenticate, authorize('admin'), ctrl.deleteShift);

export default router;