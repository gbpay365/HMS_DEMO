'use strict';

/** Run a maternity controller method and capture its JSON response (SSR form posts). */
function invokeMaternityCtrl(ctrlFn, req) {
  return new Promise((resolve, reject) => {
    const mockRes = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        if (payload && payload.success) {
          resolve({
            ok: true,
            data: payload.data,
            message: payload.message,
            status: this.statusCode || 200,
          });
          return;
        }
        resolve({
          ok: false,
          message: (payload && payload.message) || 'Request failed',
          status: this.statusCode || 500,
        });
      },
    };
    Promise.resolve(ctrlFn(req, mockRes)).catch(reject);
  });
}

module.exports = { invokeMaternityCtrl };
