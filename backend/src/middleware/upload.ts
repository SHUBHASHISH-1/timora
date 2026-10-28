// backend/src/middleware/upload.ts

import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { env } from '../config/env';

const uploadDir = path.resolve(env.UPLOAD_DIR);
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const safeUserId = req.user?.userId ?? 'anon';
    const cleanBase = path
      .basename(file.originalname, path.extname(file.originalname))
      .replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `cv_${safeUserId}_${Date.now()}_${cleanBase}.pdf`);
  },
});

export const cvUpload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB max
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      cb(new Error('Only PDF files (.pdf) are permitted for CV uploads.'));
      return;
    }
    cb(null, true);
  },
});

