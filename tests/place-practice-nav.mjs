// Test-only navigation for Place by Place Math practice. It operates the real
// Options dialog (open, choose native radios, Apply) rather than any legacy button.
import {expect} from '@playwright/test';
export const ROUTES=Object.freeze({mixed:'Addition & subtraction',facts:'Number facts',book:'Book topics'});
export const mathPractice=page=>page.getByRole('button',{name:'Math practice',exact:true});
export const optionsButton=page=>page.getByRole('button',{name:/^Practice options, now /});
export const optionsDialog=page=>page.locator('dialog.practice-options');
const press=(locator,tap)=>tap?locator.tap():locator.click();
// Reads the checked choices by opening Options, then cancels without changing anything.
export async function checkedOptions(page){
 const dialog=optionsDialog(page);await optionsButton(page).click();await expect(dialog).toBeVisible();
 const value=await dialog.evaluate(d=>({focus:d.querySelector('[name="practice-focus"]:checked').value,presentation:d.querySelector('[name="practice-presentation"]:checked').value}));
 await dialog.getByRole('button',{name:'Cancel',exact:true}).click();await expect(dialog).toBeHidden();return value;
}
// Applies a focus and/or presentation choice; `tap` drives every step by touch.
export async function chooseOptions(page,{focus,presentation}={},{tap=false}={}){
 const dialog=optionsDialog(page);
 await press(optionsButton(page),tap);await expect(dialog).toBeVisible();
 if(focus)await press(dialog.getByRole('radio',{name:ROUTES[focus],exact:true}),tap);
 if(presentation)await press(dialog.getByRole('radio',{name:presentation==='plain'?'Plain':'Football',exact:true}),tap);
 await press(dialog.getByRole('button',{name:'Apply',exact:true}),tap);
 await expect(dialog).toBeHidden();
}
