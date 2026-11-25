/** Parkhill fork: official project list (Fabric), per-conversation capture, image downloads. */
const express = require('express');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const { parkhill, downloads } = require('~/server/services/Parkhill');

const router = express.Router();

router.use(requireJwtAuth);
router.get('/projects', parkhill.handlers.listProjects);
router.get('/project-folders/:chatProjectId', parkhill.handlers.getFolderProject);
router.post('/image-downloads', downloads.recordImageDownload);

module.exports = router;
