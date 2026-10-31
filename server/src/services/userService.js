/**
 * Shapes a user document for the client. Never includes the password hash or token data.
 * @param {object} user lean or hydrated user
 */
export function toPublicUser(user) {
  const stats = user.stats?.toObject ? user.stats.toObject() : (user.stats ?? {});
  const best =
    stats.bestByRounds instanceof Map ? Object.fromEntries(stats.bestByRounds) : stats.bestByRounds;
  return {
    id: String(user._id),
    nickname: user.nickname,
    email: user.email ?? null,
    phone: user.phone ?? null,
    avatarColor: user.avatarColor,
    role: user.role,
    isVerified: user.isVerified,
    stats: { ...stats, bestByRounds: best ?? {} },
    createdAt: user.createdAt,
  };
}
