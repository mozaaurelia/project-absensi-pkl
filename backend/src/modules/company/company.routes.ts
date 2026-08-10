import { Router } from 'express';
import * as ctrl from './company.controller';
import { authenticate } from '../../middlewares/authenticate';
import { requireSuperAdmin } from '../../middlewares/authorize';

const router = Router();
router.get('/', authenticate, requireSuperAdmin, ctrl.listCompanies);
router.get('/:id', authenticate, requireSuperAdmin, ctrl.getCompanyById);
router.post('/', authenticate, requireSuperAdmin, ctrl.createCompany);
router.put('/:id', authenticate, requireSuperAdmin, ctrl.updateCompany);
router.patch('/:id/status', authenticate, requireSuperAdmin, ctrl.updateCompanyStatus);

export default router;