// Grade 2-A Chapters 2-3 book practice (issue #223). Original generators for
// Math Mammoth Grade 2-A (rev-2025-09-06) printed pages 37-54 (clock and
// calendar) and 59-97 (addition and subtraction facts within 0-18). No
// workbook wording, story, number sequence, figure, or exercise is copied.
// Routines, people, events, and dates are fictional and stated in the prompt;
// nothing reads the device clock or date. Draw/mark/color tasks are adapted
// as choose/select activities and claim no drawing assessment.
//
// Each catalog row (see shared/grade2a-curriculum.js) has a fixed list of
// variants; a row's own occurrence count picks the variant, so every variant
// of a row is reached within that many occurrences in any run.
const PLACE_BOOK_2A_CH23=(()=>{
  'use strict';
  const NAMES=['Kai','Rosa','Theo','Lena','Jun','Ivy','Zane','Mara'];
  const DAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const ABBR=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const YEARS=[2026,2027,2028,2029];
  const EVENTS=['Kite Day','Book Swap','Garden Day','Robot Show','Music Night','Bake Sale','Puppet Show','Chess Meet'];
  const ORD=['first','second','third','fourth','fifth','sixth','seventh','eighth','ninth','tenth','eleventh','twelfth','thirteenth','fourteenth','fifteenth','sixteenth','seventeenth','eighteenth','nineteenth','twentieth','twenty-first','twenty-second','twenty-third','twenty-fourth','twenty-fifth','twenty-sixth','twenty-seventh','twenty-eighth'];
  // Gregorian calendar arithmetic (fixed fixtures only).
  const leap=y=>y%4===0&&(y%100!==0||y%400===0);
  const monthDays=(y,m)=>m===1?(leap(y)?29:28):[31,0,31,30,31,30,31,31,30,31,30,31][m];
  const weekday=(y,m,d)=>{const t=[0,3,2,5,0,3,5,1,4,6,2,4],yy=m<2?y-1:y;return (yy+Math.floor(yy/4)-Math.floor(yy/100)+Math.floor(yy/400)+t[m]+d)%7;};
  const shift=(date,n)=>{let {y,m,d}=date;d+=n;while(d>monthDays(y,m)){d-=monthDays(y,m);m++;if(m>11){m=0;y++;}}while(d<1){m--;if(m<0){m=11;y--;}d+=monthDays(y,m);}return {y,m,d};};
  const md=x=>`${MONTHS[x.m]} ${x.d}`,mdy=x=>`${md(x)}, ${x.y}`;
  // Twelve-hour clock times in five-minute steps.
  const nh=h=>h%12+1,ph=h=>h===1?12:h-1;
  const tm=(h,m)=>`${h}:${String(m).padStart(2,'0')}`;
  const later=(h,m,n)=>{const t=(((h%12)*60+m+n)%720+720)%720,H=Math.floor(t/60);return tm(H||12,t%60);};
  const mins=n=>`${n} minute${n===1?'':'s'}`;
  const past=(h,m)=>m===0?`${h} o'clock`:m===30?`half past ${h}`:`${mins(m)} past ${h}`;
  const till=(h,m)=>`${mins(60-m)} till ${nh(h)}`;
  const words=(h,m)=>m<=30?past(h,m):till(h,m);
  // Wrong word forms that never name the same time.
  const wordOptions=(h,m)=>m===0?[`half past ${h}`,`${nh(h)} o'clock`,`${ph(h)} o'clock`]
    :m===30?[`half past ${nh(h)}`,`${h} o'clock`,`30 minutes till ${h}`]
    :m<30?[`${mins(m)} past ${nh(h)}`,`${mins(m)} till ${h}`,`${mins(60-m)} past ${h}`]
    :[`${mins(60-m)} till ${h}`,`${mins(60-m)} past ${nh(h)}`,`${mins(m-30)} till ${nh(h)}`];
  const clock=(hour,minute,extra={})=>({kind:'clock',hour,minute,...extra});
  const hr=H=>H===0||H===24?'12 midnight':H===12?'12 noon':`${H%12||12} ${H<12?'AM':'PM'}`;
  // The 20 unordered single-digit pairs whose sum crosses ten (11-18).
  const FACTS20=[];for(let a=2;a<=9;a++)for(let b=a;b<=9;b++)if(a+b>10)FACTS20.push([b,a]);
  const near=(v,...prefer)=>[...prefer,v+1,v-1,v+2,v-2,v+10,v-10].filter(x=>Number.isInteger(x)&&x>=0&&x!==v);
  const dayNear=d=>[DAYS[(d+1)%7],DAYS[(d+6)%7],DAYS[(d+2)%7]];
  const evenOdd=n=>n%2?'odd':'even';
  const hash=(a,b)=>{let x=Math.imul((a|0)+0x9e37,0x85ebca6b)^Math.imul((b|0)+0x51ed,0xc2b2ae35);x^=x>>>16;x=Math.imul(x,0x7feb352d);x^=x>>>15;x=Math.imul(x,0x846ca68b);x^=x>>>16;return x>>>0;};
  const V={};
  const ask=(prompt,answer,options,help,visual=null,data=null)=>({prompt,answer,options,help,visual,data});
  const calendar=(year,month,marks=[])=>({kind:'calendar',year,month,marks});
  const datePick=(r,{end=false,start=false,force=false}={})=>{
    const y=YEARS[r(YEARS.length,31)];let m=r(12,32);
    if(force)m=end?11:0;
    const n=monthDays(y,m),d=end?n-r(10,33):start?1+r(10,33):1+r(n,33);
    return {y,m,d};
  };

  // ---------- Chapter 2: Clock (printed pages 37-54) ----------
  V['2a-clock-whole-half']=[
    ['read',({r,t})=>{const h=t%6===0?12:1+r(12),half=r(2,1)===1,m=half?30:0;
      return ask('What time does the clock show?',past(h,m),half?[`half past ${nh(h)}`,`${h} o'clock`,`${nh(h)} o'clock`]:[`half past ${h}`,`${nh(h)} o'clock`,`${ph(h)} o'clock`],
        half?`The long minute hand points to 6, so it is half past. The short hour hand is halfway from ${h} to ${nh(h)}: half past ${h}.`:`The long minute hand points to 12, so it is o'clock. The short hour hand points to ${h}.`,clock(h,m),{h,m});}],
    ['digital',({r})=>{const h=1+r(12),half=r(2,1)===1,m=half?30:0;
      return ask(`Which digital time means ${past(h,m)}?`,tm(h,m),half?[tm(nh(h),30),tm(h,0),tm(h,3)]:[tm(h,30),tm(nh(h),0),tm(ph(h),0)],
        half?`"Half past" means 30 minutes after the hour, so half past ${h} is ${tm(h,30)}.`:`"O'clock" means 0 minutes after the hour, so ${h} o'clock is ${tm(h,0)}.`,null,{h,m});}],
    ['plus-hour',({r,t})=>{const h=t%4===0?12:1+r(12),m=30*r(2,1);
      return ask('The clock shows the time now. What time will it be 1 hour later?',later(h,m,60),[tm(h,m),later(h,m,30),later(h,m,120)],
        `One hour later the hour hand moves on to the next number${h===12?' (after 12 comes 1)':''}: ${tm(h,m)} becomes ${later(h,m,60)}.`,clock(h,m),{h,m,add:60});}],
    ['plus-half',({r,t})=>{const h=t%4===1?12:1+r(12),m=30*r(2,1);
      return ask('The clock shows the time now. What time will it be 30 minutes later?',later(h,m,30),[later(h,m,60),tm(h,m),later(h,m,90)],
        `30 minutes is half an hour. The minute hand moves halfway around: ${tm(h,m)} becomes ${later(h,m,30)}.`,clock(h,m),{h,m,add:30});}],
  ];
  V['2a-minutes-hand']=[
    ['numeral-to-minutes',({r})=>{const n=1+r(11);
      return ask(`The minute hand moved from 12 to ${n}. How many minutes passed?`,5*n,near(5*n,n,5*n+5,5*n-5),
        `Count by fives for each number the minute hand passes: ${Array.from({length:n},(_,i)=>5*(i+1)).join(', ')}.`,clock(null,5*n));}],
    ['minutes-to-numeral',({r})=>{const n=1+r(11);
      return ask(`The minute hand starts at 12. After ${5*n} minutes, which number does it point to?`,n,[n+1,n-1,n+2,n-2].filter(x=>x>=1&&x<=12),
        `Each number on the clock is 5 more minutes. Count by fives until you reach ${5*n}.`,clock(null,null));}],
    ['facts',({r})=>{const [p,a,o,h]=[
      ['How many minutes are in one hour?',60,[30,100,12],'The minute hand goes all the way around the clock in one hour: 60 minutes.'],
      ['How many minutes are in half an hour?',30,[60,50,15],'Half an hour is half of 60 minutes: 30 minutes.'],
      ['The minute hand goes all the way around the clock once. How many minutes pass?',60,[12,30,100],'One full turn of the minute hand is 60 minutes.'],
      ['The minute hand moves from 12 to 6. How many minutes pass?',30,[6,60,25],'From 12 to 6 is half a turn: 30 minutes.']][r(4)];
      return ask(p,a,o,h);}],
  ];
  const readOptions=(h,m)=>[tm(h,m/5),tm(nh(h),m),tm(h,m+5),tm(ph(h),m)];
  V['2a-minutes-read']=[
    ['labeled',({r})=>{const h=1+r(12),m=5*r(7,1);
      return ask('What time does the clock show? The small numbers show the minutes.',tm(h,m),readOptions(h,m),
        `The short hour hand shows ${h}. The long minute hand points to ${m/5||12}; that is ${m} minutes.`,clock(h,m,{labels:true}),{h,m});}],
    ['standard',({r})=>{const h=1+r(12),m=5*r(7,1);
      return ask('What time does the clock show?',tm(h,m),readOptions(h,m),
        `The short hour hand shows ${h}. Count by fives to the long minute hand: ${m} minutes.`,clock(h,m),{h,m});}],
  ];
  const clockSet=(h,minutes,order,labels=['A','B','C'])=>({kind:'clock-set',clocks:order.map((i,k)=>({label:labels[k],hour:minutes[i][0],minute:minutes[i][1]}))});
  const PERMS=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
  V['2a-minutes-match']=[
    ['clock-match',({r})=>{const h=1+r(12),m=5*r(7,1),order=PERMS[r(6,2)];
      const times=[[h,m],[nh(h),m],[h,(m+15)%60]],label=['A','B','C'][order.indexOf(0)];
      return ask(`Which clock shows ${tm(h,m)}?`,`Clock ${label}`,['Clock A','Clock B','Clock C'],
        `For ${tm(h,m)} the hour hand is at or just past ${h}, and the minute hand points to ${m/5||12}.`,clockSet(h,times,order),{h,m});}],
    ['plus-five',({r})=>{const h=1+r(12),m=5*r(6,1);
      return ask('The clock shows the time now. What time will it be 5 minutes later?',tm(h,m+5),[tm(h,m+1),tm(h,m+10),tm(nh(h),m+5)],
        `5 minutes later the minute hand moves to the next number: ${tm(h,m)} becomes ${tm(h,m+5)}.`,clock(h,m),{h,m,add:5});}],
  ];
  V['2a-late-read']=[
    ['read-late',({r})=>{const h=1+r(12),m=35+5*r(5,1);
      return ask('What time does the clock show?',tm(h,m),[tm(nh(h),m),tm(h,m===55?50:m+5),tm(h,m-10)],
        `The minute hand points to ${m/5}: ${m} minutes. The hour hand is close to ${nh(h)} but has not reached it, so the hour is still ${h}.`,clock(h,m),{h,m});}],
    ['set-hand',({r})=>{const h=1+r(12),m=5*(1+r(11,1)),order=PERMS[r(6,2)];
      const times=[[h,m],[h,(m+20)%60],[h,(m+40)%60]],label=['A','B','C'][order.indexOf(0)];
      return ask(`Which clock has its minute hand set for ${tm(h,m)}?`,`Clock ${label}`,['Clock A','Clock B','Clock C'],
        `For ${m} minutes the minute hand points to ${m/5}, because ${m/5} fives make ${m}.`,clockSet(h,times,order),{h,m});}],
  ];
  V['2a-late-plus-five']=[
    ['rollover',({r})=>{const h=1+r(12);
      return ask('The clock shows the time now. What time will it be 5 minutes later?',tm(nh(h),0),[`${h}:60`,tm(h,0),tm(nh(h),5)],
        `After 55 minutes a new hour starts. 5 minutes after ${tm(h,55)} is ${tm(nh(h),0)}.`,clock(h,55),{h,m:55,add:5});}],
    ['late',({r})=>{const h=1+r(12),m=30+5*r(5,1);
      return ask('The clock shows the time now. What time will it be 5 minutes later?',tm(h,m+5),[tm(nh(h),m+5),tm(h,m+10),tm(h,m+1)],
        `5 minutes later the minute hand moves to the next number. The hour is still ${h}: ${tm(h,m+5)}.`,clock(h,m),{h,m,add:5});}],
  ];
  const pastOptions=(h,m)=>m===30?[`half past ${nh(h)}`,`${h} o'clock`,`30 minutes till ${h}`]:[`${mins(m)} past ${nh(h)}`,`${mins(m/5)} past ${h}`,`${mins(m)} till ${h}`];
  V['2a-past']=[
    ['clock',({r})=>{const h=1+r(12),m=5*(1+r(6,1));
      return ask('Which words tell the time on the clock?',past(h,m),pastOptions(h,m),`The minute hand points to ${m/5}: ${m} minutes after ${h} o'clock, so it is ${past(h,m)}.`,clock(h,m),{h,m});}],
    ['digital',({r})=>{const h=1+r(12),m=5*(1+r(6,1));
      return ask(`Which words mean ${tm(h,m)}?`,past(h,m),pastOptions(h,m),`${tm(h,m)} is ${m} minutes after ${h} o'clock: ${past(h,m)}.`,null,{h,m});}],
    ['plus-five',({r})=>{const h=1+r(12),m=5*r(6,1);
      return ask(`It is ${past(h,m)}. What time will it be 5 minutes later?`,past(h,m+5),[`${mins(m+5)} past ${nh(h)}`,past(h,m),`${mins(m+5)} till ${nh(h)}`],
        `5 minutes after ${past(h,m)} is ${m+5} minutes past ${h}: ${past(h,m+5)}.`,null,{h,m,add:5});}],
  ];
  const tillOptions=(h,m)=>[`${mins(60-m)} till ${h}`,`${mins(m)} till ${nh(h)}`,`${mins(60-m)} past ${nh(h)}`];
  V['2a-till']=[
    ['clock',({r})=>{const h=1+r(12),m=35+5*r(5,1);
      return ask('Which words tell the time on the clock?',till(h,m),tillOptions(h,m),`The minute hand is ${60-m} minutes before 12, and the next hour is ${nh(h)}. So it is ${till(h,m)}.`,clock(h,m),{h,m});}],
    ['digital',({r})=>{const h=1+r(12),m=35+5*r(5,1);
      return ask(`Which words mean ${tm(h,m)}?`,till(h,m),tillOptions(h,m),`${m} minutes is ${60-m} minutes before the next hour, ${nh(h)}. So ${tm(h,m)} is ${till(h,m)}.`,null,{h,m});}],
  ];
  V['2a-time-forms']=[
    ['words-to-digital',({r})=>{const h=1+r(12),m=5*r(12,1);
      const o=m===0?[tm(h,30),tm(nh(h),0),tm(ph(h),0)]:m>30?[tm(nh(h),60-m),tm(h,60-m),tm(nh(h),m)]:[tm(nh(h),m),tm(ph(h),m),tm(h,m===5?10:m-5)];
      return ask(`Which digital time means ${words(h,m)}?`,tm(h,m),o,m>30?`${mins(60-m)} till ${nh(h)} is ${m} minutes after ${h}: ${tm(h,m)}.`:`${words(h,m)} is ${m} minutes after ${h}: ${tm(h,m)}.`,null,{h,m});}],
    ['digital-to-words',({r})=>{const h=1+r(12),m=5*r(12,1);
      return ask(`Which words mean ${tm(h,m)}?`,words(h,m),wordOptions(h,m),m>30?`${m} minutes is ${60-m} minutes before ${nh(h)}: ${words(h,m)}.`:`${tm(h,m)} is ${m} minutes after ${h}: ${words(h,m)}.`,null,{h,m});}],
    ['clock-to-digital',({r})=>{const h=1+r(12),m=5*r(12,1);
      return ask('What time does the clock show, in digital form?',tm(h,m),[tm(nh(h),m),tm(h,(m+5)%60),tm(m>30?ph(h):nh(h),(m+10)%60)],
        `The minute hand shows ${m} minutes. The hour hand has passed ${h} but not ${nh(h)}, so it is ${tm(h,m)}.`,clock(h,m),{h,m});}],
    ['clock-to-words',({r})=>{const h=1+r(12),m=5*r(12,1);
      return ask('Which words tell the time on the clock?',words(h,m),wordOptions(h,m),`The clock shows ${tm(h,m)}, which we can say as ${words(h,m)}.`,clock(h,m),{h,m});}],
  ];
  // How many hours pass (pages 46-47): whole hours on a fictional day.
  const ROUTINE=[['wakes up',6,'in the morning'],['eats lunch',13,'in the afternoon'],['reads a story',20,'in the evening'],['plays outside',15,'in the afternoon'],
    ['eats breakfast',7,'in the morning'],['is fast asleep',2,'in the middle of the night'],['has dinner',18,'in the evening'],['walks to the park',10,'in the morning']];
  V['2a-hours-am-pm']=[
    ['am-pm',({pick,name})=>{const [act,H,when]=pick(ROUTINE,1),h=H%12||12;
      return ask(`In this story, ${name} ${act} at ${h} o'clock ${when}. Is that ${h} AM or ${h} PM?`,`${h} ${H<12?'AM':'PM'}`,[`${h} AM`,`${h} PM`],
        `AM hours run from midnight to noon. PM hours run from noon to midnight. ${when[0].toUpperCase()+when.slice(1)} is ${H<12?'AM':'PM'}.`,null,{H});}],
    ['noon-midnight',({r})=>{const [p,a,o,h]=[
      ['What do we call 12 o\'clock in the middle of the day?','noon',['midnight','morning'],'12 o\'clock in the middle of the day is noon, 12 PM.'],
      ['What do we call 12 o\'clock in the middle of the night?','midnight',['noon','evening'],'12 o\'clock in the middle of the night is midnight, 12 AM.'],
      ['Is 12 noon written as 12 AM or 12 PM?','12 PM',['12 AM'],'Noon starts the PM hours: 12 noon is 12 PM.'],
      ['Is 12 midnight written as 12 AM or 12 PM?','12 AM',['12 PM'],'Midnight starts the AM hours: 12 midnight is 12 AM.']][r(4)];
      return ask(p,a,o,h);}],
    ['same-half',({r})=>{const pm=r(2,1)===1,a=1+r(9),b=a+1+r(11-a,2),H1=pm?a+12:a,H2=pm?b+12:b;
      return ask(`From ${hr(H1)} to ${hr(H2)} on the same day, how many hours pass?`,b-a,near(b-a),`Count the hours from ${a} to ${b}: ${b} − ${a} = ${b-a} hours.`,{kind:'day-strip',start:H1,end:H2},{H1,H2});}],
    // Page 46: morning starts 5-11 AM, ends from 12 noon to 6 PM.
    ['across-noon',({r})=>{const H1=5+r(7),H2=12+r(7,1);
      return ask(`From ${hr(H1)} to ${hr(H2)} on the same day, how many hours pass?`,H2-H1,near(H2-H1),H2===12?`Count the hours from ${hr(H1)} to 12 noon: ${12-H1} hours.`:`From ${hr(H1)} to 12 noon is ${12-H1} hours. From noon to ${hr(H2)} is ${H2-12} hours. ${12-H1} + ${H2-12} = ${H2-H1}.`,{kind:'day-strip',start:H1,end:H2},{H1,H2});}],
    ['twelve',({r})=>{const H=1+r(11);
      return ask(`From ${hr(H)} to ${hr(H+12)} on the same day, how many hours pass?`,12,[6,24,10],`From ${hr(H)} to 12 noon is ${12-H} hours, and from noon to ${hr(H+12)} is ${H} more: 12 hours, half a day.`,{kind:'day-strip',start:H,end:H+12},{H1:H,H2:H+12});}],
  ];
  V['2a-hours-overnight']=[
    // Page 47 counts to midnight from morning, noon, or evening starts.
    ['to-midnight',({r})=>{const H=7+r(17);
      return ask(`How many hours are there from ${hr(H)} until 12 midnight?`,24-H,near(24-H,Math.abs(12-H)),H<12?`From ${hr(H)} to 12 noon is ${12-H} hours, and noon to midnight is 12 more: ${24-H} hours.`:`Count the hours from ${hr(H)} to 12 midnight: ${24-H} hours.`,{kind:'day-strip',start:H,end:24},{H1:H,H2:24});}],
    // Bedtimes from 7 PM through 12 midnight; wake-up times 5-9 AM.
    ['overnight',({r,name})=>{const H1=19+r(6),H2=5+r(5,1);
      return ask(`In this story, ${name} goes to sleep at ${hr(H1)} and wakes up at ${hr(H2)} the next morning. How many hours does ${name} sleep?`,24-H1+H2,near(24-H1+H2,H1-12-H2>0?H1-12-H2:12),
        H1===24?`From 12 midnight to ${hr(H2)} is ${H2} hours.`:`${hr(H1)} to 12 midnight is ${24-H1} hours. Midnight to ${hr(H2)} is ${H2} hours. ${24-H1} + ${H2} = ${24-H1+H2} hours.`,{kind:'day-strip',start:H1,end:H2,overnight:true},{H1,H2,overnight:true});}],
    // Page 47: solve for a bedtime from a morning wake-up time and sleep length.
    ['overnight-start',({r,name})=>{const H2=5+r(4),d=H2+r(5,1),bed=24+H2-d;
      return ask(`In this story, ${name} needs ${d} hours of sleep and wants to wake up at ${hr(H2)}. At what time should ${name} go to bed the night before?`,hr(bed),[hr(bed-1),hr(bed+1>24?bed-2:bed+1),hr(H2+d>23?(H2+d)%12+12:H2+d)],
        `Count back ${H2} hours from ${hr(H2)} to 12 midnight${d>H2?`, then ${d-H2} more hours to ${hr(bed)}`:''}. ${hr(bed)} to ${hr(H2)} is ${d} hours.`,{kind:'day-strip',start:H2,end:H2,overnight:true},{H1:bed,H2,overnight:true,d});}],
    ['two-durations',({r})=>{const s1=13+r(4),d1=1+r(3,1),s2=8+r(3,2),d2=1+r(4,3);
      return ask(`A pretend robot club meets from ${hr(s1)} to ${hr(s1+d1)} on Monday and from ${hr(s2)} to ${hr(s2+d2)} on Saturday. How many hours does it meet in all?`,d1+d2,near(d1+d2),
        `Monday: ${d1} hour${d1>1?'s':''}. Saturday: ${d2} hour${d2>1?'s':''}. ${d1} + ${d2} = ${d1+d2} hours.`);}],
    ['day-hours',({r})=>{const two=r(2)===1;
      return ask(two?'How many hours are in two whole days, counting day and night?':'How many hours are in one whole day, from midnight to the next midnight?',two?48:24,[12,24,48,36],
        'A whole day has 12 AM hours and 12 PM hours: 12 + 12 = 24. Two whole days have 24 + 24 = 48 hours.');}],
    ['start-time',({r})=>{const end=13+r(8),d=1+r(4,1),start=end-d;
      return ask(`A pretend puppet show ends at ${hr(end)}. It lasts ${d} hour${d>1?'s':''}. What time did it start?`,hr(start),[hr((end+d)%24),hr(start+1),hr(start-1)],
        `Count back ${d} hour${d>1?'s':''} from ${hr(end)}: it started at ${hr(start)}.`,{kind:'day-strip',start:end,end:end},{H1:start,H2:end});}],
  ];
  // Calendar (pages 48-53). Page 48's year calendar is a reference figure only.
  V['2a-weekdays']=[
    ['abbreviation',({r})=>{const d=r(7);
      return ask(`On a calendar, which day does "${ABBR[d]}" stand for?`,DAYS[d],[DAYS[(d+2)%7],DAYS[(d+1)%7],DAYS[(d+5)%7]],`"${ABBR[d]}" is short for ${DAYS[d]}.`);}],
    ['before-after',({r,t})=>{const after=t%2===0,d=t%4<2?(after?6:0):r(7);
      const a=DAYS[(d+(after?1:6))%7];
      return ask(`Which day comes right ${after?'after':'before'} ${DAYS[d]}?`,a,[DAYS[(d+(after?6:1))%7],DAYS[(d+(after?2:5))%7],DAYS[d]],
        `The days go Sunday, Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, and then Sunday again. Right ${after?'after':'before'} ${DAYS[d]} is ${a}.`);}],
    ['plus-days',({r})=>{const d=r(7),n=1+r(7,1),a=DAYS[(d+n)%7];
      return ask(`In this story, today is ${DAYS[d]}. What day of the week will it be ${n===1?'tomorrow':`in ${n} days`}?`,a,dayNear((d+n)%7),
        `Count forward ${n} day${n>1?'s':''} from ${DAYS[d]}: ${Array.from({length:n},(_,i)=>DAYS[(d+i+1)%7]).join(', ')}.`,null,{d,n});}],
    ['calendar',({r})=>{const x=datePick(r),w=weekday(x.y,x.m,x.d);
      return ask(`Use the practice calendar. What day of the week is ${mdy(x)}?`,DAYS[w],dayNear(w),`Find ${x.d} in the calendar, then look up to the top of its column: ${DAYS[w]}.`,calendar(x.y,x.m),{date:x});}],
  ];
  V['2a-months']=[
    ['length',({r})=>{const m=[0,2,3,4,5,6,7,8,9,10,11][r(11)];
      return ask(`How many days does ${MONTHS[m]} have?`,monthDays(2027,m),[28,29,30,31],`${MONTHS[m]} has ${monthDays(2027,m)} days. April, June, September, and November have 30 days. Every other month except February has 31.`,null,{m});}],
    ['february',({r,t})=>{const y=t%2===0?[2028,2032][r(2)]:2025+r(8,1);
      return ask(`Leap years come every four years, and 2024 was a leap year. How many days does February have in ${y}?`,leap(y)?29:28,[28,29,30,31],
        leap(y)?`Count by fours from 2024: ${y} is a leap year, so February has 29 days.`:`${y} is not a leap year (2024, 2028, and 2032 are), so February has 28 days.`,null,{y});}],
    ['order',({r,t})=>{const after=t%2===0,m=t%4<2?(after?11:0):r(12),a=MONTHS[(m+(after?1:11))%12];
      return ask(`Which month comes right ${after?'after':'before'} ${MONTHS[m]}?`,a,[MONTHS[(m+(after?11:1))%12],MONTHS[(m+(after?2:10))%12],MONTHS[m]],
        `The months go January to December, then January again. Right ${after?'after':'before'} ${MONTHS[m]} is ${a}.`);}],
    ['count',({r,pick})=>{const a=r(12),n=1+r(11,1),b=(a+n)%12,event=pick(EVENTS,2);
      return ask(`In this story, it is ${MONTHS[a]}. The pretend ${event} is in ${MONTHS[b]}. How many months from now until ${MONTHS[b]}?`,n,near(n,12-n),
        `Count the months after ${MONTHS[a]}: ${Array.from({length:n},(_,i)=>MONTHS[(a+i+1)%12]).join(', ')}. That is ${n}.`,null,{a,n});}],
  ];
  const firstOf=(y,m,w)=>1+(w-weekday(y,m,1)+7)%7;
  V['2a-dates-weekly']=[
    ['recurring',({r})=>{const y=YEARS[r(4)],m=r(12,1),w=r(7,2),list=k=>{const out=[];for(let d=firstOf(y,m,k);d<=monthDays(y,m);d+=7)out.push(d);return out.join(', ');};
      return ask(`In the practice calendar, which dates are all ${DAYS[w]}s?`,list(w),[list((w+1)%7),list((w+6)%7),list((w+3)%7)],
        `Find the ${DAYS[w]} column. Its dates go up by 7: ${list(w)}.`,calendar(y,m),{y,m,w});}],
    ['next-same',({r})=>{const y=YEARS[r(4)],m=r(12,1),d=1+r(monthDays(y,m)-7,2),x={y,m,d},w=weekday(y,m,d);
      return ask(`In the practice calendar, a pretend art club meets on ${DAYS[w]}, ${md(x)}. It meets again one week later. What is the date of the next meeting?`,md({y,m,d:d+7}),[md({y,m,d:d+1}),md({y,m,d:d+6}),md({y,m,d:d+5})],
        `One week is 7 days. ${d} + 7 = ${d+7}, so the next meeting is ${md({y,m,d:d+7})}.`,calendar(y,m),{date:x,days:7});}],
    ['format',({r})=>{const m=r(12),d=1+r(28,1);
      return ask(`How do we write the ${ORD[d-1]} day of ${MONTHS[m]} as a date?`,`${MONTHS[m]} ${d}`,[`${MONTHS[(m+1)%12]} ${d}`,`${MONTHS[(m+11)%12]} ${d}`,`${MONTHS[m]} ${d+10<=28?d+10:d-10}`],
        `Write the month, then the day number: ${MONTHS[m]} ${d}.`);}],
  ];
  V['2a-dates-events']=[
    ['event-date',({r,pick})=>{const y=YEARS[r(4)],m=r(12,1),n=monthDays(y,m),d=1+r(n,2),d2=1+(d+9+r(n-12,3))%n,event=pick(EVENTS,4);
      return ask(`In the practice calendar, the star (★) marks the pretend ${event}. What is its date?`,md({y,m,d}),[md({y,m,d:d2}),md({y,m,d:d>7?d-7:d+7}),md({y,m,d:d<n?d+1:d-1})],
        `Find the star in the calendar and read the day number in that box: ${md({y,m,d})}.`,calendar(y,m,[{day:d,label:'★'},{day:d2,label:'●'}]),{date:{y,m,d}});}],
    ['event-weekday',({r,pick})=>{const x=datePick(r),w=weekday(x.y,x.m,x.d),event=pick(EVENTS,4);
      return ask(`The pretend ${event} is on ${mdy(x)}. Use the practice calendar. What day of the week is it?`,DAYS[w],dayNear(w),`Find ${x.d} in the calendar and look up to the top of its column: ${DAYS[w]}.`,calendar(x.y,x.m),{date:x});}],
    ['full-date',({r,pick})=>{const x=datePick(r),event=pick(EVENTS,4);
      return ask(`The pretend ${event} is on day ${x.d} of ${MONTHS[x.m]} in ${x.y}. Which shows its full date in month-day-year form?`,mdy(x),[`${MONTHS[x.m]} ${x.y}, ${x.d}`,`${MONTHS[(x.m+1)%12]} ${x.d}, ${x.y}`,`${MONTHS[x.m]} ${x.d}, ${x.y+1}`],
        `Write the month, the day, a comma, and then the year: ${mdy(x)}.`,null,{date:x});}],
    ['tomorrow',({r,t})=>{const x=datePick(r,{end:t%2===0,force:t%6===0}),end=t%2===0?{...x,d:monthDays(x.y,x.m)}:x,a=mdy(shift(end,1));
      return ask(`In this story, today is ${mdy(end)}. What is the date tomorrow?`,a,[`${MONTHS[end.m]} ${end.d+1}, ${end.y}`,`${MONTHS[(end.m+1)%12]} 1, ${end.y}`,mdy(shift(end,2)),mdy(shift(end,-1))],
        end.d===monthDays(end.y,end.m)?`${MONTHS[end.m]} has ${end.d} days, so tomorrow starts a new month${end.m===11?' and a new year':''}: ${a}.`:`Tomorrow is the next day number: ${a}.`,null,{date:end,days:1});}],
    ['first-weekday',({r})=>{const y=YEARS[r(4)],m=r(12,1),w=r(7,2),f=firstOf(y,m,w);
      return ask(`In the practice calendar, what is the date of the first ${DAYS[w]}?`,md({y,m,d:f}),[md({y,m,d:f+7}),md({y,m,d:f+1}),md({y,m,d:f+2})],
        `Look down the ${DAYS[w]} column. Its first date is ${f}: ${md({y,m,d:f})}.`,calendar(y,m),{y,m,w});}],
    ['last-weekday',({r})=>{const y=YEARS[r(4)],m=r(12,1),w=r(7,2),n=monthDays(y,m),l=n-(weekday(y,m,n)-w+7)%7;
      return ask(`In the practice calendar, what is the date of the last ${DAYS[w]}?`,md({y,m,d:l}),[md({y,m,d:l-7}),md({y,m,d:l-1}),md({y,m,d:l<n?l+1:l-2})],
        `Look down the ${DAYS[w]} column to its last date: ${md({y,m,d:l})}.`,calendar(y,m),{y,m,w});}],
    ['plus-days',({r,t})=>{const x=datePick(r,{end:t%2===0}),n=3+r(10,5),a=shift(x,n);
      return ask(`What date is ${n} days after ${mdy(x)}?`,mdy(a),[mdy(shift(x,n+1)),mdy(shift(x,n-1)),x.d+n>monthDays(x.y,x.m)?`${MONTHS[x.m]} ${x.d+n}, ${x.y}`:mdy(shift(x,n+7))],
        x.d+n>monthDays(x.y,x.m)?`${MONTHS[x.m]} has ${monthDays(x.y,x.m)} days. Count on ${n} days into the next month: ${mdy(a)}.`:`${x.d} + ${n} = ${x.d+n}: ${mdy(a)}.`,null,{date:x,days:n});}],
    ['plus-months',({r,t})=>{const y=YEARS[r(4)],n=1+r(6,1),m=t%2===0?12-n+r(n,2):r(12,2),wrap=m+n>=12,a=`${MONTHS[(m+n)%12]} ${y+(wrap?1:0)}`;
      return ask(`In this story, it is ${MONTHS[m]} ${y}. What month and year will it be ${n} month${n>1?'s':''} later?`,a,[`${MONTHS[(m+n)%12]} ${y+(wrap?0:1)}`,`${MONTHS[(m+n+1)%12]} ${y+(wrap?1:0)}`,`${MONTHS[(m+n+11)%12]} ${y+(m+n-1>=12?1:0)}`],
        `Count ${n} month${n>1?'s':''} after ${MONTHS[m]}${wrap?'. After December, a new year starts':''}: ${a}.`,null,{y,m,n});}],
  ];
  const weekStep=(n,label)=>({r,t})=>{const forward=n>0,x=datePick(r,{end:forward,start:!forward,force:t%4===0}),a=shift(x,n);
    return ask(`What date is ${label} ${mdy(x)}?`,mdy(a),[mdy(shift(x,n+1)),mdy(shift(x,n-1)),mdy(shift(x,forward?n+7:n-7))],
      `${Math.abs(n)===7?'One week is 7 days':'Two weeks are 14 days'}. Count ${forward?'on':'back'} ${Math.abs(n)} days from ${mdy(x)}: ${mdy(a)}.`,null,{date:x,days:n});};
  V['2a-dates-weeks']=[
    ['week-after',weekStep(7,'one week after')],
    ['two-weeks-after',weekStep(14,'two weeks after')],
    ['week-before',weekStep(-7,'one week before')],
    ['two-weeks-before',weekStep(-14,'two weeks before')],
    ['biweekly',({r,t})=>{const x=datePick(r,{end:t%2===0}),k=2+r(2,6),a=shift(x,14*(k-1));
      return ask(`A pretend chess club meets every two weeks. Its first meeting is on ${mdy(x)}. What is the date of the ${k===2?'second':'third'} meeting?`,mdy(a),[mdy(shift(x,7*(k-1))),mdy(shift(x,14*(k-1)+1)),mdy(shift(x,14*k))],
        `Every two weeks is every 14 days. ${k===2?'Add 14 days once':'Add 14 days twice'}: ${mdy(a)}.`,null,{date:x,days:14*(k-1)});}],
  ];
  V['2a-plus-ten-min']=[
    ['plus-ten',({r})=>{const h=1+r(12),m=5*r(10,1);
      return ask('The clock shows the time now. What time will it be 10 minutes later?',tm(h,m+10),[tm(h,m+1),tm(h,m+5),tm(nh(h),m+10)],
        `10 minutes is two fives, so the minute hand moves two numbers: ${tm(h,m)} becomes ${tm(h,m+10)}.`,clock(h,m),{h,m,add:10});}],
  ];
  // Page 54: find the ending time from a stated start time and a whole number of hours.
  V['2a-hours-later']=[
    ['end-time',({r,pick,name})=>{const start=7+r(4),d=2+r(5,1),end=start+d,[act]=pick([['a pretend art class'],['a pretend nature walk'],['a pretend music camp'],['a pretend science fair']],2);
      return ask(`In this story, ${name} goes to ${act} at ${hr(start)} and stays ${d} hours. At what time does it end?`,hr(end),[hr(end-1),hr(end+1),hr(start+d-12>0?start+d-12:start+d+12)],
        end>12?`From ${hr(start)} to 12 noon is ${12-start} hour${12-start===1?'':'s'}. ${d-(12-start)} more hour${d-(12-start)===1?'':'s'} after noon is ${hr(end)}.`:`Count on ${d} hours from ${hr(start)}: ${hr(end)}.`,{kind:'day-strip',start,end:null},{H1:start,H2:end,d});}],
  ];
  const REVIEWED2=['2a-clock-whole-half','2a-minutes-hand','2a-minutes-read','2a-minutes-match','2a-late-read','2a-late-plus-five','2a-past','2a-till','2a-time-forms','2a-hours-am-pm','2a-hours-overnight','2a-weekdays','2a-months','2a-dates-weekly','2a-dates-events','2a-dates-weeks'];

  // ---------- Chapter 3: facts within 0-18 (printed pages 59-97) ----------
  const twoDigit=(r,k=0)=>10*(1+r(8,k))+1+r(9,k+1);
  V['2a-nearest-ten']=[
    ['between',({r})=>{const n=twoDigit(r),lo=n-n%10,hi=lo+10;
      return ask(`Which two whole tens is ${n} between?`,`${lo} and ${hi}`,[`${lo-10} and ${lo}`,hi<100?`${hi} and ${hi+10}`:`${lo-20} and ${lo-10}`,`${lo} and ${n}`],`${n} has ${lo/10} tens and ${n%10} ones. It is more than ${lo} and less than ${hi}.`,{kind:'number-line',from:lo-10,to:Math.min(hi+10,100),marks:[n],step:10});}],
    ['nearer',({r,t})=>{const tens=10*(1+r(9)),o=t%3===0?5:1+r(9,1),n=tens+o,lo=tens,hi=tens+10,a=o<5?String(lo):o>5?String(hi):'Both are equally near';
      return ask(`Is ${n} nearer to ${lo} or to ${hi}? If it is the same distance from both, choose "Both are equally near".`,a,[String(lo),String(hi),'Both are equally near'],
        `${n} is ${o} away from ${lo} and ${10-o} away from ${hi}.${o===5?' The distances are the same.':''}`,{kind:'number-line',from:lo,to:hi,marks:[n],step:1},{n});}],
  ];
  V['2a-next-ten-review']=[
    ['to-next-ten',({r})=>{const n=twoDigit(r),next=n-n%10+10;
      return ask(`${n} + ? = ${next}`,next-n,near(next-n,n%10),`${n} has ${n%10} ones. ${10-n%10} more ones make the next ten, ${next}.`);}],
    ['helping',({r})=>{const n=twoDigit(r),o=n%10,next=n-o+10;
      return ask(`First think of the helping problem ${o} + ? = 10. Then ${n} + ? = ${next}. What is the missing number?`,10-o,near(10-o,o),`${o} + ${10-o} = 10, so ${n} + ${10-o} = ${next}.`);}],
    ['even',({r})=>{const tens=1+r(8),even=10*tens+2*r(5,1),odds=[even+1,even+3,even-1,even+5].filter(x=>x>=10&&x<=99);
      return ask('Which number is even?',String(even),odds.map(String),`An even number ends in 0, 2, 4, 6, or 8. ${even} ends in ${even%10}.`);}],
    ['inverse-double',({t})=>{const k=2+t%9;
      return ask(`? + ? = ${2*k}. Both missing numbers are the same. What is the missing number?`,k,near(k,2*k),`${k} + ${k} = ${2*k}, so the number is ${k}.`);}],
  ];
  V['2a-next-ten-plus']=[
    ['ten-then-one',({r})=>{const n=twoDigit(r),o=n%10,next=n-o+10;
      return ask(`${n} + ? = ${next+1}`,11-o,near(11-o,10-o),`First ${10-o} more makes ${next}. Then 1 more makes ${next+1}. ${10-o} + 1 = ${11-o}.`);}],
    ['whole-ten-sum',({r})=>{const n=twoDigit(r),o=n%10;
      return ask('Which sum is exactly a whole ten?',`${n} + ${10-o}`,[`${n} + ${11-o}`,`${n} + ${9-o}`,`${n+1} + ${10-o}`],`${n} needs ${10-o} more ones to make the next whole ten, ${n-o+10}.`);}],
    ['missing-middle',({r})=>{const t=1+r(8),o=1+r(7,1),b=1+r(9-o,2),a=10*t+o;
      return ask(`${a} + ? + ${b} = ${10*(t+1)}`,10-o-b,near(10-o-b),`${a} needs ${10-o} more to make ${10*(t+1)}. ${b} of them are already there, so ${10-o} − ${b} = ${10-o-b}.`);}],
    ['pair-to-100',({r})=>{const p=1+r(9);
      return ask('90 + ? + ? = 100. Which pair of numbers can fill the two blanks?',`${p} and ${10-p}`,[`${p} and ${9-p}`,`${p} and ${11-p}`,`${p+1} and ${11-p}`],`90 needs 10 more to make 100. ${p} + ${10-p} = 10.`);}],
  ];
  const makeTen=r=>{const a=6+r(4),b=11-a+r(a-1,1);return [a,b];};
  V['2a-make-ten-visual']=[
    ['frames-total',({r})=>{const [a,b]=makeTen(r);
      return ask(`${a} + ${b} = ?`,a+b,near(a+b,a+b-10),`Move ${10-a} of the ${b} to fill the first ten-frame. Then 10 + ${b-(10-a)} = ${a+b}.`,{kind:'ten-frames',a,b});}],
    ['split',({r})=>{const [a,b]=makeTen(r);
      return ask(`To add ${a} + ${b}, split ${b} into ${10-a} and what number?`,b-(10-a),near(b-(10-a),10-a),`${10-a} fills the first ten-frame. ${b} − ${10-a} = ${b-(10-a)} is left over.`,{kind:'ten-frames',a,b});}],
    ['ten-and',({r})=>{const [a,b]=makeTen(r);
      return ask(`${a} + ${b} = 10 + ?`,a+b-10,near(a+b-10,b),`Fill the ten first. ${b} − ${10-a} = ${a+b-10} are left: 10 + ${a+b-10}.`,{kind:'ten-frames',a,b});}],
  ];
  V['2a-make-ten-split']=[
    ['decompose',({r})=>{const [a,b]=makeTen(r);
      return ask(`${a} + ${b} = ${a} + ${10-a} + ?`,b-(10-a),near(b-(10-a),b),`${b} is ${10-a} and ${b-(10-a)}. ${a} + ${10-a} = 10, then 10 + ${b-(10-a)} = ${a+b}.`);}],
    ['pattern',({r})=>{const a=3+r(7),T=10+r(3,1);
      return ask(`${a} + ? = 10, ${a} + ? = 11, ${a} + ? = 12. What is the missing number in ${a} + ? = ${T}?`,T-a,near(T-a,10-a),`${a} + ${10-a} = 10. Each total is 1 more, so the missing number is 1 more too: ${T} − ${a} = ${T-a}.`);}],
    ['parity',({r})=>{const n=11+r(10);
      return ask(`Is ${n} even or odd?`,evenOdd(n),['even','odd'],`Even numbers end in 0, 2, 4, 6, or 8. ${n} ends in ${n%10}.`);}],
    ['money',({r,name})=>{const x=5+r(5),y=3+r(7,1),z=1+r(Math.min(9,x+y-1),2);
      return ask(`${name} has $${x}. ${name} earns $${y} more, then spends $${z}. How much money does ${name} have now?`,x+y-z,near(x+y-z,x+y),`First $${x} + $${y} = $${x+y}. Then $${x+y} − $${z} = $${x+y-z}.`);}],
    ['match',({r,name})=>{const x=5+r(5),y=3+r(7,1),z=1+r(Math.min(9,x+y-1),2);
      return ask(`${name} has $${x}, earns $${y}, and then spends $${z}. Which number sentence finds how much money ${name} has now?`,`$${x} + $${y} − $${z}`,[`$${x} − $${y} + $${z}`,`$${x} + $${y} + $${z}`,`$${y} − $${x} − $${z}`],
        `Earning adds and spending takes away: $${x} + $${y} − $${z}.`);}],
    // Page 62 also has two purchases in a row, two gifts in a row, and spending then finding money.
    ['money-events',({r,t,name})=>{const k=t%3,x=6+r(4),a=1+r(Math.min(5,x-1),1),b=1+r(Math.min(4,Math.max(1,x-a-1)),2);
      const [p,ans,sentence]=k===0?[`${name} has $${x}, buys a pretend toy for $${a}, and then buys a snack for $${b}.`,x-a-b,`$${x} − $${a} − $${b}`]
        :k===1?[`${name} has $${x}, finds $${a} in a pocket, and then gets $${b} as a gift.`,x+a+b,`$${x} + $${a} + $${b}`]
        :[`${name} has $${x}, spends $${a} on juice, and later finds $${b}.`,x-a+b,`$${x} − $${a} + $${b}`];
      return ask(`${p} How much money does ${name} have now?`,ans,near(ans,k===1?x-a-b:x+a+b),`${sentence} = $${ans}.`,null,{x,a,b,k});}],
  ];
  const factSet=(base,first)=>[
    ['move',({t})=>{const k=10-base,n=k+1+t%(9-k);
      return ask(`${base} + ${n} is the same as 10 + ?`,n-k,near(n-k,n),`Move ${k} from ${n} to ${base} to make 10. ${n} − ${k} = ${n-k} is left: 10 + ${n-k}.`,{kind:'ten-frames',a:base,b:n});}],
    ['fact',({t})=>{const n=first+t%(10-first);
      return ask(`${base} + ${n} = ?`,base+n,near(base+n),n<10-base?`Count on ${n} from ${base}: ${base+n}.`:n===10-base?`${base} + ${n} = 10.`:`${base} + ${10-base} = 10, and ${n-(10-base)} more makes ${base+n}.`);}],
    ['double',({t})=>{const k=2+t%9;
      return ask(`${k} + ${k} = ?`,2*k,near(2*k,2*k-1,2*k+1),`Doubling ${k} gives ${2*k}.`);}],
  ];
  const moreSet=base=>[
    ['zero-ten',({t})=>{const n=t%2?10:0,swap=Math.floor(t/2)%2===1;
      return ask(swap?`${n} + ${base} = ?`:`${base} + ${n} = ?`,base+n,near(base+n,n===0?base+1:base),n===0?`Adding 0 changes nothing: ${base}.`:`Adding 10 makes one more ten: ${base+10}.`);}],
    ['swapped',({t})=>{const n=1+t%9;
      return ask(`${n} + ${base} = ?`,n+base,near(n+base),`Change the order: ${base} + ${n} = ${base+n}.`);}],
    ['missing-second',({t})=>{const n=t%11;
      return ask(`${base} + ? = ${base+n}`,n,near(n,base+n-10>0?base+n-10:n+3),`Count up from ${base} to ${base+n}: ${n}.`);}],
    ['missing-first',({t})=>{const n=t%11;
      return ask(`? + ${base} = ${base+n}`,n,near(n,base),`Which number and ${base} make ${base+n}? ${n} + ${base} = ${base+n}.`);}],
  ];
  V['2a-add-nine']=factSet(9,1);
  V['2a-add-nine-more']=moreSet(9);
  V['2a-add-eight']=factSet(8,1);
  V['2a-add-eight-more']=[...moreSet(8),
    ['more-story',({r,name,other})=>{const n=2+r(8);
      return ask(`${name} has 8 shells. ${other} has ${n} more shells than ${name}. How many shells does ${other} have?`,8+n,near(8+n,n),`"${n} more than 8" means add: 8 + ${n} = ${8+n}.`);}],
    ['older',({r,name,other})=>{const n=3+r(7);
      return ask(`In this story, ${name} is ${8+n} years old and ${other} is 8. How many years older is ${name}?`,n,near(n,8+n),`Count up from 8 to ${8+n}: ${n} years.`);}],
    ['plus-even',({t})=>{const base=t%2?18:8,j=4+Math.floor(t/2)%4;
      return ask(`Continue the pattern: ${base} + 2 = ${base+2}, ${base} + 4 = ${base+4}, ${base} + 6 = ${base+6}. What is ${base} + ${2*j}?`,base+2*j,near(base+2*j,base+2*j-2,base+2*j+2),`Each time the number added grows by 2, the sum grows by 2: ${base} + ${2*j} = ${base+2*j}.`);}],
    ['half-pattern',({t})=>{const j=3+t%5;
      return ask(`1/2 of 0 is 0, 1/2 of 2 is 1, 1/2 of 4 is 2. What is 1/2 of ${2*j}?`,j,near(j,2*j),`Each time the number grows by 2, its half grows by 1. ${j} + ${j} = ${2*j}, so 1/2 of ${2*j} is ${j}.`);}],
  ];
  V['2a-add-seven']=[
    ['fact',({t})=>{const n=4+t%7;
      return ask(`7 + ${n} = ?`,7+n,near(7+n),n===10?'Adding 10 makes one more ten: 17.':`7 + 3 = 10, and ${n-3} more makes ${7+n}.`);}],
    ['near-double',({t})=>{const k=1+t%9;
      return ask(`${k} + ${k+1} = ?`,2*k+1,near(2*k+1,2*k,2*k+2),`${k} + ${k} = ${2*k}, and one more is ${2*k+1}.`);}],
    ['double',({t})=>{const k=2+t%9;
      return ask(`${k} + ${k} = ?`,2*k,near(2*k,2*k+1),`Doubling ${k} gives ${2*k}.`);}],
  ];
  V['2a-add-seven-more']=[...moreSet(7).slice(0,2),
    ['missing',({t})=>{const n=t%11,first=Math.floor(t/11)%2===1;
      return ask(first?`? + 7 = ${7+n}`:`7 + ? = ${7+n}`,n,near(n,7),`Count up from 7 to ${7+n}: ${n}.`);}],
    ['table',({t,r})=>{const add=7+t%3,start=1+r(4),ins=[start,start+2,start+3,start+6],hidden=r(4,4);
      const outputs=ins.map((x,i)=>i===hidden?null:x+add);
      return ask(`The table follows the rule "add ${add}". What number goes in the empty box?`,ins[hidden]+add,near(ins[hidden]+add,ins[hidden]+add-10),`The rule adds ${add}: ${ins[hidden]} + ${add} = ${ins[hidden]+add}.`,{kind:'io-table',rule:`+ ${add}`,inputs:ins,outputs});}],
  ];
  V['2a-add-six']=[
    ['fact',({t})=>{const n=t%11,swap=Math.floor(t/11)%2===1;
      return ask(swap?`${n} + 6 = ?`:`6 + ${n} = ?`,6+n,near(6+n),n<=4?`Count on ${n} from 6: ${6+n}.`:`6 + 4 = 10, and ${n-4} more makes ${6+n}.`);}],
    ['make-ten',({t})=>{const n=5+t%5;
      return ask(`6 + ${n} = 6 + 4 + ?`,n-4,near(n-4,4),`${n} is 4 and ${n-4}. 6 + 4 = 10, then 10 + ${n-4} = ${6+n}.`);}],
    ['near-double',({t})=>{const k=5+t%2,[a,b]=Math.floor(t/2)%2?[6,k===5?5:7]:[k===5?5:7,6];
      return ask(`${a} + ${b} = ?`,a+b,near(a+b),`${Math.min(a,b)} + ${Math.min(a,b)} = ${2*Math.min(a,b)}, and one more is ${a+b}.`);}],
    ['missing',({t,r})=>{const add=6+t%4,n=2+r(8),first=Math.floor(t/4)%2===1;
      return ask(first?`? + ${add} = ${add+n}`:`${add} + ? = ${add+n}`,n,near(n,add),`Count up from ${add} to ${add+n}: ${n}.`);}],
  ];
  V['2a-add-six-more']=[
    ['three-ten',({r})=>{const p=1+r(9),x=1+r(9,1);
      return ask(`${p} + ${x} + ${10-p} = ?`,10+x,near(10+x,x),`${p} + ${10-p} = 10 first, then 10 + ${x} = ${10+x}.`);}],
    ['four-ten',({r})=>{const p=1+r(9),x=1+r(5,1),y=1+r(4,2);
      return ask(`${x} + ${p} + ${y} + ${10-p} = ?`,10+x+y,near(10+x+y,x+y),`Group ${p} + ${10-p} = 10. Then 10 + ${x} + ${y} = ${10+x+y}.`);}],
    ['missing-start',({r})=>{const s=2+r(8),c=2+r(8,1);
      return ask(`Some birds sat on a fence. Then ${c} more birds came. Now there are ${s+c} birds. How many birds were there at first?`,s,near(s,c),`? + ${c} = ${s+c}. Count up from ${c} to ${s+c}: ${s}.`);}],
    ['missing-change',({r,name})=>{const s=2+r(8),c=2+r(8,1);
      return ask(`${name} had ${s} stickers. After getting some more, ${name} has ${s+c}. How many stickers did ${name} get?`,c,near(c,s),`${s} + ? = ${s+c}. Count up from ${s} to ${s+c}: ${c}.`);}],
    ['compare',({r,name,other})=>{const b=3+r(7),d=2+r(8,1);
      return ask(`${name} has ${b+d} marbles and ${other} has ${b}. How many more marbles does ${name} have?`,d,near(d,b),`${b} + ? = ${b+d}. Count up from ${b} to ${b+d}: ${d} more.`);}],
    ['multistep',({r,name})=>{const x=2+r(8),y=2+r(6,1),z=1+r(5,2);
      return ask(`${name} has ${x} cards. ${name} gets ${y} more, and then ${z} more. How many cards does ${name} have now?`,x+y+z,near(x+y+z,x+y),`${x} + ${y} = ${x+y}, then ${x+y} + ${z} = ${x+y+z}.`);}],
    // Page 70: unknown start before a known removal, known remainder (inverse by adding back).
    ['removal-start',({r})=>{const gone=2+r(8),left=2+r(8,1);
      return ask(`There were some apples in a basket. Children ate ${gone} of them. Now ${left} apples are left. How many apples were in the basket at first?`,gone+left,near(gone+left,Math.abs(left-gone)),
        `Put the eaten apples back: ${left} + ${gone} = ${gone+left}.`,null,{gone,left});}],
    // Page 70: known start and remainder; the unknown is what was spent.
    ['removal-cost',({r,name})=>{const left=2+r(8),cost=2+r(8,1),start=left+cost;
      return ask(`${name} had $${start}. ${name} bought a pretend kite, and then had $${left} left. How much did the kite cost?`,cost,near(cost,start),
        `$${left} + ? = $${start}. Count up from $${left} to $${start}: the kite cost $${cost}.`,null,{start,left});}],
    // Page 70: several known removals and a remainder; the unknown is the start.
    ['removals-start',({r,name})=>{const n=2+r(2),takes=Array.from({length:n},(_,i)=>1+r(3,2+i)),left=2+r(6,9),start=takes.reduce((a,b)=>a+b,left);
      const who=['a parent','a friend','the twins'].slice(0,n);
      return ask(`In this story, ${name} bought some pears. ${who.map((w,i)=>`${i?w:w[0].toUpperCase()+w.slice(1)} ate ${takes[i]}`).join(', ')}. Then ${left} pears were left. How many pears did ${name} buy?`,start,near(start,start-left,left),
        `Add back everything that was eaten: ${[left,...takes].join(' + ')} = ${start}.`,null,{takes,left});}],
    // Page 70: a known smaller amount and "N more" gives the larger amount.
    ['more-than',({r,name,other})=>{const a=3+r(7),d=2+r(8,1);
      return ask(`${other} solved ${a} puzzles. ${name} solved ${d} more than ${other}. How many puzzles did ${name} solve?`,a+d,near(a+d,Math.abs(a-d)),`"${d} more than ${a}" means add: ${a} + ${d} = ${a+d}.`,null,{known:a,more:d});}],
  ];
  V['2a-facts-crossing']=[
    ['fact',({t})=>{const [a,b]=FACTS20[t%20],swap=Math.floor(t/20)%2===1,[x,y]=swap?[b,a]:[a,b];
      return ask(`${x} + ${y} = ?`,x+y,near(x+y),`${Math.max(x,y)} + ${10-Math.max(x,y)} = 10, and ${Math.min(x,y)-(10-Math.max(x,y))} more makes ${x+y}.`,null,{a:x,b:y});}],
    ['pattern',({r})=>{const a=6+r(4),b0=11-a+r(a-3,1);
      return ask(`${a} + ${b0} = ${a+b0}, ${a} + ${b0+1} = ${a+b0+1}, ${a} + ${b0+2} = ?`,a+b0+2,near(a+b0+2),`Adding one more each time makes the sum one more: ${a+b0+2}.`);}],
    // Page 71: missing-number patterns (adding 10; one part up by 2 and the other
    // down by 2 with the same total; the sum up by 2 each time).
    ['pattern-missing',({t})=>{const k=t%3,j=3+Math.floor(t/3)%4;
      if(k===0){const n=6-Math.floor(t/3)%4;return ask(`9 + ? = 19, 8 + ? = 18, 7 + ? = 17. What is the missing number in ${n} + ? = ${n+10}?`,10,near(10,n),`Each time the total is 10 more than the first number, so the missing number is 10: ${n} + 10 = ${n+10}.`,null,{form:'plus-ten',n});}
      if(k===1)return ask(`1 + 16 = 17, 3 + 14 = 17, 5 + 12 = 17. What is the missing number in ? + ${16-2*j} = 17?`,1+2*j,near(1+2*j,16-2*j),`The first number goes up by 2 and the second goes down by 2: ${1+2*j} + ${16-2*j} = 17.`,null,{form:'same-total',j});
      return ask(`6 + 0 = 6, 6 + 2 = 8, 6 + 4 = 10. What is the missing number in 6 + ? = ${6+2*j}?`,2*j,near(2*j,6+2*j),`Each total is 2 more, so the missing number is 2 more each time: 6 + ${2*j} = ${6+2*j}.`,null,{form:'step-two',j});}],
  ];
  const noPair=r=>{for(let k=0;k<40;k++){const x=2+r(8,k),y=2+r(8,k+40),z=2+r(8,k+80);if(x+y!==10&&y+z!==10&&x+z!==10)return [x,y,z];}return [2,3,4];};
  V['2a-facts-table-stories']=[
    ['table',({r})=>{const rows=[5+r(3),8+r(2,1)],cols=[3+r(2,2),5+r(2,3),7+r(3,4)],i=r(2,5),j=r(3,6);
      return ask('In this addition table, each box is its row number plus its column number. What number goes in the empty box?',rows[i]+cols[j],near(rows[i]+cols[j]),`Row ${rows[i]} and column ${cols[j]}: ${rows[i]} + ${cols[j]} = ${rows[i]+cols[j]}.`,{kind:'add-table',rows,cols,hidden:[i,j]});}],
    ['inverse-story',({r,name})=>{const c=3+r(7),s=11-c+r(8,1);
      return ask(`${name} had some pens. After getting ${c} more, ${name} has ${s+c}. How many pens did ${name} have at first?`,s,near(s,c),`? + ${c} = ${s+c}. ${s+c} − ${c} = ${s}.`);}],
    ['compare-story',({r,name,other})=>{const b=3+r(7),d=11-b+r(Math.max(1,b-2),1);
      return ask(`${name} read ${b+d} pages. ${other} read ${b} pages. How many more pages did ${name} read?`,d,near(d,b),`${b} + ? = ${b+d}. Count up from ${b}: ${d} more pages.`);}],
    ['three-no-pair',({r})=>{const [x,y,z]=noPair(r);
      return ask(`${x} + ${y} + ${z} = ?`,x+y+z,near(x+y+z),`No two numbers make 10 here. Add two first: ${x} + ${y} = ${x+y}, then ${x+y} + ${z} = ${x+y+z}.`);}],
    ['four-terms',({r})=>{const p=2+r(7),x=1+r(6,1),y=2+r(5,2);
      return ask(`${p} + ${x} + ${y} + ${10-p} = ?`,10+x+y,near(10+x+y),`Find the pair that makes 10: ${p} + ${10-p}. Then 10 + ${x} + ${y} = ${10+x+y}.`);}],
    // Page 72: unknown whole group from a known part that left and a known part that stayed.
    ['removal-start',({r})=>{const gone=2+r(8),s=Math.min(4+r(11,1),18-gone),total=gone+s;
      return ask(`A flock of birds was eating seeds. ${gone} of them flew away, but ${s} stayed. How many birds were in the flock?`,total,near(total,Math.abs(s-gone)),`The flock was the birds that flew away and the birds that stayed: ${gone} + ${s} = ${total}.`,null,{gone,left:s});}],
    // Page 72: the larger amount and the difference are known; find the smaller.
    ['fewer-unknown',({r,name,other})=>{const d=2+r(8),small=2+r(9,1),big=small+d;
      return ask(`${name} has ${d} more shells than ${other}. ${name} has ${big} shells. How many shells does ${other} have?`,small,near(small,big+d),`${other} has fewer: ${big} − ${d} = ${small}.`,null,{big,d});}],
    // Page 72: the smaller amount (2-10) and the difference are known; find the larger.
    ['more-unknown',({r,name,other})=>{const small=2+r(9),d=2+r(8,1);
      return ask(`${other} ate ${small} grapes. ${name} ate ${d} more than ${other}. How many grapes did ${name} eat?`,small+d,near(small+d,Math.abs(small-d)),`${name} ate more: ${small} + ${d} = ${small+d}.`,null,{known:small,more:d});}],
  ];
  // Page 73: teens 11-18 minus a one-digit number that crosses ten.
  const crossSub=(r,k=0)=>{const a=11+r(8,k),b=a-9+r(19-a,k+1);return [a,b];};
  V['2a-subtract-to-ten']=[
    ['to-ten',({t})=>{const a=11+t%9;
      return ask(`${a} − ? = 10`,a-10,near(a-10,a),`${a} is 10 and ${a-10}. Take away the ${a-10} ones to leave 10.`,{kind:'ten-frames',a:10,b:a-10});}],
    ['split-step',({r})=>{const [a,b]=crossSub(r);
      return ask(`${a} − ${b}: first take away ${a-10} to reach 10. How many more must you take away?`,b-(a-10),near(b-(a-10),a-10),`${b} is ${a-10} and ${b-(a-10)}. After ${a} − ${a-10} = 10, take away ${b-(a-10)} more.`,{kind:'ten-frames',a:10,b:a-10});}],
    ['split-result',({r})=>{const [a,b]=crossSub(r);
      return ask(`${a} − ${b} = ?`,a-b,near(a-b,10-b),`${a} − ${a-10} = 10, then 10 − ${b-(a-10)} = ${a-b}.`,{kind:'ten-frames',a:10,b:a-10},{a,b});}],
  ];
  V['2a-subtract-to-ten-more']=[
    ['direct',({r})=>{const [a,b]=crossSub(r);
      return ask(`${a} − ${b} = ?`,a-b,near(a-b,b),`Go down to 10 first: ${a} − ${a-10} = 10. Then 10 − ${b-(a-10)} = ${a-b}.`,null,{a,b});}],
    ['twenties',({r})=>{const [a,b]=crossSub(r);
      return ask(`${a} − ${b} = ${a-b}. So ${a+10} − ${b} = ?`,a-b+10,near(a-b+10,a-b),`${a+10} is one ten more than ${a}, so the answer is one ten more: ${a-b+10}.`);}],
    ['missing-takeaway',({r})=>{const [a,b]=crossSub(r);
      return ask(`${a} − ? = ${a-b}`,b,near(b,a-10),`Take away ${a-10} to reach 10, then ${10-(a-b)} more to reach ${a-b}. ${a-10} + ${10-(a-b)} = ${b}.`);}],
  ];
  V['2a-difference-line']=[
    ['line',({r})=>{const x=r(10),y=x+2+r(Math.min(8,16-x),1);
      return ask(`On the number line, how far apart are ${x} and ${y}?`,y-x,near(y-x,y),`Count the jumps from ${x} to ${y}: ${y} − ${x} = ${y-x}.`,{kind:'number-line',from:0,to:17,marks:[x,y],step:1});}],
    ['equation',({r})=>{const x=2+r(8),y=x+3+r(8,1),[p,q]=r(2,2)?[x,y]:[y,x];
      return ask(`Which subtraction finds the difference between ${p} and ${q}?`,`${y} − ${x}`,[`${x} − ${y}`,`${y} + ${x}`,`${y} − ${x+1}`],`Take the smaller number from the bigger one: ${y} − ${x} = ${y-x}.`);}],
    ['whole-tens',({r})=>{const a=10*(2+r(8)),b=10*(1+r(a/10-1,1));
      return ask(`What is the difference between ${a} and ${b}?`,a-b,near(a-b,a+b>100?a-b+20:a+b),`${a/10} tens − ${b/10} tens = ${(a-b)/10} tens: ${a-b}.`);}],
    ['neighbors',({r,t})=>{const y=t%2===0?10*(2+r(8))+1+r(3,1):12+r(87),d=t%2===0?y%10+1+r(3,2):1+r(5,2),x=y-d;
      return ask(`What is the difference between ${x} and ${y}?`,d,near(d,y-x+10),`The numbers are close. Count up from ${x} to ${y}: ${d}.`,null,{x,y});}],
  ];
  V['2a-how-many-more']=[
    ['missing-addend',({r})=>{const a=3+r(7),d=Math.max(2,11-a)+r(10-Math.max(2,11-a),1);
      return ask(`${a} + ? = ${a+d}`,d,near(d,a),`Count up from ${a} to ${a+d}: ${d}.`);}],
    ['how-many-more',({r})=>{const a=3+r(7),d=Math.max(2,11-a)+r(10-Math.max(2,11-a),1);
      return ask(`How many more is ${a+d} than ${a}?`,d,near(d,a+d),`${a} + ? = ${a+d}. The difference is ${d}.`);}],
    ['strategy',({r,t})=>{const x=30+r(65),neighbor=t%2===0,y=neighbor?x-(2+r(3,1)):1+r(3,1);
      // Both ways give the right answer; the question is which takes fewer counting steps.
      return ask(`Both ways work to find ${x} − ${y}. Which way takes fewer counting steps?`,neighbor?`Count up from ${y} to ${x}`:`Count back ${y} from ${x}`,[neighbor?`Count back ${y} from ${x}`:`Count up from ${y} to ${x}`],
        neighbor?`Counting up from ${y} to ${x} takes only ${x-y} steps. Counting back ${y} would take ${y} steps.`:`Counting back ${y} takes only ${y} steps. Counting up from ${y} to ${x} would take ${x-y} steps.`,null,{x,y,steps:neighbor?x-y:y});}],
    ['near-count-up',({r})=>{const y=10*(3+r(7))+1+r(3,1),d=y%10+1+r(3,2),x=y-d;
      return ask(`${y} − ${x} = ? Count up from ${x}.`,d,near(d,y%10),`Count up from ${x} to ${y-y%10}, then to ${y}: ${d}.`);}],
    // Page 76: a wide difference computed by subtracting: a two-digit number minus a
    // small number with no borrowing (page 11), 100 minus a small number, or 100
    // and a whole ten (whole tens minus one digit / whole tens, pages 10 and 29).
    ['wide-difference',({r,t})=>{const k=t%3;let x,y;
      if(k===0){y=10*(2+r(8))+2+r(8,1);x=1+r(y%10,2);}else if(k===1){y=100;x=1+r(5,1);}else{y=100;x=10*(1+r(9,1));}
      const [p,q]=r(2,3)?[x,y]:[y,x];
      return ask(`What is the difference between ${p} and ${q}?`,y-x,near(y-x,y,y-x+10>100?y-x-10:y-x+10),
        k===0?`Subtract: take ${x} from the ones of ${y}: ${y} − ${x} = ${y-x}.`:k===1?`Subtract: 100 − ${x} = ${100-x}.`:`Subtract whole tens: 10 tens − ${x/10} tens = ${(100-x)/10} tens, ${100-x}.`,null,{x,y});}],
  ];
  // "Who has more, and how many more?" for two named quantities (never equal).
  // Wrong choices name the other side, or the right side with a nearby amount.
  const whoMore=(A,B,na,nb,unit,extra=[])=>{const [w,l,d]=A>B?[na,nb,A-B]:[nb,na,B-A],say=(who,n)=>`${who}, ${unit(n)} more`;
    return {answer:say(w,d),options:[say(l,d),say(w,d+1),say(w,d>1?d-1:d+2),...extra.map(([who,n])=>say(who,n))],winner:w,d};};
  const dollars=n=>`$${n}`,plainN=n=>`${n}`,hours=n=>`${n} hour${n===1?'':'s'}`;
  V['2a-compare-stories']=[
    ['compare',({r,name,other})=>{const [a,b]=crossSub(r);
      return ask(`${name} has ${a} crayons and ${other} has ${b}. How many fewer crayons does ${other} have?`,a-b,near(a-b,b),`${b} + ? = ${a}. The difference is ${a-b}.`);}],
    ['left',({r,name})=>{const [a,b]=crossSub(r);
      return ask(`There were ${a} apples. ${name} ate ${b} of them. How many apples are left?`,a-b,near(a-b,a-10),`${a} − ${b} = ${a-b}.`);}],
    ['dozen',({r,name})=>{const n=1+r(6);
      return ask(`A dozen means 12. ${name} has a dozen eggs and ${n} more. How many eggs does ${name} have?`,12+n,near(12+n,10+n),`A dozen is 12. 12 + ${n} = ${12+n}.`);}],
    // Page 77 also totals three groups where one group is a teen (11-19).
    ['three-total',({r,t,name})=>{const a=2+r(8),b=t%2?11+r(9,1):2+r(8,1),c=2+r(8,2);
      return ask(`${name} has ${a} red beads, ${b} blue beads, and ${c} green beads. How many beads are there in all?`,a+b+c,near(a+b+c),`${a} + ${b} = ${a+b}, then ${a+b} + ${c} = ${a+b+c}.`);}],
    ['both-updated',({r,name,other})=>{const b=3+r(6),d=2+r(7,1),c=2+r(5,2);
      return ask(`${name} has ${b+d} cards and ${other} has ${b}. Then each of them gets ${c} more cards. Now how many more cards does ${name} have than ${other}?`,d,near(d,d+c),`Now ${name} has ${b+d+c} and ${other} has ${b+c}. ${b+d+c} − ${b+c} = ${d}. Both got the same amount, so the difference stays ${d}.`);}],
    // Page 77: both people gain different amounts; recompute who has more and by how much.
    ['unequal-gains',({r,name,other})=>{const a=8+r(6),b=3+r(5,1);let ga=2+r(6,2),gb=2+(ga-2+1+r(7,3))%8;if(a+ga===b+gb)gb=gb===9?gb-1:gb+1;
      const A=a+ga,B=b+gb,x=whoMore(A,B,name,other,dollars,[[name,a-b]]);
      return ask(`In this story, ${name} had $${a} and ${other} had $${b}. Then ${name} earned $${ga} and ${other} earned $${gb}. Now who has more money, and how much more?`,x.answer,x.options,
        `Now ${name} has $${a} + $${ga} = $${A} and ${other} has $${b} + $${gb} = $${B}. ${x.winner} has more: $${Math.max(A,B)} − $${Math.min(A,B)} = $${x.d}.`,null,{a,b,ga,gb});}],
    // Page 77: add two times first, then compare the total with a third time.
    ['durations-compare',({r,name,other})=>{const d1=1+r(4),d2=1+r(4,1);let d3=3+r(8,2);if(d3===d1+d2)d3++;
      const x=whoMore(d1+d2,d3,name,other,hours,[[name,d1+d2]]);
      return ask(`In this story, ${name} reads for ${d1} hour${d1>1?'s':''} in the morning and ${d2} hour${d2>1?'s':''} in the evening. ${other} reads for ${d3} hours on a long train ride. Who reads more hours, and how many more?`,x.answer,x.options,
        `${name}: ${d1} + ${d2} = ${d1+d2} hours. ${other}: ${d3} hours. ${x.winner} reads more: ${Math.max(d1+d2,d3)} − ${Math.min(d1+d2,d3)} = ${x.d}.`,null,{d1,d2,d3});}],
    // Page 77: pages left in a book that ends on a whole ten (count up to the ten).
    ['pages-left',({r,name})=>{const end=10*(3+r(7)),left=2+r(8,1),at=end-left;
      return ask(`In this story, ${name} is reading a ${end}-page book and is on page ${at}. How many more pages are left to read?`,left,near(left,left+10),`Count up from ${at} to ${end}: ${left} pages.`,null,{x:at,y:end});}],
    // Page 77: how many more, for a two-digit amount and a small amount (no borrowing).
    ['wide-compare',({r,name,other})=>{const y=10*(2+r(4))+2+r(8,1),x=1+r(y%10,2);
      return ask(`In this story, ${name} picked ${y} cherries and ${other} picked ${x}. How many more cherries did ${name} pick than ${other}?`,y-x,near(y-x,y,y-x-10),`Subtract the small number from the ones: ${y} − ${x} = ${y-x}.`,null,{x,y});}],
  ];
  // A hidden middle number (6 for 12, 7 for 14) hides the second copy below
  // the self-paired middle, never the number the prompt names.
  const rainbow=(total,hidden=null)=>({kind:'rainbow',total,hidden,...(hidden!==null&&hidden*2===total?{hiddenCopy:true}:{})});
  const endpointPrompt=(T,k)=>2*k===T?`On this rainbow for ${T}, ${k} is in the middle. A short line goes down from ${k} to a missing number below it. What is the missing number?`:`On this rainbow for ${T}, one arc goes from ${k} to a missing number. What is the missing number?`;
  V['2a-rainbow-11-12']=[
    ['partner',({t,r})=>{const T=11+t%2,k=r(T+1);
      return ask(`On the rainbow for ${T}, which number is joined to ${k}?`,T-k,near(T-k,k),`Each arc joins two numbers that add to ${T}: ${k} + ${T-k} = ${T}.`,rainbow(T));}],
    ['subtract',({t,r})=>{const T=11+t%2,k=1+r(T-1);
      return ask(`Use the rainbow. ${T} − ${k} = ?`,T-k,near(T-k,k),`${k} is joined to ${T-k} on the rainbow, so ${T} − ${k} = ${T-k}.`,rainbow(T));}],
  ];
  V['2a-rainbow-11-12-fill']=[
    ['endpoint',({t,r})=>{const T=11+t%2,k=r(T+1);
      return ask(endpointPrompt(T,k),T-k,near(T-k,k),`The two joined numbers add to ${T}: ${k} + ? = ${T}, so it is ${T-k}.`,rainbow(T,T-k),{T,k});}],
    ['related',({t,r})=>{const T=11+t%2,k=1+r(T-1),sub=Math.floor(t/2)%2===1;
      return ask(sub?`${T} − ? = ${k}`:`${k} + ? = ${T}`,T-k,near(T-k,k),`${k} and ${T-k} make ${T}.`);}],
  ];
  const familyQ=(T,lo,hi)=>({r,t})=>{const a=lo+r(hi-lo+1),b=T-a,form=t%3;
    return form===0?ask(`${a} + ? = ${T}`,b,near(b,a),`${a} + ${b} = ${T}.`)
      :form===1?ask(`${T} − ${a} = ?`,b,near(b,a),`${a} + ${b} = ${T}, so ${T} − ${a} = ${b}.`)
      :ask(`${T} − ? = ${a}`,b,near(b,a),`${T} − ${b} = ${a}, because ${a} + ${b} = ${T}.`);};
  // Pages 81/84/85/87/89 open each family with 10 and its part (10, 2, 12 …
  // 10, 6, 16): both addition orders and both subtractions, cycled in turn.
  const tenFamily=T=>({t})=>{const p=T-10,form=['10+p','p+10','T-10','T-p'][t%4];
    const data={T,form};
    return form==='10+p'?ask(`10 + ${p} = ?`,T,near(T,p,20),`10 and ${p} more make ${T}.`,{kind:'fact-family',numbers:[10,p,null]},data)
      :form==='p+10'?ask(`${p} + 10 = ?`,T,near(T,p,20),`Adding 10 gives one ten and ${p} ones: ${T}.`,{kind:'fact-family',numbers:[p,10,null]},data)
      :form==='T-10'?ask(`${T} − 10 = ?`,p,near(p,T,10),`Take away the ten from ${T}: ${p} ones are left.`,null,data)
      :ask(`${T} − ${p} = ?`,10,near(10,T,p),`Take away the ${p} ones from ${T}: one ten is left, 10.`,null,data);};
  const directQ=(T,lo,hi)=>({t})=>{const n=lo+t%(hi-lo+1);return ask(`${T} − ${n} = ?`,T-n,near(T-n,n),`${T-n} + ${n} = ${T}, so ${T} − ${n} = ${T-n}.`);};
  const explainQ=T=>({r})=>{const b=T-9+r(9-(T-9)+1),c=T-b;
    return ask(`Which addition shows that ${T} − ${b} = ${c} is right?`,`${c} + ${b} = ${T}`,[`${T} + ${b} = ${T+b}`,`${b} + ${b} = ${2*b}`,`${c} + ${c} = ${2*c}`],`Subtraction is checked by adding back: ${c} + ${b} = ${T}.`);};
  V['2a-family-11']=[
    ['belongs',({r,t})=>{const a=1+r(10),b=11-a,true4=[`${a} + ${b} = 11`,`${b} + ${a} = 11`,`11 − ${a} = ${b}`,`11 − ${b} = ${a}`],ans=true4[t%4];
      return ask(`Which number sentence belongs to the fact family of ${a}, ${b}, and 11?`,ans,[`11 + ${a} = ${b}`,`11 − ${a} = ${b+1}`,`${b} − ${a} = 11`],`The fact family uses ${a}, ${b}, and 11: ${true4.join(', ')}.`,{kind:'fact-family',numbers:[a,b,11]});}],
    ['missing-part',({r})=>{const a=1+r(10);
      return ask(`11 − ? = ${11-a}`,a,near(a,11-a),`${11-a} + ${a} = 11, so 11 − ${a} = ${11-a}.`);}],
    ['groups',({r})=>{const a=2+r(8);
      return ask(`11 marbles are in two groups. The first group has ${a}. 11 − ${a} = ?`,11-a,near(11-a,a),`Take away the first group of ${a}: 11 − ${a} = ${11-a} marbles in the other group.`,{kind:'groups',groups:[a,11-a]});}],
    ['direct',directQ(11,1,10)],
  ];
  V['2a-family-12']=[
    ['related',familyQ(12,3,9)],
    ['review-11',directQ(11,2,9)],
    ['double-six',()=>ask('How many different number sentences are in the fact family of 6, 6, and 12?',2,[1,3,4],'Both parts are 6, so there are only two: 6 + 6 = 12 and 12 − 6 = 6.',{kind:'fact-family',numbers:[6,6,12]})],
    ['direct',directQ(12,3,9)],
    ['ten-family',tenFamily(12)],
  ];
  V['2a-family-12-more']=[
    ['missing-first',({r})=>{const b=3+r(7);return ask(`? + ${b} = 12`,12-b,near(12-b,b),`${12-b} + ${b} = 12.`);}],
    ['missing-second',({r})=>{const a=3+r(7);return ask(`${a} + ? = 12`,12-a,near(12-a,a),`${a} + ${12-a} = 12.`);}],
    // Page 82 practices the same "how many more" additions for 11 too.
    ['missing-11',({r,t})=>{const a=2+r(8),first=t%2===1;return ask(first?`? + ${a} = 11`:`${a} + ? = 11`,11-a,near(11-a,a),`${a} + ${11-a} = 11.`);}],
    ['explanation',explainQ(12)],
    ['pattern-17',({t})=>{const j=12+t%5;
      return ask(`9 + 8 = 17, 10 + 7 = 17, 11 + 6 = 17. What is the missing number in ${j} + ? = 17?`,17-j,near(17-j,j-10),`The first number goes up by 1 and the second goes down by 1. ${j} + ${17-j} = 17.`);}],
    ['pattern-odd',({t})=>{const T=15+t%2,j=3+Math.floor(t/2)%4;
      return ask(`${T} − 1 = ${T-1}, ${T} − 3 = ${T-3}, ${T} − 5 = ${T-5}. What is ${T} − ${2*j+1}?`,T-2*j-1,near(T-2*j-1,T-2*j),`Taking away 2 more each time makes the answer 2 less: ${T} − ${2*j+1} = ${T-2*j-1}.`);}],
  ];
  V['2a-rainbow-13-14']=[
    ['endpoint',({t,r})=>{const T=13+t%2,k=r(T+1);
      return ask(endpointPrompt(T,k),T-k,near(T-k,k),`The two joined numbers add to ${T}: ${k} + ${T-k} = ${T}.`,rainbow(T,T-k),{T,k});}],
    // Page 83 subtracts 2-11 from 13 and 3-11 from 14 (including 13 − 10 and 13 − 11).
    ['subtract',({t,r})=>{const T=13+t%2,k=T-11+r(11-(T-11)+1);
      return ask(`${T} − ${k} = ?`,T-k,near(T-k,k),`${k} and ${T-k} are joined on the rainbow for ${T}, so ${T} − ${k} = ${T-k}.`,rainbow(T,T-k));}],
  ];
  V['2a-family-13']=[
    ['related',familyQ(13,4,9)],
    ['match',({r})=>{const a=4+r(6),b=13-a;
      return ask(`Which subtraction goes with ${a} + ${b} = 13?`,`13 − ${a} = ${b}`,[`13 − ${a} = ${b+1}`,`14 − ${a} = ${b}`,`${a} − ${b} = 13`],`The same three numbers, ${a}, ${b}, and 13: 13 − ${a} = ${b}.`,{kind:'fact-family',numbers:[a,b,13]});}],
    ['direct',directQ(13,4,9)],
    ['ten-family',tenFamily(13)],
  ];
  V['2a-family-14']=[
    ['related',familyQ(14,5,9)],
    ['double-seven',({t})=>t%2?ask('7 + 7 = 14. So 14 − 7 = ?',7,[6,8,14],'The two parts are both 7: 14 − 7 = 7.'):ask('How many different number sentences are in the fact family of 7, 7, and 14?',2,[1,3,4],'Both parts are 7, so there are only two: 7 + 7 = 14 and 14 − 7 = 7.',{kind:'fact-family',numbers:[7,7,14]})],
    ['direct',({r})=>{const a=11+r(4),b=2+r(8,1);return ask(`${a} − ${b} = ?`,a-b,near(a-b,b),a%10>=b?`Take away the ones: ${a} − ${b} = ${a-b}.`:`${a} − ${a-10} = 10, then 10 − ${b-(a-10)} = ${a-b}.`);}],
    ['missing-minuend',({r})=>{const b=3+r(7),c=Math.max(2,11-b)+r(14-b-Math.max(2,11-b)+1,1);
      return ask(`? − ${b} = ${c}`,b+c,near(b+c,c),`The missing number is the total: ${c} + ${b} = ${b+c}.`);}],
    ['missing-subtrahend',({r})=>{const a=11+r(4),c=a-9+r(8,1),b=a-c;
      return ask(`${a} − ? = ${c}`,b,near(b,c),`${c} + ${b} = ${a}, so ${a} − ${b} = ${c}.`);}],
    ['ten-family',tenFamily(14)],
  ];
  V['2a-family-14-stories']=[
    ['three-term',({r})=>{const x=2+r(8),y=2+r(8,1),z=2+r(6,2);
      return ask(`${x} + ${y} + ${z} = ?`,x+y+z,near(x+y+z),`${x} + ${y} = ${x+y}, then ${x+y} + ${z} = ${x+y+z}.`);}],
    ['compare-story',({r,name,other})=>{const T=13+r(2),b=T-9+r(9-(T-9)+1,1);
      return ask(`${name} has ${T} stamps. ${other} has ${b}. How many more stamps does ${name} have?`,T-b,near(T-b,b),`${b} + ? = ${T}. The difference is ${T-b}.`);}],
    ['change-story',({r,name})=>{const T=13+r(2),c=T-9+r(9-(T-9)+1,1);
      return ask(`${name} had ${T} balloons. Some floated away. Now ${name} has ${c}. How many floated away?`,T-c,near(T-c,c),`${T} − ? = ${c}. ${c} + ${T-c} = ${T}.`);}],
    // Page 86 continues a +8 pattern up to 104 (Book topics only).
    ['plus-eight',({t,r})=>{const start=t%12===0?64:[24,32,40,48,56,64][r(6)],blank=t%12===0?5:3+r(3,1),terms=Array.from({length:6},(_,i)=>start+8*i);
      return ask(`Count by 8s: ${terms.map((x,i)=>i===blank?'?':x).join(', ')}. What number is missing?`,terms[blank],near(terms[blank],terms[blank]-2,terms[blank]+2),`Each number is 8 more: ${terms[blank-1]} + 8 = ${terms[blank]}.`,{kind:'sequence',terms:terms.map((x,i)=>i===blank?null:x)},{terms});}],
    ['plus-four',({r})=>{const start=9+4*r(6),blank=2+r(4,1),terms=Array.from({length:6},(_,i)=>start+4*i);
      return ask(`Count by 4s: ${terms.map((x,i)=>i===blank?'?':x).join(', ')}. What number is missing?`,terms[blank],near(terms[blank],terms[blank]-2,terms[blank]+2),`Each number is 4 more: ${terms[blank-1]} + 4 = ${terms[blank]}.`,{kind:'sequence',terms:terms.map((x,i)=>i===blank?null:x)},{terms});}],
    // Page 86: a known removal (one item to each of several people), then the remainder.
    ['share-one-each',({r})=>{const T=12+r(9),k=2+r(5,1);
      return ask(`In this story, a baker has ${T} rolls. Before closing, the baker gives each of ${k} helpers one roll. How many rolls are left?`,T-k,near(T-k,T+k,k),`${k} helpers get 1 roll each, so ${k} rolls are given away. ${T} − ${k} = ${T-k}.`,null,{T,k});}],
    // Page 86: a known smaller amount plus "N more" gives the larger amount (facts to 18).
    ['more-than',({r,name,other})=>{const a=3+r(7),d=Math.max(2,11-a)+r(10-Math.max(2,11-a),1);
      return ask(`${other} has ${a} cherries. ${name} has ${d} more than ${other}. How many cherries does ${name} have?`,a+d,near(a+d,Math.abs(a-d)),`"${d} more than ${a}" means add: ${a} + ${d} = ${a+d}.`,null,{known:a,more:d});}],
  ];
  V['2a-family-15']=[
    ['related',familyQ(15,6,9)],
    ['direct',directQ(15,6,9)],
    ['explanation',explainQ(15)],
    ['ten-family',tenFamily(15)],
    ['skip-three',({r})=>{const start=9+3*r(4),blank=2+r(4,1),terms=Array.from({length:6},(_,i)=>start+3*i);
      return ask(`Count by 3s: ${terms.map((x,i)=>i===blank?'?':x).join(', ')}. What number is missing?`,terms[blank],near(terms[blank],terms[blank]+1,terms[blank]-1),`Each number is 3 more: ${terms[blank-1]} + 3 = ${terms[blank]}.`,{kind:'sequence',terms:terms.map((x,i)=>i===blank?null:x)},{terms});}],
  ];
  V['2a-family-15-review']=[
    ['bigger-unknown',({r,name,other})=>{const b=5+r(5),d=3+r(7,1);
      return ask(`${other} has ${b} stamps. ${name} has ${d} more than ${other}. How many stamps does ${name} have?`,b+d,near(b+d,b-d>0?b-d:d),`"${d} more than ${b}" means ${b} + ${d} = ${b+d}.`);}],
    ['smaller-unknown',({r,name,other})=>{const b=5+r(5),d=3+r(7,1);
      return ask(`${name} has ${b+d} stamps. That is ${d} more than ${other} has. How many stamps does ${other} have?`,b,near(b,b+2*d<=20?b+2*d:d),`${other} has ${d} fewer: ${b+d} − ${d} = ${b}.`);}],
    ['difference-unknown',({r,name,other})=>{const b=5+r(5),d=3+r(7,1);
      return ask(`${name} has ${b+d} stamps and ${other} has ${b}. How many more stamps does ${name} have?`,d,near(d,b),`${b} + ? = ${b+d}. The difference is ${d}.`);}],
    ['even-double',({t})=>{const e=2*(1+t%10);
      return ask(`${e} is an even number. It is double what number?`,e/2,near(e/2,e),`${e/2} + ${e/2} = ${e}.`);}],
    ['combine-half',({r,name,other})=>{const x=3+r(8),y=(x%2?1:2)+2*r(4,1);
      return ask(`${name} has ${x} grapes and ${other} has ${y}. They put them together and share them equally. How many grapes does each get?`,(x+y)/2,near((x+y)/2,x+y),`Together: ${x} + ${y} = ${x+y}. Half of ${x+y} is ${(x+y)/2}.`);}],
    ['parity',({t})=>{const n=t%21;return ask(`Is ${n} even or odd?`,evenOdd(n),['even','odd'],`Even numbers end in 0, 2, 4, 6, or 8. ${n} ends in ${n%10}.`);}],
    ['dollars',({r})=>{const three=r(2)===1,p=[2+r(6,1),2+r(6,2),2+r(5,3)].slice(0,three?3:2),total=p.reduce((a,b)=>a+b,0);
      return ask(`In a pretend shop, ${three?`a ball costs $${p[0]}, a cap costs $${p[1]}, and a book costs $${p[2]}`:`a ball costs $${p[0]} and a cap costs $${p[1]}`}. How much do they cost together?`,total,near(total),`Add the prices: ${p.map(x=>`$${x}`).join(' + ')} = $${total}.`);}],
    // Page 88: one two-digit price plus whole-ten prices (adding whole tens, page 26), total at most $99.
    ['dollars-tens',({r})=>{const three=r(2)===1,p=[10*(1+r(4))+1+r(9,1),10*(1+r(three?3:4,2)),...(three?[10*(1+r(2,3))]:[])],total=p.reduce((a,b)=>a+b,0);
      return ask(`In a pretend shop, ${three?`a bike costs $${p[0]}, a tent costs $${p[1]}, and a ball costs $${p[2]}`:`a bike costs $${p[0]} and a tent costs $${p[1]}`}. How much do they cost together?`,total,near(total,total-10,total+1),
        `Add the whole tens to the tens of $${p[0]}; the ones stay ${p[0]%10}: ${p.map(x=>`$${x}`).join(' + ')} = $${total}.`,null,{prices:p});}],
  ];
  V['2a-family-16']=[
    ['related',familyQ(16,7,9)],
    ['double-eight',({t})=>t%2?ask('8 + 8 = 16. So 16 − 8 = ?',8,[7,9,16],'Both parts are 8: 16 − 8 = 8.'):ask('How many different number sentences are in the fact family of 8, 8, and 16?',2,[1,3,4],'Both parts are 8, so there are only two: 8 + 8 = 16 and 16 − 8 = 8.',{kind:'fact-family',numbers:[8,8,16]})],
    ['mixed',({t,r})=>{const a=11+t%9,k=Math.floor(t/9)%3,b=k===0?9:k===1?10:2+r(7);
      return ask(`${a} − ${b} = ?`,a-b,near(a-b,b),b===10?`Taking away 10 takes away the ten: ${a} − 10 = ${a-10}.`:a%10>=b?`Take away the ones: ${a} − ${b} = ${a-b}.`:`${a} − ${a-10} = 10, then 10 − ${b-(a-10)} = ${a-b}.`,null,{a,b});}],
    ['ten-family',tenFamily(16)],
  ];
  V['2a-family-16-stories']=[
    ['skip-three',({r})=>{const start=2+r(9),blank=2+r(4,1),terms=Array.from({length:6},(_,i)=>start+3*i);
      return ask(`Count by 3s: ${terms.map((x,i)=>i===blank?'?':x).join(', ')}. What number is missing?`,terms[blank],near(terms[blank],terms[blank]+1,terms[blank]-1),`Each number is 3 more: ${terms[blank-1]} + 3 = ${terms[blank]}.`,{kind:'sequence',terms:terms.map((x,i)=>i===blank?null:x)},{terms});}],
    ['skip-four',({r})=>{const start=2+r(9),blank=2+r(4,1),terms=Array.from({length:6},(_,i)=>start+4*i);
      return ask(`Count by 4s: ${terms.map((x,i)=>i===blank?'?':x).join(', ')}. What number is missing?`,terms[blank],near(terms[blank],terms[blank]+2,terms[blank]-2),`Each number is 4 more: ${terms[blank-1]} + 4 = ${terms[blank]}.`,{kind:'sequence',terms:terms.map((x,i)=>i===blank?null:x)},{terms});}],
    ['afford',({r,t})=>{const p1=5+r(5),p2=5+r(5,1),h=t%2?p1+p2+r(3,2):p1+p2-1-r(3,2);
      return ask(`A pretend toy store sells a car for $${p1} and a kite for $${p2}. You have $${h}. Do you have enough money to buy both?`,h>=p1+p2?'Yes':'No',['Yes','No'],`Both cost $${p1} + $${p2} = $${p1+p2}. $${h} is ${h>=p1+p2?'enough':`$${p1+p2-h} short`}.`);}],
    ['money-left',({r})=>{const [h,p]=crossSub(r);
      return ask(`You have $${h}. You buy a pretend car for $${p}. How much money is left?`,h-p,near(h-p,p),`$${h} − $${p} = $${h-p}.`);}],
    ['shortfall',({r})=>{const p1=5+r(5),p2=5+r(5,1),h=p1+p2-2-r(5,2);
      return ask(`A pretend car costs $${p1} and a kite costs $${p2}. You have $${h}. How much more money do you need to buy both?`,p1+p2-h,near(p1+p2-h,h),`Both cost $${p1+p2}. $${h} + ? = $${p1+p2}: you need $${p1+p2-h} more.`);}],
    ['compare-expr',({r,t})=>{const a=2+r(8),b=2+r(8,1),diff=t%3-1,c=Math.min(9,Math.max(1,a+diff)),d=b;
      const left=a+b,right=c+d,sign=left<right?'<':left>right?'>':'=';
      return ask(`Which sign makes this true? ${a} + ${b} ? ${c} + ${d}`,sign,['<','>','='],`${a} + ${b} = ${left} and ${c} + ${d} = ${right}, so ${left} ${sign} ${right}.`);}],
    // Page 90 also compares a number with a sum (facts to 18, or a whole ten plus ones).
    ['compare-number-sum',({r,t})=>{const tens=t%2===1,a=tens?10*(2+r(5)):2+r(8),b=tens?1+r(9,1):2+r(8,1),s=a+b,n=s+(tens?[-1,0,1,10]:[-1,0,1])[r(tens?4:3,2)];
      const sign=n<s?'<':n>s?'>':'=';
      return ask(`Which sign makes this true? ${n} ? ${a} + ${b}`,sign,['<','>','='],`${a} + ${b} = ${s}, so ${n} ${sign} ${s}.`,null,{n,a,b});}],
    // … and two subtractions that take the same number from different teens.
    ['compare-subtract',({r})=>{const s=5+r(5),m1=11+r(8,1),d=[1,-1,2,-2][r(4,2)],m2=m1+d>=11&&m1+d<=18?m1+d:m1-d;
      const left=m1-s,right=m2-s,sign=left<right?'<':left>right?'>':'=';
      return ask(`Which sign makes this true? ${m1} − ${s} ? ${m2} − ${s}`,sign,['<','>','='],`Both take away ${s}. ${m1} ${m1<m2?'is less than':'is more than'} ${m2}, so ${m1} − ${s} ${sign} ${m2} − ${s} (${left} ${sign} ${right}).`,null,{m1,m2,s});}],
    // Page 90: one group changes, then compare the two groups.
    ['one-changed-compare',({r})=>{const x=3+r(7),leave=r(2,1)===0,c=1+r(2,2);let y=3+r(7,3);
      if((leave?y-c:y+c)===x)y++;const after=leave?y-c:y+c,red='Red shirts',blue='Blue shirts';
      const s=whoMore(x,after,red,blue,plainN,y!==x?[[y>x?blue:red,Math.abs(y-x)]]:[]);
      return ask(`At a pretend park, ${x} players in red shirts came to play. Then ${y} players in blue shirts came. Then ${c} ${leave?`of the blue-shirt player${c>1?'s':''} went home`:`more player${c>1?'s':''} in blue shirts came`}. Now are there more red shirts or blue shirts, and how many more?`,s.answer,s.options,
        `Blue shirts now: ${y} ${leave?'−':'+'} ${c} = ${after}. Red shirts: ${x}. ${s.winner} have more: ${Math.max(x,after)} − ${Math.min(x,after)} = ${s.d}.`,null,{x,y,c,leave});}],
    // Page 90: two removals in a row from one starting group.
    ['two-removals',({r})=>{const o=4+r(6),start=10*(1+r(3,1))+o,r1=1+r(3,2),r2=1+r(Math.min(4,o-r1),3);
      return ask(`A pretend class has ${start} children. ${r1} went home early, and then ${r2} more left for a music lesson. How many children are still in class?`,start-r1-r2,near(start-r1-r2,start-r1,start+r1+r2),
        `${start} − ${r1} = ${start-r1}, then ${start-r1} − ${r2} = ${start-r1-r2}.`,null,{start,r1,r2});}],
  ];
  V['2a-family-17-18']=[
    ['related-17',({t})=>{const pairs=[[8,9],[9,8],[7,10],[10,7]],[a,b]=pairs[t%4],form=Math.floor(t/4)%3;
      return form===0?ask(`${a} + ? = 17`,b,near(b,a),`${a} + ${b} = 17.`):form===1?ask(`17 − ${a} = ?`,b,near(b,a),`${a} + ${b} = 17, so 17 − ${a} = ${b}.`):ask(`17 − ? = ${a}`,b,near(b,a),`17 − ${b} = ${a}.`);}],
    ['related-18',({t})=>{const pairs=[[9,9],[8,10],[10,8]],[a,b]=pairs[t%3],form=Math.floor(t/3)%3;
      return form===0?ask(`${a} + ? = 18`,b,near(b,a+1),`${a} + ${b} = 18.`):form===1?ask(`18 − ${a} = ?`,b,near(b,a+1),`${a} + ${b} = 18, so 18 − ${a} = ${b}.`):ask(`18 − ? = ${a}`,b,near(b,a+1),`18 − ${b} = ${a}.`);}],
    ['count-sentences',({t})=>{const dbl=t%2===0;
      return ask(`How many different number sentences are in the fact family of ${dbl?'9, 9, and 18':'8, 9, and 17'}?`,dbl?2:4,[1,2,3,4],dbl?'Both parts are 9, so there are only two: 9 + 9 = 18 and 18 − 9 = 9.':'There are four: 8 + 9 = 17, 9 + 8 = 17, 17 − 8 = 9, and 17 − 9 = 8.',{kind:'fact-family',numbers:dbl?[9,9,18]:[8,9,17]});}],
    ['mixed',({t})=>{const [a,b]=FACTS20[(t*7)%20],sub=Math.floor(t/20)%2===1;
      return sub?ask(`${a+b} − ${b} = ?`,a,near(a,b),`${a} + ${b} = ${a+b}, so ${a+b} − ${b} = ${a}.`):ask(`${b} + ${a} = ?`,a+b,near(a+b),`${a} + ${b} = ${a+b}.`);}],
  ];
  const WORDS=['SUN','MAP','HAT','DOG','CUP','PEN','BOX','FIG','JAR','WEB'];
  V['2a-family-17-18-review']=[
    ['compare-expr',({r,t})=>{const k=t%3;let text,left,right;
      if(k===0){const x=20+r(41),a=1+r(9,1),b=1+r(9,2);text=`${x} + ${a} ? ${x} + ${b}`;left=x+a;right=x+b;}
      else if(k===1){const x=20+r(41),a=1+r(9,1),b=1+r(9,2);text=`${x} − ${a} ? ${x} − ${b}`;left=x-a;right=x-b;}
      else{const h=3+r(8,1),m=h+r(3,2)-1;text=`1/2 of ${2*h} ? ${m}`;left=h;right=m;}
      const sign=left<right?'<':left>right?'>':'=';
      return ask(`Which sign makes this true? ${text}`,sign,['<','>','='],k===2?`1/2 of ${2*left} is ${left}, so ${left} ${sign} ${right}.`:`Both start with the same number, so compare what is ${k===0?'added':'taken away'}: ${left} ${sign} ${right}.`);}],
    ['missing-position',({t,r})=>{const k=t%3;
      if(k===0){const c=5+r(5);return ask(`? − 9 = ${c}`,c+9,near(c+9,c),`The missing number is the total: ${c} + 9 = ${c+9}.`);}
      if(k===1){const a=11+r(8);return ask(`${a} − ? = 9`,a-9,near(a-9,a-8),`9 + ${a-9} = ${a}.`);}
      const b=8+r(2);return ask(`? + ${b} = 17`,17-b,near(17-b,b),`${17-b} + ${b} = 17.`);}],
    ['durations',({r})=>{const d=[1+r(4),1+r(3,1),1+r(4,2),1+r(3,3)],sum=d.reduce((a,b)=>a+b,0);
      return ask(`In this story, a pretend puppy naps ${d[0]} hours, then ${d[1]} hours, then ${d[2]} hours, and then ${d[3]} hours. How many hours does it nap in all?`,sum,near(sum),`${d.join(' + ')} = ${sum} hours.`);}],
    // Page 92 packages: whole boxes only, found by repeated addition; no division.
    ['packages',({r})=>{const size=[6,8,10,12][r(4)],k=2+r(2,1),need=size*(k-1)+1+r(size-1,2),left=size*k-need,q=need-size*(k-1);
      const wrongLeft=q!==left?q:left+1,boxes=n=>`${n} box${n===1?'':'es'}`;
      const fewer=k===2?`One box holds only ${size}`:`${Array(k-1).fill(size).join(' + ')} = ${size*(k-1)}: ${k-1} boxes hold only ${size*(k-1)}`;
      return ask(`In this story, pencils come in boxes of ${size}. A class needs ${need} pencils. Boxes cannot be split. How many boxes must the class buy, and how many pencils will be left over?`,`${boxes(k)}, ${left} left over`,[`${boxes(k-1)}, ${left} left over`,`${boxes(k)}, ${wrongLeft} left over`,`${boxes(k+1)}, ${left} left over`],
        `${fewer}, which is less than ${need}. ${Array(k).fill(size).join(' + ')} = ${size*k}, which is enough. ${size*k} − ${need} = ${left} left over.`,{kind:'packages',size},{size,need,boxes:k,left});}],
    ['journey',({r})=>{const steps=[10,1+r(5),2+r(7,1),1+r(8,2)],path=steps.reduce((acc,s)=>[...acc,acc.at(-1)-s],[100]);
      return ask(`Start at 100. Take away ${steps.join(', then ')}. Where do you end?`,path.at(-1),near(path.at(-1),path.at(-2)),`${path.map((n,i)=>i?`− ${steps[i-1]} = ${n}`:n).join(' ')}.`,null,{start:100,steps});}],
  ];
  V['2a-elapsed-minutes']=[
    // Start minutes :00-:30 (page 93 includes a half-past start), 5-30 minutes, same hour.
    ['same-hour',({r})=>{const h=1+r(12),m1=5*r(7,1),d=5*(1+r(Math.min(6,(55-m1)/5),2)),m2=m1+d;
      return ask(`How many minutes pass from ${tm(h,m1)} to ${tm(h,m2)}?`,d,near(d,d+5,d-5),`Count by fives from ${m1} minutes to ${m2} minutes: ${d} minutes.`,{kind:'clock-set',clocks:[{label:'Start',hour:h,minute:m1},{label:'End',hour:h,minute:m2}]},{h,m1,m2});}],
  ];
  V['2a-mixed-review-93']=[
    ['late-read',V['2a-late-read'][0][1]],
    ['plus-five',({r})=>{const h=1+r(12),m=5*r(12,1);
      return ask('The clock shows the time now. What time will it be 5 minutes later?',later(h,m,5),[later(h,m,10),later(h,m,1),m===55?`${h}:60`:tm(nh(h),m+5)],`5 minutes later the minute hand moves to the next number: ${later(h,m,5)}.`,clock(h,m),{h,m,add:5});}],
    ['sets-halved',({r,name,other})=>{const x=2*(2+r(8)),y=2*(2+r(5,1));
      return ask(`${name} has ${x} apples and ${y} pears. ${name} gives half of the apples and half of the pears to ${other}. How many pieces of fruit does ${other} get?`,x/2+y/2,near(x/2+y/2,x+y),`Half of ${x} is ${x/2}, and half of ${y} is ${y/2}. ${x/2} + ${y/2} = ${x/2+y/2}.`);}],
    ['inverse-double',({r})=>{const h=6+r(10);return ask(`Half of a number is ${h}. What is the number?`,2*h,near(2*h,h),`The number is double the half: ${h} + ${h} = ${2*h}.`);}],
    // Page 93: write an even number (to 20, or 30 or 40) as a double.
    ['double-of',({r})=>{const e=[10,12,14,16,18,20,30,40][r(8)];return ask(`${e} = ? + ?, with the same number twice. What is that number?`,e/2,near(e/2,e,e/2+10>40?e/2-1:e/2+10),`${e/2} + ${e/2} = ${e}.`,null,{e});}],
  ];
  V['2a-mixed-review-94']=[
    ['journey',({r})=>{const start=40+r(56),steps=[2+r(8,1),10,3+r(7,2)],path=steps.reduce((acc,s)=>[...acc,acc.at(-1)-s],[start]);
      return ask(`Start at ${start}. Take away ${steps.join(', then ')}. Where do you end?`,path.at(-1),near(path.at(-1),path.at(-2)),`${path.map((n,i)=>i?`− ${steps[i-1]} = ${n}`:n).join(' ')}.`,null,{start,steps});}],
    ['half-total',({r,name,other})=>{const h=3+r(8);return ask(`${name} has ${2*h} cards and gives half of them to ${other}. How many cards does ${other} get?`,h,near(h,2*h),`Half of ${2*h} is ${h}, because ${h} + ${h} = ${2*h}.`);}],
    ['inverse-half',({r,name,other})=>{const h=4+r(7);return ask(`${other} got half of ${name}'s beads, which was ${h} beads. How many beads did ${name} have at first?`,2*h,near(2*h,h),`Half was ${h}, so the whole was ${h} + ${h} = ${2*h}.`);}],
    ['age-difference',({r,name,other})=>{const [a,b]=crossSub(r);return ask(`In this story, ${name} is ${a} years old and ${other} is ${b}. How many years older is ${name}?`,a-b,near(a-b,b),`Count up from ${b} to ${a}: ${a-b} years.`);}],
    ['update-compare',({r,name,other})=>{const b=3+r(6),d=2+r(5,1),c=2+r(5,2);
      return ask(`${name} has ${b+d} shells and ${other} has ${b}. Then ${name} finds ${c} more. Now how many more shells does ${name} have than ${other}?`,d+c,near(d+c,d),`Now ${name} has ${b+d+c}. ${b+d+c} − ${b} = ${d+c}.`);}],
    // Page 94: an older whole-ten age minus a small age (whole tens minus one digit, page 10).
    ['age-tens',({r,name,other})=>{const a=10*(2+r(4)),b=2+r(8,1);
      return ask(`In this story, ${name} is ${a} years old and ${other} is ${b}. How many years older is ${name}?`,a-b,near(a-b,a-b+10,a-b-10),`Break one ten: ${a} − ${b} = ${a-b}.`,null,{a,b});}],
    // Page 94: find half of the first amount, then the two amounts together.
    ['half-then-total',({r,name,other})=>{const x=[10,12,14,16,18,20,30,40][r(8)];
      return ask(`${name} picked ${x} berries, and ${other} picked half as many. How many berries did they pick together?`,x+x/2,near(x+x/2,x/2,2*x),`Half of ${x} is ${x/2}, because ${x/2} + ${x/2} = ${x}. Together: ${x} + ${x/2} = ${x+x/2}.`,null,{x});}],
    // Page 94: the larger amount from a known amount and "more". Alternates a
    // whole-ten increase (10 more than 10-89, total at most 99) with a
    // single-digit increase (a fact with total at most 18).
    ['more-quantity',({r,t,name,other})=>{const tens=t%2===0,base=tens?10*(1+r(8))+r(10,1):2+r(8,1),more=tens?10:2+r(8,2),total=base+more;
      return ask(tens?`In this story, ${other} read ${base} pages. ${name} read 10 more pages than ${other}. How many pages did ${name} read?`
        :`In this story, ${other} has $${base}. ${name} has $${more} more than ${other}. How much money does ${name} have?`,
        total,near(total,Math.abs(base-more),tens?total+1:more),tens?`10 more than ${base} adds one ten: ${base} + 10 = ${total}.`:`"$${more} more than $${base}" means add: $${base} + $${more} = $${total}.`,null,{base,more});}],
  ];
  V['2a-review-95']=[
    ['fact',({t})=>{const [a,b]=FACTS20[(t*3)%20];return ask(`${a} + ${b} = ?`,a+b,near(a+b),`${a} + ${10-a} = 10, and ${b-(10-a)} more makes ${a+b}.`);}],
    ['same-family',({r})=>{const [a,b]=FACTS20[r(20)];
      return ask(`Which number sentence is in the same fact family as ${a} + ${b} = ${a+b}?`,`${a+b} − ${b} = ${a}`,[`${a+b} − ${a} = ${a===b?a+1:a}`,`${a} − ${b} = ${a+b}`,`${a+b} + ${b} = ${a}`],`A fact family uses the same three numbers: ${a}, ${b}, and ${a+b}. ${a+b} − ${b} = ${a}.`);}],
    ['difference',({r,t})=>{const wide=t%2===0,x=wide?1+r(5):5+r(9),y=wide?x+8+r(8,1):x+1+r(3,1);
      return ask(`What is the difference between ${x} and ${y}?`,y-x,near(y-x,y),`${wide?'Subtract':'Count up'}: ${y} − ${x} = ${y-x}.`,null,{x,y});}],
    // Page 95: a close two-digit pair (count up, as on page 75) …
    ['difference-close',({r})=>{const y=10*(2+r(8))+r(10,1),d=2+r(8,2),x=y-d;
      return ask(`What is the difference between ${x} and ${y}?`,d,near(d,d+10),`The numbers are close. Count up from ${x} to ${y}: ${d}.`,null,{x,y});}],
    // … and a two-digit number and a small number with no borrowing (page 11).
    ['difference-wide',({r})=>{const y=10*(2+r(8))+2+r(8,1),x=1+r(y%10,2);
      return ask(`What is the difference between ${y} and ${x}?`,y-x,near(y-x,y-x-10,y),`Take ${x} from the ones of ${y}: ${y} − ${x} = ${y-x}.`,null,{x,y});}],
  ];
  V['2a-review-96']=[
    ['missing',({t,r})=>{const [a,b]=FACTS20[r(20)],s=a+b,k=t%4;
      return k===0?ask(`${a} + ? = ${s}`,b,near(b,a),`${a} + ${b} = ${s}.`):k===1?ask(`? + ${b} = ${s}`,a,near(a,b),`${a} + ${b} = ${s}.`)
        :k===2?ask(`${s} − ? = ${a}`,b,near(b,a),`${s} − ${b} = ${a}.`):ask(`? − ${b} = ${a}`,s,near(s,a),`The missing number is the total: ${a} + ${b} = ${s}.`);}],
    ['journey',({r})=>{const start=30+r(31),steps=[4+r(5,1),3+r(6,2),5+r(4,3)],path=steps.reduce((acc,s)=>[...acc,acc.at(-1)-s],[start]);
      return ask(`Start at ${start}. Take away ${steps.join(', then ')}. Where do you end?`,path.at(-1),near(path.at(-1),path.at(-2)),`${path.map((n,i)=>i?`− ${steps[i-1]} = ${n}`:n).join(' ')}.`,null,{start,steps});}],
    // Page 96 combines two groups, then decides parity and equal sharing.
    ['odd-odd',({r,name})=>{const x=1+2*r(5),y=1+2*r(5,1);
      return ask(`${name} has ${x} red blocks and ${y} blue blocks. Both numbers are odd. ${name} puts them together. Is the total even or odd?`,'even',['odd'],`${x} + ${y} = ${x+y}. Each odd group has one block left without a partner; the two leftovers pair up, so ${x+y} is even.`,{kind:'groups',groups:[x,y],paired:true},{x,y});}],
    ['odd-even',({r,name})=>{const x=1+2*r(5),y=2+2*r(4,1);
      return ask(`${name} has ${x} red blocks (an odd number) and ${y} blue blocks (an even number). ${name} puts them together. Is the total even or odd?`,'odd',['even'],`${x} + ${y} = ${x+y}. Only the odd group has a leftover block, so ${x+y} is odd.`,{kind:'groups',groups:[x,y],paired:true},{x,y});}],
    ['share',({r,t,name})=>{const x=1+2*r(5),y=t%2?1+2*r(5,1):2+2*r(4,1),n=x+y;
      return ask(`${name} puts ${x} red blocks and ${y} blue blocks together. Can the blocks be shared equally by 2 children with none left over?`,n%2?'No':'Yes',['Yes','No'],`${x} + ${y} = ${n}, which is ${evenOdd(n)}. ${n%2?'One block is left over.':`Each child gets ${n/2}.`}`,{kind:'groups',groups:[x,y],paired:true},{x,y});}],
    // Page 96 uses two-digit amounts too: odd + odd or odd + even, total at most 98
    // (two-digit addition from Chapter 1), then parity or equal sharing.
    ['two-digit-parity',({r,t,name,other})=>{const x=11+2*r(20),odd=t%2===0,yy=odd?11+2*r(20,1):10+2*r(20,1),n=x+yy,share=Math.floor(t/2)%2===1;
      return ask(`${name} has ${x} cookies and ${other} has ${yy}. They put their cookies together. ${share?'Can they share them evenly between the two of them?':'Is the total even or odd?'}`,
        share?(n%2?'No':'Yes'):evenOdd(n),share?['Yes','No']:['even','odd'],`${x} + ${yy} = ${n}. ${x} is odd and ${yy} is ${evenOdd(yy)}, so the total is ${evenOdd(n)}${share?(n%2?': one cookie is left over.':`: each gets ${n/2}.`):'.'}`,null,{x,y:yy});}],
  ];
  V['2a-review-97']=[
    // Page 97 decode: an original short word and an original letter key.
    ['decode',({r})=>{const word=WORDS[r(WORDS.length)];
      // Six different answers from 11-18 in a fixed shuffled order.
      const nums=[11,12,13,14,15,16,17,18].map((v,i)=>[r(997,10+i),v]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]).slice(0,6).map(x=>x[1]);
      const spare=['R','K','L','Z','Q','V'].filter(l=>!word.includes(l)).slice(0,3),letters=[...word,...spare];
      const key=letters.map((l,i)=>[nums[i],l]).sort((a,b)=>a[0]-b[0]);
      const facts=[...word].map((l,i)=>{const v=nums[i],a=Math.max(v-9,9-r(3,20+i));return `${a} + ${v-a}`;});
      const reversed=[...word].reverse().join(''),swapped=word[1]+word[0]+word[2],changed=spare[0]+word.slice(1);
      return ask(`Solve each fact, then use the key to change each answer into a letter: ${facts.join(', ')}. Which word do you get?`,word,[reversed,swapped,changed],
        `${facts.map((f,i)=>`${f} = ${nums[i]} → ${word[i]}`).join('; ')}. The word is ${word}.`,{kind:'code-key',key},{facts,key,word});}],
    ['compare-role',({r,name,other})=>{const b=4+r(6),d=2+r(5,1);
      return ask(`${name} has ${d} more flowers than ${other}. ${name} has ${b+d} flowers. How many flowers does ${other} have?`,b,near(b,b+2*d),`${other} has ${d} fewer: ${b+d} − ${d} = ${b}.`);}],
    ['shortfall',({r})=>{const h=10+r(11),c=h+5+r(5,1),e=1+r(c-h-1,2);
      return ask(`You have $${h} and want a pretend game that costs $${c}. Then a neighbor pays you $${e} for helping. Now how many more dollars do you need?`,c-h-e,near(c-h-e,c-h),`First you need $${c} − $${h} = $${c-h}. After earning $${e}: $${c-h} − $${e} = $${c-h-e}.`);}],
    ['board-remaining',({r})=>{const R=13+r(8),d1=1+r(6,1),d2=1+r(6,2);
      return ask(`In a board game you need ${R} more squares to reach the end. You roll ${d1} and ${d2} on two dice and move that many squares. How many squares are left now?`,R-d1-d2,near(R-d1-d2,d1+d2),`You move ${d1} + ${d2} = ${d1+d2}. ${R} − ${d1+d2} = ${R-d1-d2}.`);}],
    ['finishing-pair',({r})=>{const q=4+r(7),lo=Math.max(1,q-6),p=lo+r(Math.min(6,q-1)-lo+1,1);
      const pair=s=>{const x=Math.max(1,Math.min(6,s-1-r(2,s)));const y=s-x;return y>=1&&y<=6?`${x} and ${y}`:null;};
      const wrong=[q-1,q+1,q+2,q-2].map(pair).filter(Boolean);
      return ask(`You need exactly ${q} more squares to reach the end. Each die shows 1 to 6. Which pair of rolls takes you exactly to the end?`,`${p} and ${q-p}`,wrong,`${p} + ${q-p} = ${q}. The other pairs add to a different number.`,null,{q});}],
    // Page 97: a known smaller amount plus "N more" gives the larger amount.
    ['more-than',({r,name,other})=>{const a=2+r(8),d=2+r(8,1);
      return ask(`In a pretend chess game, ${other} has ${a} pieces left. ${name} has ${d} more than ${other}. How many pieces does ${name} have?`,a+d,near(a+d,Math.abs(a-d)),`"${d} more than ${a}" means add: ${a} + ${d} = ${a+d}.`,null,{known:a,more:d});}],
    // Page 97: both amounts known, a teen against 20; find how many more (count up to 20).
    ['compare-both',({r,name,other})=>{const small=11+r(9);
      return ask(`In this story, ${name} has ${small} tennis balls and ${other} has 20. How many more tennis balls does ${other} have than ${name}?`,20-small,near(20-small,small,30-small),`Count up from ${small} to 20: ${20-small} more.`,null,{x:small,y:20});}],
  ];

  function question(skill,serial=0){
    const list=V[skill.id];if(!list)throw new RangeError(`Unknown Grade 2-A skill ${skill.id}`);
    const s=Math.abs(Math.floor(serial));
    if(skill.id==='2a-ch2-review'){
      const id=REVIEWED2[s%REVIEWED2.length],target={...skill,id,page:skill.page},q=question(target,Math.floor(s/REVIEWED2.length));
      return {...q,skillId:skill.id,page:skill.page,lesson:skill.lesson,variant:id,reviewOf:id};
    }
    const [variant,make]=list[s%list.length],t=Math.floor(s/list.length);
    const salt=[...skill.id].reduce((a,c)=>(Math.imul(a,31)+c.charCodeAt(0))|0,7);
    const r=(m,k=0)=>m<=1?0:hash(t,salt+k*1013)%m;
    const pick=(arr,k=0)=>arr[r(arr.length,k)];
    const name=pick(NAMES,50),other=pick(NAMES.filter(n=>n!==name),51);
    const x=make({t,r,pick,name,other,s});
    const answer=String(x.answer);
    let choices=[...new Set([answer,...x.options.map(String)])].slice(0,4);
    const k=hash(s,salt+777)%choices.length;choices=[...choices.slice(k),...choices.slice(0,k)];
    return {skillId:skill.id,page:skill.page,lesson:skill.lesson,prompt:x.prompt,answer,choices,visual:x.visual,help:x.help,math:null,variant,...(x.data?{data:x.data}:{})};
  }
  V['2a-ch2-review']=[['review',null]];
  const VARIANTS=Object.freeze(Object.fromEntries(Object.entries(V).map(([id,list])=>[id,Object.freeze(id==='2a-ch2-review'?[...REVIEWED2]:list.map(([name])=>name))])));
  return Object.freeze({question,VARIANTS,REVIEWED2:Object.freeze(REVIEWED2),ids:()=>Object.keys(V)});
})();
globalThis.PLACE_BOOK_2A_CH23=PLACE_BOOK_2A_CH23;
