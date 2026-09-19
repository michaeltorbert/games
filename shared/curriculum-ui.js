// One explicit progress confirmation per consumer-defined session boundary.
(() => {
  'use strict';
  const api=MATH_CURRICULUM,KEY='math-curriculum:progress:v1';
  let pending=null,snapshot=null;
  const read=()=>{try{const raw=localStorage.getItem(KEY);let value=null;try{value=JSON.parse(raw);}catch{}return {raw,value:api.normalize(value),blocked:raw!==null&&!api.normalize(value)};}catch{return {raw:null,value:null,blocked:true};}};
  function ask() {
    if(pending)return pending;
    pending=new Promise(resolve=>{
      let prior=read(),confirmed=null,live=true;
      const dialog=document.createElement('dialog');dialog.className='curriculum-dialog';dialog.setAttribute('aria-labelledby','curriculum-heading');
      dialog.innerHTML='<form><h2 id="curriculum-heading">What is the last page you finished?</h2><p>Math Mammoth Grade 1-B · 2026 edition</p><label for="curriculum-page">Printed page completed</label><input id="curriculum-page" type="text" inputmode="numeric" autocomplete="off" aria-describedby="curriculum-hint curriculum-error"><p id="curriculum-hint">Use the number printed on the page, not the PDF counter. Enter 0 if you have not started.</p><p class="curriculum-local">Saved only in this browser on this device.</p><p id="curriculum-error" role="alert"></p><div class="curriculum-actions"><button type="button" id="curriculum-cancel">Cancel</button><button type="submit" id="curriculum-submit">Continue</button></div><button type="button" id="curriculum-memory" hidden>Use for this session only</button></form>';
      const input=dialog.querySelector('input'),error=dialog.querySelector('#curriculum-error'),submit=dialog.querySelector('[type=submit]'),memory=dialog.querySelector('#curriculum-memory');
      input.value=String(prior.value?.completedThroughPage??snapshot?.completedThroughPage??api.BASELINE.completedThroughPage);
      const finish=value=>{if(!live)return;live=false;snapshot=value||snapshot;dialog.close();dialog.remove();pending=null;resolve(value);};
      const parsed=()=>/^\d+$/.test(input.value.trim())?Number(input.value.trim()):NaN;
      const check=()=>{const page=parsed();if(!api.validPage(page)){error.textContent='Enter a whole printed page from 0 to 187.';input.setAttribute('aria-invalid','true');return null;}return page;};
      const approve=page=>{const before=prior.value?.completedThroughPage??snapshot?.completedThroughPage??api.BASELINE.completedThroughPage;if(api.needsConfirmation(before,page)&&confirmed!==page){confirmed=page;error.textContent=`Change from page ${before} to page ${page}? Check the printed page, then confirm.`;submit.textContent='Confirm page';return false;}return true;};
      const local=page=>Object.freeze({worktext:api.BOOK,edition:api.EDITION,completedThroughPage:page,saved:false});
      if(prior.blocked){error.textContent='Saved progress is unavailable or from another version. You can continue without changing it.';memory.hidden=false;}
      input.addEventListener('input',()=>{confirmed=null;submit.textContent='Continue';input.removeAttribute('aria-invalid');error.textContent='';});
      memory.addEventListener('click',()=>{const page=check();if(page!==null&&approve(page))finish(local(page));});
      dialog.querySelector('#curriculum-cancel').onclick=()=>finish(null);
      dialog.addEventListener('cancel',event=>{event.preventDefault();finish(null);});
      dialog.querySelector('form').onsubmit=async event=>{
        event.preventDefault();const page=check();if(page===null||!approve(page))return;submit.disabled=true;
        try{
          if(!navigator.locks)throw new Error('no lock');
          await navigator.locks.request(KEY,()=>{
            if(!live)return;
            const fresh=read();if(fresh.raw!==prior.raw){prior=fresh;confirmed=null;error.textContent='Progress changed in another tab. Check your page and confirm again.';submit.textContent='Continue';return;}
            if(fresh.blocked)throw new Error('unreadable');
            const value={schemaVersion:1,worktext:api.BOOK,edition:api.EDITION,completedThroughPage:page,revision:(fresh.value?.revision??0)+1,updatedAt:new Date().toISOString(),provenance:'learner-reported'};
            localStorage.setItem(KEY,JSON.stringify(value));finish(Object.freeze({...value,saved:true}));
          });
        }catch{error.textContent='This page could not be saved. You can use it for this session only.';memory.hidden=false;}
        finally{submit.disabled=false;}
      };
      document.body.append(dialog);dialog.showModal();input.focus();input.select();
    });return pending;
  }
  globalThis.CURRICULUM_UI=Object.freeze({ask,key:KEY,current:()=>snapshot,text:()=>({open:!!pending,book:api.BOOK,edition:api.EDITION,page:snapshot?.completedThroughPage??null,saved:snapshot?.saved??false})});
})();
