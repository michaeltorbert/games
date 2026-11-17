// Grade 2-A runtime authority (issue #219). No DOM, storage, clocks, or game
// evidence. Approved runtime practice scope is Chapter 1, printed pages 10-32,
// of the purchased Math Mammoth Grade 2-A PDF identified below by file hash
// (the cover names no edition year). Learners may truthfully report any
// printed page through 161; pages after 32 unlock no further practice.
const MATH_CURRICULUM_2A = (() => {
  'use strict';
  const BOOK = 'Math Mammoth Grade 2-A';
  // Revision identity, not an edition year: copyright 2012-2025, PDF created
  // 2025-09-06, SHA-256 of the purchased file. The PDF itself stays outside
  // the repository.
  const EDITION = 'rev-2025-09-06';
  const SOURCE = Object.freeze({copyright:'2012-2025',created:'2025-09-06',sha256:'ff96fc64c6d05a4b961ab4ea46920be86de06cb0af15c84cb311b3445a7a6bf2'});
  const LAST_PAGE = 161, CHAPTER1_FIRST = 10, CHAPTER1_LAST = 32;
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
  ]);
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
  ];
  const CATALOG = Object.freeze(rows.map(([id,page,lesson])=>Object.freeze({id,page,lesson,chapter:1,worktext:BOOK,edition:EDITION,optional:false})));
  // Reviewed dispositions: optional enrichment omitted from the gentle first
  // wave. They are not ordinary lesson units, so no ordinary skill is missing.
  const OMITTED_OPTIONAL = Object.freeze([
    Object.freeze({page:16,kind:'Puzzle Corner',topic:'missing subtrahend and two-step missing terms'}),
    Object.freeze({page:18,kind:'Puzzle Corner',topic:'word reordering'}),
    Object.freeze({page:23,kind:'Challenge',topic:'doubling 16 repeatedly'}),
    Object.freeze({page:28,kind:'Puzzle Corner',topic:'whole-ten arithmetic grid'}),
    Object.freeze({page:30,kind:'Puzzle Corner',topic:'arithmetic grids'}),
  ]);
  const validPage = page => Number.isInteger(page) && page>=0 && page<=LAST_PAGE;
  // Only Chapter 1's printed boundaries are verified; later pages form one
  // "after Chapter 1" bucket rather than invented chapter edges.
  const chapter = page => page>CHAPTER1_LAST?2:page>=CHAPTER1_FIRST?1:0;
  const available = page => validPage(page)?CATALOG.filter(skill=>skill.page<=page):[];
  const needsConfirmation=(before,after)=>after<before||after-before>10||chapter(after)!==chapter(before);
  function normalize(raw) {
    if(!raw||raw.schemaVersion!==1||raw.worktext!==BOOK||raw.edition!==EDITION||!validPage(raw.completedThroughPage)||!Number.isSafeInteger(raw.revision)||raw.revision<1||typeof raw.updatedAt!=='string'||!['learner-reported','instructor-confirmed'].includes(raw.provenance))return null;
    return Object.freeze({schemaVersion:1,worktext:BOOK,edition:EDITION,completedThroughPage:raw.completedThroughPage,revision:raw.revision,updatedAt:raw.updatedAt,provenance:raw.provenance});
  }
  // Earliest Chapter 1 printed page whose ordinary lesson work covers this
  // existing Football arithmetic relation, or Infinity. General borrowing,
  // results over 100, and subtraction across ten within 20 stay excluded.
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
      return Infinity;
    }
    return Infinity;
  }
  return Object.freeze({BOOK,EDITION,SOURCE,LAST_PAGE,CHAPTER1_FIRST,CHAPTER1_LAST,LESSONS,CATALOG,OMITTED_OPTIONAL,validPage,chapter,available,needsConfirmation,normalize,operationPage});
})();
globalThis.MATH_CURRICULUM_2A=MATH_CURRICULUM_2A;
