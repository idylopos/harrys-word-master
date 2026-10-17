import test from 'node:test';
import assert from 'node:assert/strict';
import {parseList,isCorrect,schedule,buildQueue,resolveSelectedListIds,chapterKey,cardsForLists,mergeBuiltInLists} from '../dist/core.js';
import {initialText,day11Text,day12Text} from '../dist/vocabulary.js';
const words=parseList(initialText).words;
test('all 120 supplied words and 4 chapter headings parse without dropped lines',()=>{assert.equal(words.length,120);assert.equal(parseList(initialText).skipped.length,0);for(const chapter of [7,8,9,10])assert.equal(words.filter(w=>w.chapter===`Chapter ${chapter}`).length,30);assert.equal(words.find(w=>w.english==='peer').korean,'1. 또래, 친구, 2.동료');});
test('any listed meaning, optional parentheses, spacing and punctuation work',()=>{for(const [english,answer] of [['trim','다듬다'],['trim','손질하다'],['grab','먹다'],['roast','볶다'],['condition','조건'],['by oneself','혼자힘으로'],['sew','을 꿰매다']])assert.equal(isCorrect(answer,words.find(w=>w.english===english),'en-ko'),true,english);assert.equal(isCorrect('다듬',words.find(w=>w.english==='trim'),'en-ko'),false);assert.equal(isCorrect('TRIM.',words.find(w=>w.english==='trim'),'ko-en'),true);assert.equal(isCorrect('',words[0],'en-ko'),false);});
test('imports plain text, CSV, TSV, multi-word entries and flags malformed rows',()=>{const result=parseList('English,Korean\nCHAP.11\nask for,"요청하다, 부탁하다"\ntrim\t다듬다\nset up 1. 설치하다 2. 준비하다\nbad row\ntrim\t다듬다');assert.equal(result.words.length,3);assert.equal(result.words[0].korean,'요청하다, 부탁하다');assert.equal(result.skipped.length,2);});
test('successful due reviews expand through 1,3,7,14,30,60,90 days',()=>{let now=1000000,p;for(const days of [1,3,7,14,30,60,90,90]){p=schedule(p,true,now);assert.equal(p.due-now,days*86400000);now=p.due;}});
test('missed cards reset to ten minutes then restart at one day',()=>{const p=schedule({level:4,due:0},false,1000000);assert.equal(p.due,1600000);assert.equal(p.level,-1);const next=schedule(p,true,p.due);assert.equal(next.level,0);assert.equal(next.due-p.due,86400000);});
test('early correct practice cannot advance a scheduled card',()=>{const p={level:2,due:9999999};assert.equal(schedule(p,true,100).due,p.due);assert.equal(schedule(p,true,100).level,2);});
test('queue puts due reviews before new cards and excludes future reviews',()=>{const cards=[{key:'future'},{key:'new'},{key:'due'}],p={future:{due:500},due:{due:50}};assert.deepEqual(buildQueue(cards,p,10,100).map(c=>c.key),['due','new']);assert.equal(buildQueue(cards,p,10,100,true).length,3);assert.equal(buildQueue(cards,p,1,100)[0].key,'due');});
test('English and Korean directions keep independent schedules',()=>{const p={'trim/en-ko':schedule(undefined,true,100)};assert.deepEqual(buildQueue([{key:'trim/en-ko'},{key:'trim/ko-en'}],p,10,200).map(c=>c.key),['trim/ko-en']);});

