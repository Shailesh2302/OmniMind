import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import { prisma } from '../config/db.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { storageService } from '../services/storage.service.js';
import { queueService } from '../services/queue.service.js';
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';

const router = Router();

const storage = multer.memoryStorage();

const fileFilter = (req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimeTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'video/mp4',
    'video/webm',
    'video/x-msvideo',
    'video/x-matroska',
    'video/quicktime',
    'audio/mpeg',
    'audio/wav',
    'audio/wave',
    'audio/x-wav',
    'audio/ogg',
    'audio/webm',
    'text/plain',
    'text/markdown',
    'text/csv',
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type'));
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: 500 * 1024 * 1024,
  },
  fileFilter,
});

interface UploadedFileInfo {
  id: string;
  name: string;
  originalName: string;
  mimeType: string;
  size: number;
  status: string;
  url: string | null;
  createdAt: Date;
}

const DOCUMENT_MIMES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/markdown',
  'text/csv',
]);

/**
 * Shared post-upload pipeline:
 *   video/audio -> enqueue to aether:video:queue (Rust worker transcribes + indexes)
 *   documents   -> index directly via AI service
 */
async function processUploadedFile(
  userId: string,
  originalName: string,
  mimeType: string,
  size: number,
  buffer: Buffer
): Promise<UploadedFileInfo> {
  const storageResult = await storageService.saveFile(buffer, originalName);

  const dbFile = await prisma.file.create({
    data: {
      userId,
      name: path.basename(storageResult.path),
      originalName,
      mimeType,
      size: Number(BigInt(size)),
      path: storageResult.path,
      url: storageResult.url,
      status: 'PENDING',
    },
  });

  try {
    if (mimeType.startsWith('video/') || mimeType.startsWith('audio/')) {
      await queueService.addVideoProcessingJob({
        fileId: dbFile.id,
        filePath: storageResult.path,
        mimeType,
        userId,
      });
      await prisma.file.update({
        where: { id: dbFile.id },
        data: { status: 'PROCESSING' },
      });
    } else if (DOCUMENT_MIMES.has(mimeType)) {
      await prisma.file.update({
        where: { id: dbFile.id },
        data: { status: 'PROCESSING' },
      });

      // Index in the background so uploads return instantly.
      // The file's DB row is updated when indexing finishes.
      void indexDocumentInBackground(dbFile.id, storageResult.path, mimeType, userId).catch((err) => {
        logger.error({ err, fileId: dbFile.id }, 'Background indexing crashed');
      });
    }
  } catch (err) {
    logger.error({ err, fileId: dbFile.id }, 'Post-upload processing failed');
    await prisma.file.update({
      where: { id: dbFile.id },
      data: { status: 'FAILED' },
    }).catch(() => undefined);
  }

  const finalFile = await prisma.file.findUnique({
    where: { id: dbFile.id },
  });

  return {
    id: dbFile.id,
    name: dbFile.name,
    originalName: dbFile.originalName,
    mimeType: dbFile.mimeType,
    size: Number(dbFile.size),
    status: finalFile?.status || dbFile.status,
    url: dbFile.url,
    createdAt: dbFile.createdAt,
  };
}


/**
 * Background document indexing - never blocks the upload response.
 */
async function indexDocumentInBackground(
  fileId: string,
  filePath: string,
  mimeType: string,
  userId: string
): Promise<void> {
  try {
    const aiResponse = await fetch(`${config.aiServiceUrl}/api/v1/documents/index`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        file_id: fileId,
        file_path: path.resolve(filePath),
        mime_type: mimeType,
        user_id: userId,
      }),
    });
    if (aiResponse.ok) {
      logger.info({ fileId }, 'Background indexing finished');
      await prisma.file.update({ where: { id: fileId }, data: { status: 'COMPLETED' } });
    } else {
      throw new Error(`AI service returned ${aiResponse.status}`);
    }
  } catch (indexError) {
    logger.warn({ indexError, fileId }, 'Direct indexing failed, enqueuing for worker');
    await queueService.addDocumentProcessingJob({
      fileId,
      filePath,
      mimeType,
      userId,
    }).catch(() => undefined);
  }
}

router.post(
  '/',
  authenticate,
  upload.single('file'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const fileInfo = await processUploadedFile(
        req.user!.userId,
        req.file.originalname,
        req.file.mimetype,
        req.file.size,
        req.file.buffer
      );

      logger.info({ fileId: fileInfo.id, userId: req.user!.userId, mimeType: fileInfo.mimeType }, 'File uploaded');

      res.status(201).json({ file: fileInfo });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  '/multiple',
  authenticate,
  upload.array('files', 10),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
      }

      const results: UploadedFileInfo[] = [];
      for (const file of req.files) {
        results.push(await processUploadedFile(
          req.user!.userId,
          file.originalname,
          file.mimetype,
          file.size,
          file.buffer
        ));
      }

      logger.info({ count: results.length, userId: req.user!.userId }, 'Multiple files uploaded');

      res.status(201).json({ files: results });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
