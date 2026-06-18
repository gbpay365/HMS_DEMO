/** Shared pageData builders for React EJS stubs */

function finPageData(pageKey, finNavActive, extra = {}) {
  return {
    finNavActive: finNavActive || pageKey,
    reactPage: 'financials',
    pageData: {
      pageKey,
      finNavActive: finNavActive || pageKey,
      ...extra,
    },
  };
}

function ipdPageData(pageKey, extra = {}) {
  return {
    pageData: {
      pageKey,
      ...extra,
    },
  };
}

function labPageData(pageKey, extra = {}) {
  return {
    reactPage: 'lab-workflow',
    pageData: {
      pageKey,
      ...extra,
    },
  };
}

function serializeValidateCtx(ctx) {
  if (!ctx || !ctx.ok) return ctx;
  const resultMap = {};
  if (ctx.resultMap instanceof Map) {
    for (const [k, v] of ctx.resultMap.entries()) resultMap[k] = v;
  } else if (ctx.resultMap && typeof ctx.resultMap === 'object') {
    Object.assign(resultMap, ctx.resultMap);
  }
  return {
    kind: ctx.kind,
    code: ctx.code,
    items: ctx.items || [],
    patient: ctx.patient || {},
    doctor: ctx.doctor || null,
    resultMap,
  };
}

function opdPageData(pageKey, extra = {}) {
  return {
    pageData: {
      pageKey,
      ...extra,
    },
  };
}

module.exports = { finPageData, ipdPageData, opdPageData, labPageData, serializeValidateCtx };
