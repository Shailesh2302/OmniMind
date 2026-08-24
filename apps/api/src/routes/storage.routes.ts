import { Router, Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';

const router = Router();

const resolveSafePath = (baseDir: string, filename: string): string | null => {
  const safeName = path.basename(filename);
  if (!safeName || safeName === '.' || safeName === '..') {
    return null;
  }
  const filePath = path.join(baseDir, safeName);
  const resolvedBase = path.resolve(baseDir);
  const resolvedPath = path.resolve(filePath);
  if (!resolvedPath.startsWith(resolvedBase + path.sep)) {
    return null;
  }
  return resolvedPath;
};

router.get('/uploads/:filename', (req: Request, res: Response, next: NextFunction) => {
  try {
    const filePath = resolveSafePath(config.storage.uploadDir, req.params.filename);

    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.sendFile(filePath);
  } catch (error) {
    logger.error({ error }, 'Error serving upload file');
    next(error);
  }
});

router.get('/clips/:filename', (req: Request, res: Response, next: NextFunction) => {
  try {
    const filePath = resolveSafePath(config.storage.clipsDir, req.params.filename);

    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.sendFile(filePath);
  } catch (error) {
    logger.error({ error }, 'Error serving clip file');
    next(error);
  }
});

router.get('/thumbnails/:filename', (req: Request, res: Response, next: NextFunction) => {
  try {
    const filePath = resolveSafePath('./storage/thumbnails', req.params.filename);

    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.sendFile(filePath);
  } catch (error) {
    logger.error({ error }, 'Error serving thumbnail file');
    next(error);
  }
});

export default router;
