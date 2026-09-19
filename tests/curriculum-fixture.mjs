// Existing game regressions explicitly confirm the new startup boundary.
// Curriculum interaction/error cases use the unmodified Playwright fixture.
import {test as base,expect} from '@playwright/test';
export {expect};
export const test=base.extend({page:async({page,context},use)=>{
 await context.addInitScript(()=>{const handled=new WeakSet();new MutationObserver(()=>{const dialog=document.querySelector('.curriculum-dialog');if(!dialog)return;const memory=dialog.querySelector('#curriculum-memory');if(!memory.hidden&&handled.has(dialog)){memory.click();return;}if(handled.has(dialog)){if(dialog.querySelector('#curriculum-error').textContent.includes('another tab')&&!dialog.querySelector('[type=submit]').disabled)dialog.querySelector('form').requestSubmit();return;}handled.add(dialog);if(location.pathname.includes('/place-value-practice/')){const input=dialog.querySelector('input');input.value='187';input.dispatchEvent(new Event('input'));}dialog.querySelector('form').requestSubmit();if(dialog.querySelector('[type=submit]').textContent==='Confirm page')dialog.querySelector('form').requestSubmit();}).observe(document,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','disabled']});});
 const confirm=()=>expect(page.locator('.curriculum-dialog')).toHaveCount(0);
 const goto=page.goto.bind(page),reload=page.reload.bind(page);
 page.goto=async(...args)=>{const result=await goto(...args);await confirm();return result;};
 page.reload=async(...args)=>{const result=await reload(...args);await confirm();return result;};
 await use(page);
}});
