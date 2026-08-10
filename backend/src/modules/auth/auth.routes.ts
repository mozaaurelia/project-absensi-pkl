import { Router } from 'express';
import { login, me, superadminLogin } from './auth.controller';
import { authenticate } from '../../middlewares/authenticate';

const router = Router();
router.post('/login', login);
router.post('/superadmin/login', superadminLogin);
router.get('/me', authenticate, me);

export default router;