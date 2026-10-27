// Shared by the production question desk and the storage-free coin preview.
// Diameter ratios: US Mint circulating coin specifications (mm), checked
// 2026-10-27: https://www.usmint.gov/learn/coins-and-medals/circulating-coins/coin-specifications
const FOOTBALL_COIN_VIEW = (() => {
  const names={1:'penny',5:'nickel',10:'dime',25:'quarter'};
  const diameters={1:19.05,5:21.21,10:17.91,25:24.26};
  function coin(value) {
    const node=document.createElement('span');
    node.className=`shop-coin shop-coin-${value}`;
    node.style.setProperty('--coin-ratio',diameters[value]/24.26);
    node.setAttribute('role','img');
    node.setAttribute('aria-label',`${names[value]}, ${value} ${value===1?'cent':'cents'}`);
    node.textContent=`${value}¢`;
    return node;
  }
  function set(coins) {
    const row=document.createElement('span');row.className='shop-coin-set';
    coins.forEach(value=>row.append(coin(value)));return row;
  }
  function renderWallet(container,visual) {
    const data=visual.data;container.replaceChildren();
    const title=document.createElement('div');title.className='shop-heading';title.textContent=data.heading;container.append(title);
    const content=document.createElement('div');content.className='shop-content';container.append(content);
    if(data.referenceCoins?.length){const label=document.createElement('span');label.className='shop-note shop-reference';label.append('Coin value: ',set(data.referenceCoins));content.append(label);}
    if(data.coins.length)content.append(set(data.coins));
    if(data.add) {const extra=document.createElement('span');extra.className='shop-add';extra.append(' + ',coin(data.add));content.append(extra);}
    const facts=[];
    if(data.target!==null)facts.push(`Practice price: ${data.target}¢`);
    if(data.price!==null)facts.push(`Spend: ${data.price}¢`);
    if(data.suppliedDollar)facts.push('$1 = 100¢');
    if(facts.length){const note=document.createElement('div');note.className='shop-note';note.textContent=facts.join(' · ');content.append(note);}
    if(visual.stage==='worked' && visual.result && typeof visual.result.value==='number') {
      const result=document.createElement('div');result.className='shop-note';result.textContent=`Answer: ${visual.result.value} ${data.answerUnit}`;content.append(result);
    }
  }
  function renderChoice(container,choice) {
    container.replaceChildren();container.classList.add('shop-choice');
    choice.coinSets.forEach((coins,i)=>{if(i){const or=document.createElement('span');or.className='shop-and';or.textContent='and';container.append(or);}container.append(set(coins));});
  }
  return Object.freeze({coin,set,renderWallet,renderChoice});
})();
globalThis.FOOTBALL_COIN_VIEW=FOOTBALL_COIN_VIEW;
