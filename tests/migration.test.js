import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalize,prepareImport} from '../migration.js';
const v={category:'autos',type:'Test',plate:'AB 12',purchasePrice:20,info:'',image:''};
test('recognizes legacy array and backup; never mutates originals',async()=>{const source=[{...v}];const before=JSON.stringify(source);const p=await prepareImport(source,[]);assert.equal(p[0].status,'Neu');assert.equal(JSON.stringify(source),before);assert.deepEqual(await prepareImport({vehicles:source},[]),p);});
test('deduplicates exact rows, normalized plates, repeated cloud import',async()=>{const p=await prepareImport([v,{...v},{...v,plate:'ab 12',info:'different'}],[]);assert.deepEqual(p.map(x=>x.status),['Neu','Doppelt in Datei','Kennzeichen doppelt in Datei – prüfen']);assert.equal((await prepareImport([v],[{...v,import_key:p[0].key}]))[0].status,'Bereits importiert');});
test('same plate in cloud is a conflict, never overwrites',async()=>{assert.match((await prepareImport([v],[{...v,info:'Cloud'}]))[0].status,/prüfen/);});
test('rejects corrupt values and remote or executable images',()=>{for(const bad of [{category:'x'},{purchasePrice:-1},{purchasePrice:'no'},{image:'https://example.com/a.png'},{image:'data:image/svg+xml;base64,AA=='},{type:undefined}])assert.throws(()=>normalize({...v,...bad}));});
test('keeps embedded raster images and all 29 records in preview',async()=>{const rows=Array.from({length:29},(_,i)=>({...v,plate:'T '+i,image:'data:image/png;base64,AA=='}));const p=await prepareImport({vehicles:rows},[]);assert.equal(p.length,29);assert.equal(p.filter(x=>x.status==='Neu').length,29);assert.equal(p.filter(x=>x.v.image).length,29);});
