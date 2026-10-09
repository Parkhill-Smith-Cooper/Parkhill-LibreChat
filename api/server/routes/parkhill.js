/** Parkhill fork: official project list (Fabric) and per-conversation capture. */
const express = require('express');
const mongoose = require('mongoose');
const { createParkhillProjects } = require('@librechat/api');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');

const parkhill = createParkhillProjects({ mongoose });
const router = express.Router();

router.use(requireJwtAuth);
router.get('/projects', parkhill.handlers.listProjects);

module.exports = router;
module.exports.captureConversationProject = parkhill.captureConversationProject;
