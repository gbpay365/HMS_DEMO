'use strict';

const http = require('http');

function request(method, path, headers = {}, body = '') {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: 'localhost', port: 3003, path, method, headers },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          resolve({ status: res.statusCode, headers: res.headers, body: data });
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function mergeCookies(existing, setCookie) {
  const jar = new Map();
  for (const c of existing) {
    const [pair] = c.split(';');
    const i = pair.indexOf('=');
    if (i > 0) jar.set(pair.slice(0, i), pair);
  }
  if (setCookie) {
    for (const raw of setCookie) {
      const [pair] = raw.split(';');
      const i = pair.indexOf('=');
      if (i > 0) jar.set(pair.slice(0, i), pair);
    }
  }
  return [...jar.values()];
}

(async () => {
  let cookies = [];
  let r = await request('GET', '/');
  cookies = mergeCookies(cookies, r.headers['set-cookie']);
  console.log('1 GET html lang:', (r.body.match(/<html lang="(en|fr)"/) || [])[1]);
  console.log('1 cookies:', cookies.join('; '));

  const body = 'lang=fr';
  r = await request('GET', '/set-lang?lang=fr&back=/', { Cookie: cookies.join('; ') });
  cookies = mergeCookies(cookies, r.headers['set-cookie']);
  console.log('2 POST status:', r.status, 'location:', r.headers.location);
  console.log('2 cookies:', cookies.join('; '));

  const loc = r.headers.location || '/?msgKey=language.updated';
  r = await request('GET', loc, { Cookie: cookies.join('; ') });
  console.log('3 GET html lang:', (r.body.match(/<html lang="(en|fr)"/) || [])[1]);
  console.log('3 pageData lang:', (r.body.match(/"lang":"(en|fr)"/) || [])[1]);
  console.log('3 label:', (r.body.match(/login-lang-form__label[^>]*>([^<]+)/) || [])[1]);
  console.log('3 msg:', (r.body.match(/"msg":"([^"]+)"/) || [])[1]);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
