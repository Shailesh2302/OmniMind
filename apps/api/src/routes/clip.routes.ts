import { Router, Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { prisma } from '../config/db.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { queueService } from '../services/queue.service.js';
import { logger } from '../config/logger.js';
import { v4 as uuidv4 } from 'uuid';

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
    const { fileId } = req.query;
    const where: any = { userId: req.user!.userId };
    if (fileId) {
      where.fileId = fileId as string;
    }
    const clips = await prisma.clip.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        file: {
          select: {
            id: true,
            name: true,
            originalName: true,
          },
        },
      },
    });
    res.json({ clips });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/',
  authenticate,
  [
    body('fileId').notEmpty().withMessage('File ID is required'),
    body('title').notEmpty().withMessage('Title is required'),
    body('startTime').isFloat({ min: 0 }).withMessage('Start time must be a positive number'),
    body('endTime').isFloat({ min: 0 }).withMessage('End time must be a positive number'),
  ],
  validateRequest,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { fileId, title, description, startTime, endTime, videoUrl, thumbnail } = req.body;

      const file = await prisma.file.findFirst({
        where: { id: fileId, userId: req.user!.userId },
      });

      if (!file) {
        return res.status(404).json({ error: 'File not found' });
      }

      const clip = await prisma.clip.create({
        data: {
          userId: req.user!.userId,
          fileId,
          title,
          description,
          startTime,
          endTime,
          videoUrl,
          thumbnail,
          status: videoUrl ? 'COMPLETED' : 'PENDING',
        },
        include: {
          file: {
            select: {
              id: true,
              name: true,
              originalName: true,
            },
          },
        },
      });

      logger.info({ clipId: clip.id, fileId }, 'Clip created');
      res.status(201).json({ clip });
    } catch (error) {
      next(error);
    }
  }
);

router.get('/:id', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const clip = await prisma.clip.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
      include: {
        file: true,
      },
    });

    if (!clip) {
      return res.status(404).json({ error: 'Clip not found' });
    }

    const serializedClip = {
      ...clip,
      startTime: Number(clip.startTime),
      endTime: Number(clip.endTime),
      file: clip.file ? {
        ...clip.file,
        size: Number(clip.file.size),
      } : null,
    };

    res.json({ clip: serializedClip });
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const clip = await prisma.clip.findFirst({
      where: { id: req.params.id, userId: req.user!.userId },
    });

    if (!clip) {
      return res.status(404).json({ error: 'Clip not found' });
    }

    await prisma.clip.delete({
      where: { id: req.params.id },
    });

    logger.info({ clipId: req.params.id, userId: req.user!.userId }, 'Clip deleted');
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/generate',
  authenticate,
  [
    body('fileId').notEmpty().withMessage('File ID is required'),
    body('startTime').isFloat({ min: 0 }).withMessage('Start time must be a positive number'),
    body('endTime').isFloat({ min: 0 }).withMessage('End time must be a positive number'),
    body('title').optional().isLength({ min: 1 }).withMessage('Title cannot be empty'),
  ],
  validateRequest,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { fileId, startTime, endTime, title, description } = req.body;

      const file = await prisma.file.findFirst({
        where: { id: fileId, userId: req.user!.userId },
      });

      if (!file) {
        return res.status(404).json({ error: 'File not found' });
      }

      const clip = await prisma.clip.create({
        data: {
          userId: req.user!.userId,
          fileId,
          title: title || `Clip from ${file.name}`,
          description,
          startTime,
          endTime,
          status: 'PROCESSING',
        },
      });

      const jobId = uuidv4();

      try {
        const rustWorkerUrl = process.env.RUST_WORKER_URL || 'http://localhost:3003';
        const rustResponse = await fetch(`${rustWorkerUrl}/api/clips/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clipId: clip.id,
            filePath: file.path,
            startTime,
            endTime,
          }),
        });

        if (rustResponse.ok) {
          const result = await rustResponse.json() as { url?: string; thumbnail?: string };
          await prisma.clip.update({
            where: { id: clip.id },
            data: {
              status: 'COMPLETED',
              videoUrl: result.url ?? null,
              thumbnail: result.thumbnail ?? null,
            },
          });
          logger.info({ clipId: clip.id, jobId }, 'Clip generated via Rust worker');
        } else {
          throw new Error('Rust worker failed');
        }
      } catch (rustError) {
        logger.warn({ rustError, clipId: clip.id }, 'Rust worker not available, using queue');
        try {
          await queueService.addClipGenerationJob({
            fileId,
            filePath: file.path,
            startTime,
            endTime,
            userId: req.user!.userId,
            clipId: clip.id,
          });
        } catch (queueError) {
          logger.warn({ queueError }, 'Queue unavailable, clip will be processed async');
        }
      }

      const updatedClip = await prisma.clip.findUnique({
        where: { id: clip.id },
        include: {
          file: {
            select: {
              id: true,
              name: true,
              originalName: true,
            },
          },
        },
      });

      res.json({ clip: updatedClip, jobId });
    } catch (error) {
      next(error);
    }
  }
);

export default router;