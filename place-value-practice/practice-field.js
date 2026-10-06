// Display-only stadium drive shared by Addition & subtraction and Book topics.
// Each caller keeps its own yards and points; this view only draws them. Number facts keeps its own scene.
(() => {
  'use strict';
  const ART='assets/touchdown-stadium-v1.webp?v=1.7.0',RUNNER='assets/touchdown-runner-v1.webp?v=1.7.0';
  const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text)el.textContent=text;if(cls)el.className=cls;return el;};
  // Lazy art is not fetched while its practice panel is hidden, so Number facts still loads only its own two images.
  const art=(src,cls,width,height)=>{const img=node('img',null,cls);img.src=src;img.alt='';img.width=width;img.height=height;img.loading='lazy';img.decoding='async';return img;};
  function create(prefix,cls){
    const drive=node('section',null,`practice-field ${cls}`),title=node('h3','Touchdown drive','practice-field-title'),score=node('p',null,'practice-field-score');
    title.id=`${prefix}-drive-title`;score.id=`${prefix}-drive-score`;drive.setAttribute('aria-labelledby',title.id);
    const header=node('div',null,'practice-field-header');header.append(title,score);
    const track=node('div',null,'practice-field-track');track.setAttribute('role','progressbar');track.setAttribute('aria-labelledby',title.id);
    track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax','100');
    const turf=node('div',null,'practice-field-turf');turf.setAttribute('aria-hidden','true');
    for(const mark of [0,25,50,75,100]){const line=node('span',String(mark),'practice-field-yard');line.style.left=`${mark}%`;turf.append(line);}
    const runner=art(RUNNER,'practice-field-runner',800,700);turf.append(runner);track.append(turf);
    drive.append(art(ART,'practice-field-stadium',2048,768),header,track);
    // `yards` is the position on the current drive (0-99); the runner shifts by its own width so both ends stay on the field.
    function render(yards,points,text){
      score.textContent=text;drive.style.setProperty('--yard',String(yards));
      track.setAttribute('aria-valuenow',String(yards));track.setAttribute('aria-valuetext',`${yards} of 100 yards; ${points} points`);
    }
    return Object.freeze({element:drive,render});
  }
  globalThis.PLACE_PRACTICE_FIELD=Object.freeze({create});
})();
