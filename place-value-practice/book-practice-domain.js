// Original digital activities based on the committed worktext lesson concepts.
// This lane does not write arithmetic/fact/place-value or Football evidence.
const PLACE_BOOK = (()=>{
  'use strict';
  const shapes=['triangle','rectangle','square','circle','hexagon','rhombus'];
  const sides={triangle:3,rectangle:4,square:4,circle:0,hexagon:6,rhombus:4};
  function question(skill,serial=0){
    const n=serial%4+2,m=serial%3+1;
    let prompt='',answer='',options=[],visual=null,help='';
    const numeric=(text,value,model,explanation)=>{prompt=text;answer=String(value);visual=model;help=explanation;options=[value,value+1,Math.max(0,value-1),value+2].map(String);};
    const choice=(text,value,values,model,explanation)=>{prompt=text;answer=value;options=values;visual=model;help=explanation;};
    switch(skill.id){
      case 'basic-shapes': {const name=serial%2?'circle':'triangle';choice('What shape is shown?',name,shapes.slice(0,4),{kind:'shape',name},'A triangle has three straight sides. A circle has one curved boundary and no corners.');break;}
      case 'shape-properties': if(serial%2)choice('Which name fits this four-sided shape with equal sides?','rhombus',['square','triangle','circle','rhombus'],{kind:'shape',name:'rhombus'},'A rhombus has four equal sides. This one does not have square corners.');else choice('Which shape has four equal sides and four square corners?','square',['square','triangle','circle','rhombus'],null,'A square has four equal sides and four right angles. A rhombus has equal sides but need not have square corners.');break;
      case 'shape-sides': {const name=shapes[serial%shapes.length];numeric('How many straight sides does this shape have?',sides[name],{kind:'shape',name},`Count each straight boundary once. The ${name} has ${sides[name]} straight sides.`);break;}
      case 'solids':{const name=['cube','cylinder','cone','box'][serial%4];choice('Name this solid.',name,['cube','cylinder','cone','box'],{kind:'solid',name},`${name==='cube'?'A cube has six equal square faces.':name==='box'?'A box has rectangular faces.':name==='cone'?'A cone has a circular base and a point.':'A cylinder has two circular ends and a curved side.'}`);break;}
      case 'compose-shapes': choice('Join these two matching triangles along the diagonal. What shape do they make?','square',['square','circle','hexagon','triangle'],{kind:'partition',parts:2,filled:0,diagonal:true},'The two triangles fill the square without gaps or overlaps.');break;
      case 'decompose-shapes':case 'shape-parts':numeric('The square is cut along both diagonals. How many triangles fill it?',4,{kind:'partition',parts:4,filled:0,diagonal:true},'Each part between the center and one side is a triangle. There are four parts.');break;
      case 'halves':case 'quarters':{const parts=skill.id==='halves'?2:4;choice('What fraction of the whole is colored?',parts===2?'one half':'one quarter',['one half','one quarter','one whole','none'],{kind:'partition',parts,filled:1},`The whole has ${parts} equal parts; one is colored.`);break;}
      case 'fraction-equivalence':numeric('How many quarters make one half?',2,{kind:'partition',parts:4,filled:2},'Two of the four equal parts cover half the whole.');break;
      case 'thirds':choice('Optional: one of three equal parts is colored. Name it.','one third',['one third','one half','one quarter','one whole'],{kind:'partition',parts:3,filled:1},'One of three equal parts is one third.');break;
      case 'length-units':numeric('How many equal units cover the ribbon with no gaps?',n,{kind:'units',count:n},'Count the equal units from one end of the ribbon to the other.');break;
      case 'measurement-errors':choice('Can these spaced blocks measure the ribbon correctly?','No — there are gaps',['Yes','No — there are gaps','No — they overlap'],{kind:'gaps',count:n},'Measurement units must touch end to end, with no gaps or overlaps.');break;
      case 'unit-sizes':numeric('Four long units cover a ribbon. Each long unit equals two short units. How many short units cover it?',8,{kind:'unit-sizes'},'Each of the four long units needs two short units: 2 + 2 + 2 + 2 = 8.');break;
      case 'length-compare':choice('Which ribbon is longer?','A',['A','B','same length'],{kind:'bars',values:[n+2,n],labels:['A','B']},'Compare the ribbons from the same starting point. A reaches farther.');break;
      case 'length-difference':choice('A is longer than the measuring stick. B is shorter than that stick. Which is longer?','A',['A','B','same length'],{kind:'bars',values:[7,5,3],labels:['A','stick','B']},'A is longer than the stick, and the stick is longer than B. So A is longer than B.');break;
      case 'inches':case 'centimeters':numeric(`The ribbon starts at zero. How many ${skill.id} long is it?`,n,{kind:'ruler',count:n,unit:skill.id},`Read the end mark, counting the spaces from zero. This is a drawn ruler, not a life-size measuring tool.`);break;
      case 'bar-graphs':case 'graph-compare':case 'graph-total':{
        const values=[n,m,n+1],labels=['Apples','Pears','Plums'];
        const total=values.reduce((a,b)=>a+b,0);
        if(skill.id==='graph-compare'&&serial%2){choice('Which fruit has the most?',labels[values.indexOf(Math.max(...values))],labels,{kind:'graph',values,labels},'The longest bar shows the greatest count.');break;}
        numeric(skill.id==='bar-graphs'?'How many pears are shown?':skill.id==='graph-compare'?'How many more plums than apples?':'How many pieces of fruit altogether?',skill.id==='bar-graphs'?m:skill.id==='graph-compare'?1:total,{kind:'graph',values,labels},skill.id==='graph-total'?`Add the counts: ${n} + ${m} + ${n+1} = ${total}.`:'Each unit on this graph is one fruit. Read the bar ends and compare the counts.');break;}
      case 'graph-build':numeric(`A table says ${n} children chose apples. At which tick should the Apples bar end?`,n,{kind:'graph',values:[0,3,4],labels:['Apples','Pears','Plums']},`On a one-child-per-unit graph, draw the Apples bar from zero to ${n}.`);break;
      case 'graph-difference':choice(`Someone says there are ${serial%2?'three':'two'} more plums than pears. Is that right?`,serial%2?'No':'Yes',['Yes','No'],{kind:'graph',values:[n,n+2],labels:['Pears','Plums']},`${n+2} − ${n} = 2. Check whether the statement says two.`);break;
      case 'tallies':numeric('How many votes do these tally marks show?',5+n,{kind:'tallies',count:5+n},'The crossed group is five. Count on from five for the remaining marks.');break;
      case 'dimes-pennies':case 'dimes-nickels-pennies':case 'coin-combinations':case 'coin-values':case 'coin-change':case 'quarters-coins':case 'quarter-combinations':case 'money-practice':{
        const coins=skill.page<171?[10,10,m]:skill.page<176?[10,5,5,m]:skill.page<178?[25,25,10]:serial%2?[25,25,25,10,5,m]:[25,10,5,m];
        // Expand the few pennies individually; a nonexistent 2/3-cent coin is never drawn.
        const expanded=coins.flatMap(c=>c<5?Array(c).fill(1):[c]),total=expanded.reduce((a,b)=>a+b,0);
        if(skill.id==='coin-change')choice('Which coins make the same amount as one dime?','two nickels',['two nickels','two pennies','one nickel'],null,'A dime is 10 cents. Two nickels make 5 + 5 = 10 cents.');
        else if(skill.id==='coin-values'){const name=['pennies','nickels','dimes'][serial%3],count={pennies:100,nickels:20,dimes:10}[name];numeric(`How many ${name} equal one dollar?`,count,{kind:'money-label',text:'$1 = 100 cents'},`One dollar is 100 cents. ${count} ${name} make 100 cents.`);}
        else if(skill.id==='quarters-coins'&&serial%2)numeric('How many quarters make one whole dollar?',4,{kind:'money-label',text:'A quarter = 25 cents'},'A quarter is one fourth of a dollar. Four quarters make 100 cents.');
        else if(skill.id==='quarter-combinations'&&serial%2)choice('Which coins make 35 cents?','one quarter and one dime',['one quarter and one dime','one quarter and one nickel','three dimes'],null,'A quarter is 25 cents and a dime is 10 cents. Together they make 35 cents.');
        else if(skill.id==='money-practice')numeric('You spend 10 cents. How many cents are left?',total-10,{kind:'coins',coins:expanded},`The coins total ${total} cents. Subtract 10 cents to find ${total-10} cents left.`);
        else numeric('How many cents altogether?',total,{kind:'coins',coins:expanded},`Add the coin values: ${expanded.join(' + ')} = ${total} cents.`);break;}
      default:{
        let a=n,b=m,op='+',missing=false;
        const id=skill.id;
        if(id.startsWith('facts-')){const total=Number(id.slice(6).split('-').at(-1));a=Math.min(n,total);b=total-a;op=serial%2?'-':'+';if(op==='-'){a=total;b=m;}}
        else if(id==='repeated-subtraction'){numeric(`9 − ${m} − 2 = ?`,7-m,null,`First subtract ${m} from 9, then subtract 2.`);break;}
        else if(id==='compare-facts'){choice(`Which is greater: ${n} + 1 or ${n} + 2?`,`${n} + 2`,[`${n} + 1`,`${n} + 2`,'equal'],null,'Adding two gives one more than adding one.');break;}
        else if(['word-equations','word-problems'].includes(id)){numeric(`There are ${n} red balls and ${m} blue balls. How many balls altogether?`,n+m,null,`Add the two groups: ${n} + ${m} = ${n+m}.`);break;}
        else if(id==='make-ten-three'){numeric(`${n} + ${10-n} + ${m} = ?`,10+m,null,`First make ten: ${n} + ${10-n} = 10. Then add ${m}.`);break;}
        else if(id==='just-one-more'){a=n;b=11-n;}
        else if(id==='doubles'){a=n+4;b=n+4;}
        else if(id==='make-ten-nine'){a=9;b=n;}
        else if(id==='make-ten-eight'){a=8;b=n;}
        else if(id==='ones-add'){a=21;b=n;}
        else if(id==='ones-subtract'){a=28;b=n;op='−';}
        else if(id==='missing-ones'){a=21;b=n;missing=true;}
        else if(id==='two-digit-add'){a=21;b=12+n;}
        else if(id==='complete-ten'){a=21+n;b=30-a;missing=true;}
        else if(id==='cross-ten'){a=7;b=n+3;}
        else if(id==='cross-next-ten'){a=28;b=n+1;}
        else if(['addition-20','addition-20-more'].includes(id)){a=8;b=n;}
        else if(['two-digit-carry','two-digit-carry-columns'].includes(id)){a=28;b=12+n;}
        else if(id==='three-addends'){numeric(`8 + ${n} + ${m} = ?`,8+n+m,null,`Add 8 and ${n}, then add ${m}. The sum is ${8+n+m}.`);break;}
        else if(id==='missing-addend'){a=8;b=n;missing=true;}
        else if(id==='subtract-to-ten'){a=10+n;b=n;op='−';}
        else if(['addition-to-subtract','subtract-20'].includes(id)){a=12;b=5+n;op='−';}
        else if(['two-digit-subtract','mixed-two-digit'].includes(id)){a=48;b=12+n;op='−';}
        else if(id==='tens-minus-digit'){a=40;b=n;op='−';}
        const result=op==='+'?a+b:a-b;
        numeric(missing?`${a} + ? = ${a+b}`:`${a} ${op} ${b} = ?`,missing?b:result,null,`${a} ${op} ${b} = ${result}.`);
      }
    }
    options=[...new Set([String(answer),...options.map(String)])];
    const rotate=serial%options.length;options=[...options.slice(rotate),...options.slice(0,rotate)];
    return {skillId:skill.id,page:skill.page,chapter:skill.chapter,prompt,answer:String(answer),choices:options,visual,help};
  }
  const create=(page,chapter=0)=>({schemaVersion:1,page,chapter,serial:0,completed:0,firstTry:0,yards:0,misses:[],done:false,history:[]});
  const skills=s=>MATH_CURRICULUM.available(s.page).filter(k=>!s.chapter||k.chapter===s.chapter);
  const current=s=>{const all=skills(s);return all.length?question(all[s.serial%all.length],s.serial):null;};
  function normalize(s){if(!s||s.schemaVersion!==1||!MATH_CURRICULUM.validPage(s.page)||![0,5,6,7,8,9,10].includes(s.chapter)||!['serial','completed','firstTry','yards'].every(k=>Number.isSafeInteger(s[k])&&s[k]>=0&&s[k]<1e9)||s.firstTry>s.completed||s.completed!==s.serial+Number(s.done)||s.yards>s.completed*5||!Array.isArray(s.misses)||s.misses.length>3||!s.misses.every(v=>typeof v==='string')||typeof s.done!=='boolean'||!Array.isArray(s.history)||s.history.length>100||s.history.some(r=>!MATH_CURRICULUM.CATALOG.some(k=>k.id===r.skillId&&k.page===r.page)||!Number.isInteger(r.serial)||r.serial<1||r.serial>s.completed||!Number.isInteger(r.misses)||r.misses<0||r.misses>3))return null;const q=current(s);if(q&&s.misses.some(v=>v===q.answer||!q.choices.includes(v)))return null;return {schemaVersion:1,page:s.page,chapter:s.chapter,serial:s.serial,completed:s.completed,firstTry:s.firstTry,yards:s.yards,misses:[...s.misses],done:s.done,history:s.history.map(r=>({skillId:r.skillId,page:r.page,serial:r.serial,misses:r.misses}))};}
  function answer(s,value){const q=current(s);if(!q||s.done||!q.choices.includes(value)||s.misses.includes(value)||s.completed>=1e8)return false;if(value===q.answer){s.done=true;s.completed++;if(!s.misses.length)s.firstTry++;s.yards+=s.misses.length?1:5;s.history.push({skillId:q.skillId,page:q.page,serial:s.completed,misses:s.misses.length});s.history=s.history.slice(-100);}else{s.misses.push(value);s.yards-=Math.min(5,s.yards%100);}return true;}
  function next(s){if(!s.done)return false;s.serial++;s.done=false;s.misses=[];return true;}
  return Object.freeze({question,create,normalize,current,answer,next,skills});
})();
globalThis.PLACE_BOOK=PLACE_BOOK;
