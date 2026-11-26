/**
 * Parkhill fork (CUSTOMIZATIONS.md §6, §7): the single project and image-download services,
 * shared by the `/api/parkhill` routes and the agents chat route. Kept free of auth/config
 * imports so `routes/agents/chat.js` can load it under upstream route specs that mock that chain.
 * The optional calls mirror §11: an `@librechat/api` mock without the factories yields `null`.
 */
const mongoose = require('mongoose');
const { createParkhillProjects, createParkhillImageDownloads } = require('@librechat/api');
const { getFiles, getChatProject, createChatProject, deleteChatProject } = require('~/models');

const parkhill =
  createParkhillProjects?.({
    mongoose,
    chatProjects: { getChatProject, createChatProject, deleteChatProject },
  }) ?? null;
const downloads = createParkhillImageDownloads?.({ mongoose, getFiles }) ?? null;

module.exports = { parkhill, downloads };
