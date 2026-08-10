import { Router } from 'express';
import * as ctrl from './location.controller';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';

const router = Router();
router.get('/', authenticate, authorize('admin'), ctrl.listLocations);
router.post('/', authenticate, authorize('admin'), ctrl.createLocation);
router.put('/:id', authenticate, authorize('admin'), ctrl.updateLocation);
router.delete('/:id', authenticate, authorize('admin'), ctrl.deleteLocation);

export default router;