import { Router, Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';
import { prisma } from '../config/db.js';

const router = Router();

const requireOwnedFile = async (fileId: unknown, userId: string): Promise<boolean> => {
  if (!fileId || typeof fileId !== 'string') return false;
  const file = await prisma.file.findFirst({ where: { id: fileId, userId }, select: { id: true } });
  return Boolean(file);
};

router.post(
  '/summary',
  authenticate,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { fileId } = req.body;
      const userId = req.user!.userId;

      if (!(await requireOwnedFile(fileId, userId))) {
        return res.status(404).json({ error: 'File not found' });
      }

      logger.info(`Generating video summary: fileId=${fileId}, userId=${userId}`);

      const response = await fetch(`${config.aiServiceUrl}/api/v1/summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_id: fileId,
          user_id: userId,
        }),
      });

      if (!response.ok) {
        throw new Error(`AI service error: ${response.statusText}`);
      }

      const data = await response.json();
      res.json(data);
    } catch (error) {
      logger.error({ error }, 'Error generating video summary');
      next(error);
    }
  }
);

router.post(
  '/ask',
  authenticate,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { fileId, question } = req.body;
      const userId = req.user!.userId;

      if (!fileId || !question) {
        return res.status(400).json({ error: 'fileId and question are required' });
      }

      if (!(await requireOwnedFile(fileId, userId))) {
        return res.status(404).json({ error: 'File not found' });
      }

      logger.info(`Processing video question: fileId=${fileId}`);

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const response = await fetch(`${config.aiServiceUrl}/api/v1/ask`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({
          file_id: fileId,
          user_id: userId,
          question,
        }),
      });

      if (!response.ok) {
        throw new Error(`AI service error: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        const readStream = () => {
          reader.read().then(({ done, value }) => {
            if (done) {
              res.end();
            } else {
              res.write(decoder.decode(value));
              readStream();
            }
          }).catch((err) => {
            logger.error({ err }, 'SSE stream error');
            res.end();
          });
        };
        readStream();
      }

    } catch (error) {
      logger.error({ error }, 'Error processing video question');
      next(error);
    }
  }
);

router.get(
  '/status/:fileId',
  authenticate,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { fileId } = req.params;
      const userId = req.user!.userId;

      if (!(await requireOwnedFile(fileId, userId))) {
        return res.status(404).json({ error: 'File not found' });
      }

      const response = await fetch(
        `${config.aiServiceUrl}/api/v1/status?file_id=${fileId}&user_id=${userId}`,
        { method: 'GET' }
      );

      if (!response.ok) {
        throw new Error(`AI service error: ${response.statusText}`);
      }

      const data = await response.json();
      res.json(data);
    } catch (error) {
      logger.error({ error }, 'Error getting video status');
      next(error);
    }
  }
);

router.post(
  '/smart-clips',
  authenticate,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { fileId, maxClips = 5 } = req.body;
      const userId = req.user!.userId;

      if (!(await requireOwnedFile(fileId, userId))) {
        return res.status(404).json({ error: 'File not found' });
      }

      logger.info(`Generating smart clips: fileId=${fileId}, maxClips=${maxClips}`);

      const response = await fetch(`${config.aiServiceUrl}/api/v1/smart-clips`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_id: fileId,
          user_id: userId,
          max_clips: maxClips,
        }),
      });

      if (!response.ok) {
        throw new Error(`AI service error: ${response.statusText}`);
      }

      const data = await response.json();
      res.json(data);
    } catch (error) {
      logger.error({ error }, 'Error generating smart clips');
      next(error);
    }
  }
);

export default router;
