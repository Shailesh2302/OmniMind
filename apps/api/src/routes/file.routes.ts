import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { prisma } from '../config/db.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { storageService } from '../services/storage.service.js';
import { logger } from '../config/logger.js';

const router = Router();

const validateRequest = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

router.get('/', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const files = await prisma.file.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        originalName: true,
        mimeType: true,
        size: true,
        status: true,
        url: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    const serialized = files.map(f => ({ ...f, size: Number(f.size) }));
    res.json({ files: serialized });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const file = await prisma.file.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.json({
      file: {
        id: file.id,
        name: file.name,
        originalName: file.originalName,
        mimeType: file.mimeType,
        size: Number(file.size),
        path: file.path,
        url: file.url,
        status: file.status,
        metadata: file.metadata,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const file = await prisma.file.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    await storageService.deleteFile(file.path);

    await prisma.file.delete({
      where: { id: req.params.id },
    });

    logger.info({ fileId: req.params.id, userId: req.user!.userId }, 'File deleted');
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.get('/:id/download', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const file = await prisma.file.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
    });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    const downloadUrl = await storageService.getDownloadUrl(file.path, file.originalName);
    res.json({ url: downloadUrl });
  } catch (error) {
    next(error);
  }
});

router.patch(
  '/:id',
  authenticate,
  [
    body('status').optional().isIn(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']).withMessage('Invalid status'),
  ],
  validateRequest,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { name, originalName, status, metadata } = req.body;

      const file = await prisma.file.findFirst({
        where: { id: req.params.id, userId: req.user!.userId },
      });

      if (!file) {
        return res.status(404).json({ error: 'File not found' });
      }

      const updateData: any = {};
      if (name) updateData.name = name;
      if (originalName) updateData.originalName = originalName;
      if (status) updateData.status = status;
      if (metadata) updateData.metadata = metadata;

      const updated = await prisma.file.update({
        where: { id: req.params.id },
        data: updateData,
        select: {
          id: true,
          name: true,
          originalName: true,
          mimeType: true,
          size: true,
          path: true,
          url: true,
          status: true,
          metadata: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      res.json({
        file: {
          ...updated,
          size: Number(updated.size),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;