/**
 * Thin HTTP layer over the single-player and leaderboard services.
 * @param {{ single: object, leaderboard: object }} deps
 */
export function createSingleController({ single, leaderboard }) {
  return {
    async create(req, res) {
      res.status(201).json(await single.createGame(req.auth.userId, req.body.rounds));
    },
    async next(req, res) {
      res.json(await single.nextRound(req.auth.userId, req.params.id));
    },
    async submit(req, res) {
      res.json(
        await single.submit(req.auth.userId, req.params.id, req.params.index, req.body.answers),
      );
    },
    async get(req, res) {
      res.json(await single.getGame(req.auth.userId, req.params.id));
    },
    async quit(req, res) {
      res.json(await single.quit(req.auth.userId, req.params.id));
    },
    async leaderboard(req, res) {
      res.json(await leaderboard.list({ ...req.query, userId: req.auth.userId }));
    },
  };
}
