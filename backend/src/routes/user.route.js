import express from 'express';
import { protectRoute } from '../middleware/auth.middleware.js';
import { getUserById } from '../controllers/user.controller.js';

const router = express.Router();

router.get('/:id', protectRoute, getUserById);

export default router;
