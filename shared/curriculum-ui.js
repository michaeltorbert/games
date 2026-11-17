// One explicit progress confirmation per consumer-defined session boundary.
// The learner picks one book per prompt (#219). Grade 1-B and Grade 2-A keep
// separate, separately locked records; every answer snapshots both so Grade
// 1-B availability (coins, facts, Mixed) survives a Grade 2-A report.
(() => {
  'use strict';
  const api=MATH_CURRICULUM,api2=typeof MATH_CURRICULUM_2A==='undefined'?null:MATH_CURRICULUM_2A;
  const KEY='math-curriculum:progress:v1',KEY_2A='math-curriculum:progress:grade2a:v1',BOOK_KEY='math-curriculum:selected-book:v1';
  const BOOKS={
    '1-B':{api,key:KEY,name:'Math Mammoth Grade 1-B · 2026 edition',fallback:()=>api.BASELINE.completedThroughPage},
    ...(api2?{'2-A':{api:api2,key:KEY_2A,name:'Math Mammoth Grade 2-A · 2025 revision · practice covers Chapter 1 (pages 10-32)',fallback:()=>0}}:{}),
  };
  let pending=null,last=null,notes={};
  const sessionOnly={};
  const read=book=>{const {api:a,key}=BOOKS[book];try{const raw=localStorage.getItem(key);let value=null;try{value=JSON.parse(raw);}catch{}return {raw,value:a.normalize(value),blocked:raw!==null&&!a.normalize(value)};}catch{return {raw:null,value:null,blocked:true};}};
  const preferred=()=>{try{const value=localStorage.getItem(BOOK_KEY);return BOOKS[value]?value:'1-B';}catch{return '1-B';}};
  const remember=book=>{try{localStorage.setItem(BOOK_KEY,book);}catch{}};
  const local=(book,page)=>Object.freeze({worktext:BOOKS[book].api.BOOK,edition:BOOKS[book].api.EDITION,completedThroughPage:page,saved:false});
  // Saved record, else this visit's session-only answer, else the packaged
  // fallback (Grade 1-B baseline 113; Grade 2-A not started, 0).
  const resolve=(book,fresh=read(book))=>fresh.value?Object.freeze({...fresh.value,saved:true}):sessionOnly[book]||local(book,BOOKS[book].fallback());
  const combine=(selected,values)=>{
    const g1=values['1-B'],g2=api2?values['2-A']:null;
    return Object.freeze({...g1,selectedBook:selected,...(g2?{grade2a:g2}:{})});
  };
  function ask() {
    if(pending)return pending;
    pending=new Promise(done=>{
      let book=last?.selectedBook&&BOOKS[last.selectedBook]?last.selectedBook:preferred(),prior=read(book),confirmed=null,live=true;
      const dialog=document.createElement('dialog');dialog.className='curriculum-dialog';dialog.setAttribute('aria-labelledby','curriculum-heading');
      // Buttons in a radio group keep the page number the dialog's only text field.
      const choices=Object.keys(BOOKS).length>1?`<p class="curriculum-books-label" id="curriculum-books-label">Book</p><div class="curriculum-books" role="radiogroup" aria-labelledby="curriculum-books-label">${Object.keys(BOOKS).map(id=>`<button type="button" role="radio" data-book="${id}">Grade ${id}</button>`).join('')}</div>`:'';
      dialog.innerHTML=`<form><h2 id="curriculum-heading">What is the last page you finished?</h2>${choices}<p id="curriculum-book-name"></p><p id="curriculum-book-note" hidden></p><label for="curriculum-page">Printed page completed</label><input id="curriculum-page" type="text" inputmode="numeric" autocomplete="off" aria-describedby="curriculum-hint curriculum-error"><p id="curriculum-hint">Use the number printed on the page, not the PDF counter. Enter 0 if you have not started.</p><p class="curriculum-local">Saved only in this browser on this device.</p><p id="curriculum-error" role="alert"></p><div class="curriculum-actions"><button type="button" id="curriculum-cancel">Cancel</button><button type="submit" id="curriculum-submit">Continue</button></div><button type="button" id="curriculum-memory" hidden>Use for this session only</button></form>`;
      const input=dialog.querySelector('input#curriculum-page'),error=dialog.querySelector('#curriculum-error'),submit=dialog.querySelector('[type=submit]'),memory=dialog.querySelector('#curriculum-memory'),name=dialog.querySelector('#curriculum-book-name'),note=dialog.querySelector('#curriculum-book-note');
      const before=()=>prior.value?.completedThroughPage??sessionOnly[book]?.completedThroughPage??(book==='1-B'?last?.completedThroughPage:last?.grade2a?.completedThroughPage)??BOOKS[book].fallback();
      const reset=()=>{confirmed=null;submit.textContent='Continue';input.removeAttribute('aria-invalid');error.textContent='';};
      const show=()=>{
        name.textContent=BOOKS[book].name;note.textContent=Object.keys(BOOKS).length>1?notes[book]||'':'';note.hidden=!note.textContent;input.value=String(before());reset();memory.hidden=true;
        for(const radio of dialog.querySelectorAll('[data-book]')){const on=radio.dataset.book===book;radio.setAttribute('aria-checked',String(on));radio.tabIndex=on?0:-1;}
        if(prior.blocked){error.textContent='Saved progress is unavailable or from another version. You can continue without changing it.';memory.hidden=false;}
      };
      const finish=value=>{if(!live)return;live=false;if(value){if(!value.saved)sessionOnly[book]=value;const values={};for(const id of Object.keys(BOOKS))values[id]=id===book?value:resolve(id);last=combine(book,values);remember(book);}dialog.close();dialog.remove();pending=null;done(value?last:null);};
      const parsed=()=>/^\d+$/.test(input.value.trim())?Number(input.value.trim()):NaN;
      const check=()=>{const page=parsed();if(!BOOKS[book].api.validPage(page)){error.textContent=`Enter a whole printed page from 0 to ${BOOKS[book].api.LAST_PAGE}.`;input.setAttribute('aria-invalid','true');return null;}return page;};
      const approve=page=>{const from=before();if(BOOKS[book].api.needsConfirmation(from,page)&&confirmed!==page){confirmed=page;error.textContent=`Change from page ${from} to page ${page}? Check the printed page, then confirm.`;submit.textContent='Confirm page';return false;}return true;};
      show();
      const radios=[...dialog.querySelectorAll('[data-book]')];
      const choose=id=>{if(id===book||!BOOKS[id])return;book=id;prior=read(book);show();};
      for(const radio of radios){
        radio.addEventListener('click',()=>{choose(radio.dataset.book);radio.focus();});
        radio.addEventListener('keydown',event=>{const step={ArrowRight:1,ArrowDown:1,ArrowLeft:-1,ArrowUp:-1}[event.key];if(!step)return;event.preventDefault();const next=radios[(radios.indexOf(radio)+step+radios.length)%radios.length];choose(next.dataset.book);next.focus();});
      }
      input.addEventListener('input',reset);
      memory.addEventListener('click',()=>{const page=check();if(page!==null&&approve(page))finish(local(book,page));});
      dialog.querySelector('#curriculum-cancel').onclick=()=>finish(null);
      dialog.addEventListener('cancel',event=>{event.preventDefault();finish(null);});
      dialog.querySelector('form').onsubmit=async event=>{
        event.preventDefault();const page=check();if(page===null||!approve(page))return;submit.disabled=true;
        const target=book,{api:a,key}=BOOKS[target];
        try{
          if(!navigator.locks)throw new Error('no lock');
          await navigator.locks.request(key,()=>{
            if(!live||target!==book)return;
            const fresh=read(target);if(fresh.raw!==prior.raw){prior=fresh;confirmed=null;error.textContent='Progress changed in another tab. Check your page and confirm again.';submit.textContent='Continue';return;}
            if(fresh.blocked)throw new Error('unreadable');
            const value={schemaVersion:1,worktext:a.BOOK,edition:a.EDITION,completedThroughPage:page,revision:(fresh.value?.revision??0)+1,updatedAt:new Date().toISOString(),provenance:'learner-reported'};
            localStorage.setItem(key,JSON.stringify(value));finish(Object.freeze({...value,saved:true}));
          });
        }catch{error.textContent='This page could not be saved. You can use it for this session only.';memory.hidden=false;}
        finally{submit.disabled=false;}
      };
      document.body.append(dialog);dialog.showModal();input.focus();input.select();
    });return pending;
  }
  // Each page states where the chosen book's practice lives there.
  const configure=value=>{notes=Object.freeze({...(value?.notes||{})});};
  globalThis.CURRICULUM_UI=Object.freeze({ask,configure,key:KEY,key2a:KEY_2A,bookKey:BOOK_KEY,current:()=>last,
    text:()=>({open:!!pending,book:api.BOOK,edition:api.EDITION,page:last?.completedThroughPage??null,saved:last?.saved??false,
      selectedBook:last?.selectedBook??null,grade2aPage:last?.grade2a?.completedThroughPage??null})});
})();
