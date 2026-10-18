'use strict';

const express = require('express');
const router = express.Router();
const systemController = require('../controllers/system.controller');

// GET /api/health – alias cho /health (không qua Docker healthcheck route)
router.get('/health', systemController.health);

// GET /api/instance – thông tin instance
router.get('/instance', systemController.instance);

// GET /api/whoami – thông tin request headers (proxy debug)
router.get('/whoami', systemController.whoami);

// POST /api/upload-test – kiểm tra giới hạn body không dùng multer
router.post('/upload-test', systemController.uploadTest);

module.exports = router;
