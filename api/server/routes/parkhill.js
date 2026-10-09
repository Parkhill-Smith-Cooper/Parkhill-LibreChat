/** Parkhill fork: official project list (Fabric), per-conversation capture, image downloads. */
const express = require('express');
const mongoose = require('mongoose');
const { createParkhillProjects, createParkhillImageDownloads } = require('@librechat/api');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const { getFiles } = require('~/models');

const parkhill = createParkhillProjects({ mongoose });
const downloads = createParkhillImageDownloads({ mongoose, getFiles });
const router = express.Router();

router.use(requireJwtAuth);
router.get('/projects', parkhill.handlers.listProjects);
router.post('/image-downloads', downloads.recordImageDownload);

module.exports = router;
module.exports.captureConversationProject = parkhill.captureConversationProject;
