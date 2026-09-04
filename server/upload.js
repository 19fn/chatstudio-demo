const express = require('express');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const router = express.Router();

const maxUploadBytes = Number(process.env.MAX_UPLOAD_MB || 20) * 1024 * 1024;
const allowedTypes = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/csv',
  'text/markdown',
  'text/plain',
]);
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: maxUploadBytes, files: 1 },
  fileFilter: (_request, file, callback) => callback(
    allowedTypes.has(file.mimetype) ? null : new multer.MulterError('LIMIT_UNEXPECTED_FILE'),
    allowedTypes.has(file.mimetype),
  ),
});

// Function to upload file to the external service
async function uploadFileToService(file) {
  const formData = new FormData();
  formData.append('file', fs.createReadStream(file.path), file.originalname);

  const response = await axios.post(`${process.env.AI_API_ENDPOINT}/data/upload`, formData, {
    headers: {
      ...formData.getHeaders(),
      'api-key': process.env.AI_API_KEY
    },
    timeout: Number(process.env.UPSTREAM_TIMEOUT_MS || 60000),
  });

  return response.data;
}

// Route to handle file upload
router.post('/upload', upload.single('file'), async (req, res) => {
  const file = req.file;

  if (!file) {
    return res.status(400).send({ error: 'No file uploaded' });
  }

  try {
    const responseData = await uploadFileToService(file);
    res.json(responseData);
  } catch (error) {
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(502).send({ error: 'upstream_unavailable' });
    }
  } finally {
    await fs.promises.rm(file.path, { force: true });
  }
});

router.use((error, _request, response, next) => {
  if (error instanceof multer.MulterError) {
    return response.status(400).json({ error: 'invalid_upload', code: error.code });
  }
  return next(error);
});

module.exports = router;