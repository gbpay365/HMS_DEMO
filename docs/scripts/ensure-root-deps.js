'use strict';

/**
 * @deprecated Logic is built into railway-sync-core.js — kept for older deployments.
 */
require('./railway-sync-core');
module.exports = { appRoot: require('path').resolve(__dirname, '..', '..') };
