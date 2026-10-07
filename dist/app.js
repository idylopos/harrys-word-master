import { initialText } from './vocabulary.js';
import { parseList, isCorrect, schedule, buildQueue, meanings } from './core.js';
const $ = s => document.querySelector(s);
const escape = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const storageKey = 'harry-word-master-v1';
const seed = { id:'week-1', name:'This week · Chapters 7–10', words:parseList(initialText).words };
let state = { lists:[seed], selected:seed.id, progress:{}, attempts:0, correct:0, streak:0, best:0 };
let storageAvailable = true;
try { const saved = JSON.parse(localStorage.getItem(storageKey)); if (saved && Array.isArray(saved.lists) && saved.lists.length && saved.progress) state = saved; } catch { storageAvailable = false; }
let view = 'practice', queue = [], position = 0, results = [], answered = false, current, timer;
const list = () => state.lists.find(l => l.id === state.selected) || state.lists[0];
const cardKey = (word, direction) => `${list().id}/${word.id}/${direction}`;
const allCards = (everyList = false) => (everyList ? state.lists : [list()]).flatMap(l => l.words.flatMap(word => ['en-ko','ko-en'].map(direction => ({word,direction,key:`${l.id}/${word.id}/${direction}`}))));
function persist() { try { localStorage.setItem(storageKey,JSON.stringify(state)); storageAvailable = true; } catch { storageAvailable = false; } $('.save-status').textContent = storageAvailable ? '● Saved on this browser' : '⚠ Storage unavailable — keep this tab open'; }
function toast(message) { clearTimeout(timer); $('#toast').textContent=message; $('#toast').hidden=false; timer=setTimeout(()=>$('#toast').hidden=true,4000); }
function formatDue(timestamp) { const delta = timestamp-Date.now(); if(delta<=0) return 'Due now'; if(delta<3600000) return `In ${Math.ceil(delta/60000)} min`; return new Intl.DateTimeFormat(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(timestamp); }
function stats() {
 const cards=allCards(), due=cards.filter(c=>state.progress[c.key]?.due<=Date.now()), fresh=cards.filter(c=>!state.progress[c.key]);
 $('#word-total').textContent=list().words.length; $('#library-count').textContent=list().words.length;
 $('#practiced-total').textContent=allCards(true).filter(c=>state.progress[c.key]?.due<=Date.now()).length; $('#accuracy-total').textContent=state.attempts ? `${Math.round(state.correct/state.attempts*100)}%` : '—'; $('#streak-total').textContent=state.best;
 $('#review-count').textContent=allCards(true).filter(c=>state.progress[c.key]?.due<=Date.now()).length;
 $('#list-meta').textContent=`${list().words.length} words · ${due.length} due · ${fresh.length} new cards`;
}
function settings() {
 $('#week-select').innerHTML=state.lists.map(l=>`<option value="${escape(l.id)}">${escape(l.name)}</option>`).join(''); $('#week-select').value=list().id;
 $('#chapter-options').innerHTML=[...new Set(list().words.map(w=>w.chapter))].map(c=>`<label><input type="checkbox" value="${escape(c)}" checked>${escape(c)}</label>`).join(''); stats();
}
function switchView(next) {
 view=next; document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===next));
 ['practice','library','review'].forEach(v=>$(`#${v}-view`).hidden=v!==next);
 const names={practice:'Practice',library:'Word library',review:'Spaced repetition'}; $('#breadcrumb').textContent=names[next];
 $('#section-title').textContent={practice:'Your daily word workout',library:'A little collection of big ideas',review:'Right on time for a refresh'}[next];
 if(next==='library') renderLibrary(); if(next==='review') renderReview();
}
function selectedCards() {
 const chapters=[...document.querySelectorAll('#chapter-options input:checked')].map(c=>c.value), direction=$('#direction').value;
 return allCards().filter(c=>chapters.includes(c.word.chapter)&&(direction==='mixed'||direction===c.direction));
}
function startRound({early=false,onlyDue=false}={}) {
 const cards=selectedCards(); if(!cards.length){toast('Select at least one chapter to practice.');return;}
 const count=$('#session-size').value==='all'?cards.length:Number($('#session-size').value);
 queue=buildQueue(onlyDue?cards.filter(c=>state.progress[c.key]):cards,state.progress,count,Date.now(),early);
 position=0; results=[]; switchView('practice'); renderQuestion();
}
function renderQuestion() {
 answered=false; current=queue[position];
 $('#session-position').innerHTML=current?`Card <strong>${position+1}</strong> of ${queue.length}`:'Your learning rhythm';
 $('#session-score').textContent=`${results.filter(r=>r.correct).length} correct`;
 $('#session-progress').style.width=`${queue.length?position/queue.length*100:0}%`;
 if(!current) { renderComplete();return; }
 const {word,direction,key}=current, korean=direction==='ko-en', p=state.progress[key];
 $('#question-area').innerHTML=`<div class="question-card"><div class="card-top"><span class="chapter-tag">${escape(word.chapter)} · ${p?'Review':'New word'}</span><span class="direction-tag">${korean?'Korean → English':'English → Korean'}</span></div><div class="prompt"><span class="prompt-label">${korean?'What’s the English word?':'What does this word mean?'}</span><h2 ${korean?'class="korean" lang="ko"':''}>${escape(korean?meanings(word.korean).join(' · '):word.english)}</h2><p>${korean?'뜻에 맞는 영어 단어를 적어 보세요.':'한국어 뜻을 적어 보세요.'}</p></div><form id="answer-form"><label class="answer-label" for="answer">${korean?'English word':'Korean meaning'}</label><input id="answer" lang="${korean?'en':'ko'}" placeholder="${korean?'Type the English word…':'뜻을 입력하세요…'}" autocomplete="off" autocapitalize="off" spellcheck="false" required><div id="feedback" aria-live="polite"></div><div class="answer-actions"><button type="button" class="text-button" id="reveal">I don’t know yet</button><button class="button primary" id="check" type="submit">Check answer <span>↵</span></button></div></form></div><div class="srs-note"><b>Built to remember.</b> Correct → 1, 3, 7, 14, 30, 60, 90 days. Missed → 10 minutes.<br>English and Korean directions have separate review schedules.</div>`;
 $('#answer-form').addEventListener('submit',e=>{e.preventDefault();if(answered){advance();return;}grade(false);});
 $('#answer').addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.isComposing||e.keyCode===229))e.preventDefault();});
 $('#reveal').onclick=()=>grade(true);
}
function grade(reveal) {
 if(answered)return;
 const answer=$('#answer').value.trim(); if(!reveal&&!answer)return;
 const correct=!reveal&&isCorrect(answer,current.word,current.direction); answered=true;
 const next=schedule(state.progress[current.key],correct);state.progress[current.key]=next;
 state.attempts++; if(correct){state.correct++;state.streak++;state.best=Math.max(state.best,state.streak);}else state.streak=0;
 results.push({...current,correct});persist();stats();
 $('#answer').readOnly=true;$('#answer').required=false;
 $('#feedback').className=`feedback ${correct?'':'incorrect'}`;
 $('#feedback').innerHTML=`<strong>${correct?'✓ That’s right. Nicely done!':'Let’s give this one another look.'}</strong><p>${escape(current.word.english)} — <span lang="ko">${escape(current.word.korean)}</span></p><small>Next review: ${escape(formatDue(next.due))}${correct?' · A little more time to let it stick.':' · You’ll see this card again soon.'}</small>`;
 $('#reveal').hidden=true;$('#check').innerHTML=`${position+1===queue.length?'Finish round':'Next word'} <span>→</span>`;$('#check').focus();
}
function advance(){position++;renderQuestion();$('#answer')?.focus();}
function renderComplete() {
 const next=allCards().map(c=>state.progress[c.key]?.due).filter(t=>t>Date.now()).sort((a,b)=>a-b)[0];
 const count=results.filter(r=>r.correct).length;
 $('#question-area').innerHTML=`<div class="result"><div class="result-icon">✳</div><div class="eyebrow">A LITTLE PROGRESS, EVERY DAY</div><h2>${queue.length?'Look at you growing.':'You’re all caught up.'}</h2><p>${queue.length?`${count} of ${queue.length} cards correct. Your review schedule is saved.`:'No new or due cards match your selection.'}<br>${next?`Next scheduled card: ${escape(formatDue(next))}.`:'Try another chapter or add a new word list.'}</p><button class="button primary" id="continue-study">Check for more cards →</button><button class="button light" id="early-study">Practice early</button><p>Early correct answers keep their existing review date.<br>Missed answers return in 10 minutes.</p></div>`;
 $('#continue-study').onclick=()=>{if(allCards(true).some(c=>state.progress[c.key]?.due<=Date.now()))startDueRound();else startRound();};$('#early-study').onclick=()=>startRound({early:true});
}
function renderLibrary() {
 const query=$('#search').value.trim().toLowerCase();const words=list().words.filter(w=>`${w.english} ${w.korean}`.toLowerCase().includes(query));
 $('#word-list').innerHTML=words.length?words.map(w=>`<div class="word-row"><div><strong>${escape(w.english)}</strong><small>${escape(w.chapter)}</small></div><div lang="ko">${escape(w.korean)}<small>${['en-ko','ko-en'].map(d=>{const p=state.progress[cardKey(w,d)];return `${d==='en-ko'?'EN → KO':'KO → EN'}: ${p?escape(formatDue(p.due)):'New'}`;}).join(' · ')}</small></div></div>`).join(''):'<p class="review-explanation">No matching words. Try another search.</p>';
}
function renderReview() {
 const cards=allCards(true),due=cards.filter(c=>state.progress[c.key]?.due<=Date.now()),future=cards.filter(c=>state.progress[c.key]?.due>Date.now()).sort((a,b)=>state.progress[a.key].due-state.progress[b.key].due);
 $('#review-content').innerHTML=`<div class="result"><div class="result-icon">↻</div><h2>${due.length?`${due.length} ${due.length===1?"card":"cards"} ready for a refresh.`:'Your memory is taking root.'}</h2><p>Due reviews include every saved word list, in both directions.<br>${future.length?`Next review: ${escape(formatDue(state.progress[future[0].key].due))}.`:'Practice some new words to start your schedule.'}</p><button id="due-round" class="button primary" ${due.length?'':'disabled'}>Practice due cards →</button></div><p class="review-explanation">Each direction is learned separately. A correct answer moves a due card to the next interval. A mistake resets it to a 10-minute review. The next correct answer restarts at 1 day.</p>${future.slice(0,8).map(c=>`<div class="word-row"><div><strong>${escape(c.word.english)}</strong><small>${c.direction==='en-ko'?'English → Korean':'Korean → English'}</small></div><div>${escape(formatDue(state.progress[c.key].due))}</div></div>`).join('')}`;
 $('#due-round').onclick=startDueRound;
}
function startDueRound(){const cards=allCards(true).filter(c=>state.progress[c.key]?.due<=Date.now());const size=$('#session-size').value;queue=buildQueue(cards,state.progress,size==='all'?cards.length:Number(size));position=0;results=[];switchView('practice');renderQuestion();}
function previewImport(){const {words,skipped}=parseList($('#list-text').value);$('#import-preview').innerHTML=`${words.length} words found${skipped.length?` · <span class="warning">${skipped.length} unrecognized or duplicate lines will be skipped.</span><details><summary>View skipped lines</summary>${skipped.map(s=>`Line ${s.line}: ${escape(s.text)}`).join('<br>')}</details>`:''}`;return {words,skipped};}
function openUpload(){$('#upload-dialog').showModal();$('#list-name').focus();}
function exportBackup(){const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='harry-vocabulary-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function validateBackup(value){return value&&Array.isArray(value.lists)&&value.lists.length>0&&value.lists.every(l=>typeof l.id==='string'&&typeof l.name==='string'&&Array.isArray(l.words)&&l.words.length&&l.words.every(w=>['id','english','korean','chapter'].every(k=>typeof w[k]==='string')))&&value.progress&&typeof value.progress==='object'&&Object.values(value.progress).every(p=>p&&Number.isFinite(p.due)&&Number.isInteger(p.level)&&p.level>=-1&&p.level<=6)&&['attempts','correct','streak','best'].every(k=>Number.isFinite(value[k])&&value[k]>=0);}
$('#upload-form').onsubmit=e=>{e.preventDefault();const {words}=previewImport();if(!words.length){toast('Add at least one English word with a Korean meaning.');return;}const item={id:crypto.randomUUID(),name:$('#list-name').value.trim(),words};if(!item.name)return;state.lists.push(item);state.selected=item.id;persist();settings();$('#upload-dialog').close();$('#upload-form').reset();$('#import-preview').textContent='';$('#file-name').textContent='or paste your list below';startRound();toast(`${words.length} words added. Let’s practice.`);};
$('#file-input').onchange=async e=>{const file=e.target.files[0];if(!file)return;if(file.size>1000000){toast('Please choose a file smaller than 1 MB.');return;}try{$('#list-text').value=await file.text();$('#file-name').textContent=file.name;if(!$('#list-name').value)$('#list-name').value=file.name.replace(/\.[^.]+$/,'');previewImport();}catch{toast('Could not read that file. Try pasting the list.');}};
$('#list-text').oninput=previewImport;$('#close-upload').onclick=()=>$('#upload-dialog').close();
$('#week-select').onchange=()=>{state.selected=$('#week-select').value;persist();settings();startRound();};$('#new-round').onclick=()=>startRound();$('#search').oninput=renderLibrary;
for(const b of document.querySelectorAll('[data-view]'))b.onclick=()=>switchView(b.dataset.view);
for(const b of document.querySelectorAll('[data-upload]'))b.onclick=openUpload;
$('#backup').onclick=exportBackup;$('#restore').onclick=()=>$('#restore-file').click();$('#restore-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>5000000)throw Error();const data=JSON.parse(await file.text());if(!validateBackup(data))throw Error();if(!confirm('Restore this backup? It will replace the lists and progress currently saved in this browser.'))return;state=data;persist();settings();startRound();toast('Backup restored.');}catch{toast('This is not a valid Word Master backup.');}finally{e.target.value='';}};
window.addEventListener('hashchange',()=>{const target=location.hash.slice(1);if(['practice','library','review'].includes(target))switchView(target);});
window.addEventListener('focus',()=>{stats();if(view==='review')renderReview();});
setInterval(()=>{stats();if(view==='review')renderReview();},60000);
settings();persist();if(allCards(true).some(c=>state.progress[c.key]?.due<=Date.now()))startDueRound();else startRound();
