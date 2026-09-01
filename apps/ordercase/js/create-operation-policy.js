/****************************************************
 * create-operation-policy.js
 * 案件作成の再送時に同じ操作IDを使う
 ****************************************************/
(function(global) {
  'use strict';

  function createOperationId_(cryptoProvider) {
    const safeCrypto = cryptoProvider || global.crypto;

    if (safeCrypto && typeof safeCrypto.randomUUID === 'function') {
      return safeCrypto.randomUUID();
    }

    if (safeCrypto && typeof safeCrypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      safeCrypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;

      const hex = Array.from(bytes, function(value) {
        return value.toString(16).padStart(2, '0');
      }).join('');

      return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        hex.slice(12, 16),
        hex.slice(16, 20),
        hex.slice(20)
      ].join('-');
    }

    throw new Error('安全な操作IDを生成できません。ブラウザを更新してから再度お試しください。');
  }

  function createTracker(cryptoProvider) {
    let pending = null;

    return Object.freeze({
      attach: function(payload) {
        const fingerprint = JSON.stringify(payload);

        if (!pending || pending.fingerprint !== fingerprint) {
          pending = {
            id: createOperationId_(cryptoProvider),
            fingerprint: fingerprint
          };
        }

        return Object.assign({}, payload, {
          create_operation_id: pending.id
        });
      },

      complete: function(operationId) {
        if (pending && pending.id === String(operationId || '')) {
          pending = null;
        }
      }
    });
  }

  global.OrderCaseCreateOperationPolicy = Object.freeze({
    createTracker: createTracker
  });
})(typeof window !== 'undefined' ? window : globalThis);
