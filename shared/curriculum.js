// Grade 1-B runtime authority. No DOM, storage, clocks, or game evidence.
const MATH_CURRICULUM = (() => {
  'use strict';
  const BOOK = 'Math Mammoth Grade 1-B', EDITION = 2026, LAST_PAGE = 187;
  const BASELINE = Object.freeze({worktext:BOOK,edition:EDITION,completedThroughPage:113,asOfDate:'2026-09-18',provenance:'instructor-confirmed'});
  const rows = [
    ['facts-4-5',17,5],['facts-6',19,5],['word-equations',21,5],['facts-7',23,5],['facts-8',25,5],['compare-facts',29,5],['facts-9',31,5],['facts-10',35,5],['repeated-subtraction',39,5],['word-problems',41,5],
    ['basic-shapes',50,6],['shape-properties',52,6],['shape-sides',55,6],['solids',59,6],['compose-shapes',63,6],['decompose-shapes',64,6],['shape-parts',66,6],['halves',68,6],['quarters',70,6],['fraction-equivalence',71,6],['thirds',72,6],
    ['length-units',79,7],['measurement-errors',80,7],['length-compare',81,7],['unit-sizes',82,7],['length-difference',83,7],['inches',86,7],['centimeters',89,7],
    ['make-ten-three',101,8],['just-one-more',102,8],['doubles',103,8],['make-ten-nine',104,8],['make-ten-eight',106,8],['ones-add',108,8],['ones-subtract',110,8],['missing-ones',112,8],['two-digit-add',114,8],['complete-ten',117,8],['cross-ten',119,8],['cross-next-ten',120,8],['two-digit-carry',121,8],['addition-20',122,8],['three-addends',124,8],['addition-20-more',125,8],['two-digit-carry-columns',127,8],['missing-addend',129,8],['subtract-to-ten',131,8],['addition-to-subtract',133,8],['subtract-20',135,8],['two-digit-subtract',137,8],['mixed-two-digit',139,8],['tens-minus-digit',142,8],
    ['bar-graphs',153,9],['graph-compare',154,9],['graph-total',155,9],['graph-build',156,9],['graph-difference',158,9],['tallies',160,9],
    ['dimes-pennies',170,10],['dimes-nickels-pennies',171,10],['coin-combinations',172,10],['coin-values',174,10],['coin-change',175,10],['quarters-coins',176,10],['quarter-combinations',178,10],['money-practice',180,10],
  ];
  const CATALOG = Object.freeze(rows.map(([id,page,chapter])=>Object.freeze({id,page,chapter,worktext:BOOK,edition:EDITION,optional:['tallies','thirds'].includes(id)})));
  const validPage = page => Number.isInteger(page) && page>=0 && page<=LAST_PAGE;
  const chapter = page => page>=167?10:page>=151?9:page>=95?8:page>=77?7:page>=47?6:page>=13?5:0;
  const available = page => validPage(page)?CATALOG.filter(skill=>skill.page<=page):[];
  function factPage(op,a,b) {
    if(![a,b].every(Number.isInteger)||a<0||b<0)return Infinity;
    const total=op==='add'?a+b:a;
    if(total<=10)return total<=5?17:total===6?19:total===7?23:total===8?25:total===9?31:35;
    if(op==='sub')return a<=20&&b<=a?131:Infinity;
    if(a<=9&&b<=9){if(total===11)return 102;if(Math.abs(a-b)<=1)return 103;if(a===9||b===9)return 104;if(a===8||b===8)return 106;return 119;}
    return a+b<=20?122:Infinity;
  }
  function arithmeticPage(f,[a,b,c]) {
    switch(f){
      case 'facts-add':return factPage('add',a,b);
      case 'facts-subtract':return Math.min(a>=10&&b<=a%10?110:Infinity,factPage('sub',a,b));
      case 'add-no-carry':return b<=9?108:114;
      case 'add-carry':return b<=9?120:121;
      case 'subtract-no-borrow':return b<=9?110:137;
      case 'complete-ten':return 117;
      case 'missing-addend':return a+b<=10?21:[8,9].includes(a)&&b<=9?107:a>=10&&b<=9&&a%10+b<=9?112:129;
      case 'three-addends':return [a+b,a+c,b+c].includes(10)?101:124;
      case 'repeated-subtraction':return 39;
      case 'tens-minus-digit':return 142;
      default:return Infinity;
    }
  }
  function normalize(raw) {
    if(!raw||raw.schemaVersion!==1||raw.worktext!==BOOK||raw.edition!==EDITION||!validPage(raw.completedThroughPage)||!Number.isSafeInteger(raw.revision)||raw.revision<1||typeof raw.updatedAt!=='string'||!['learner-reported','instructor-confirmed'].includes(raw.provenance))return null;
    return Object.freeze({schemaVersion:1,worktext:BOOK,edition:EDITION,completedThroughPage:raw.completedThroughPage,revision:raw.revision,updatedAt:raw.updatedAt,provenance:raw.provenance});
  }
  const needsConfirmation=(before,after)=>after<before||after-before>10||chapter(after)>chapter(before);
  function operationPage(op,a,b){
    if(op==='add'){
      if(a<=9&&b<=9)return factPage('add',a,b);
      if(a<b)[a,b]=[b,a];
      return a%10+b%10>=10?arithmeticPage('add-carry',[a,b]):arithmeticPage('add-no-carry',[a,b]);
    }
    if(a<=10)return factPage('sub',a,b);
    if(a%10>=b&&b<=9)return 110;
    if(a<=20)return 131;
    if(a%10===0&&b<=9)return 142;
    return a%10>=b%10?137:Infinity;
  }
  return Object.freeze({BOOK,EDITION,LAST_PAGE,BASELINE,CATALOG,validPage,chapter,available,factPage,arithmeticPage,operationPage,normalize,needsConfirmation});
})();
globalThis.MATH_CURRICULUM=MATH_CURRICULUM;
