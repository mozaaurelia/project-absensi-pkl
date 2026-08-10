import { Router } from 'express';
import { myNotifications, markAsRead, markAllAsRead } from './notification.controller';
import { authenticate } from '../../middlewares/authenticate';

const router = Router();
router.get('/me', authenticate, myNotifications);
router.patch('/:id/read', authenticate, markAsRead);
router.patch('/read-all', authenticate, markAllAsRead);

export default router;