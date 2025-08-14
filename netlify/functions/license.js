// netlify/functions/license.js (ESM)
// Server-verified licensing with Netlify Blobs: one-time code per device.

import { getStore } from '@netlify/blobs';

const STORE_NAME = 'bingo-licenses';
const ADMIN_HEADER = 'authorization'; // expect: Bearer <token>

function json(status, body){
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function normalizeCode(code){
  return (code || '').toUpperCase().replace(/[^A-Z0-9-]/g, '');
}

// e.g., TVLV-ABCD-1234
function randomCode(prefix = '', L = 4, G = 2){
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0/1/I confusers
  const group = n => Array.from({ length: n }, () => alphabet[Math.floor(Math.random()*alphabet.length)]).join('');
  const core = Array.from({ length: G }, () => group(L)).join('-');
  return (prefix ? prefix + '-' : '') + core;
}

export default async (req) => {
  const store = getStore(STORE_NAME);

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action;

    // Player activation
    if (action === 'activate'){
      const code = normalizeCode(body.code);
      const deviceId = String(body.deviceId || '').slice(0,128);
      if (!code || !deviceId) return json(400, { ok:false, reason:'bad_request' });

      const key = 'code:' + code;
      const recordRaw = await store.get(key, { consistency: 'strong' });
      if (!recordRaw) return json(200, { ok:false, reason:'invalid_code' });

      let record;
      try { record = JSON.parse(recordRaw); } catch { record = null; }
      if (!record || !record.status) return json(200, { ok:false, reason:'invalid_code' });

      if (record.status === 'unused'){
        record.status = 'used';
        record.deviceId = deviceId;
        record.usedAt = Date.now();
        await store.set(key, JSON.stringify(record));
        return json(200, { ok:true, usedAt: record.usedAt });
      }

      if (record.status === 'used'){
        if (record.deviceId === deviceId){
          // Allow re-activation on the same device (cache cleared/reinstall)
          return json(200, { ok:true, usedAt: record.usedAt });
        }
        return json(200, { ok:false, reason:'already_used' });
      }

      return json(200, { ok:false, reason:'invalid_code' });
    }

    // Owner bulk generation
    if (action === 'bulk_generate'){
      const auth = req.headers.get(ADMIN_HEADER) || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      if (!token || token !== process.env.ADMIN_TOKEN){
        return json(401, { ok:false, reason:'unauthorized' });
      }

      const count = Math.max(1, Math.min(5000, parseInt(body.count || '0', 10)));
      const prefix = String(body.prefix || '').toUpperCase().replace(/[^A-Z0-9]/g,'');
      const L = Math.max(4, Math.min(6, parseInt(body.L || '4', 10)));
      const G = Math.max(2, Math.min(4, parseInt(body.G || '2', 10)));
      if (!count) return json(400, { ok:false, reason:'bad_request' });

      const codes = [];
      for (let i=0; i<count; i++){
        let tries = 0, code, exists;
        do {
          code = randomCode(prefix, L, G);
          exists = await store.get('code:' + code, { consistency: 'strong' });
          tries++;
        } while (exists && tries < 6);

        if (exists) continue; // rare: all tries collided
        await store.set('code:' + code, JSON.stringify({ status:'unused', createdAt: Date.now() }));
        codes.push(code);
      }

      return json(200, { ok:true, codes });
    }

    return json(404, { ok:false, reason:'unknown_action' });
  } catch (e){
    return json(500, { ok:false, reason:'server_error' });
  }
};
