// Display-only renderer for completed-answer explanations, shared by Mixed,
// Fact focus and Whole book. No state, storage, timers or answer authority.
// `shown` is a PLACE_ARITHMETIC projection ('columns' or 'steps') or a
// {kind:'text'} worked answer, optionally with a completed `equation` line.
const PLACE_WORKED_UI = (() => {
  'use strict';
  const node=(tag,text,className)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(className)n.className=className;return n;};
  function render(section,shown,headingId) {
    section.replaceChildren();section.hidden=!shown;
    if(!shown)return;
    const heading=node('h4',shown.heading);heading.id=headingId;section.setAttribute('aria-labelledby',headingId);
    const body=node('div',null,'arithmetic-explanation-body'), lines=node('ul',null,'arithmetic-explanation-lines');
    for(const line of shown.lines)lines.append(node('li',line));
    if(shown.kind==='columns') {
      // The lines carry the meaning for assistive technology; the grid is its visual alignment.
      const grid=node('div',null,'place-columns');grid.setAttribute('aria-hidden','true');grid.style.setProperty('--places',shown.places.length);
      const row=(sign,values,className,crossed)=>{grid.append(node('span',sign,`place-sign ${className}`));values.forEach((v,i)=>grid.append(node('span',v,`${className}${crossed&&crossed[i]?' place-crossed':''}`)));};
      row('',shown.places,'place-name');
      if(shown.carries)row('',shown.carries,'place-carry');
      if(shown.trades)row('',shown.trades,'place-trade');
      for(const r of shown.rows)row(r.sign,r.digits,`place-digit${r.result?' place-result':''}${r.answer?' place-answer':''}`,r.crossed);
      body.append(grid);
    }
    body.append(lines);
    section.append(heading);
    if(shown.equation)section.append(node('p',shown.equation,'arithmetic-explanation-equation'));
    section.append(body);
  }
  return Object.freeze({render});
})();
globalThis.PLACE_WORKED_UI = PLACE_WORKED_UI;
