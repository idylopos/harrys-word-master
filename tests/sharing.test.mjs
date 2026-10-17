import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { encodeShareHash, decodeShareHash, sharedListFile, parseSharedListFile, addSharedList } from '../dist/sharing.js';
import { parseList } from '../dist/core.js';
import { day11Text } from '../dist/vocabulary.js';

const sample={id:'sender-id',name:'Day 13 · 새 단어 ✳',words:parseList('CHAPTER 13\ntrim 다듬다, 손질하다\nlook forward to ~을 고대하다').words,progress:{private:'never-share'},attempts:99,secret:'private'};
const payload=()=>JSON.parse(sharedListFile(sample));
const plainHash=value=>'#share=1u.'+Buffer.from(JSON.stringify(value)).toString('base64url');

test('shared links and files contain vocabulary only, excluding sender IDs and all progress',async()=>{
 const file=sharedListFile(sample),p=JSON.parse(file);
 assert.deepEqual(Object.keys(p),['format','version','name','words']);
 assert.ok(!file.includes('private')&&!file.includes('sender-id')&&!file.includes('attempts'));
 const shared=await decodeShareHash(await encodeShareHash(sample));
 assert.equal(shared.name,sample.name);
 assert.deepEqual(shared.words,sample.words);
 assert.deepEqual(Object.keys(shared),['name','words']);
 assert.deepEqual(parseSharedListFile(file),shared);
});
test('plain links work as a fallback and gzip shortens a real 30-word list',async()=>{
 const list={name:'Day 11',words:parseList(day11Text).words};
 const plain=await encodeShareHash(list,{compress:false}),compressed=await encodeShareHash(list);
 assert.ok(plain.startsWith('#share=1u.'));
 assert.ok(compressed.startsWith('#share=1z.'));
 assert.ok(compressed.length<plain.length);
 assert.deepEqual(await decodeShareHash(plain),await decodeShareHash(compressed));
 assert.equal((await decodeShareHash(compressed)).words.length,30);
});
test('malformed, truncated and unsupported share links fail without importing data',async()=>{
 for(const hash of ['#share=2u.aaaa','#share=1u.!','#share=1u.A','#share=1z.YWJj','#share=1u.','not-a-share']){
  await assert.rejects(decodeShareHash(hash));
 }
 await assert.rejects(decodeShareHash('#share=1u.'+'a'.repeat(16000)),/too long/);
});
test('decompressed input is bounded even when a small link expands to a huge payload',async()=>{
 const hash='#share=1z.'+gzipSync(' '.repeat(600000)).toString('base64url');
 assert.ok(hash.length<16000);
 await assert.rejects(decodeShareHash(hash),/too large/);
});
test('rejects invalid formats, oversized values, duplicate cards, or missing Korean meanings',async()=>{
 const invalids=[{...payload(),version:2},{...payload(),format:'backup'},{...payload(),name:''},{...payload(),name:'a'.repeat(81)},{...payload(),words:[]},{...payload(),words:Array(1001).fill(['word','뜻','My words'])},{...payload(),words:[['word','English only','My words']]},{...payload(),words:[['<script>','뜻','My words']]},{...payload(),words:[['word','뜻','My words'],['WORD','다른 뜻','My words']]},{...payload(),words:[['word','뜻\nmore','My words']] }];
 for(const value of invalids){
  assert.throws(()=>parseSharedListFile(JSON.stringify(value)));
  await assert.rejects(decodeShareHash(plainHash(value)));
 }
 assert.throws(()=>parseSharedListFile(' '.repeat(500001)),/too large/);
 assert.throws(()=>parseSharedListFile('{broken'),/invalid or incomplete/);
});
test('untrusted extra metadata is discarded and display text remains plain data',async()=>{
 const p={...payload(),name:'<img src=x onerror=alert(1)>',id:'steal-id',progress:{score:999},attempts:999};
 const shared=await decodeShareHash(plainHash(p));
 assert.equal(shared.name,p.name);
 assert.equal(shared.id,undefined);
 assert.equal(shared.progress,undefined);
 assert.equal(shared.attempts,undefined);
});
test('import adds only one list and keeps the recipient’s existing lists, scores and schedules',async()=>{
 const shared=await decodeShareHash(await encodeShareHash(sample));
 const existing={id:'recipient',name:'My own words',words:parseList('apple 사과').words};
 const state={lists:[existing],selected:'recipient',selectedListIds:['recipient'],progress:{'recipient/My words:apple/en-ko':{level:4,due:900}},attempts:7,correct:6};
 const before=JSON.stringify(state),result=addSharedList(state,shared,'new-local-id');
 assert.equal(result.lists.length,2);
 assert.equal(result.lists[0],existing);
 assert.equal(result.lists[1].id,'new-local-id');
 assert.deepEqual(result.selectedListIds,['new-local-id']);
 assert.deepEqual(result.progress,state.progress);
 assert.equal(result.attempts,7);
 assert.equal(result.correct,6);
 assert.equal(JSON.stringify(state),before);
 assert.ok(!Object.keys(result.progress).some(k=>k.startsWith('new-local-id/')));
});
test('opening an equivalent list again reuses the recipient’s IDs and progress',async()=>{
 const shared=await decodeShareHash(await encodeShareHash(sample));
 const local={id:'my-existing-id',name:'My renamed list',words:shared.words};
 const key=`${local.id}/${local.words[0].id}/en-ko`;
 const state={lists:[local],progress:{[key]:{level:3,due:700}},attempts:8};
 const result=addSharedList(state,shared,'unused-id');
 assert.equal(result.lists.length,1);
 assert.equal(result.lists[0],local);
 assert.equal(result.selected,'my-existing-id');
 assert.equal(result.progress[key].level,3);
 assert.equal(result.attempts,8);
});
test('same-name lists with different vocabulary remain separate and ID collisions are rejected',()=>{
 const local={id:'old',name:sample.name,words:parseList('apple 사과').words};
 const state={lists:[local],progress:{}};
 const shared=parseSharedListFile(sharedListFile(sample));
 assert.equal(addSharedList(state,shared,'new').lists.length,2);
 assert.throws(()=>addSharedList(state,shared,'old'),/Could not save/);
});
test('larger lists can be shared as files when the plain link is too long',async()=>{
 const large={name:'Large list',words:Array.from({length:1000},(_,i)=>({english:'word',korean:'뜻'.repeat(20),chapter:`Chapter ${i}`}))};
 await assert.rejects(encodeShareHash(large,{compress:false}),/Download list file/);
 assert.equal(parseSharedListFile(sharedListFile(large)).words.length,1000);
});
