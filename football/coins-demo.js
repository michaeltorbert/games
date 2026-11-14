// Isolated synthetic examples: production generator + coin renderer, no game,
// storage, learning, stats, or Season writers are loaded by this page.
(() => {
  const api=FOOTBALL_CONTEXTUAL_QUESTIONS, ids=api.IN_GAME_COIN_FAMILIES;
  const $=id=>document.getElementById(id), select=$('demo-family');
  let index=0, stage='initial', misses=0, resolved=false, question;
  const names={
    'count-dimes-pennies':'Dimes and pennies','count-nickels-pennies':'Nickels and pennies','count-dimes-nickels':'Dimes and nickels','make-nickels':'Pay with nickels','count-mixed':'Dimes, nickels, pennies','two-nickels':'Group two nickels','add-dime':'Add a dime','add-nickel':'Add a nickel','complete-amount':'Find the missing cents','dollar':'One dollar, 100 cents','finish-set':'Finish a one-dollar set','wallet-left':'Money left after spending','count-quarters':'Count quarters','count-quarters-dimes':'Quarters and dimes','count-quarters-nickels':'Quarters and nickels','count-quarters-mixed':'Quarters, dimes, nickels','complete-quarters':'Complete a quarter set','count-all':'Mix all four coins','equal-sets':'Match equal values','two-ways':'Two different ways to pay','quarter-purchase':'Spend from a quarter wallet','one-quarter':'Pay with exactly one quarter','two-quarters':'Pay with exactly two quarters','three-quarters':'Pay with exactly three quarters','later-equal':'Match larger equal values','later-purchase':'Money left from a larger wallet'};
  ids.forEach(id=>{const option=document.createElement('option');option.value=id;option.textContent=`${names[id.slice(5)]} · p. ${api.COIN_SOURCE_MAP[id]}`;select.append(option);});
  const context={contextId:'coin-preview-context',match:{schemaVersion:1,player:{id:'duke',displayName:'Duke',shortName:'DUKE',endZoneName:'DUKE'},opponent:{id:'unc',displayName:'UNC',shortName:'UNC',endZoneName:'UNC'}},possession:'offense',direction:1,quarter:1,down:1,yardsToGo:10,yardLine:20,firstDownLine:30,driveStart:20,scores:{player:0,opponent:0},totalYards:{player:0,opponent:0},plays:0,drivePlays:0,calls:{offense:'shortRun',defense:null,matchup:null},privateOpponentSnapshot:null};
  const snap=FOOTBALL_DOMAIN.createSnap(context,{gain:4,callKey:'shortRun',label:'Preview run'});
  const play=FOOTBALL_DOMAIN.createActivePlay({schemaVersion:1,playType:'scrimmage',gameId:'coin-preview-game',possessionId:'coin-preview-possession',playId:'coin-preview-play',contextId:context.contextId,context:snap.context,proposal:snap.proposal,call:snap.call});
  const profile={worktexts:{'Math Mammoth Grade 1-B':{edition:2026,completedThroughPage:181}}};
  function render(){
    const visual=question.visuals[stage];$('demo-visual').setAttribute('aria-label',visual.ariaLabel);FOOTBALL_COIN_VIEW.renderWallet($('demo-visual'),visual);
    $('demo-stage').textContent=stage==='initial'?'First try':stage==='guided'?'Try again with help':'Worked answer';
    $('demo-question').textContent=question.q;
    $('demo-feedback').textContent=stage==='worked'?question.explain:stage==='guided'?question.hintText:'';
    $('demo-choices').replaceChildren();question.choices.forEach(choice=>{const button=document.createElement('button');button.type='button';button.dataset.choiceId=choice.id;button.setAttribute('aria-label',choice.ariaLabel);button.textContent=choice.label;if(choice.coinSets)FOOTBALL_COIN_VIEW.renderChoice(button,choice);button.disabled=resolved;button.onclick=()=>{
      if(resolved)return;if(choice.id===question.correctChoiceId){resolved=true;stage='worked';render();$('demo-feedback').textContent=`Correct. ${question.explain}`;}
      else {misses++;if(misses>=2){resolved=true;stage='worked';render();}else{stage='guided';render();$('demo-feedback').textContent=`Try again. ${question.hintText}`;}}
    };$('demo-choices').append(button);});
    $('demo-source').textContent=`Math Mammoth Grade 1-B (2026), printed page ${question.introducedOnPage} · ${question.evidenceClass==='literacy'?'Read a supplied value':'Work out a value or coin set'}`;
    $('demo-count').textContent=`${index+1} of ${ids.length}`;select.value=ids[index];
  }
  function load(){stage='initial';misses=0;resolved=false;question=api.build(play,ids[index],{profile,presentationRng:()=>0.5});render();}
  select.onchange=()=>{index=ids.indexOf(select.value);load();};$('demo-next').onclick=()=>{index=(index+1)%ids.length;load();};$('demo-help').onclick=()=>{if(!resolved){stage='guided';render();}};$('demo-worked').onclick=()=>{stage='worked';resolved=true;render();};$('demo-again').onclick=load;
  load();
})();
