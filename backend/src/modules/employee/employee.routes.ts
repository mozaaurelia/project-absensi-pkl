import { Router } from 'express';
import { listEmployees, createEmployee, getEmployeeById, updateEmployee, deleteEmployee, getMyProfile, updateMyProfile } from './employee.controller';
import { authenticate } from '../../middlewares/authenticate';
import { authorize } from '../../middlewares/authorize';

const router = Router();
router.get('/me/profile', authenticate, getMyProfile);
router.put('/me/profile', authenticate, updateMyProfile);
router.get('/', authenticate, authorize('admin'), listEmployees);
router.post('/', authenticate, authorize('admin'), createEmployee);
router.get('/:id', authenticate, authorize('admin'), getEmployeeById);
router.put('/:id', authenticate, authorize('admin'), updateEmployee);
router.delete('/:id', authenticate, authorize('admin'), deleteEmployee);

export default router;