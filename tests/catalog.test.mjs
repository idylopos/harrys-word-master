import test from 'node:test';
import assert from 'node:assert/strict';
import { parseList, deduplicateState, wordSignature, listSignature, cardsForLists, progressForCard, buildQueue } from '../dist/core.js';
import { createCatalogClient, mergeCatalogLists } from '../dist/catalog.js';
const list=(id,name,text)=>({id,name,words:parseList(text).words});
const state=lists=>({lists,selected:lists[0].id,selectedListIds:lists.map(l=>l.id),progress:{},attempts:8,correct:5,streak:1,best:4});
const catalogId='catalog-'+'a'.repeat(64);

test('duplicate lists consolidate by vocabulary, keeping selections, scores, recent reviews and recovery copies',()=>{
 const a=list('a','Day 11','trim 다듬다, 손질하다'),b=list('b','Imported Day 11','CHAPTER 11\ntrim 손질하다 / 다듬다');
 const original=state([a,b]);
 original.progress['a/My words:trim/en-ko']={level:3,due:900,reviewedAt:100};
 original.progress['b/Chapter 11:trim/en-ko']={level:-1,due:600,reviewedAt:200};
 const snapshot=JSON.stringify(original),result=deduplicateState(original);
 assert.equal(result.lists.length,1);assert.deepEqual(result.selectedListIds,['a']);
 assert.equal(result.progress['a/My words:trim/en-ko'].level,-1);
 assert.equal(result.progress['b/Chapter 11:trim/en-ko'].level,-1);
 assert.equal(result.attempts,8);assert.equal(result.correct,5);assert.equal(result.best,4);
 assert.equal(result.duplicateListArchive.length,1);assert.equal(result.duplicateListArchive[0].id,'b');
 assert.deepEqual(deduplicateState(result),result);assert.equal(JSON.stringify(original),snapshot);
});
test('repeated words across chapters consolidate without losing the later reverse-direction review',()=>{
 const a=list('a','Both','CHAPTER 11\ntrim 다듬다\nCHAPTER 12\ntrim 다듬다\nride 타다');
 const original=state([a]);original.progress['a/Chapter 12:trim/ko-en']={level:2,due:700,reviewedAt:500};
 const result=deduplicateState(original);assert.equal(result.lists[0].words.length,2);
 assert.equal(result.progress['a/Chapter 11:trim/ko-en'].level,2);
 assert.equal(result.duplicateListArchive[0].words.length,3);
});
test('same names with different words or meanings remain separate',()=>{
 const result=deduplicateState(state([list('a','Day 11','trim 다듬다'),list('b','Day 11','trim 장식하다')]));
 assert.equal(result.lists.length,2);
});
test('overlapping lists produce one card per word and direction, with aliases for progress',()=>{
 const lists=[list('a','Day 11','trim 다듬다\nride 타다'),list('b','Day 12','trim 다듬다\nvehicle 차량')];
 const cards=cardsForLists(lists,['a','b']);assert.equal(cards.length,6);
 const trim=cards.find(c=>c.word.english==='trim'&&c.direction==='en-ko');assert.equal(trim.aliases.length,2);
 const progress={'b/My words:trim/en-ko':{level:2,due:900,reviewedAt:500}};
 assert.equal(progressForCard(progress,trim).level,2);
 assert.equal(buildQueue(cards,progress,100,100).filter(c=>c.word.english==='trim'&&c.direction==='en-ko').length,0);
 const reverse=cards.find(c=>c.word.english==='trim'&&c.direction==='ko-en');assert.equal(progressForCard(progress,reverse),undefined);
});
test('definition order, duplicated senses, punctuation and chapter labels do not create duplicate lists',()=>{
 assert.equal(listSignature(list('a','one','CHAPTER 11\ntrim 다듬다, 손질하다, 다듬다')),listSignature(list('b','two','trim 손질하다 / 다듬다.')));
 assert.notEqual(wordSignature({english:'trim',korean:'다듬다'}),wordSignature({english:'trim',korean:'장식하다'}));
});
test('public catalog merges reuse local IDs and preserve recipient-only progress and selection',()=>{
 const local=list('local','My words','trim 다듬다'),original=state([local]);
 original.progress['local/My words:trim/en-ko']={level:2,due:900};
 const result=mergeCatalogLists(original,[{...list(catalogId,'Public trim','trim 다듬다'),catalogId}]);
 assert.equal(result.lists.length,1);assert.equal(result.lists[0].id,'local');assert.equal(result.lists[0].catalogId,catalogId);
 assert.equal(result.progress['local/My words:trim/en-ko'].level,2);assert.deepEqual(result.selectedListIds,['local']);
});
test('new public lists appear without selecting them or importing another person’s progress',()=>{
 const original=state([list('local','Mine','apple 사과')]);
 const result=mergeCatalogLists(original,[{...list(catalogId,'Public trim','trim 다듬다'),catalogId}]);
 assert.equal(result.lists.length,2);assert.deepEqual(result.selectedListIds,['local']);assert.deepEqual(result.progress,{});
 assert.equal(mergeCatalogLists(result,[result.lists[1]]).lists.length,2);
});
test('catalog publication sends only whitelisted vocabulary and canonicalizes repeated entries',async()=>{
 let sent;
 const client=createCatalogClient({url:'https://catalog.example',anonKey:'public-anon-key'},async(url,options)=>{
  sent={url,options};return {ok:true,json:async()=>[{id:catalogId,name:'Both',words:[['trim','다듬다','Chapter 11']]}]};
 });
 const original={...list('private-id','Both','CHAPTER 11\ntrim 다듬다\nCHAPTER 12\ntrim 다듬다'),progress:{private:99},attempts:99};
 const result=await client.publish(original),data=JSON.parse(sent.options.body).payload;
 assert.equal(data.words.length,1);assert.deepEqual(Object.keys(data),['format','version','name','words']);
 assert.ok(!sent.options.body.includes('private-id')&&!sent.options.body.includes('progress'));
 assert.equal(result.catalogId,catalogId);assert.equal(sent.url,'https://catalog.example/rest/v1/rpc/publish_word_list');
});
test('catalog reads validate records and disabled configuration cannot issue requests',async()=>{
 let requests=0;
 const disabled=createCatalogClient({url:'',anonKey:''},async()=>{requests++;});
 assert.equal(disabled.enabled,false);await assert.rejects(disabled.list(),/not connected/);assert.equal(requests,0);
 const client=createCatalogClient({url:'https://catalog.example',anonKey:'public'},async()=>({ok:true,json:async()=>[{id:catalogId,name:'Public',words:[['trim','다듬다','My words']]}]}));
 assert.equal((await client.list())[0].words[0].english,'trim');
 const invalid=createCatalogClient({url:'https://catalog.example',anonKey:'public'},async()=>({ok:true,json:async()=>[{id:'bad',name:'Public',words:[]}]}));
 await assert.rejects(invalid.list(),/invalid list/);
});
test('catalog errors propagate instead of claiming a successful upload',async()=>{
 const client=createCatalogClient({url:'https://catalog.example',anonKey:'public'},async()=>({ok:false,json:async()=>({message:'Temporary outage'})}));
 await assert.rejects(client.publish(list('a','One','trim 다듬다')),/Temporary outage/);
});
