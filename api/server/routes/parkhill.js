/** Parkhill fork: official project list (Fabric), per-conversation capture, image downloads. */
const express = require('express');
const mongoose = require('mongoose');
const { createParkhillProjects, createParkhillImageDownloads } = require('@librechat/api');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const { getFiles, getChatProject, createChatProject, deleteChatProject } = require('~/models');

const parkhill = createParkhillProjects({
  mongoose,
  chatProjects: { getChatProject, createChatProject, deleteChatProject },
});
const downloads = createParkhillImageDownloads({ mongoose, getFiles });
const router = express.Router();

router.use(requireJwtAuth);
router.get('/projects', parkhill.handlers.listProjects);
router.get('/project-folders/:chatProjectId', parkhill.handlers.getFolderProject);
router.post('/image-downloads', downloads.recordImageDownload);

module.exports = router;
module.exports.captureConversationProject = parkhill.captureConversationProject;
