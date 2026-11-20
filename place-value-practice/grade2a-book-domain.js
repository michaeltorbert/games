// Grade 2-A book practice: Chapter 1 generators (issue #219, unchanged) and the
// run state for Chapters 1-3 (#223; Chapters 2-3 generators live in
// grade2a-chapters23-domain.js). Original, source-bounded
// generators for Math Mammoth Grade 2-A printed pages 10-32; no workbook
// wording, figures, or exercises are copied. Digital choose/select activities
// adapt draw/color tasks and do not claim to assess drawing or cutting.
// This lane writes only its own store; it never touches Grade 1-B book,
// arithmetic, fact, place-value, or Football evidence.
const PLACE_BOOK_2A = (()=>{
  'use strict';
  const C=MATH_CURRICULUM_2A;
  const NAMES=['Mia','Leo','Ava','Sam','Noor','Eli','Ruth','Omar'];
  const LETTERS='ABCDEFGHJKLMNPRSTUVWXYZ';
  const ORD=['first','second','third','fourth','fifth','sixth','seventh','eighth','ninth','tenth','eleventh','twelfth','thirteenth','fourteenth','fifteenth','sixteenth'];
  const ordinal=n=>`${n}${n%100>=11&&n%100<=13?'th':({1:'st',2:'nd',3:'rd'})[n%10]||'th'}`;
  const ordName=n=>`${ordinal(n)} (${ORD[n-1]})`;
  const REVIEWED=['2a-base-ten-read','2a-add-no-carry','2a-tens-minus-digit','2a-subtract-no-borrow','2a-missing-ones-tens','2a-three-addends','2a-review-stories','2a-chart-skip','2a-chart-neighbors','2a-chart-patterns','2a-to-next-ten','2a-cross-ten','2a-repeated-subtract','2a-fact-family','2a-fact-family-100','2a-ordinal-position','2a-ordinal-nth-first','2a-ordinal-grid','2a-even-odd-pairs','2a-even-odd-rule','2a-doubles','2a-share-even','2a-double-inverse','2a-halves-shapes-sets','2a-halves-numbers','2a-add-whole-tens','2a-tens-stories','2a-missing-tens','2a-subtract-whole-tens','2a-tens-patterns-stories'];
  function question(skill,serial=0){
    const s=Math.abs(Math.floor(serial));
    const v=(m,salt=0)=>(s*7+salt*13+Math.floor(s/m)*3)%m;
    const pick=(list,salt=0)=>list[v(list.length,salt)];
    let prompt='',answer='',options=[],visual=null,help='',math=null,reviewOf=null;
    const numeric=(text,value,model,explanation,spread=value>=20?10:1)=>{
      prompt=text;answer=String(value);visual=model;help=explanation;
      options=[value,value+1,value-1,value+spread,value-spread,value+2].filter(x=>x>=0&&x<=100).map(String);
    };
    const choice=(text,value,values,model,explanation)=>{prompt=text;answer=value;options=values;visual=model;help=explanation;};
    const add=(a,b,row=null)=>{math={op:'add',operands:[a,b],answerRow:row};};
    const sub=(...ops)=>{math={op:'sub',operands:ops,answerRow:null};};
    const name=pick(NAMES),other=pick(NAMES.filter(n=>n!==name),1);
    switch(skill.id){
      case '2a-base-ten-read':{
        const tens=1+v(8),ones=v(10),n=tens*10+ones;
        if(s%2)numeric(`How many tens are in ${n}?`,tens,{kind:'base-ten',tens,ones},`${n} is ${tens} ten${tens>1?'s':''} and ${ones} one${ones===1?'':'s'}.`);
        else numeric('What number do these tens and ones show?',n,{kind:'base-ten',tens,ones},`Count the ten-rods by tens: ${tens} ten${tens>1?'s':''} ${tens>1?'are':'is'} ${tens*10}. Then add ${ones} one${ones===1?'':'s'} to make ${n}.`);
        break;}
      case '2a-add-no-carry':{
        let a,b;const k=s%3;
        if(k===0){a=10*(1+v(8))+v(5);b=1+v(9-a%10);}
        else if(k===1){a=10*(1+v(5));b=10*(1+v(4,1));}
        else{a=10*(1+v(4))+v(5,1);b=10*(1+v(4,2))+v(5,3);}
        numeric(`${a} + ${b} = ?`,a+b,k===1?{kind:'base-ten',tens:a/10,ones:0,add:{tens:b/10,ones:0}}:null,`Add the ones, then add the tens. No new ten is made: ${a} + ${b} = ${a+b}.`);add(a,b);break;}
      case '2a-tens-minus-digit':{
        const a=10*(2+v(8)),b=1+v(9);
        numeric(`${a} − ${b} = ?`,a-b,{kind:'base-ten',tens:a/10,ones:0},`Break one ten into ten ones. Take away ${b} ones: ${a} − ${b} = ${a-b}.`);sub(a,b);break;}
      case '2a-subtract-no-borrow':{
        let a,b;
        if(s%2){a=10*(1+v(8))+2+v(8);b=1+v(a%10);}
        else{const ta=3+v(6),oa=3+v(7);a=10*ta+oa;b=10*(1+v(ta-1,1))+v(oa+1,2);}
        numeric(`${a} − ${b} = ?`,a-b,null,`Subtract the ones, then the tens. Each column has enough: ${a} − ${b} = ${a-b}.`);sub(a,b);break;}
      case '2a-missing-ones-tens':{
        const t=1+v(7),o=v(5),a=10*t+o;
        if(s%2){const m=1+v(9-o,1);numeric(`${a} + ? = ${a+m}`,m,null,`The tens stay the same. Count on in ones from ${a} to ${a+m}: ${m} ones.`);add(a,m,1);}
        else{const m=10*(1+v(9-t,1));numeric(`${a} + ? = ${a+m}`,m,null,`The ones stay the same. ${a+m} has ${m/10} more tens than ${a}, so the missing number is ${m}.`);add(a,m,1);}
        break;}
      case '2a-three-addends':{
        const a=2+v(8),b=1+v(9,1),c=1+v(9,2);
        numeric(`${a} + ${b} + ${c} = ?`,a+b+c,null,`Add two numbers first, then add the third. Look for a pair that makes ten.`);math={op:'add',operands:[a,b,c],answerRow:null};break;}
      case '2a-review-stories':{
        const k=s%3;
        if(k===0){const a=10*(2+v(6))+v(5),b=1+v(9-a%10);numeric(`${name} has ${a} stickers. ${other} has ${b} more stickers than ${name}. How many stickers does ${other} have?`,a+b,null,`"More than" means add: ${a} + ${b} = ${a+b}.`);add(a,b);}
        else if(k===1){const a=10*(3+v(6))+5+v(5),b=10*(1+v(2))+v(6,1);numeric(`One box has ${a} crayons. Another box has ${b} crayons. How many more crayons are in the first box?`,a-b,null,`Find the difference: ${a} − ${b} = ${a-b}.`);sub(a,b);}
        else{const a=10*(1+v(5))+v(5),b=10*(1+v(3,1))+v(5,2);numeric(`There are ${a} red apples and ${b} green apples. How many apples are there in all?`,a+b,null,`Join the groups: ${a} + ${b} = ${a+b}.`);add(a,b);}
        break;}
      case '2a-chart-skip':case '2a-chart-patterns':{
        // p12 uses the lesson's own starts; p13 varies starts, direction, and the missing place.
        let step,start,dir;
        if(skill.id==='2a-chart-skip'){[start,step,dir]=pick([[5,5,1],[6,5,1],[2,2,1],[99,2,-1],[4,4,1]]);start+=dir*step*v(6,1);}
        else{step=pick([2,5,10]);dir=s%2?-1:1;start=dir>0?1+v(40,1):60+v(39,1);}
        const terms=Array.from({length:5},(_,i)=>start+dir*step*i),blank=skill.id==='2a-chart-skip'?3+v(2,2):1+v(3,2);
        const shown=terms.map((t,i)=>i===blank?null:t);
        numeric(`Skip-count by ${step}s${dir<0?' backward':''}: ${shown.map(t=>t??'?').join(', ')}. What number is missing?`,terms[blank],{kind:'sequence',terms:shown},`Each step ${dir<0?'takes away':'adds'} ${step}. ${terms[blank-1]??terms[blank+1]} ${blank>0?(dir<0?'−':'+'):(dir<0?'+':'−')} ${step} = ${terms[blank]}.`,step);
        break;}
      case '2a-chart-neighbors':{
        const row=1+v(7),col=2+v(8),n=row*10+col;
        const [where,value,why]=pick([['just below',n+10,'one row down is 10 more'],['just above',n-10,'one row up is 10 less'],['just right of',n+1,'one step right is 1 more'],['just left of',n-1,'one step left is 1 less']],1);
        numeric(`On the 100-chart, which number is ${where} ${n}?`,value,{kind:'chart',first:row*10-9,target:n,hidden:value},`On the 100-chart, ${why}. So the answer is ${value}.`);
        break;}
      case '2a-to-next-ten':{
        const a=10*(1+v(8))+1+v(9),next=Math.ceil(a/10)*10;
        numeric(`${a} + ? = ${next}`,next-a,{kind:'base-ten',tens:Math.floor(a/10),ones:a%10},`${a} has ${a%10} ones. ${10-a%10} more ones complete the next ten, ${next}.`);add(a,next-a,1);break;}
      case '2a-cross-ten':{
        let a,b;
        if(s%2){const o=5+v(5);a=10*(1+v(8))+o;b=11-o+v(o-1,1);}
        else{a=10*(1+v(4))+5+v(5);b=10*(1+v(3,1))+5+v(5,2);}
        numeric(`${a} + ${b} = ?`,a+b,null,`The ones make a new ten. ${a%10} + ${b%10} = ${a%10+b%10}, so carry one ten: ${a} + ${b} = ${a+b}.`);add(a,b);break;}
      case '2a-repeated-subtract':{
        if(s%2){const o=1+v(5),t=1+v(7),a=10*t+o,b=1+v(8-o,1),missing=10-o-b;
          numeric(`${a} + ${b} + ? = ${10*(t+1)}`,missing,null,`${a} + ${b} = ${a+b}. ${missing} more makes the next ten, ${10*(t+1)}.`);}
        else{const [step,start]=pick([[10,40+10*v(6,1)],[20,60+20*v(3,1)],[5,20+5*v(7,1)]]);
          numeric(`${start} − ${step} − ${step} = ?`,start-2*step,null,`Take away ${step} two times: ${start} − ${step} = ${start-step}, then ${start-step} − ${step} = ${start-2*step}.`);sub(start,step,step);}
        break;}
      case '2a-fact-family':{
        const x=3+v(7),y=2+v(x-2,1),t=x+y,k=s%4,family={kind:'fact-family',numbers:[x,y,t]};
        if(k===0)choice(`Which subtraction belongs to the fact family of ${x}, ${y}, and ${t}?`,`${t} − ${x} = ${y}`,[`${t} − ${x} = ${y}`,`${t} − ${x} = ${y+1}`,`${x} − ${y} = ${t}`,`${t} + ${x} = ${y}`],family,`A fact family uses the same three numbers. Take one part from the total: ${t} − ${x} = ${y}.`);
        else if(k===1){numeric(`${x} + ${y} = ${t}. So ${t} − ${y} = ?`,x,family,`Addition and subtraction undo each other: ${t} − ${y} = ${x}.`);sub(t,y);}
        else if(k===2){numeric(`? − ${x} = ${y}. What is the missing number?`,t,{kind:'fact-family',numbers:[x,y,null]},`The missing number is the total. Add the parts: ${x} + ${y} = ${t}.`);add(x,y);}
        else numeric(`How many different addition and subtraction sentences use ${x}, ${y}, and ${t}?`,4,family,`${x} + ${y} = ${t}, ${y} + ${x} = ${t}, ${t} − ${x} = ${y}, and ${t} − ${y} = ${x}: four sentences.`);
        break;}
      case '2a-fact-family-100':{
        const p=10*(2+v(5))+v(5),q=10*(1+v(3,1))+v(5,2),t=p+q,k=s%3,family={kind:'fact-family',numbers:[p,q,t]};
        if(k===0){numeric(`${p} + ${q} = ${t}. So ${t} − ${q} = ?`,p,family,`Subtraction undoes addition: ${t} − ${q} = ${p}.`);sub(t,q);}
        else if(k===1){numeric(`? − ${q} = ${p}. What is the missing number?`,t,{kind:'fact-family',numbers:[p,q,null]},`Find the total by adding the parts: ${p} + ${q} = ${t}.`);add(p,q);}
        else choice(`Which addition matches ${t} − ${q} = ${p}?`,`${p} + ${q} = ${t}`,[`${p} + ${q} = ${t}`,`${t} + ${q} = ${p}`,`${p} − ${q} = ${t}`,`${p} + ${q} = ${t+10}`],family,`The parts ${p} and ${q} add to the total ${t}.`);
        break;}
      case '2a-ordinal-position':{
        const len=8+v(9),offset=v(LETTERS.length,1),items=Array.from({length:len},(_,i)=>LETTERS[(offset+i*5)%LETTERS.length]);
        const pos=1+v(len,2),fromRight=s%2===1,index=fromRight?len-pos:pos-1;
        if(s%4<2){const others=[...new Set([items[(index+1)%len],items[(index+len-1)%len],items[len-1-index]])].filter(x=>x!==items[index]);
          choice(`Which letter is ${ordinal(pos)} from the ${fromRight?'right':'left'}?`,items[index],[items[index],...others].slice(0,4),{kind:'ordinal-row',items,from:fromRight?'right':'left'},`Count from the ${fromRight?'right':'left'} end: the ${ORD[pos-1]} letter is ${items[index]}.`);}
        else{const wrong=[pos+1,pos-1,len+1-pos].filter((x,i,a)=>x>=1&&x<=16&&x!==pos&&a.indexOf(x)===i);
          choice(`The letter ${items[index]} is in which place, counting from the ${fromRight?'right':'left'}?`,ordName(pos),[ordName(pos),...wrong.map(ordName)].slice(0,4),{kind:'ordinal-row',items,from:fromRight?'right':'left',mark:index},`Count from the ${fromRight?'right':'left'}: ${items[index]} is ${ordinal(pos)}, the ${ORD[pos-1]}.`);}
        break;}
      case '2a-ordinal-nth-first':{
        const n=2+v(5),right=Math.floor(s/2)%2===1,first=s%2===0,len=10;
        const colored=first?Array.from({length:n},(_,i)=>right?len-1-i:i):[right?len-n:n-1];
        const side=right?'right':'left',labels=[`the ${ordinal(n)} ball from the ${side}`,`the first ${n} balls from the ${side}`,`the ${ordinal(n)} ball from the ${right?'left':'right'}`,`the first ${n} balls from the ${right?'left':'right'}`];
        choice('Which words describe the colored balls?',first?labels[1]:labels[0],labels,{kind:'ordinal-row',items:Array(len).fill(''),balls:true,colored},first?`${n} balls are colored, starting at the ${side} end: the first ${n}.`:`Only one ball is colored. It is ${ordinal(n)} counting from the ${side}.`);
        break;}
      case '2a-ordinal-grid':{
        const grid=Array.from({length:7},(_,r)=>Array.from({length:7},(_,c)=>LETTERS[(r*5+c*3+s)%LETTERS.length]));
        const r=1+v(7),c=1+v(7,1),fromBottom=s%2===1,fromRight=Math.floor(s/2)%2===1;
        const ri=fromBottom?7-r:r-1,ci=fromRight?7-c:c-1,correct=grid[ri][ci];
        const pool=[grid[6-ri][ci],grid[ri][6-ci],grid[6-ri][6-ci],grid[(ri+1)%7][ci],grid[ri][(ci+1)%7],grid[(ri+6)%7][ci]];
        const wrong=[...new Set(pool.filter(x=>x!==correct))].slice(0,3);
        choice(`Which letter is in the ${ordinal(r)} row from the ${fromBottom?'bottom':'top'} and the ${ordinal(c)} column from the ${fromRight?'right':'left'}?`,correct,[correct,...wrong],{kind:'letter-grid',grid},`Count ${r} row${r>1?'s':''} from the ${fromBottom?'bottom':'top'}, then ${c} column${c>1?'s':''} from the ${fromRight?'right':'left'}. The letter is ${correct}.`);
        break;}
      case '2a-even-odd-pairs':{
        const n=3+v(9);
        if(s%2)choice(`Put these ${n} dots into pairs. Is ${n} even or odd?`,n%2?'odd':'even',['even','odd'],{kind:'pairs',count:n},n%2?`One dot has no partner, so ${n} is odd.`:`Every dot has a partner, so ${n} is even.`);
        else numeric(`Share ${n} blocks equally between 2 children. How many blocks are left over?`,n%2,{kind:'pairs',count:n},n%2?`Each child gets ${(n-1)/2}, and 1 block is left over.`:`Each child gets ${n/2}, and none are left over.`);
        break;}
      case '2a-even-odd-rule':{
        const k=s%3;
        if(k===0){const n=11+v(7);choice(`Put these ${n} dots into pairs. Is ${n} even or odd?`,n%2?'odd':'even',['even','odd'],{kind:'pairs',count:n},n%2?`One dot is left without a partner, so ${n} is odd.`:`All dots have partners, so ${n} is even.`);}
        else if(k===1){const n=10+v(90,1);choice(`Is ${n} even or odd?`,n%2?'odd':'even',['even','odd'],null,`Look at the last digit. Even numbers end in 0, 2, 4, 6, or 8. ${n} ends in ${n%10}.`);}
        else{const tens=1+v(9),even=10*tens+2*v(5,1),odds=[1,3,5].map(d=>10*((tens+d)%9+1)+(2*v(5,d)+1));choice('Which number is even?',String(even),[String(even),...odds.map(String)],null,`An even number ends in 0, 2, 4, 6, or 8. ${even} ends in ${even%10}.`);}
        break;}
      case '2a-doubles':{
        const k=s%3,n=k===0?1+v(15):k===1?10*(1+v(5)):10*(1+v(4))+1+v(4,1);
        numeric(`Double ${n}: ${n} + ${n} = ?`,2*n,k===1?{kind:'base-ten',tens:n/10,ones:0,add:{tens:n/10,ones:0}}:null,`Doubling means adding the same number twice: ${n} + ${n} = ${2*n}.`);add(n,n);break;}
      case '2a-share-even':{
        const k=s%3;
        if(k===0){const t=2*(2+v(9));numeric(`Share ${t} cards equally between 2 friends. How many cards does each friend get?`,t/2,{kind:'pairs',count:t},`${t/2} + ${t/2} = ${t}, so each friend gets ${t/2}.`);}
        else if(k===1){const a=2+v(8),b=a%2?1+2*v(4,1):2+2*v(4,1),t=a+b;numeric(`${name} has ${a} shells and ${other} has ${b}. They put them together and share them equally. How many shells does each get?`,t/2,null,`Together: ${a} + ${b} = ${t}. Half of ${t} is ${t/2}, because ${t/2} + ${t/2} = ${t}.`);}
        else{const n=5+v(14);choice(`Can ${n} apples be shared equally by 2 children with none left over?`,n%2?'No':'Yes',['Yes','No'],{kind:'pairs',count:n},n%2?`${n} is odd, so one apple is left over.`:`${n} is even: each child gets ${n/2}.`);}
        break;}
      case '2a-double-inverse':{
        const t=2*(3+v(13));
        if(s%2)numeric(`What number doubled makes ${t}?`,t/2,null,`${t/2} + ${t/2} = ${t}, so ${t/2} doubled is ${t}.`);
        else numeric(`${t} stickers are shared equally by 2 children. How many stickers does each child get?`,t/2,null,`Find the number that doubles to ${t}: ${t/2} + ${t/2} = ${t}.`);
        break;}
      case '2a-halves-shapes-sets':{
        const k=s%4;
        if(k===0){const equal=Math.floor(s/4)%2===0,shape=['rectangle','square','circle'][Math.floor(s/8)%3];choice('Is this shape cut into two equal halves?',equal?'Yes':'No',['Yes','No'],{kind:'halves-shape',shape,equal},equal?'The two parts are the same size, so each part is one half.':'The parts are different sizes, so they are not halves.');}
        else if(k===1){const n=pick([10,24,40,8,12,20],1);numeric(`What is half of ${n}?`,n/2,{kind:'base-ten',tens:Math.floor(n/10),ones:n%10},`Split the set into two equal groups: ${n/2} and ${n/2}.`);}
        else if(k===2){const n=pick([10,24,40,6,14,20],2);numeric(`1/2 of ${n} = ?`,n/2,{kind:'base-ten',tens:Math.floor(n/10),ones:n%10},`1/2 means one of two equal parts. ${n/2} + ${n/2} = ${n}.`);}
        else{const n=pick([10,24,40,12],3);numeric(`1/2 of ${n} is ${n/2}. What is ${n/2} + ${n/2}?`,n,null,`Two halves make the whole: ${n/2} + ${n/2} = ${n}.`);add(n/2,n/2);}
        break;}
      case '2a-halves-numbers':case '2a-halves-review':{
        // Through p25: even 12-30, whole tens to 100, and grouped halves of
        // two-digit numbers with even tens and ones (48, 80). p32 reviews the
        // same base-ten halving with 50, 88, 46 and composed stories.
        const review=skill.id==='2a-halves-review',k=s%4;
        if(k===0){const n=review?[50,88,46,64,90,28][Math.floor(s/4)%6]:[12+2*v(10,1),10*(1+v(10,2)),[48,80,64,26,42,86,68,24,40,62,84,28][Math.floor(s/12)%12]][Math.floor(s/4)%3];
          numeric(`What is half of ${n}?`,n/2,{kind:'base-ten',tens:Math.floor(n/10),ones:n%10},`Split the tens and ones into two equal groups: half of ${n} is ${n/2}, because ${n/2} + ${n/2} = ${n}.`);}
        else if(k===1){const n=review?pick([25,44,23,15],2):pick([15,25,35,20,40],2);numeric(`Double ${n}: ${n} + ${n} = ?`,2*n,null,`${n} + ${n} = ${2*n}.`);add(n,n);}
        else if(k===2){const h=review?pick([23,44,25,32],3):pick([7,9,11,13,14,15],3);numeric(`Half of a number is ${h}. What is the number?`,2*h,null,`The number is double the half: ${h} + ${h} = ${2*h}.`);add(h,h);}
        else{const d=review?pick([12,14,21,23],4):pick([6,8,10,12],4),more=1+v(5,5);numeric(`${name} has double ${d} marbles. Then ${name} gets ${more} more. How many marbles does ${name} have now?`,2*d+more,null,`Double ${d} is ${2*d}. Then ${2*d} + ${more} = ${2*d+more}.`);math={op:'add',operands:[d,d,more],answerRow:null};}
        break;}
      case '2a-add-whole-tens':{
        const tens=10*(1+v(6)),n=10*(1+v(9-tens/10,1))+1+v(9,2),first=s%2?tens:n,second=s%2?n:tens;
        numeric(`${first} + ${second} = ?`,first+second,{kind:'base-ten',tens:Math.floor(first/10),ones:first%10,add:{tens:Math.floor(second/10),ones:second%10}},`Add the tens: the ones digit stays ${n%10}. ${first} + ${second} = ${first+second}.`);add(first,second);break;}
      case '2a-tens-stories':{
        const k=s%4;
        if(k===0){const a=10*(1+v(5)),b=10*(1+v(4,1))+1+v(9,2);numeric(`A ball costs $${a} and a kite costs $${b}. How much do both cost?`,a+b,null,`Add the prices: $${a} + $${b} = $${a+b}.`);add(a,b);}
        else if(k===1){const have=10*(5+v(5)),spend=10*(1+v(4,1));numeric(`You have $${have}. You spend $${spend}. How much money is left?`,have-spend,null,`Take away whole tens: $${have} − $${spend} = $${have-spend}.`);sub(have,spend);}
        else if(k===2){const n=5*(1+v(10,1));numeric(`Double ${n}: ${n} + ${n} = ?`,2*n,null,`${n} + ${n} = ${2*n}.`);add(n,n);}
        else{const t=20*(1+v(5,2));numeric(`${name} and ${other} share $${t} equally. How much does each get?`,t/2,null,`Half of $${t} is $${t/2}, because $${t/2} + $${t/2} = $${t}.`);}
        break;}
      case '2a-missing-tens':{
        const t=1+v(6),o=v(10),a=10*t+o;
        if(s%2){const m=10*(1+v(9-t,1));numeric(`${a} + ? = ${a+m}`,m,{kind:'base-ten',tens:t,ones:o},`The ones digit stays ${o}. ${a+m} has ${m/10} more tens, so add ${m}.`);add(a,m,1);}
        else{const m=10*(1+v(9-t,1)),parity=o%2?'odd':'even';choice(`${a} is ${parity}. Is ${a} + ${m} even or odd?`,parity,['even','odd'],null,`Adding whole tens leaves the ones digit ${o}, so ${a+m} is still ${parity}.`);}
        break;}
      case '2a-subtract-whole-tens':{
        if(s%2){const a=10*(3+v(7))+v(10),m=10*(1+v(Math.floor(a/10)-1,1));numeric(`${a} − ${m} = ?`,a-m,{kind:'base-ten',tens:Math.floor(a/10),ones:a%10},`Take away ${m/10} ten${m>10?'s':''}. The ones digit stays ${a%10}: ${a} − ${m} = ${a-m}.`);sub(a,m);}
        else{const start=40+v(60,1),terms=[0,1,2,3].map(i=>start-10*i),shown=[...terms.slice(0,3),null];numeric(`Count back by 10s: ${terms.slice(0,3).join(', ')}, ? What comes next?`,terms[3],{kind:'sequence',terms:shown},`Each step is 10 less: ${terms[2]} − 10 = ${terms[3]}.`,10);}
        break;}
      case '2a-tens-patterns-stories':{
        const k=s%3;
        if(k===0){const step=[10,20][Math.floor(s/6)%2],dir=Math.floor(s/3)%2?-1:1,start=dir>0?5+v(30,3):99-v(30,3),terms=[0,1,2,3].map(i=>start+dir*step*i);
          numeric(`Continue the pattern: ${terms.slice(0,3).join(', ')}, ?`,terms[3],{kind:'sequence',terms:[...terms.slice(0,3),null]},`Each number is ${step} ${dir>0?'more':'less'}. ${terms[2]} ${dir>0?'+':'−'} ${step} = ${terms[3]}.`,step);}
        else if(k===1){const a=10*(1+v(3)),b=10*(1+v(3,1)),c=1+v(19,2);numeric(`A shelf has ${a} red books, ${b} blue books, and ${c} green books. How many books are on the shelf?`,a+b+c,null,`Add the whole tens first: ${a} + ${b} = ${a+b}. Then ${a+b} + ${c} = ${a+b+c}.`);math={op:'add',operands:[a,b,c],answerRow:null};}
        else{const price=10*(1+v(3,3)),have=3*price+10*(1+v(Math.max(1,(100-3*price)/10),4));numeric(`Three games cost $${price} each. You have $${have}. How much money is left after you buy all three?`,have-3*price,null,`Three games cost $${price} + $${price} + $${price} = $${3*price}. Then $${have} − $${3*price} = $${have-3*price}.`);}
        break;}
      case '2a-chapter-review':{
        const target=C.CATALOG.find(k=>k.id===REVIEWED[s%REVIEWED.length]);
        const q=question(target,Math.floor(s/REVIEWED.length));
        ({prompt,answer,visual,help,math}=q);options=q.choices;reviewOf=target.id;break;}
      default:
        // #223: Chapters 2-3 live in their own module and do their own choices.
        if(skill.chapter>1&&typeof PLACE_BOOK_2A_CH23!=='undefined')return PLACE_BOOK_2A_CH23.question(skill,serial);
        throw new RangeError(`Unknown Grade 2-A skill ${skill.id}`);
    }
    options=[...new Set([String(answer),...options.map(String)])].slice(0,4);
    const rotate=s%options.length;options=[...options.slice(rotate),...options.slice(0,rotate)];
    return {skillId:skill.id,page:skill.page,lesson:skill.lesson,prompt,answer:String(answer),choices:options,visual,help,math,...(reviewOf?{reviewOf}:{})};
  }
  function explain(s) {
    const q=s&&s.done===true?current(s):null;
    if(!q)return null;
    const shown=q.math&&typeof PLACE_ARITHMETIC!=='undefined'?PLACE_ARITHMETIC.explainOperation(q.math.op,q.math.operands,q.math.answerRow):null;
    if(shown) {
      const [first,...rest]=q.math.operands,total=q.math.op==='add'?rest.reduce((x,y)=>x+y,first):rest.reduce((x,y)=>x-y,first);
      return {...shown,equation:`${q.math.operands.join(q.math.op==='add'?' + ':' − ')} = ${total}`};
    }
    return {kind:'text',heading:'Worked answer',lines:[q.help,`Answer: ${q.answer}.`]};
  }
  // ---- Run state (#223) ----
  // One store, two inner schemas. Schema 1 (released #219) is read only: its
  // pending question is rebuilt from the frozen Chapter 1 catalog and order
  // (a missing ceiling means page 32). Every write is schema 2, which a
  // schema-1 reader rejects as unknown, leaving the bytes alone. Reading never
  // writes. Schema 2 keeps a stable pointer to the pending question (skill,
  // its printed page, and the generator occurrence), so the exact question is
  // regenerated rather than stored, plus a bounded list of retained retries.
  //
  // Eligibility is frozen per run: completed page x catalog ceiling x topic x
  // each skill's own page. Saved scores and history never unlock a page. Only
  // create() and boundary() (an explicit new session, confirmed page change,
  // or topic change) start a new frame; answer/next/reload keep it.
  const LEGACY_LESSONS=[0,...C.LESSONS.filter(l=>l.id<=C.LEGACY_LESSON_LAST).map(l=>l.id)];
  const LESSON_IDS=[0,...C.LESSONS.map(l=>l.id)];
  const RETAIN_LIMIT=32;
  const byId=id=>C.CATALOG.find(k=>k.id===id)||null;
  const skills=s=>C.available(s.page,s.catalogThrough).filter(k=>!s.lesson||k.lesson===s.lesson);
  const same=(a,b)=>a.skillId===b.skillId&&a.page===b.page&&a.occurrence===b.occurrence;
  const eligible=(s,p)=>skills(s).some(k=>k.id===p.skillId&&k.page===p.page);
  const regenerate=p=>{const k=byId(p.skillId);return k&&k.page===p.page?question(k,p.occurrence):null;};
  const validMisses=(q,misses,min=0)=>Array.isArray(misses)&&misses.length>=min&&misses.length<=3&&misses.every(v=>typeof v==='string'&&v!==q.answer&&q.choices.includes(v))&&new Set(misses).size===misses.length;
  // Fresh work: an eligible retained retry first (oldest first), else the next
  // family in the run's order. Each family's own occurrence count picks its
  // variant, so every ordinary variant is reached in any run.
  function select(s){
    s.active=null;s.misses=[];s.done=false;
    const i=s.retained.findIndex(p=>eligible(s,p));
    if(i>=0){const [p]=s.retained.splice(i,1);s.active={skillId:p.skillId,page:p.page,occurrence:p.occurrence};s.misses=[...p.misses];return;}
    const all=skills(s);if(!all.length)return;
    const k=all[s.cursor%all.length];s.active={skillId:k.id,page:k.page,occurrence:Math.floor(s.cursor/all.length)};s.cursor++;
  }
  const blank=(page,lesson,through)=>({schemaVersion:2,worktext:C.BOOK,edition:C.EDITION,catalogThrough:through,page,lesson,cursor:0,completed:0,firstTry:0,yards:0,active:null,misses:[],done:false,history:[],retained:[]});
  const create=(page,lesson=0)=>{const s=blank(page,lesson,C.CATALOG_THROUGH);select(s);return s;};
  const current=s=>s&&s.active?regenerate(s.active):null;
  // An explicit boundary: the new page/topic and the full catalog apply now.
  // A still-eligible unfinished question stays exactly as it was (misses and
  // help included). A locked one with misses is retained, hidden, unrewarded,
  // and never deleted; a locked untouched one simply is not shown. History is
  // never pruned by page.
  function boundary(s,page,lesson=s.lesson){
    if(!C.validPage(page)||!LESSON_IDS.includes(lesson))return false;
    const held=s.active&&!s.done?{...s.active,misses:[...s.misses]}:null;
    s.catalogThrough=C.CATALOG_THROUGH;s.page=page;s.lesson=lesson;
    if(held&&eligible(s,held))return true;
    if(held&&held.misses.length&&!s.retained.some(p=>same(p,held)))s.retained.push(held);
    select(s);return true;
  }
  // Retaining beyond the bound never evicts a saved retry; the page keeps the
  // last durable record and this visit stays in memory instead.
  const overCapacity=s=>s.retained.length>RETAIN_LIMIT;
  const counters=s=>['completed','firstTry','yards'].every(k=>Number.isSafeInteger(s[k])&&s[k]>=0&&s[k]<1e9)&&s.firstTry<=s.completed&&s.yards<=s.completed*5;
  const historyOk=(s,through)=>Array.isArray(s.history)&&s.history.length<=100&&!s.history.some(r=>!r||!C.CATALOG.some(k=>k.id===r.skillId&&k.page===r.page&&k.page<=through)||!Number.isInteger(r.serial)||r.serial<1||r.serial>s.completed||!Number.isInteger(r.misses)||r.misses<0||r.misses>3);
  const copyHistory=h=>h.map(r=>({skillId:r.skillId,page:r.page,serial:r.serial,misses:r.misses}));
  function normalizeV1(s){
    const through=C.LEGACY_CATALOG_THROUGH;
    if(s.worktext!==C.BOOK||s.edition!==C.EDITION||!C.validPage(s.page)||!LEGACY_LESSONS.includes(s.lesson)||!Number.isSafeInteger(s.serial)||s.serial<0||s.serial>=1e9||!counters(s)||s.completed!==s.serial+Number(s.done)||!Array.isArray(s.misses)||s.misses.length>3||!s.misses.every(v=>typeof v==='string')||typeof s.done!=='boolean'||!historyOk(s,through))return null;
    const out=blank(s.page,s.lesson,through);
    Object.assign(out,{completed:s.completed,firstTry:s.firstTry,yards:s.yards,history:copyHistory(s.history),cursor:s.serial});
    const all=skills(out);
    if(all.length){const k=all[s.serial%all.length];out.active={skillId:k.id,page:k.page,occurrence:Math.floor(s.serial/all.length)};out.cursor=s.serial+1;
      const q=current(out);if(s.misses.some(v=>v===q.answer||!q.choices.includes(v)))return null;out.misses=[...s.misses];out.done=s.done;}
    // No question in this frame (as in the released reader): nothing pending.
    else out.cursor=s.serial+Number(s.done);
    return out;
  }
  const pointerOk=(p,through)=>p&&typeof p.skillId==='string'&&Number.isSafeInteger(p.occurrence)&&p.occurrence>=0&&p.occurrence<1e9&&Number.isInteger(p.page)&&p.page<=through&&!!regenerate(p);
  function normalizeV2(s){
    const through=s.catalogThrough;
    if(s.worktext!==C.BOOK||s.edition!==C.EDITION||![C.LEGACY_CATALOG_THROUGH,C.CATALOG_THROUGH].includes(through)||!C.validPage(s.page)||!(through===C.CATALOG_THROUGH?LESSON_IDS:LEGACY_LESSONS).includes(s.lesson)
      ||!Number.isSafeInteger(s.cursor)||s.cursor<0||s.cursor>=1e9||!counters(s)||typeof s.done!=='boolean'||!historyOk(s,through)||!Array.isArray(s.retained)||s.retained.length>RETAIN_LIMIT)return null;
    const out=blank(s.page,s.lesson,through);
    Object.assign(out,{cursor:s.cursor,completed:s.completed,firstTry:s.firstTry,yards:s.yards,history:copyHistory(s.history)});
    if(s.active===null){if(s.done||!Array.isArray(s.misses)||s.misses.length)return null;}
    else{if(!pointerOk(s.active,through)||!eligible(out,s.active))return null;
      const q=regenerate(s.active);if(!validMisses(q,s.misses))return null;
      out.active={skillId:s.active.skillId,page:s.active.page,occurrence:s.active.occurrence};out.misses=[...s.misses];out.done=s.done;}
    for(const p of s.retained){
      if(!pointerOk(p,through)||!validMisses(regenerate(p),p.misses,1)||out.retained.some(x=>same(x,p))||(out.active&&same(out.active,p)))return null;
      out.retained.push({skillId:p.skillId,page:p.page,occurrence:p.occurrence,misses:[...p.misses]});
    }
    return out;
  }
  function normalize(s){
    if(!s||typeof s!=='object')return null;
    if(s.schemaVersion===1)return normalizeV1(s);
    if(s.schemaVersion===2)return normalizeV2(s);
    return null;
  }
  // Counting a completed answer happens here only, once per pending question.
  function answer(s,value){const q=current(s);if(!q||s.done||!q.choices.includes(value)||s.misses.includes(value)||s.completed>=1e8)return false;if(value===q.answer){s.done=true;s.completed++;if(!s.misses.length)s.firstTry++;s.yards+=s.misses.length?1:5;s.history.push({skillId:q.skillId,page:q.page,serial:s.completed,misses:s.misses.length});s.history=s.history.slice(-100);}else{s.misses.push(value);s.yards-=Math.min(5,s.yards%100);}return true;}
  // Selecting the next question; never changes the page, topic, or ceiling.
  function next(s){if(!s.done)return false;select(s);return true;}
  return Object.freeze({question,create,normalize,current,answer,next,boundary,overCapacity,skills,explain,REVIEWED,RETAIN_LIMIT});
})();
globalThis.PLACE_BOOK_2A=PLACE_BOOK_2A;