test('imports the supplied broken table as exactly 21 words, excluding commentary and derived words', async()=>{
  const {readFile}=await import('node:fs/promises');
  const pasted=await readFile(new URL('./fixtures/copied-extraction.txt',import.meta.url),'utf8');
  const result=parseList(pasted);
  assert.deepEqual(result.words.map(w=>w.english),['purpose','perform','agency','appoint','succeed','operate','associate','profession','expert','document','deal with','obtain','illustrate','achieve','confirm','distribute','superior','retire','assign','look forward to','carry out']);
  assert.equal(result.words[0].korean,'목적, 의도');
  assert.equal(result.words[3].korean,'임명하다, 지명하다, (시간·장소 등을) 약속하다');
  assert.equal(result.words[6].korean,'동료 / 연상하다, 결부시키다');
  assert.equal(result.words[19].korean,'~을 고대하다');
  assert.equal(result.words[20].korean,'수행하다, 실행하다');
  assert.equal(result.skipped.length,3); // Intro and two closing comments, not table formatting.
  assert.ok(result.words.every(w=>!/[|\\*]/.test(w.korean)));
  assert.ok(isCorrect('을 고대하다', result.words[19], 'en-ko'));
});
test('reads regular Markdown tables and retains multiple meanings and phrases',()=>{
  const result=parseList('| 번호 | 영어단어 | 품사 | 뜻 |\n| --- | --- | --- | --- |\n| 0316 | **associate** | 명사 / 동사 | 동료 / 연상하다, 결부시키다 |\n| 0329 | look forward to | 숙어 | \\~을 고대하다 |');
  assert.equal(result.skipped.length,0);
  assert.deepEqual(result.words.map(w=>[w.english,w.korean]),[['associate','동료 / 연상하다, 결부시키다'],['look forward to','~을 고대하다']]);
});
test('reads numbered TSV and quoted CSV exports with optional parts of speech',()=>{
  const result=parseList('번호\t영어단어\t품사\t뜻\n0310\tpurpose\t명사\t목적, 의도\n"0311","perform","동사","수행하다, 실행하다, 공연하다"');
  assert.equal(result.skipped.length,0);
  assert.deepEqual(result.words.map(w=>[w.english,w.korean]),[['purpose','목적, 의도'],['perform','수행하다, 실행하다, 공연하다']]);
});
test('handles vertical entries and inline numbering without treating parts of speech as answers',()=>{
  const result=parseList('0310\npurpose\n명사\n목적, 의도\n0311 perform 동사 수행하다, 실행하다\n- **deal with** 처리하다, 다루다');
  assert.equal(result.skipped.length,0);
  assert.deepEqual(result.words.map(w=>[w.english,w.korean]),[['purpose','목적, 의도'],['perform','수행하다, 실행하다'],['deal with','처리하다, 다루다']]);
});
test('does not link an incomplete vertical word to the next numbered entry or chapter',()=>{
  const result=parseList('0310\npurpose\n명사\n0311\nperform\n동사\n수행하다\nunfinished\nCHAPTER 12\ntrim 다듬다\ntrailing');
  assert.deepEqual(result.words.map(w=>w.english),['perform','trim']);
  assert.equal(result.words[1].chapter,'Chapter 12');
  assert.equal(result.skipped.length,3);
});

const testLists = [
  {id:'day-11',name:'Day 11',words:parseList('manage 운영하다\nfirm 회사').words},
  {id:'day-12',name:'Day 12',words:parseList('ride 타다\nfirm 단단한').words},
  {id:'day-13',name:'Day 13',words:parseList('outside 밖에').words}
];
test('migrates old single-list selections and restores multiple selections without touching progress',()=>{
  const old={lists:testLists,selected:'day-12',progress:{'day-12/My words:ride/en-ko':{due:900,level:3}}};
  const original=JSON.stringify(old);
  assert.deepEqual(resolveSelectedListIds(old),['day-12']);
  assert.equal(JSON.stringify(old),original);
  assert.deepEqual(resolveSelectedListIds({...old,selectedListIds:['day-11','day-12','day-11','missing']}),['day-11','day-12']);
  assert.deepEqual(resolveSelectedListIds({...old,selectedListIds:['missing']}),['day-11']);
});
test('combines selected lists into one queue and excludes unchecked lists',()=>{
  const cards=cardsForLists(testLists,['day-11','day-12']);
  assert.equal(cards.length,8);
  assert.equal(new Set(cards.map(c=>c.key)).size,8);
  const queue=buildQueue(cards,{},100);
  assert.deepEqual(new Set(queue.map(c=>c.listName)),new Set(['Day 11','Day 12']));
  assert.ok(queue.every(c=>c.word.english!=='outside'));
});
test('identical chapter names stay separate across lists and respect direction filters',()=>{
  const cards=cardsForLists(testLists,['day-11','day-12'],{chapters:[chapterKey('day-12','My words')],direction:'ko-en'});
  assert.equal(cards.length,2);
  assert.ok(cards.every(c=>c.listId==='day-12'&&c.direction==='ko-en'));
  assert.equal(cardsForLists(testLists,['day-11'],{chapters:[]}).length,0);
});
test('existing review keys and schedules apply to the same cards after combining lists',()=>{
  const progress={'day-11/My words:manage/en-ko':{level:2,due:50},'day-12/My words:ride/en-ko':{level:1,due:900}};
  const queue=buildQueue(cardsForLists(testLists,['day-11','day-12'],{direction:'en-ko'}),progress,100,100);
  assert.equal(queue[0].key,'day-11/My words:manage/en-ko');
  assert.equal(queue.length,3);
  assert.ok(queue.every(c=>c.key!=='day-12/My words:ride/en-ko'));
  assert.equal(progress[queue[0].key].level,2);
});

