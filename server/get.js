const express = require('express');  
const axios = require('axios');  
const router = express.Router();  
  
router.get('/listfiles', async (req, res) => {  
  try {  
    const response = await axios.get(`${process.env.AI_API_ENDPOINT}/data/files`, {  
      headers: {  
        'api-key': process.env.AI_API_KEY  
      },
      timeout: Number(process.env.UPSTREAM_TIMEOUT_MS || 60000),
    });  
    res.json(response.data);  
  } catch (error) {  
    if (error.response) {  
      // The request was made and the server responded with a status code  
      // that falls out of the range of 2xx  
      res.status(error.response.status).json(error.response.data);  
    } else {  
      // Something happened in setting up the request and triggered an Error  
      res.status(502).send({ error: 'upstream_unavailable' });  
    }  
  }  
});  
  
module.exports = router;  