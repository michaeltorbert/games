// Grade 2-A runtime authority (issues #219, #223). No DOM, storage, clocks, or
// game evidence. Approved runtime practice scope is Chapters 1-3, printed pages
// 10-97, of the purchased Math Mammoth Grade 2-A PDF identified below by file
// hash (the cover names no edition year). Learners may truthfully report any
// printed page through 161; pages after 97 unlock no further practice.
// Approving this scope never advances a learner's reported page or mastery.
const MATH_CURRICULUM_2A = (() => {
  'use strict';
  const BOOK = 'Math Mammoth Grade 2-A';
  // Revision identity, not an edition year: copyright 2012-2025, PDF created
  // 2025-09-06, SHA-256 of the purchased file. The PDF itself stays outside
  // the repository.
  const EDITION = 'rev-2025-09-06';
  const SOURCE = Object.freeze({copyright:'2012-2025',created:'2025-09-06',sha256:'ff96fc64c6d05a4b961ab4ea46920be86de06cb0af15c84cb311b3445a7a6bf2'});
  const LAST_PAGE = 161, CHAPTER1_FIRST = 10, CHAPTER1_LAST = 32;
  // #223: Chapter 2 (Clock) starts with a teacher introduction on 33; its
  // learner pages are 37-54. Chapter 3 (facts within 0-18) starts with a
  // teacher introduction on 55; its learner pages are 59-97. Chapter 4 begins
  // on 98 and is outside the approved scope.
  const CHAPTER2_FIRST = 33, CHAPTER2_LAST = 54, CHAPTER3_FIRST = 55, CHAPTER3_LAST = 97;
  // Catalog ceilings. A Book run frozen before #223 (no saved ceiling) keeps the
  // released Chapter 1 catalog and order; new runs use the full catalog.
  const LEGACY_CATALOG_THROUGH = 32, CATALOG_THROUGH = 97;
  const LESSONS = Object.freeze([
    Object.freeze({id:1,title:'Some Review',pages:[10,11]}),
    Object.freeze({id:2,title:'100-chart and More Review',pages:[12,14]}),
    Object.freeze({id:3,title:'Fact Families',pages:[15,16]}),
    Object.freeze({id:4,title:'Ordinal Numbers',pages:[17,18]}),
    Object.freeze({id:5,title:'Even and Odd',pages:[19,20]}),
    Object.freeze({id:6,title:'Doubling',pages:[21,23]}),
    Object.freeze({id:7,title:'One-Half',pages:[24,25]}),
    Object.freeze({id:8,title:'Adding Whole Tens',pages:[26,28]}),
    Object.freeze({id:9,title:'Subtracting Whole Tens',pages:[29,30]}),
    Object.freeze({id:10,title:'Chapter 1 Review',pages:[31,32]}),
    // Chapter 2: Clock
    Object.freeze({id:11,title:'Review—Whole and Half Hours',pages:[37],chapter:2}),
    Object.freeze({id:12,title:'The Minutes',pages:[38,40],chapter:2}),
    Object.freeze({id:13,title:'The Minutes, Part 2',pages:[41,42],chapter:2}),
    Object.freeze({id:14,title:'Past and Till in Five-Minute Intervals',pages:[43,45],chapter:2}),
    Object.freeze({id:15,title:'How Many Hours Pass?',pages:[46,47],chapter:2}),
    Object.freeze({id:16,title:'The Calendar: Weekdays and Months',pages:[48,50],chapter:2}),
    Object.freeze({id:17,title:'The Calendar: Dates',pages:[51,53],chapter:2}),
    Object.freeze({id:18,title:'Review Chapter 2',pages:[54],chapter:2}),
    // Chapter 3: Addition and Subtraction Facts Within 0-18
    Object.freeze({id:19,title:'Review: Completing the Next Ten',pages:[59,60],chapter:3}),
    Object.freeze({id:20,title:'Review: Going Over Ten',pages:[61,62],chapter:3}),
    Object.freeze({id:21,title:'Adding with 9',pages:[63,64],chapter:3}),
    Object.freeze({id:22,title:'Adding with 8',pages:[65,66],chapter:3}),
    Object.freeze({id:23,title:'Adding with 7',pages:[67,68],chapter:3}),
    Object.freeze({id:24,title:'Adding with 6',pages:[69,70],chapter:3}),
    Object.freeze({id:25,title:'Review—Facts with 6, 7, and 8',pages:[71,72],chapter:3}),
    Object.freeze({id:26,title:'Subtract to Ten',pages:[73,74],chapter:3}),
    Object.freeze({id:27,title:'Difference and How Many More',pages:[75,77],chapter:3}),
    Object.freeze({id:28,title:'Number Rainbows for 11 and 12',pages:[78,79],chapter:3}),
    Object.freeze({id:29,title:'Fact Families for 11',pages:[80],chapter:3}),
    Object.freeze({id:30,title:'Fact Families for 12',pages:[81,82],chapter:3}),
    Object.freeze({id:31,title:'Number Rainbows for 13 and 14',pages:[83],chapter:3}),
    Object.freeze({id:32,title:'Fact Families for 13 and 14',pages:[84,86],chapter:3}),
    Object.freeze({id:33,title:'Fact Family for 15',pages:[87,88],chapter:3}),
    Object.freeze({id:34,title:'Fact Family for 16',pages:[89,90],chapter:3}),
    Object.freeze({id:35,title:'Fact Families for 17 and 18',pages:[91,92],chapter:3}),
    Object.freeze({id:36,title:'Mixed Review Chapter 3',pages:[93,94],chapter:3}),
    Object.freeze({id:37,title:'Review Chapter 3',pages:[95,97],chapter:3}),
  ]);
  const LEGACY_LESSON_LAST = 10;
  // Each row unlocks only when its printed page is reported complete.
  const rows = [
    ['2a-base-ten-read',10,1],['2a-add-no-carry',10,1],['2a-tens-minus-digit',10,1],
    ['2a-subtract-no-borrow',11,1],['2a-missing-ones-tens',11,1],['2a-three-addends',11,1],['2a-review-stories',11,1],
    ['2a-chart-skip',12,2],['2a-chart-neighbors',12,2],['2a-chart-patterns',13,2],['2a-to-next-ten',13,2],['2a-cross-ten',14,2],['2a-repeated-subtract',14,2],
    ['2a-fact-family',15,3],['2a-fact-family-100',16,3],
    ['2a-ordinal-position',17,4],['2a-ordinal-nth-first',18,4],['2a-ordinal-grid',18,4],
    ['2a-even-odd-pairs',19,5],['2a-even-odd-rule',20,5],
    ['2a-doubles',21,6],['2a-share-even',22,6],['2a-double-inverse',23,6],
    ['2a-halves-shapes-sets',24,7],['2a-halves-numbers',25,7],
    ['2a-add-whole-tens',26,8],['2a-tens-stories',27,8],['2a-missing-tens',28,8],
    ['2a-subtract-whole-tens',29,9],['2a-tens-patterns-stories',30,9],
    ['2a-chapter-review',31,10],['2a-halves-review',32,10],
    // #223 Chapter 2. A row's page is the printed page that introduces every
    // one of its variants; a later variant gets its own row and gate.
    ['2a-clock-whole-half',37,11],
    ['2a-minutes-hand',38,12],['2a-minutes-read',39,12],['2a-minutes-match',40,12],
    ['2a-late-read',41,13],['2a-late-plus-five',42,13],
    ['2a-past',43,14],['2a-till',44,14],['2a-time-forms',45,14],
    ['2a-hours-am-pm',46,15],['2a-hours-overnight',47,15],
    ['2a-weekdays',49,16],['2a-months',50,16],
    ['2a-dates-weekly',51,17],['2a-dates-events',52,17],['2a-dates-weeks',53,17],
    ['2a-plus-ten-min',54,18],['2a-hours-later',54,18],['2a-ch2-review',54,18],
    // #223 Chapter 3.
    ['2a-nearest-ten',59,19],['2a-next-ten-review',59,19],['2a-next-ten-plus',60,19],
    ['2a-make-ten-visual',61,20],['2a-make-ten-split',62,20],
    ['2a-add-nine',63,21],['2a-add-nine-more',64,21],
    ['2a-add-eight',65,22],['2a-add-eight-more',66,22],
    ['2a-add-seven',67,23],['2a-add-seven-more',68,23],
    ['2a-add-six',69,24],['2a-add-six-more',70,24],
    ['2a-facts-crossing',71,25],['2a-facts-table-stories',72,25],
    ['2a-subtract-to-ten',73,26],['2a-subtract-to-ten-more',74,26],
    ['2a-difference-line',75,27],['2a-how-many-more',76,27],['2a-compare-stories',77,27],
    ['2a-rainbow-11-12',78,28],['2a-rainbow-11-12-fill',79,28],
    ['2a-family-11',80,29],
    ['2a-family-12',81,30],['2a-family-12-more',82,30],
    ['2a-rainbow-13-14',83,31],
    ['2a-family-13',84,32],['2a-family-14',85,32],['2a-family-14-stories',86,32],
    ['2a-family-15',87,33],['2a-family-15-review',88,33],
    ['2a-family-16',89,34],['2a-family-16-stories',90,34],
    ['2a-family-17-18',91,35],['2a-family-17-18-review',92,35],
    ['2a-elapsed-minutes',93,36],['2a-mixed-review-93',93,36],['2a-mixed-review-94',94,36],
    ['2a-review-95',95,37],['2a-review-96',96,37],['2a-review-97',97,37],
  ];
  const chapterOfPage = page => page>CHAPTER3_LAST?4:page>=CHAPTER3_FIRST?3:page>=CHAPTER2_FIRST?2:page>=CHAPTER1_FIRST?1:0;
  const CATALOG = Object.freeze(rows.map(([id,page,lesson])=>Object.freeze({id,page,lesson,chapter:chapterOfPage(page),worktext:BOOK,edition:EDITION,optional:false})));
  // Pages in Chapters 2-3 that add no practice, with the reviewed reason.
  // None of them is a completion boundary for any skill.
  const NO_PRACTICE_PAGES = Object.freeze([
    Object.freeze({page:33,kind:'teacher introduction',topic:'Chapter 2 introduction and pacing'}),
    Object.freeze({page:34,kind:'optional home games',topic:'clock games for adults to lead'}),
    Object.freeze({page:35,kind:'external resources',topic:'links and videos'}),
    Object.freeze({page:36,kind:'blank',topic:'no content'}),
    Object.freeze({page:48,kind:'reference figure',topic:'a whole-year calendar to look at; no exercise'}),
    Object.freeze({page:55,kind:'teacher introduction',topic:'Chapter 3 introduction'}),
    Object.freeze({page:56,kind:'teacher introduction',topic:'pacing and an optional card game'}),
    Object.freeze({page:57,kind:'optional home games',topic:'card games for adults to lead'}),
    Object.freeze({page:58,kind:'external resources',topic:'links and online games'}),
  ]);
  // Reviewed dispositions: optional enrichment omitted from the gentle first
  // wave. They are not ordinary lesson units, so no ordinary skill is missing.
  const OMITTED_OPTIONAL = Object.freeze([
    Object.freeze({page:16,kind:'Puzzle Corner',topic:'missing subtrahend and two-step missing terms'}),
    Object.freeze({page:18,kind:'Puzzle Corner',topic:'word reordering'}),
    Object.freeze({page:23,kind:'Challenge',topic:'doubling 16 repeatedly'}),
    Object.freeze({page:28,kind:'Puzzle Corner',topic:'whole-ten arithmetic grid'}),
    Object.freeze({page:30,kind:'Puzzle Corner',topic:'arithmetic grids'}),
  ]);
  // #223 reviewed dispositions for Chapters 2-3. Number rainbows (78-79, 83)
  // are included even though the book marks them optional, by explicit issue
  // scope. The page-97 code puzzle is ordinary review and is adapted.
  const OMITTED_OPTIONAL_CH23 = Object.freeze([
    Object.freeze({page:42,kind:'Puzzle Corner',topic:'working backward through several elapsed rounds'}),
    Object.freeze({page:64,kind:'Puzzle Corner',topic:'generalized sums ending in 9'}),
    Object.freeze({page:74,kind:'Puzzle Corner',topic:'subtraction patterns in larger decades'}),
    Object.freeze({page:82,kind:'Puzzle Corner',topic:'missing middle term of three'}),
  ]);
  const validPage = page => Number.isInteger(page) && page>=0 && page<=LAST_PAGE;
  // Verified printed chapter boundaries: 1 = 10-32, 2 = 33-54, 3 = 55-97, and
  // one "after Chapter 3" bucket for 98-161 rather than invented later edges.
  const chapter = chapterOfPage;
  // Skills whose own page is completed, within a catalog ceiling (default: the
  // whole approved catalog). Mastery is never an input.
  const available = (page, through = CATALOG_THROUGH) => validPage(page)&&(through===LEGACY_CATALOG_THROUGH||through===CATALOG_THROUGH)?CATALOG.filter(skill=>skill.page<=page&&skill.page<=through):[];
  const needsConfirmation=(before,after)=>after<before||after-before>10||chapter(after)!==chapter(before);
  function normalize(raw) {
    if(!raw||raw.schemaVersion!==1||raw.worktext!==BOOK||raw.edition!==EDITION||!validPage(raw.completedThroughPage)||!Number.isSafeInteger(raw.revision)||raw.revision<1||typeof raw.updatedAt!=='string'||!['learner-reported','instructor-confirmed'].includes(raw.provenance))return null;
    return Object.freeze({schemaVersion:1,worktext:BOOK,edition:EDITION,completedThroughPage:raw.completedThroughPage,revision:raw.revision,updatedAt:raw.updatedAt,provenance:raw.provenance});
  }
  // Earliest printed page whose ordinary lesson work covers this existing
  // Football arithmetic relation, or Infinity. General borrowing and results
  // over 100 stay excluded. #223 adds exactly one relation: a teen 11-18 minus
  // a one-digit number that crosses below ten (Subtract to Ten, page 73).
  // Chapter 3 addition facts were already covered on page 14; clocks,
  // calendars, and Book-only patterns never enter Football.
  function operationPage(op,a,b) {
    if(![a,b].every(Number.isInteger)||a<0||b<0)return Infinity;
    if(op==='add'){
      if(a<b)[a,b]=[b,a];
      const sum=a+b;
      if(sum>100)return Infinity;
      if(a<=9)return sum<=10?15:14;                         // facts within 10 (fact families); sums crossing ten
      if(b<=9)return a%10+b<=9?10:14;                       // two-digit + one-digit, without/with crossing
      if(a%10===0&&b%10===0)return 10;                      // whole tens
      if(a%10===0||b%10===0)return 26;                      // whole ten + two-digit
      return a%10+b%10<=9?10:14;                            // column addition; carry in p14
    }
    if(op==='subtract'){
      if(b>a||a>100)return Infinity;
      if(a<=10)return 15;                                   // facts within 10 (fact families)
      if(a<=99&&a%10>=b%10)return 11;                       // no borrowing
      if(a%10===0&&b<=9)return 10;                          // whole tens minus one digit
      if(a>=11&&a<=18&&b<=9)return 73;                      // teen across ten (a%10<b here)
      return Infinity;
    }
    return Infinity;
  }
  return Object.freeze({BOOK,EDITION,SOURCE,LAST_PAGE,CHAPTER1_FIRST,CHAPTER1_LAST,CHAPTER2_FIRST,CHAPTER2_LAST,CHAPTER3_FIRST,CHAPTER3_LAST,
    LEGACY_CATALOG_THROUGH,CATALOG_THROUGH,LEGACY_LESSON_LAST,LESSONS,CATALOG,OMITTED_OPTIONAL,OMITTED_OPTIONAL_CH23,NO_PRACTICE_PAGES,
    validPage,chapter,available,needsConfirmation,normalize,operationPage});
})();
globalThis.MATH_CURRICULUM_2A=MATH_CURRICULUM_2A;
