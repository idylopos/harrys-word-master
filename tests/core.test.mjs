import test from 'node:test';
import assert from 'node:assert/strict';
import {parseList,isCorrect,schedule,buildQueue} from '../dist/core.js';
import {initialText} from '../dist/vocabulary.js';
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
