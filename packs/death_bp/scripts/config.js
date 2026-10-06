export const CONFIG = {
  /** Tell players in chat where they died once they respawn. Each player can change it for themselves in /realm:prefs. */
  announce: true,

  /** /realm:death_back teleports a player to their last death point, once per death. Off by default: operators enable it in /realm:config. */
  backEnabled: false,

  /** How far (blocks) sideways from the death point /realm:death_back may look for a safe place to stand. */
  backSearchRadius: 2,

  /** How far (blocks) up and down from the death point /realm:death_back may look for a safe place to stand. */
  backSearchHeight: 8,

  /** How long (seconds) /realm:death_back waits for a faraway death point to load before giving up. */
  backLoadSeconds: 5,
};
