import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/env.js';
import { logger } from '../config/logger.js';

export interface StorageResult {
  path: string;
  url: string;
  size: number;
  publicId?: string;
}

interface CloudinaryUploadResult {
  secure_url: string;
  public_id: string;
  bytes: number;
  format: string;
}

class StorageService {
  private cloudName: string;
  private apiKey: string;
  private apiSecret: string;
  private uploadPreset: string;
  private storageType: 'local' | 'cloudinary' | 's3';

  constructor() {
    this.cloudName = process.env.CLOUDINARY_CLOUD_NAME || '';
    this.apiKey = process.env.CLOUDINARY_API_KEY || '';
    this.apiSecret = process.env.CLOUDINARY_API_SECRET || '';
    this.uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET || '';
    this.storageType = (process.env.STORAGE_TYPE || 'local') as 'local' | 'cloudinary' | 's3';
    if (this.storageType === 'cloudinary' && (!this.cloudName || !this.apiKey || !this.apiSecret)) {
      logger.warn('STORAGE_TYPE=cloudinary but CLOUDINARY_* env vars are not fully configured - falling back to local storage');
      this.storageType = 'local';
    }
  }

  async initialize(): Promise<void> {
    if (this.storageType === 'local') {
      const uploadDir = config.storage.uploadDir;
      const clipsDir = config.storage.clipsDir;
      await fs.mkdir(uploadDir, { recursive: true });
      await fs.mkdir(clipsDir, { recursive: true });
      logger.info({ uploadDir, clipsDir }, 'Local storage initialized');
    } else {
      logger.info({ cloudName: this.cloudName }, 'Cloudinary storage initialized');
    }
  }

  async saveFile(buffer: Buffer, originalName: string): Promise<StorageResult> {
    if (this.storageType === 'cloudinary') {
      return this.uploadToCloudinary(buffer, originalName, 'raw');
    }
    return this.saveFileLocal(buffer, originalName);
  }

  async saveClip(buffer: Buffer, originalName: string): Promise<StorageResult> {
    if (this.storageType === 'cloudinary') {
      return this.uploadToCloudinary(buffer, originalName, 'video');
    }
    return this.saveClipLocal(buffer, originalName);
  }

  private async uploadToCloudinary(buffer: Buffer, originalName: string, resourceType: 'image' | 'video' | 'raw' | 'auto'): Promise<StorageResult> {
    const ext = path.extname(originalName).toLowerCase();
    const publicId = `aether/${resourceType}/${uuidv4()}${ext}`;
    
    const base64 = buffer.toString('base64');
    const mimeType = this.getMimeType(ext);

    const formData = new URLSearchParams();
    formData.append('file', `data:${mimeType};base64,${base64}`);
    formData.append('public_id', publicId);
    formData.append('upload_preset', this.uploadPreset);
    formData.append('resource_type', resourceType);

    try {
      const response = await fetch(`https://api.cloudinary.com/v1_1/${this.cloudName}/${resourceType}/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({ error: errorText, status: response.status }, 'Cloudinary upload failed');
        let detail = errorText;
        try {
          const parsed = JSON.parse(errorText);
          detail = parsed?.error?.message || errorText;
        } catch {
          // not JSON, keep raw text
        }
        throw new Error(`Cloudinary upload failed (${response.status}): ${detail}`);
      }

      const result = await response.json() as CloudinaryUploadResult;
      
      logger.info({ publicId: result.public_id, url: result.secure_url }, 'File uploaded to Cloudinary');

      return {
        path: result.public_id,
        url: result.secure_url,
        size: result.bytes,
        publicId: result.public_id,
      };
    } catch (error) {
      logger.error({ error, originalName }, 'Failed to upload to Cloudinary');
      throw error;
    }
  }

  private getMimeType(ext: string): string {
    const mimeTypes: Record<string, string> = {
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.avi': 'video/avi',
      '.mov': 'video/quicktime',
      '.mkv': 'video/x-matroska',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  private async saveFileLocal(buffer: Buffer, originalName: string): Promise<StorageResult> {
    const ext = path.extname(originalName);
    const filename = `${uuidv4()}${ext}`;
    const filePath = path.join(config.storage.uploadDir, filename);
    
    await fs.writeFile(filePath, buffer);
    
    const stats = await fs.stat(filePath);
    
    return {
      path: filePath,
      url: `/storage/uploads/${filename}`,
      size: stats.size,
    };
  }

  private async saveClipLocal(buffer: Buffer, originalName: string): Promise<StorageResult> {
    const ext = path.extname(originalName);
    const filename = `${uuidv4()}${ext}`;
    const filePath = path.join(config.storage.clipsDir, filename);
    
    await fs.writeFile(filePath, buffer);
    
    const stats = await fs.stat(filePath);
    
    return {
      path: filePath,
      url: `/storage/clips/${filename}`,
      size: stats.size,
    };
  }

  async deleteFile(filePath: string): Promise<void> {
    if (this.storageType === 'cloudinary') {
      try {
        const deleteUrl = `https://api.cloudinary.com/v1_1/${this.cloudName}/resources/image/upload?public_id=${encodeURIComponent(filePath)}`;
        
        const response = await fetch(deleteUrl, {
          method: 'DELETE',
          headers: {
            'Authorization': `Basic ${Buffer.from(`${this.apiKey}:${this.apiSecret}`).toString('base64')}`,
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          logger.warn({ error: errorText, filePath }, 'Cloudinary delete failed, file may not exist');
        } else {
          logger.info({ filePath }, 'File deleted from Cloudinary');
        }
      } catch (error) {
        logger.error({ error, filePath }, 'Failed to delete from Cloudinary');
        throw error;
      }
    } else {
      try {
        await fs.unlink(filePath);
        logger.info({ filePath }, 'File deleted from local storage');
      } catch (error) {
        logger.error({ error, filePath }, 'Failed to delete local file');
        throw error;
      }
    }
  }

  async getFile(filePath: string): Promise<Buffer> {
    if (this.storageType === 'cloudinary') {
      const response = await fetch(filePath);
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }
    return fs.readFile(filePath);
  }

  async fileExists(filePath: string): Promise<boolean> {
    if (this.storageType === 'cloudinary') {
      try {
        const response = await fetch(`https://res.cloudinary.com/${this.cloudName}/image/resolve?public_id=${filePath}`);
        return response.ok;
      } catch {
        return false;
      }
    }
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  getFileUrl(relativePath: string): string {
    if (this.storageType === 'cloudinary') {
      return `https://res.cloudinary.com/${this.cloudName}/raw/upload/${relativePath}`;
    }
    return `${config.storage.apiUrl}${relativePath}`;
  }

  async getDownloadUrl(publicId: string, _originalName: string): Promise<string> {
    if (this.storageType === 'cloudinary') {
      return `https://res.cloudinary.com/${this.cloudName}/video/upload/${publicId}`;
    }
    return this.getFileUrl(publicId);
  }

  getUploadDir(): string {
    return config.storage.uploadDir;
  }

  getClipsDir(): string {
    return config.storage.clipsDir;
  }

  getStorageType(): string {
    return this.storageType;
  }
}

export const storageService = new StorageService();