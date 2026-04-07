const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const router = express.Router();

const { authenticate } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../middleware/errorHandler');
const { logger } = require('../config/logger');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB default
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = (process.env.ALLOWED_FILE_TYPES || 'image/jpeg,image/png,image/webp,application/pdf').split(',');
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new AppError('File type not allowed', 400), false);
    }
  }
});

// @desc    Upload single file
// @route   POST /api/upload/single
// @access  Private
router.post('/single', authenticate, upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new AppError('No file uploaded', 400);
  }

  const { folder = 'general' } = req.body;

  try {
    // Upload to Cloudinary
    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: `safetradehub/${folder}`,
          resource_type: 'auto',
          use_filename: true,
          unique_filename: true
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      
      uploadStream.end(req.file.buffer);
    });

    logger.info('File uploaded successfully', {
      userId: req.user.id,
      filename: req.file.originalname,
      size: req.file.size,
      url: result.secure_url
    });

    res.json({
      success: true,
      message: 'File uploaded successfully',
      data: {
        url: result.secure_url,
        publicId: result.public_id,
        filename: result.original_filename,
        size: result.bytes,
        format: result.format
      }
    });
  } catch (error) {
    logger.error('File upload failed:', error);
    throw new AppError('File upload failed', 500);
  }
}));

// @desc    Upload multiple files
// @route   POST /api/upload/multiple
// @access  Private
router.post('/multiple', authenticate, upload.array('files', 5), asyncHandler(async (req, res) => {
  if (!req.files || req.files.length === 0) {
    throw new AppError('No files uploaded', 400);
  }

  const { folder = 'general' } = req.body;
  const uploadedFiles = [];

  try {
    // Upload all files to Cloudinary
    const uploadPromises = req.files.map(file => {
      return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            folder: `safetradehub/${folder}`,
            resource_type: 'auto',
            use_filename: true,
            unique_filename: true
          },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        
        uploadStream.end(file.buffer);
      });
    });

    const results = await Promise.all(uploadPromises);

    results.forEach((result, index) => {
      uploadedFiles.push({
        url: result.secure_url,
        publicId: result.public_id,
        filename: result.original_filename,
        size: result.bytes,
        format: result.format,
        originalName: req.files[index].originalname
      });
    });

    logger.info('Multiple files uploaded successfully', {
      userId: req.user.id,
      fileCount: req.files.length,
      totalSize: req.files.reduce((sum, file) => sum + file.size, 0)
    });

    res.json({
      success: true,
      message: `${req.files.length} files uploaded successfully`,
      data: {
        files: uploadedFiles
      }
    });
  } catch (error) {
    logger.error('Multiple file upload failed:', error);
    throw new AppError('File upload failed', 500);
  }
}));

// @desc    Delete file
// @route   DELETE /api/upload/:publicId
// @access  Private
router.delete('/:publicId', authenticate, asyncHandler(async (req, res) => {
  const { publicId } = req.params;

  if (!publicId) {
    throw new AppError('Public ID is required', 400);
  }

  try {
    const result = await cloudinary.uploader.destroy(publicId);

    if (result.result === 'ok') {
      logger.info('File deleted successfully', {
        userId: req.user.id,
        publicId
      });

      res.json({
        success: true,
        message: 'File deleted successfully'
      });
    } else {
      throw new AppError('File not found or already deleted', 404);
    }
  } catch (error) {
    logger.error('File deletion failed:', error);
    throw new AppError('File deletion failed', 500);
  }
}));

module.exports = router;