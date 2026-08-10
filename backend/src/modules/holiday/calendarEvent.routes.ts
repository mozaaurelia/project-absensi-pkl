import { Router } from 'express';
import * as ctrl from './holiday.controller';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';

const router = Router();
router.get('/', authenticate, ctrl.listCalendarEvents);
router.post('/', authenticate, authorize('admin'), ctrl.createCalendarEvent);
router.put('/:id', authenticate, authorize('admin'), ctrl.updateCalendarEvent);
router.delete('/:id', authenticate, authorize('admin'), ctrl.deleteCalendarEvent);

export default router;