const publicDays = [
  {id:'builtin-day-11',name:'Day 11 — Jobs & Work (0301–0330)',words:parseList(day11Text).words},
  {id:'builtin-day-12',name:'Day 12 — City & Traffic (0331–0360)',words:parseList(day12Text).words}
];
const emptyLearner = () => ({lists:[],progress:{},selected:'builtin-day-11',selectedListIds:['builtin-day-11','builtin-day-12'],attempts:0,correct:0,streak:0,best:0});
test('both public day lists include all 30 supplied words and meanings',()=>{
  assert.equal(parseList(day11Text).skipped.length,0);
  assert.equal(parseList(day12Text).skipped.length,0);
  assert.equal(publicDays[0].words.length,30);
  assert.equal(publicDays[1].words.length,30);
  assert.equal(publicDays[0].words[0].english,'manage');
  assert.equal(publicDays[0].words[29].english,'carry out');
  assert.equal(publicDays[1].words[0].english,'ride');
  assert.equal(publicDays[1].words[29].english,'bring about');
  assert.equal(publicDays[0].words.find(w=>w.english==='employ').korean,'고용하다, (물건·기술 등을) 사용하다');
  assert.equal(publicDays[1].words.find(w=>w.english==='be likely to').korean,'~할 가능성이 크다, ~할 것 같다');
});
test('fresh learners get both day lists with separate private progress and copies of vocabulary',()=>{
  const a=mergeBuiltInLists(emptyLearner(),publicDays), b=mergeBuiltInLists(emptyLearner(),publicDays);
  assert.equal(a.lists.length,2);
  assert.equal(cardsForLists(a.lists,resolveSelectedListIds(a)).length,120);
  const key=cardsForLists(a.lists,resolveSelectedListIds(a))[0].key;
  a.progress[key]=schedule(undefined,true,100);
  a.attempts++;
  assert.deepEqual(b.progress,{});
  assert.equal(b.attempts,0);
  assert.notEqual(a.lists[0].words[0],b.lists[0].words[0]);
  assert.ok(a.lists.every(l=>l.builtinId===l.id));
});
test('returning learners and old backups receive missing built-ins once without losing private lists or scores',()=>{
  const old={...emptyLearner(),lists:[{id:'custom',name:'My own list',words:parseList('extra 추가의').words}],selected:'custom',selectedListIds:['custom'],progress:{'custom/My words:extra/en-ko':{level:2,due:900}},attempts:7,correct:5};
  const snapshot=JSON.stringify(old);
  const upgraded=mergeBuiltInLists(old,publicDays);
  assert.equal(upgraded.lists.length,3);
  assert.equal(upgraded.lists[0],old.lists[0]);
  assert.deepEqual(upgraded.progress,old.progress);
  assert.deepEqual(upgraded.selectedListIds,['custom']);
  assert.equal(upgraded.attempts,7);
  assert.equal(upgraded.correct,5);
  assert.equal(mergeBuiltInLists(upgraded,publicDays).lists.length,3);
  assert.equal(JSON.stringify(old),snapshot);
});
test('matching imports keep their IDs, chapters, titles, selection and both directional review schedules',()=>{
  const imported={id:'uploaded-uuid',name:'My Day11',words:publicDays[0].words.map(w=>({...w,id:`Chapter 11:${w.english}`,chapter:'Chapter 11',korean:w.korean.replace('회사, 단단한','회사 / 단단한')}))};
  const originalKey='uploaded-uuid/Chapter 11:manage/en-ko', reverseKey='uploaded-uuid/Chapter 11:manage/ko-en';
  const old={...emptyLearner(),lists:[imported],selected:'uploaded-uuid',selectedListIds:['uploaded-uuid'],progress:{[originalKey]:{level:3,due:800},[reverseKey]:{level:1,due:900}}};
  const upgraded=mergeBuiltInLists(old,publicDays);
  assert.equal(upgraded.lists.length,2);
  assert.equal(upgraded.lists[0].id,'uploaded-uuid');
  assert.equal(upgraded.lists[0].name,'My Day11');
  assert.equal(upgraded.lists[0].builtinId,'builtin-day-11');
  assert.deepEqual(upgraded.lists[0].words,imported.words);
  assert.deepEqual(resolveSelectedListIds(upgraded),['uploaded-uuid']);
  const cards=cardsForLists(upgraded.lists,['uploaded-uuid']);
  assert.equal(upgraded.progress[cards.find(c=>c.key===originalKey).key].level,3);
  assert.equal(upgraded.progress[cards.find(c=>c.key===reverseKey).key].level,1);
});
test('partial or customized imports are preserved instead of being replaced by public lists',()=>{
  const partial={id:'partial',name:'Day 11',words:publicDays[0].words.slice(0,21)};
  const edited={id:'edited',name:'Day 12',words:publicDays[1].words.map((w,i)=>i===0?{...w,korean:'나만의 뜻'}:w)};
  const upgraded=mergeBuiltInLists({...emptyLearner(),lists:[partial,edited]},publicDays);
  assert.equal(upgraded.lists.length,4);
  assert.equal(upgraded.lists[0],partial);
  assert.equal(upgraded.lists[1],edited);
  assert.equal(upgraded.lists[2].words.length,30);
  assert.equal(upgraded.lists[3].words.length,30);
});
