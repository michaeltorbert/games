// DOM-free clock and calendar practice for Football Math.
// This module owns no football, opponent, learning, stats, Season, DOM, or storage state.

const FOOTBALL_TIME_LAB = (() => {
  'use strict';

  const SCHEMA_VERSION = 1;
  const SESSION_LENGTH = 8;
  const COMPLETED_THROUGH_PAGE = 145;
  const INCLUDED_THROUGH_PAGE = 179;
  const MODES = Object.freeze(['clocks', 'calendar', 'mixed']);
  const EVIDENCE_CLASSES = Object.freeze(['literacy', 'independent']);
  const ANSWER_EXPOSURES = Object.freeze(['source-visible', 'modeled-with-result-hidden']);
  const MONTH_NAMES = Object.freeze([
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]);
  const WEEKDAY_NAMES = Object.freeze([
    'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
  ]);

  function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function deepFreeze(value, seen = new Set()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return value;
    seen.add(value);
    Object.values(value).forEach(child => deepFreeze(child, seen));
    return Object.freeze(value);
  }

  function safeId(value, label) {
    if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9-]*$/u.test(value)) {
      throw new TypeError(`${label} must be a stable lowercase identifier.`);
    }
    return value;
  }

  function normalizedDraw(rng) {
    if (typeof rng !== 'function') throw new TypeError('A practice RNG function is required.');
    const value = Number(rng());
    if (!Number.isFinite(value)) throw new TypeError('Practice RNG must return a finite number.');
    return Math.max(0, Math.min(0.9999999999999999, value));
  }

  function pick(values, rng) {
    if (!Array.isArray(values) || values.length === 0) throw new TypeError('Cannot pick from an empty practice fixture list.');
    return values[Math.floor(normalizedDraw(rng) * values.length)];
  }

  function shuffled(values, rng) {
    const result = [...values];
    for (let index = result.length - 1; index > 0; index--) {
      const swapIndex = Math.floor(normalizedDraw(rng) * (index + 1));
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  }

  function mixSeed(seed, salt) {
    let value = (Number(seed) ^ salt) >>> 0;
    value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
    value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
    return (value ^ (value >>> 16)) >>> 0;
  }

  function makeSeededRng(seed) {
    let value = Number(seed) >>> 0;
    return () => {
      value = (value + 0x6d2b79f5) >>> 0;
      let mixed = value;
      mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
      mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
      return ((mixed ^ (mixed >>> 14)) >>> 0) / 0x100000000;
    };
  }

  function createRngStreams(rootSeed) {
    if (!Number.isInteger(Number(rootSeed))) throw new TypeError('Practice root seed must be an integer.');
    return Object.freeze({
      content: makeSeededRng(mixSeed(rootSeed, 0x54494d45)),
      presentation: makeSeededRng(mixSeed(rootSeed, 0x4c41424c)),
    });
  }

  function normalizeClock(value) {
    if (!isRecord(value) || !Number.isInteger(value.hour) || value.hour < 1 || value.hour > 12
      || ![0, 30].includes(value.minute)) {
      throw new TypeError('Practice clocks require hour 1-12 and minute 0 or 30.');
    }
    return deepFreeze({ hour: value.hour, minute: value.minute });
  }

  function clockMinutes(value) {
    const clock = normalizeClock(value);
    return (clock.hour % 12) * 60 + clock.minute;
  }

  function addClockMinutes(value, delta) {
    if (!Number.isInteger(delta) || delta % 30 !== 0) throw new TypeError('Practice clock moves must use whole half hours.');
    const total = ((clockMinutes(value) + delta) % 720 + 720) % 720;
    const hour24 = Math.floor(total / 60);
    return normalizeClock({ hour: hour24 === 0 ? 12 : hour24, minute: total % 60 });
  }

  function formatTime(value) {
    const clock = normalizeClock(value);
    return `${clock.hour}:${String(clock.minute).padStart(2, '0')}`;
  }

  const CLOCK_FIXTURES = deepFreeze(Array.from({ length: 12 }, (_, hourIndex) => (
    [0, 30].map(minute => ({ id: `clock-${hourIndex + 1}-${minute}`, hour: hourIndex + 1, minute }))
  )).flat());

  function isLeapYear(year) {
    if (!Number.isInteger(year)) throw new TypeError('Calendar year must be an integer.');
    return year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
  }

  function daysInMonth(year, monthIndex) {
    if (!Number.isInteger(year) || !Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
      throw new TypeError('Calendar month requires an integer year and month index 0-11.');
    }
    if (monthIndex === 1) return isLeapYear(year) ? 29 : 28;
    return [3, 5, 8, 10].includes(monthIndex) ? 30 : 31;
  }

  function weekdayForDate(year, monthIndex, day) {
    const length = daysInMonth(year, monthIndex);
    if (!Number.isInteger(day) || day < 1 || day > length) throw new TypeError('Calendar day is outside the selected month.');
    const offsets = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
    let adjustedYear = year;
    if (monthIndex < 2) adjustedYear--;
    return (adjustedYear
      + Math.floor(adjustedYear / 4)
      - Math.floor(adjustedYear / 100)
      + Math.floor(adjustedYear / 400)
      + offsets[monthIndex]
      + day) % 7;
  }

  function validateCalendarFixture(value) {
    if (!isRecord(value)) throw new TypeError('Calendar fixture must be an object.');
    safeId(value.id, 'Calendar fixture id');
    if (!Number.isInteger(value.year) || value.year < 1900 || value.year > 2400
      || !Number.isInteger(value.monthIndex) || value.monthIndex < 0 || value.monthIndex > 11) {
      throw new TypeError('Calendar fixture year or month is invalid.');
    }
    const expectedLength = daysInMonth(value.year, value.monthIndex);
    const expectedFirstWeekday = weekdayForDate(value.year, value.monthIndex, 1);
    if (value.monthLength !== expectedLength || value.firstWeekday !== expectedFirstWeekday) {
      throw new TypeError('Calendar fixture length or weekday alignment is invalid.');
    }
    return deepFreeze({
      id: value.id,
      year: value.year,
      monthIndex: value.monthIndex,
      monthName: MONTH_NAMES[value.monthIndex],
      monthLength: value.monthLength,
      firstWeekday: value.firstWeekday,
    });
  }

  const CALENDAR_FIXTURES = deepFreeze([
    { id: 'practice-january-2024', year: 2024, monthIndex: 0, monthLength: 31, firstWeekday: 1 },
    { id: 'practice-february-2024', year: 2024, monthIndex: 1, monthLength: 29, firstWeekday: 4 },
    { id: 'practice-march-2024', year: 2024, monthIndex: 2, monthLength: 31, firstWeekday: 5 },
    { id: 'practice-april-2024', year: 2024, monthIndex: 3, monthLength: 30, firstWeekday: 1 },
    { id: 'practice-may-2024', year: 2024, monthIndex: 4, monthLength: 31, firstWeekday: 3 },
    { id: 'practice-june-2024', year: 2024, monthIndex: 5, monthLength: 30, firstWeekday: 6 },
    { id: 'practice-july-2024', year: 2024, monthIndex: 6, monthLength: 31, firstWeekday: 1 },
    { id: 'practice-august-2024', year: 2024, monthIndex: 7, monthLength: 31, firstWeekday: 4 },
    { id: 'practice-september-2024', year: 2024, monthIndex: 8, monthLength: 30, firstWeekday: 0 },
    { id: 'practice-october-2024', year: 2024, monthIndex: 9, monthLength: 31, firstWeekday: 2 },
    { id: 'practice-november-2024', year: 2024, monthIndex: 10, monthLength: 30, firstWeekday: 5 },
    { id: 'practice-december-2024', year: 2024, monthIndex: 11, monthLength: 31, firstWeekday: 0 },
    { id: 'practice-february-2025', year: 2025, monthIndex: 1, monthLength: 28, firstWeekday: 6 },
  ].map(validateCalendarFixture));

  function calendarGrid(fixture) {
    const value = validateCalendarFixture(fixture);
    const cellCount = Math.ceil((value.firstWeekday + value.monthLength) / 7) * 7;
    return deepFreeze(Array.from({ length: cellCount }, (_, index) => {
      const date = index - value.firstWeekday + 1;
      return date >= 1 && date <= value.monthLength ? date : null;
    }));
  }

  function validateAmPmFixture(value) {
    if (!isRecord(value)) throw new TypeError('AM/PM fixture must be an object.');
    safeId(value.id, 'AM/PM fixture id');
    const clock = normalizeClock(value);
    const cuePeriods = {
      sunrise: 'AM',
      breakfast: 'AM',
      'after-lunch': 'PM',
      'after-dinner': 'PM',
      bedtime: 'PM',
    };
    if (!['AM', 'PM'].includes(value.period) || !Object.hasOwn(cuePeriods, value.illustrationCue)
      || typeof value.situation !== 'string' || !value.situation.trim()
      || typeof value.unambiguityRationale !== 'string' || !value.unambiguityRationale.trim()) {
      throw new TypeError('AM/PM fixtures require an explicit period, illustration cue, situation, and rationale.');
    }
    if (value.period !== cuePeriods[value.illustrationCue]) {
      throw new TypeError('AM/PM fixture illustration cue contradicts its period.');
    }
    return deepFreeze({
      id: value.id,
      ...clock,
      period: value.period,
      illustrationCue: value.illustrationCue,
      situation: value.situation.trim(),
      unambiguityRationale: value.unambiguityRationale.trim(),
    });
  }

  const AM_PM_FIXTURES = deepFreeze([
    {
      id: 'sunrise-warmups', hour: 8, minute: 0, period: 'AM', illustrationCue: 'sunrise',
      situation: 'Warm-ups begin just after sunrise at 8:00.',
      unambiguityRationale: 'Sunrise is a before-noon event in the intended everyday context.',
    },
    {
      id: 'breakfast-before-school', hour: 7, minute: 30, period: 'AM', illustrationCue: 'breakfast',
      situation: 'The team eats breakfast before school at 7:30.',
      unambiguityRationale: 'Breakfast before school is a before-noon event in the intended school-day context.',
    },
    {
      id: 'after-lunch-kickoff', hour: 1, minute: 0, period: 'PM', illustrationCue: 'after-lunch',
      situation: 'Kickoff starts just after lunch at 1:00.',
      unambiguityRationale: 'Just after lunch at 1:00 is after noon in the intended everyday context.',
    },
    {
      id: 'after-dinner-film-room', hour: 7, minute: 0, period: 'PM', illustrationCue: 'after-dinner',
      situation: 'Film review starts after dinner at 7:00.',
      unambiguityRationale: 'After dinner at 7:00 is after noon in the intended everyday context.',
    },
    {
      id: 'bedtime-stadium-cleanup', hour: 10, minute: 30, period: 'PM', illustrationCue: 'bedtime',
      situation: 'Cleanup begins while players get ready for bed at 10:30.',
      unambiguityRationale: 'Getting ready for bed at 10:30 is after noon in the intended everyday context.',
    },
  ].map(validateAmPmFixture));

  function makeMeta(value) {
    const familyId = safeId(value.familyId, 'Family id');
    if (!EVIDENCE_CLASSES.includes(value.evidenceClass) || !ANSWER_EXPOSURES.includes(value.answerExposure)) {
      throw new TypeError(`${familyId} has invalid evidence or answer-exposure metadata.`);
    }
    if (value.evidenceClass === 'literacy' && value.answerExposure !== 'source-visible') {
      throw new TypeError(`${familyId} literacy must be source-visible.`);
    }
    if (value.evidenceClass === 'independent' && value.answerExposure !== 'modeled-with-result-hidden') {
      throw new TypeError(`${familyId} independent work must hide the modeled result.`);
    }
    if (!Number.isInteger(value.introducedOnPage) || value.introducedOnPage <= COMPLETED_THROUGH_PAGE
      || value.introducedOnPage > INCLUDED_THROUGH_PAGE) {
      throw new TypeError(`${familyId} has an invalid workbook page.`);
    }
    return deepFreeze({
      id: familyId,
      familyId,
      skill: safeId(value.skill, 'Skill'),
      concept: safeId(value.concept, 'Concept'),
      purpose: value.evidenceClass === 'literacy' ? 'read' : 'solve',
      grading: 'practice',
      curriculumSource: 'workbook',
      introducedOnPage: value.introducedOnPage,
      evidenceClass: value.evidenceClass,
      answerExposure: value.answerExposure,
      group: value.group,
      visualType: value.visualType,
    });
  }

  const FAMILY_REGISTRY = deepFreeze([
    makeMeta({ familyId: 'time-read-whole-hour', skill: 'whole-hour-reading', concept: 'clock-reading', introducedOnPage: 164, evidenceClass: 'literacy', answerExposure: 'source-visible', group: 'clocks', visualType: 'analog-clock' }),
    makeMeta({ familyId: 'time-read-half-hour', skill: 'half-hour-reading', concept: 'clock-reading', introducedOnPage: 164, evidenceClass: 'literacy', answerExposure: 'source-visible', group: 'clocks', visualType: 'analog-clock' }),
    makeMeta({ familyId: 'time-match-analog-digital', skill: 'analog-digital-matching', concept: 'clock-representation', introducedOnPage: 167, evidenceClass: 'literacy', answerExposure: 'source-visible', group: 'clocks', visualType: 'analog-digital' }),
    makeMeta({ familyId: 'time-one-hour-later', skill: 'one-hour-later', concept: 'elapsed-time', introducedOnPage: 164, evidenceClass: 'independent', answerExposure: 'modeled-with-result-hidden', group: 'clocks', visualType: 'elapsed-clock' }),
    makeMeta({ familyId: 'time-half-hour-later', skill: 'half-hour-later', concept: 'elapsed-time', introducedOnPage: 164, evidenceClass: 'independent', answerExposure: 'modeled-with-result-hidden', group: 'clocks', visualType: 'elapsed-clock' }),
    makeMeta({ familyId: 'time-am-or-pm', skill: 'am-pm-situation', concept: 'time-of-day', introducedOnPage: 172, evidenceClass: 'independent', answerExposure: 'modeled-with-result-hidden', group: 'clocks', visualType: 'day-night' }),
    makeMeta({ familyId: 'calendar-find-date-day', skill: 'calendar-reading', concept: 'calendar-reading', introducedOnPage: 175, evidenceClass: 'literacy', answerExposure: 'source-visible', group: 'calendar', visualType: 'calendar-grid' }),
    makeMeta({ familyId: 'calendar-month-neighbor', skill: 'month-order', concept: 'month-order', introducedOnPage: 175, evidenceClass: 'independent', answerExposure: 'modeled-with-result-hidden', group: 'calendar', visualType: 'month-ladder' }),
  ]);
  const FAMILY_BY_ID = new Map(FAMILY_REGISTRY.map(meta => [meta.familyId, meta]));

  function stableValueToken(value) {
    return Array.from(String(value)).map(character => character.codePointAt(0).toString(16)).join('-');
  }

  function uniqueValues(values) {
    return values.filter((value, index, all) => all.indexOf(value) === index);
  }

  function timeChoiceValues(answerClock) {
    const candidates = [
      answerClock,
      addClockMinutes(answerClock, 30),
      addClockMinutes(answerClock, 60),
      addClockMinutes(answerClock, -30),
      addClockMinutes(answerClock, 120),
    ].map(formatTime);
    return uniqueValues(candidates).slice(0, 4);
  }

  function fixedChoiceValues(answer, universe, count = 4) {
    return uniqueValues([answer, ...universe.filter(value => value !== answer)]).slice(0, count);
  }

  function makeChoices(instanceId, values, answer, presentationRng) {
    const unique = uniqueValues(values);
    if (unique.length < 2 || unique.filter(value => value === answer).length !== 1) {
      throw new TypeError('Practice choices require unique values and exactly one answer.');
    }
    const choices = shuffled(unique, presentationRng).map(value => ({
      id: `${instanceId}-choice-${stableValueToken(value)}`,
      value,
      label: String(value),
      ariaLabel: String(value),
    }));
    if (new Set(choices.map(choice => choice.id)).size !== choices.length
      || new Set(choices.map(choice => choice.label)).size !== choices.length) {
      throw new TypeError('Practice choice ids and labels must be unique.');
    }
    return choices;
  }

  function practiceCopy(text) {
    return { text, ariaLabel: text };
  }

  function makeVisuals(meta, semantic, answer) {
    const sourceVisible = meta.answerExposure === 'source-visible';
    const makeStage = stage => {
      const revealsAnswer = stage === 'worked' || sourceVisible;
      const worked = stage === 'worked';
      return {
        stage,
        type: meta.visualType,
        data: clone(worked ? semantic.workedVisualData : semantic.sourceVisualData),
        result: revealsAnswer ? { value: answer, label: String(answer) } : null,
        revealsAnswer,
        ariaLabel: worked ? semantic.workedVisualAria : semantic.sourceVisualAria,
      };
    };
    const visuals = {
      initial: makeStage('initial'),
      guided: makeStage('guided'),
      worked: makeStage('worked'),
    };
    if (meta.evidenceClass === 'independent') {
      for (const stage of ['initial', 'guided']) {
        if (visuals[stage].revealsAnswer || visuals[stage].result !== null) {
          throw new TypeError(`${meta.familyId} exposes an independent result too early.`);
        }
      }
    }
    return visuals;
  }

  function clockAria(clock) {
    const value = normalizeClock(clock);
    return value.minute === 0
      ? `Analog practice clock. The minute hand points to 12 and the hour hand points to ${value.hour}.`
      : `Analog practice clock. The minute hand points to 6 and the hour hand is halfway between ${value.hour} and ${addClockMinutes(value, 60).hour}.`;
  }

  function resolveClockFact(options, allowedMinutes, contentRng) {
    if (options.fact) {
      const clock = normalizeClock(options.fact);
      if (!allowedMinutes.includes(clock.minute)) throw new TypeError('Clock fact is not eligible for this family.');
      return clock;
    }
    return normalizeClock(pick(CLOCK_FIXTURES.filter(fixture => allowedMinutes.includes(fixture.minute)), contentRng));
  }

  function resolveCalendarFact(options, contentRng) {
    const fixture = options.fixture
      ? validateCalendarFixture(options.fixture)
      : options.fixtureId
        ? CALENDAR_FIXTURES.find(item => item.id === options.fixtureId)
        : pick(CALENDAR_FIXTURES, contentRng);
    if (!fixture) throw new TypeError('Unknown practice calendar fixture.');
    const targetDate = options.targetDate === undefined
      ? 1 + Math.floor(normalizedDraw(contentRng) * fixture.monthLength)
      : options.targetDate;
    if (!Number.isInteger(targetDate) || targetDate < 1 || targetDate > fixture.monthLength) {
      throw new TypeError('Practice calendar target date is invalid.');
    }
    return { fixture, targetDate };
  }

  function resolveAmPmFact(options, contentRng) {
    const fixture = options.fixture
      ? validateAmPmFixture(options.fixture)
      : options.fixtureId
        ? AM_PM_FIXTURES.find(item => item.id === options.fixtureId)
        : pick(AM_PM_FIXTURES, contentRng);
    if (!fixture) throw new TypeError('Unknown AM/PM fixture.');
    return fixture;
  }

  function semanticFor(meta, options, contentRng) {
    if (meta.familyId === 'time-read-whole-hour' || meta.familyId === 'time-read-half-hour'
      || meta.familyId === 'time-match-analog-digital') {
      const minute = meta.familyId === 'time-read-whole-hour' ? [0]
        : meta.familyId === 'time-read-half-hour' ? [30] : [0, 30];
      const clock = resolveClockFact(options, minute, contentRng);
      const answer = formatTime(clock);
      const matching = meta.familyId === 'time-match-analog-digital';
      return {
        facts: { clock },
        answer,
        choices: timeChoiceValues(clock),
        prompt: matching ? 'Which digital time matches this practice clock?' : 'What time does this practice clock show?',
        sourceVisualData: { clock, showDigital: false },
        workedVisualData: { clock, showDigital: true, digitalTime: answer },
        sourceVisualAria: clockAria(clock),
        workedVisualAria: `${clockAria(clock)} It shows ${answer}.`,
        baselineGuidance: clock.minute === 0
          ? 'Read the short hour hand. The long minute hand at 12 means zero minutes.'
          : 'Read the short hour hand. The long minute hand at 6 means half past, or 30 minutes.',
        retryGuidance: 'Check the long minute hand first, then read where the short hour hand points.',
        explanation: `This practice clock shows ${answer}.`,
      };
    }

    if (meta.familyId === 'time-one-hour-later' || meta.familyId === 'time-half-hour-later') {
      const clock = resolveClockFact(options, [0, 30], contentRng);
      const moveMinutes = meta.familyId === 'time-one-hour-later' ? 60 : 30;
      const targetClock = addClockMinutes(clock, moveMinutes);
      const answer = formatTime(targetClock);
      const moveLabel = moveMinutes === 60 ? 'one hour' : 'half an hour';
      return {
        facts: { clock, moveMinutes },
        answer,
        choices: timeChoiceValues(targetClock),
        prompt: `The practice clock starts at ${formatTime(clock)}. What time is ${moveLabel} later?`,
        sourceVisualData: { clock, moveMinutes, targetClock: null },
        workedVisualData: { clock, moveMinutes, targetClock },
        sourceVisualAria: `${clockAria(clock)} Work out the time ${moveLabel} later.`,
        workedVisualAria: `${clockAria(clock)} After ${moveLabel}, the time is ${answer}.`,
        baselineGuidance: moveMinutes === 60
          ? 'Move the hour hand forward one number and keep the minutes the same.'
          : 'Move forward 30 minutes. Whole hours and half hours alternate.',
        retryGuidance: moveMinutes === 60
          ? 'Count one hour forward around the clock, including across 12.'
          : 'Move from :00 to :30, or from :30 to the next whole hour.',
        explanation: `${moveLabel[0].toUpperCase()}${moveLabel.slice(1)} after ${formatTime(clock)} is ${answer}.`,
      };
    }

    if (meta.familyId === 'time-am-or-pm') {
      const fixture = resolveAmPmFact(options, contentRng);
      const displayedTime = formatTime(fixture);
      return {
        facts: {
          fixtureId: fixture.id,
          clock: { hour: fixture.hour, minute: fixture.minute },
          illustrationCue: fixture.illustrationCue,
          situation: fixture.situation,
        },
        answer: fixture.period,
        choices: ['AM', 'PM'],
        prompt: `${fixture.situation} Which label completes the time?`,
        sourceVisualData: {
          illustrationCue: fixture.illustrationCue,
          displayedTime,
          situation: fixture.situation,
          targetPeriod: null,
        },
        workedVisualData: {
          illustrationCue: fixture.illustrationCue,
          displayedTime,
          situation: fixture.situation,
          targetPeriod: fixture.period,
        },
        sourceVisualAria: `${fixture.situation} Decide whether this is before noon or after noon.`,
        workedVisualAria: `${fixture.situation} This is ${fixture.period}.`,
        baselineGuidance: 'Think about what is happening. Does it belong before noon or after noon?',
        retryGuidance: 'Connect the event to before noon or after noon, then choose the matching label.',
        explanation: `${displayedTime} ${fixture.period} matches this situation.`,
      };
    }

    if (meta.familyId === 'calendar-find-date-day') {
      const { fixture, targetDate } = resolveCalendarFact(options, contentRng);
      const weekday = WEEKDAY_NAMES[(fixture.firstWeekday + targetDate - 1) % 7];
      const weekdayIndex = WEEKDAY_NAMES.indexOf(weekday);
      const choices = [
        weekday,
        WEEKDAY_NAMES[(weekdayIndex + 1) % 7],
        WEEKDAY_NAMES[(weekdayIndex + 6) % 7],
        WEEKDAY_NAMES[(weekdayIndex + 3) % 7],
      ];
      const visual = {
        calendar: fixture,
        grid: calendarGrid(fixture),
        targetDate,
        weekdayNames: WEEKDAY_NAMES,
      };
      return {
        facts: { fixture, targetDate },
        answer: weekday,
        choices,
        prompt: `On this practice calendar, what day of the week is ${fixture.monthName} ${targetDate}?`,
        sourceVisualData: visual,
        workedVisualData: { ...visual, targetWeekday: weekday },
        sourceVisualAria: `Practice calendar for ${fixture.monthName} ${fixture.year}. Find date ${targetDate} under its weekday heading.`,
        workedVisualAria: `${fixture.monthName} ${targetDate}, ${fixture.year}, is ${weekday}.`,
        baselineGuidance: 'Find the date, then read the weekday heading above its column.',
        retryGuidance: 'Trace straight up from the date to the weekday heading.',
        explanation: `${fixture.monthName} ${targetDate} is in the ${weekday} column.`,
      };
    }

    if (meta.familyId === 'calendar-month-neighbor') {
      const sourceMonthIndex = options.sourceMonthIndex === undefined
        ? Math.floor(normalizedDraw(contentRng) * 12)
        : options.sourceMonthIndex;
      const direction = options.direction || (normalizedDraw(contentRng) < 0.5 ? 'before' : 'after');
      if (!Number.isInteger(sourceMonthIndex) || sourceMonthIndex < 0 || sourceMonthIndex > 11
        || !['before', 'after'].includes(direction)) {
        throw new TypeError('Month-neighbor fact is invalid.');
      }
      const targetIndex = (sourceMonthIndex + (direction === 'after' ? 1 : 11)) % 12;
      const sourceMonth = MONTH_NAMES[sourceMonthIndex];
      const answer = MONTH_NAMES[targetIndex];
      const choices = fixedChoiceValues(answer, [
        MONTH_NAMES[(targetIndex + 1) % 12],
        MONTH_NAMES[(targetIndex + 11) % 12],
        MONTH_NAMES[(targetIndex + 6) % 12],
      ]);
      return {
        facts: { sourceMonthIndex, sourceMonth, direction },
        answer,
        choices,
        prompt: `Which month comes ${direction} ${sourceMonth}?`,
        sourceVisualData: { sourceMonth, direction, targetMonth: null },
        workedVisualData: { sourceMonth, direction, targetMonth: answer },
        sourceVisualAria: `${sourceMonth} is shown. Find the month immediately ${direction} it.`,
        workedVisualAria: `${answer} comes immediately ${direction} ${sourceMonth}.`,
        baselineGuidance: 'Say the months in order, but keep the missing neighbor in your head.',
        retryGuidance: direction === 'after'
          ? 'Start with the shown month and say the very next month.'
          : 'Think of the month that comes immediately before the shown month.',
        explanation: `${answer} comes ${direction} ${sourceMonth}.`,
      };
    }

    throw new TypeError(`No builder exists for ${meta.familyId}.`);
  }

  function buildQuestion(familyId, options = {}) {
    const meta = FAMILY_BY_ID.get(familyId);
    if (!meta) throw new TypeError(`Unknown Time Lab family ${familyId}.`);
    const instanceId = safeId(options.instanceId || `${familyId}-question`, 'Question instance id');
    const contentRng = options.contentRng || makeSeededRng(0x54494d45);
    const presentationRng = options.presentationRng || makeSeededRng(0x4c41424c);
    const semantic = semanticFor(meta, options, contentRng);
    const choices = makeChoices(instanceId, semantic.choices, semantic.answer, presentationRng);
    const correct = choices.find(choice => choice.value === semantic.answer);
    if (!correct || choices.filter(choice => choice.value === semantic.answer).length !== 1) {
      throw new TypeError(`${familyId} must have exactly one correct choice.`);
    }
    const visuals = makeVisuals(meta, semantic, semantic.answer);
    const question = {
      schemaVersion: SCHEMA_VERSION,
      ...meta,
      questionInstanceId: instanceId,
      facts: clone(semantic.facts),
      prompt: practiceCopy(semantic.prompt),
      choices,
      correctChoiceId: correct.id,
      answer: { id: `${instanceId}-answer`, value: semantic.answer, label: String(semantic.answer) },
      visuals,
      guidance: {
        baseline: practiceCopy(semantic.baselineGuidance),
        retry: practiceCopy(semantic.retryGuidance),
      },
      workedExplanation: practiceCopy(semantic.explanation),
    };
    return deepFreeze(question);
  }

  function familyPlan(mode, contentRng) {
    if (!MODES.includes(mode)) throw new TypeError('Unknown Time Lab mode.');
    const clockIds = FAMILY_REGISTRY.filter(meta => meta.group === 'clocks').map(meta => meta.familyId);
    const calendarIds = FAMILY_REGISTRY.filter(meta => meta.group === 'calendar').map(meta => meta.familyId);
    if (mode === 'mixed') return shuffled(FAMILY_REGISTRY.map(meta => meta.familyId), contentRng);
    if (mode === 'clocks') {
      const core = shuffled(clockIds, contentRng);
      return [...core, pick(clockIds, contentRng), pick(clockIds, contentRng)];
    }
    const firstPair = shuffled(calendarIds, contentRng);
    return Array.from({ length: SESSION_LENGTH }, (_, index) => firstPair[index % firstPair.length]);
  }

  function createSession(mode, options = {}) {
    if (!MODES.includes(mode)) throw new TypeError('Unknown Time Lab mode.');
    const sessionId = safeId(options.sessionId || `time-lab-${mode}-session`, 'Session id');
    const streams = options.contentRng && options.presentationRng
      ? { content: options.contentRng, presentation: options.presentationRng }
      : createRngStreams(options.rootSeed ?? 0x54494d45);
    const plan = familyPlan(mode, streams.content);
    const slots = plan.map((familyId, index) => {
      const meta = FAMILY_BY_ID.get(familyId);
      return {
        slotId: `${sessionId}-slot-${index + 1}`,
        familyId,
        concept: meta.concept,
        flexible: mode === 'clocks' ? index >= 6 : mode === 'calendar' ? index >= 2 : false,
        recurrenceOf: null,
        supportLevel: 'baseline',
        supportReason: null,
        status: index === 0 ? 'question' : 'pending',
        attempt: 1,
        missedChoiceIds: [],
        resolution: null,
        question: buildQuestion(familyId, {
          instanceId: `${sessionId}-question-${index + 1}`,
          contentRng: streams.content,
          presentationRng: streams.presentation,
        }),
      };
    });
    const recurrenceBank = Object.fromEntries(FAMILY_REGISTRY.map(meta => [
      meta.familyId,
      [1, 2].map(number => buildQuestion(meta.familyId, {
        instanceId: `${sessionId}-recurrence-${meta.familyId}-${number}`,
        contentRng: streams.content,
        presentationRng: streams.presentation,
      })),
    ]));
    return deepFreeze({
      schemaVersion: SCHEMA_VERSION,
      sessionId,
      mode,
      status: 'active',
      index: 0,
      total: SESSION_LENGTH,
      slots,
      recurrenceBank,
      recurrenceCursor: Object.fromEntries(FAMILY_REGISTRY.map(meta => [meta.familyId, 0])),
      tallies: {
        read: 0,
        solved: 0,
        supported: 0,
        firstTryCorrect: 0,
        retryCorrect: 0,
        secondMiss: 0,
      },
    });
  }

  function currentSlot(session) {
    return session?.status === 'active' ? session.slots[session.index] : null;
  }

  function recordTally(draft, slot, resolution) {
    const question = slot.question;
    if (resolution !== 'secondMiss') {
      draft.tallies[question.evidenceClass === 'literacy' ? 'read' : 'solved']++;
    }
    draft.tallies[resolution]++;
    if (resolution === 'retryCorrect'
      || resolution === 'secondMiss'
      || slot.supportReason === 'related-miss') {
      draft.tallies.supported++;
    }
  }

  function scheduleSupport(draft, slot) {
    const later = draft.slots.slice(draft.index + 1);
    if (draft.mode === 'clocks') {
      const target = later.find(candidate => candidate.flexible && !candidate.recurrenceOf);
      const cursor = draft.recurrenceCursor[slot.familyId];
      const replacement = draft.recurrenceBank[slot.familyId][cursor];
      if (target && replacement) {
        target.familyId = slot.familyId;
        target.concept = slot.concept;
        target.question = replacement;
        target.recurrenceOf = slot.familyId;
        target.supportLevel = 'heightened';
        target.supportReason = 'related-miss';
        draft.recurrenceCursor[slot.familyId]++;
      }
      return;
    }
    const target = later.find(candidate => (
      draft.mode === 'calendar' ? candidate.familyId === slot.familyId : candidate.concept === slot.concept
    ));
    if (target) {
      target.supportLevel = 'heightened';
      target.supportReason = 'related-miss';
    }
  }

  function clearRecoveredSupport(draft, slot) {
    if (slot.supportReason !== 'related-miss') return;
    draft.slots.slice(draft.index + 1).forEach(candidate => {
      if (candidate.status === 'pending'
        && candidate.concept === slot.concept
        && candidate.supportReason === 'related-miss') {
        candidate.supportLevel = 'baseline';
        candidate.supportReason = null;
      }
    });
  }

  function answerSession(session, questionInstanceId, choiceId, expectedAttempt) {
    const slot = currentSlot(session);
    if (!slot || slot.status !== 'question' || slot.question.questionInstanceId !== questionInstanceId
      || typeof choiceId !== 'string' || expectedAttempt !== slot.attempt) return session;
    const choice = slot.question.choices.find(item => item.id === choiceId);
    if (!choice) return session;
    const draft = clone(session);
    const current = draft.slots[draft.index];
    const correct = choiceId === current.question.correctChoiceId;
    if (correct) {
      const resolution = current.attempt === 1 ? 'firstTryCorrect' : 'retryCorrect';
      current.status = 'resolved';
      current.resolution = resolution;
      recordTally(draft, current, resolution);
      clearRecoveredSupport(draft, current);
      return deepFreeze(draft);
    }
    current.missedChoiceIds.push(choiceId);
    if (current.attempt === 1) {
      current.attempt = 2;
      current.supportLevel = 'retry';
      scheduleSupport(draft, current);
      return deepFreeze(draft);
    }
    current.status = 'worked';
    current.resolution = 'secondMiss';
    current.supportLevel = 'worked';
    recordTally(draft, current, 'secondMiss');
    return deepFreeze(draft);
  }

  function nextSession(session, questionInstanceId) {
    const slot = currentSlot(session);
    if (!slot || !['resolved', 'worked'].includes(slot.status)
      || slot.question.questionInstanceId !== questionInstanceId) return session;
    const draft = clone(session);
    if (draft.index === draft.total - 1) {
      draft.index = draft.total;
      draft.status = 'recap';
      return deepFreeze(draft);
    }
    draft.index++;
    draft.slots[draft.index].status = 'question';
    return deepFreeze(draft);
  }

  function doneSession(session) {
    if (!session || session.status !== 'recap') return session;
    const draft = clone(session);
    draft.status = 'done';
    return deepFreeze(draft);
  }

  function exitSession(session) {
    if (!session || !['active', 'recap'].includes(session.status)) return session;
    const draft = clone(session);
    draft.status = 'exited';
    return deepFreeze(draft);
  }

  function publicSnapshot(session) {
    if (!session) return null;
    const slot = currentSlot(session);
    const stage = slot?.status === 'worked' ? 'worked' : 'guided';
    const guidanceKey = slot && (slot.attempt === 2 || slot.supportLevel === 'heightened') ? 'retry' : 'baseline';
    return deepFreeze({
      schemaVersion: session.schemaVersion,
      sessionId: session.sessionId,
      mode: session.mode,
      status: session.status,
      questionNumber: slot ? session.index + 1 : null,
      total: session.total,
      current: slot ? {
        questionInstanceId: slot.question.questionInstanceId,
        familyId: slot.familyId,
        concept: slot.concept,
        evidenceClass: slot.question.evidenceClass,
        purpose: slot.question.purpose,
        introducedOnPage: slot.question.introducedOnPage,
        attempt: slot.attempt,
        supportLevel: slot.supportLevel,
        resolution: slot.resolution,
        prompt: clone(slot.question.prompt),
        choices: slot.question.choices.map(choice => ({
          id: choice.id,
          label: choice.label,
          ariaLabel: choice.ariaLabel,
          disabled: ['resolved', 'worked'].includes(slot.status),
          missed: slot.missedChoiceIds.includes(choice.id),
        })),
        visual: clone(slot.question.visuals[stage]),
        guidance: clone(slot.question.guidance[guidanceKey]),
        workedExplanation: slot.status === 'worked' ? clone(slot.question.workedExplanation) : null,
      } : null,
      tallies: clone(session.tallies),
      recap: session.status === 'recap' || session.status === 'done'
        ? {
            read: session.tallies.read,
            solved: session.tallies.solved,
            supported: session.tallies.supported,
          }
        : null,
    });
  }

  return deepFreeze({
    SCHEMA_VERSION,
    SESSION_LENGTH,
    COMPLETED_THROUGH_PAGE,
    INCLUDED_THROUGH_PAGE,
    MODES,
    EVIDENCE_CLASSES,
    ANSWER_EXPOSURES,
    MONTH_NAMES,
    WEEKDAY_NAMES,
    CLOCK_FIXTURES,
    CALENDAR_FIXTURES,
    AM_PM_FIXTURES,
    FAMILY_REGISTRY,
    normalizeClock,
    addClockMinutes,
    formatTime,
    isLeapYear,
    daysInMonth,
    weekdayForDate,
    validateCalendarFixture,
    calendarGrid,
    validateAmPmFixture,
    createRngStreams,
    buildQuestion,
    createSession,
    answerSession,
    nextSession,
    doneSession,
    exitSession,
    publicSnapshot,
  });
})();

if (typeof globalThis !== 'undefined') {
  globalThis.FOOTBALL_TIME_LAB = FOOTBALL_TIME_LAB;
}
