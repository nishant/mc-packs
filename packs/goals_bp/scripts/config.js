export const CONFIG = {
  /** Progress is announced in chat to everyone at 25, 50 and 75 percent, and when a goal is reached. */
  announce: true,

  /** How far away (blocks) the container an operator looks at with /realm:goals_add can be. */
  linkDistance: 8,

  /** Most goals at a time, finished ones included. */
  maxGoals: 30,

  /** Players listed under "Top contributors". */
  topContributors: 5,

  /** Items with a custom name are never donated, so a named tool or a pet's name tag stays with its owner. */
  keepNamedItems: true,
};
