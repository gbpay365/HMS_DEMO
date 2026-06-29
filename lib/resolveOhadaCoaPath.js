'use strict';

const { resolveCoaPath, loadCoaPayload, LOCAL_OHADA_COA, LOCAL_NIGERIA_COA, CORE_OHADA_COA } = require('./resolveCoaPath');

module.exports = {
  LOCAL_COA: LOCAL_OHADA_COA,
  LOCAL_NIGERIA_COA,
  CORE_COA: CORE_OHADA_COA,
  resolveOhadaCoaPath: resolveCoaPath,
  resolveCoaPath,
  loadOhadaCoaPayload: loadCoaPayload,
  loadCoaPayload,
};
