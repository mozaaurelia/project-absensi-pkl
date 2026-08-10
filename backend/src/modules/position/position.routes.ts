import { Router } from 'express';
import * as ctrl from './position.controller';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';

const router = Router();
router.get('/', authenticate, authorize('admin'), ctrl.listPositions);
router.post('/', authenticate, authorize('admin'), ctrl.createPosition);
router.put('/:id', authenticate, authorize('admin'), ctrl.updatePosition);
router.delete('/:id', authenticate, authorize('admin'), ctrl.deletePosition);

export default router;