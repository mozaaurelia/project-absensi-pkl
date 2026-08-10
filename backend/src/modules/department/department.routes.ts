import { Router } from 'express';
import * as ctrl from './department.controller';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';

const router = Router();
router.get('/', authenticate, authorize('admin'), ctrl.listDepartments);
router.post('/', authenticate, authorize('admin'), ctrl.createDepartment);
router.get('/:id', authenticate, authorize('admin'), ctrl.getDepartmentById);
router.put('/:id', authenticate, authorize('admin'), ctrl.updateDepartment);
router.delete('/:id', authenticate, authorize('admin'), ctrl.deleteDepartment);
router.get('/:id/policy', authenticate, authorize('admin', 'supervisor'), ctrl.getDepartmentPolicy);
router.put('/:id/policy', authenticate, authorize('admin'), ctrl.updateDepartmentPolicy);

export default router;