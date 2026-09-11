import { Router } from 'express';

const router = Router();

// Root / Welcome route
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Welcome to the API',
    version: '1.0.0'
  });
});

// Health check route
router.get('/health', (req, res) => {
  res.json({
    status: 'UP',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

export default router;
