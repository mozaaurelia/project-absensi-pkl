import { Router } from 'express';
import * as ctrl from './announcement.controller';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';

const router = Router();
router.get('/', authenticate, ctrl.listAnnouncements);
router.get('/:id', authenticate, ctrl.getAnnouncement);
router.post('/', authenticate, authorize('admin'), ctrl.createAnnouncement);
router.put('/:id', authenticate, authorize('admin'), ctrl.updateAnnouncement);
router.delete('/:id', authenticate, authorize('admin'), ctrl.deleteAnnouncement);

export default router;