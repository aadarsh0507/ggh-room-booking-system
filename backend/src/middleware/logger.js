const morgan = require('morgan');
const AuditLog = require('../models/AuditLog');

const logger = morgan('combined');

const auditLogger = async (req, res, next) => {
  const originalSend = res.send;
  res.send = function (data) {
    if (req.user && ['POST', 'PUT', 'DELETE'].includes(req.method)) {
      AuditLog.create({
        userId:    req.user.id,
        action:    `${req.method} ${req.originalUrl}`,
        entity:    req.baseUrl.split('/').pop(),
        entityId:  req.params.id || null,
        oldValues: req.oldValues,
        newValues: req.newValues,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
      }).catch((err) => console.error('Audit log error:', err));
    }
    originalSend.call(this, data);
  };
  next();
};

module.exports = { logger, auditLogger };
