import { Router } from 'express';
import { login, me, superadminLogin, forgotPassword, resetPassword, changePassword } from './auth.controller';
import { authenticate } from '../../middlewares/authenticate';

const router = Router();
router.post('/login', login);
router.post('/superadmin/login', superadminLogin);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.get('/me', authenticate, me);
router.post('/change-password', authenticate, changePassword);

export default router;