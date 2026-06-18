'use strict';

const { fetchDirectorDailyDashboard } = require('./directorDailyDashboard');
const { buildVisibleDashboardModel } = require('./assistantDirectorDashboardCatalog');

async function fetchAssistantDirectorDashboard(pool, range, opts = {}) {
  const model = buildVisibleDashboardModel(opts.aclPack || {});
  const data = await fetchDirectorDailyDashboard(pool, range, opts);
  return { ...data, aclModel: model };
}

module.exports = { fetchAssistantDirectorDashboard };
