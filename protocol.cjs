'use strict';
function validate(message) {
  if (!message || typeof message !== 'object') throw Error('Invalid request');
  if (!['send', 'approve', 'stop', 'status', 'close'].includes(message.type)) throw Error('Unknown request');
  if (['send', 'approve', 'stop'].includes(message.type) && !/^[a-zA-Z0-9-]{1,80}$/.test(message.chatId || '')) throw Error('Invalid session');
  if (message.type === 'send') {
    if (typeof message.text !== 'string' || !message.text.trim() || message.text.length > 1000000) throw Error('Invalid prompt');
    if (!['manual', 'plan', 'bypass'].includes(message.mode)) throw Error('Unsupported permission mode');
  }
  if (message.type === 'approve' && (!['approve', 'deny'].includes(message.decision) || typeof message.callId !== 'string')) throw Error('Invalid approval');
  return message;
}
module.exports = {validate};
