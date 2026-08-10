import { Router } from 'express';
import * as ctrl from './holiday.controller';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';

const router = Router();
router.get('/', authenticate, ctrl.listHolidays); // semua role boleh lihat
router.post('/', authenticate, authorize('admin'), ctrl.createHoliday);
router.delete('/:id', authenticate, authorize('admin'), ctrl.deleteHoliday);

export default router;