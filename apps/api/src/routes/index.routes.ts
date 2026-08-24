import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import path from 'path';
import { prisma } from '../config/db.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';

const router = Router();

const validateRequest = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

router.post(
  '/',
  authenticate,
  [
    body('fileId').notEmpty().withMessage('File ID is required'),
  ],
  validateRequest,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { fileId } = req.body;

      const file = await prisma.file.findFirst({
        where: { id: fileId, userId: req.user!.userId },
      });

      if (!file) {
        return res.status(404).json({ error: 'File not found' });
      }

      await prisma.file.update({
        where: { id: fileId },
        data: { status: 'PROCESSING' as any },
      });

      try {
        const aiResponse = await fetch(`${config.aiServiceUrl}/api/v1/documents/index`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            file_id: file.id,
            file_path: path.resolve(file.path),
            mime_type: file.mimeType,
            user_id: req.user!.userId,
          }),
        });

        if (aiResponse.ok) {
          await prisma.file.update({
            where: { id: fileId },
            data: { status: 'COMPLETED' as any },
          });
          logger.info({ fileId }, 'File indexed successfully via AI service');
          return res.json({ success: true, message: 'Indexing completed' });
        } else {
          throw new Error('AI service returned error');
        }
      } catch (aiError) {
        await prisma.file.update({
          where: { id: fileId },
          data: { status: 'FAILED' as any },
        });
        logger.error({ aiError, fileId }, 'AI indexing failed');
        return res.status(500).json({ error: 'Indexing failed' });
      }
    } catch (error) {
      next(error);
    }
  }
);

export default router;