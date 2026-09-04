const express = require('express');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const router = express.Router();

const maxUploadBytes = Number(process.env.MAX_UPLOAD_MB || 20) * 1024 * 1024;
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: maxUploadBytes, files: 1 },
  fileFilter: (_request, file, callback) => callback(
    file.mimetype.startsWith('audio/') || file.mimetype === 'video/mp4'
      ? null
      : new multer.MulterError('LIMIT_UNEXPECTED_FILE'),
    file.mimetype.startsWith('audio/') || file.mimetype === 'video/mp4',
  ),
});

// Function to upload audio file
async function uploadAudioToService(file) {
  const formData = new FormData();
  formData.append('file', fs.createReadStream(file.path), file.originalname);

  const config = {
    method: 'POST',
    maxBodyLength: Infinity,
    url: `${process.env.AI_API_ENDPOINT}/openai/deployments/whisper/audio/transcriptions`,
    headers: {
      'api-key': process.env.AI_API_KEY,
      ...formData.getHeaders()
    },
    data: formData,
    timeout: Number(process.env.UPSTREAM_TIMEOUT_MS || 60000),
  };

  const response = await axios.request(config);
  return response.data;
}

// Route to handle audio file upload
router.post('/upload-audio', upload.single('file'), async (req, res) => {
  const file = req.file;

  if (!file) {
    return res.status(400).send({ error: 'No file uploaded' });
  }

  try {
    const responseData = await uploadAudioToService(file);
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