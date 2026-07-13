// Play-by-play copy for Football Math. Plain globals (no modules); loaded
// before football.js so these tables are ready when the game reads them.

const PLAY_OUTCOME_COPY = {
  offenseMiss: {
    shortRun: [
      'Your run was stuffed at the line.',
      'The defense filled the gap. No gain.',
      'A linebacker wrapped up the runner.',
      'The pile went nowhere.',
    ],
    shortPass: [
      'The short pass was batted down.',
      'The receiver slipped, incomplete.',
      'The defender jumped the route.',
      'The pass fell incomplete.',
    ],
    longRun: [
      'The edge was sealed off. No gain.',
      'The defense strung out the run.',
      'The runner got bottled up.',
      'The cutback lane closed fast.',
    ],
    mediumPass: [
      'The pass was broken up.',
      'The quarterback had to throw it away.',
      'The coverage was too tight.',
      'The ball skipped incomplete.',
    ],
    longPass: [
      'The deep ball sailed incomplete.',
      'The safety knocked it away.',
      'The receiver was double covered.',
      'The pass was just out of reach.',
    ],
  },
  defenseStop: {
    shortRun: [
      'You stuffed the run at the line.',
      'Your defense filled the gap.',
      'Big tackle. No gain.',
    ],
    shortPass: [
      'You batted down the short pass.',
      'Great coverage on the quick throw.',
      'The receiver was covered. Incomplete.',
    ],
    longRun: [
      'You sealed the edge and stopped the run.',
      'Your defense chased it down.',
      'The runner had nowhere to go.',
    ],
    mediumPass: [
      'You broke up the pass over the middle.',
      'Tight coverage forced an incompletion.',
      'Your defender got a hand on it.',
    ],
    longPass: [
      'You knocked away the deep ball.',
      'Great safety help over the top.',
      'The deep pass fell incomplete.',
    ],
  },
  defenseGain: {
    shortRun: [
      'The opponent found a small crease.',
      'The runner squeezed through the line.',
      'The opponent powered forward.',
    ],
    shortPass: [
      'The opponent completed the quick pass.',
      'The receiver found space underneath.',
      'The short throw was complete.',
    ],
    longRun: [
      'The runner bounced outside.',
      'The opponent broke through the edge.',
      'The run hit a big lane.',
    ],
    mediumPass: [
      'The opponent hit the middle route.',
      'The pass found a window in coverage.',
      'The receiver caught it over the middle.',
    ],
    longPass: [
      'The opponent connected deep.',
      'The receiver got behind the defense.',
      'The deep throw was complete.',
    ],
  },
};

const POSSESSION_COPY = {
  ribbon: {
    offense: 'DUKE BALL - OFFENSE',
    defense: 'UNC BALL - DEFENSE',
  },
  stage: {
    offense: 'Duke on offense',
    defense: 'UNC on offense',
  },
};

const DESK_HEADER_COPY = {
  start: { chip: 'Kickoff', kicker: 'Start the rivalry.', action: 'Start the broadcast when you are ready.' },
  callOffense: { chip: 'Next Snap', kicker: 'Set the Duke offense.', action: 'Choose a play card.' },
  callDefense: { chip: 'Next Snap', kicker: 'Set the Duke defense.', action: 'Choose a defense card.' },
  questionOffense: { chip: 'Live Math', kicker: 'Run the play.', action: 'Answer the question.' },
  questionDefense: { chip: 'Live Math', kicker: 'Beat the snap.', action: 'Answer the question.' },
  resultOffense: { chip: 'Result', kicker: 'Play outcome.', action: 'Watch the result.' },
  resultDefense: { chip: 'Result', kicker: 'Defensive result.', action: 'Watch the result.' },
};
