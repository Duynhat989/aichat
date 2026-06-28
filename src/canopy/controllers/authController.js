const { ok, fail } = require('../utils/response');
const { registerDevice, refreshAccessToken } = require('../services/authService');

const authController = {
  async register(req, res) {
    try {
      const { deviceId, platform, appVersion, locale, legacyUserId } = req.body || {};
      if (!deviceId || !platform || !appVersion) {
        return fail(res, 'VALIDATION', 'deviceId, platform, appVersion are required');
      }
      if (!['android', 'ios'].includes(platform)) {
        return fail(res, 'VALIDATION', 'platform must be android or ios');
      }
      const result = await registerDevice({ deviceId, platform, appVersion, locale, legacyUserId });
      return ok(res, {
        userId: result.userId,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        isNewUser: result.isNewUser
      }, result.isNewUser ? 201 : 200);
    } catch (e) {
      return fail(res, 'REGISTER_FAILED', e.message || 'Registration failed', 500);
    }
  },

  async refresh(req, res) {
    try {
      const { refreshToken } = req.body || {};
      if (!refreshToken) {
        return fail(res, 'VALIDATION', 'refreshToken is required');
      }
      const result = await refreshAccessToken(refreshToken);
      return ok(res, result);
    } catch (e) {
      return fail(res, e.code || 'INVALID_REFRESH', e.message || 'Invalid refresh token', 401);
    }
  }
};

module.exports = authController;
