import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { readBook } from '../src/engine.ts';
import { compareTables, tableFromBook, resultPage, COMPARE_ROW_LIMIT } from '../src/compare.ts';
import { exportComparison } from '../src/compare-export.ts';
import { createCompareService } from '../src/compare-service.ts';
const table=(values,headers=['ID','Value'])=>({file:'source.csv',sheet:'Data',headerRow:1,headers,blankRows:0,rows:values.map((values,i)=>({row:i+2,values,missing:[]}))});
const options=(extra={})=>({key:{before:0,after:0},columns:[{before:1,after:1}],trim:false,ignoreCase:false,...extra});
const error=(fn,code)=>assert.throws(fn,e=>e.code===code);

test('keyed comparison has independently expected additions, removals and cell differences despite shuffled columns/rows',()=>{
 const b=table([['001','red','4'],['002','blue','6'],['003','green','8']],['ID','Color','Qty']);
 const a=table([['blue','6','002'],['red','5','001'],['black','2','004']],['Shade','Quantity','SKU']);
 const r=compareTables(b,a,options({key:{before:0,after:2},columns:[{before:1,after:0},{before:2,after:1}]}));
 assert.equal(r.ok,true);assert.deepEqual(r.summary.counts,{added:1,removed:1,changed:1,unchanged:1});
 assert.deepEqual(r.rows.map(x=>[x.key,x.status,x.beforeRow,x.afterRow,x.changed]),[['001','changed',2,3,[1]],['002','unchanged',3,2,[]],['003','removed',4,null,[0,1]],['004','added',null,4,[0,1]]]);
 assert.deepEqual(r.rows[0].before,['red','4']);assert.deepEqual(r.rows[0].after,['red','5']);
});
test('exact semantics preserve zeros, case, whitespace and decimal spelling; opt-in normalization never rewrites originals',()=>{
 const r=compareTables(table([['001','1.0'],['A',' X '],['blank','']]),table([['1','1'],['A','x'],['blank','']]),options());
 assert.equal(r.ok,true);assert.deepEqual(r.summary.counts,{added:1,removed:1,changed:1,unchanged:1});assert.equal(r.rows.find(x=>x.key==='001').status,'removed');
 const n=compareTables(table([[' A ',' X ']]),table([['a','x']]),options({trim:true,ignoreCase:true}));assert.equal(n.ok,true);assert.equal(n.rows[0].status,'unchanged');assert.equal(n.rows[0].beforeKey,' A ');assert.deepEqual(n.rows[0].before,[' X ']);
});
test('duplicate and empty keys block both sources with all affected rows and bounded diagnostics',()=>{
 const r=compareTables(table([['a','1'],['a','2'],['','3']]),table([['b','1'],['b','2'],['  ','3']]),options());
 assert.equal(r.ok,false);assert.equal(r.issueCount,6);assert.deepEqual(r.issues.map(x=>[x.side,x.row,x.code]),[['before',2,'compare.duplicateKey'],['before',3,'compare.duplicateKey'],['before',4,'compare.emptyKey'],['after',2,'compare.duplicateKey'],['after',3,'compare.duplicateKey'],['after',4,'compare.emptyKey']]);
 const many=compareTables(table(Array.from({length:250},()=>['same','x'])),table([]),options());assert.equal(many.issueCount,250);assert.equal(many.issues.length,200);
 const collision=compareTables(table([[' A','x'],['a ','y']]),table([['a','z']]),options({trim:true,ignoreCase:true}));assert.equal(collision.ok,false);assert.equal(collision.issueCount,2);
});
test('missing cached formulas block selected values and keys; excluded formulas do not change comparison',()=>{
 const b=table([['a','','']],['ID','Value','Unused']);b.rows[0].missing=[2];assert.equal(compareTables(b,table([['a','']]),options()).ok,true);
 b.rows[0].missing=[1];const r=compareTables(b,table([['a','']]),options());assert.equal(r.ok,false);assert.equal(r.issues[0].column,'Value');assert.equal(r.issues[0].code,'compare.formula');
 b.rows[0].missing=[0];assert.equal(compareTables(b,table([['a','']]),options()).issues[0].column,'ID');
});
test('invalid/repeated mappings, missing fields and configured limits are rejected',()=>{
 const b=table([['a','1','2']],['ID','A','B']);
 for(const columns of [[{before:1,after:0}],[{before:1,after:-1}],[{before:1,after:3}],[{before:1,after:1},{before:2,after:1}],[{before:1.5,after:1}]]) error(()=>compareTables(b,b,options({columns})),'compare.mappingError');
 error(()=>compareTables(b,b,options({columns:[]})),'compare.noColumns');error(()=>compareTables(b,b,options({columns:Array.from({length:51},(_,i)=>({before:i+1,after:i+1}))})),'compare.columnLimit');
 error(()=>compareTables(table(Array.from({length:COMPARE_ROW_LIMIT+1},(_,i)=>[String(i),'1'])),b,options()),'compare.rowLimit');
});
test('uncompared columns are disclosed and omitted from difference decisions',()=>{
 const r=compareTables(table([['a','1','old']],['ID','Value','Old']),table([['a','1','new']],['ID','Value','New']),options());assert.equal(r.ok,true);assert.equal(r.rows[0].status,'unchanged');assert.deepEqual(r.summary.uncompared,{before:['Old'],after:['New']});
});
test('pagination, ID search and status filters cover all records and clamp stale page numbers',()=>{
 const r=compareTables(table(Array.from({length:60},(_,i)=>[String(i).padStart(3,'0'),'1'])),table([]),options());assert.equal(r.ok,true);
 assert.equal(resultPage(r.rows,'differences','',1).rows.length,25);assert.equal(resultPage(r.rows,'removed','',3).rows.length,10);assert.equal(resultPage(r.rows,'all','059',10).page,1);assert.equal(resultPage(r.rows,'all','059',1).rows[0].key,'059');assert.equal(resultPage(r.rows,'added','',1).total,0);
});
test('CSV parsing supports custom headers, quoted multiline cells, blank rows and rejects unnamed extra data',async()=>{
 const source=new File(['Inventory\nID;Value\n001;"a;b"\n\n002;"line1\nline2"\n'],'inventory.csv');
 const data=await tableFromBook(await readBook(source,"utf-8-sig",";"),source.name,'CSV',2);assert.deepEqual(data.rows.map(r=>[r.row,...r.values]),[[3,'001','a;b'],[5,'002','line1\nline2']]);assert.equal(data.blankRows,1);
 const extra=await readBook(new File(['ID,Value\na,b,unexpected'],'wide.csv'));await assert.rejects(()=>tableFromBook(extra,'wide.csv','CSV',1),e=>e.code==='compare.extraCells');
});
test('XLSX worksheets preserve zero masks and report uncached formulas with source provenance',async()=>{
 const book=XLSX.utils.book_new(),s=XLSX.utils.aoa_to_sheet([['ID','Value'],[12,7]]);s.A2.z='000000';XLSX.utils.book_append_sheet(book,s,'Data');
 const other=XLSX.utils.aoa_to_sheet([['ID','Value'],['002',null]]);other.B2={t:'n',f:'1+1'};other['!ref']='A1:B2';XLSX.utils.book_append_sheet(book,other,'Other');
 const parsed=await readBook(new File([XLSX.write(book,{type:'array',bookType:'xlsx'})],'test.xlsx'));
 const b=await tableFromBook(parsed,'test.xlsx','Data',1),a=await tableFromBook(parsed,'test.xlsx','Other',1);assert.deepEqual(b.rows[0].values,['000012','7']);assert.deepEqual(a.rows[0].missing,[1]);assert.equal(compareTables(b,a,options()).issues[0].code,'compare.formula');
});
test('overlong or illegal selected values block exportable comparisons, while excluded fields are allowed',()=>{
 for(const [text,code] of [['x'.repeat(32768),'compare.textLimit'],['bad\u0001text','compare.textControl']]) {const r=compareTables(table([['a',text]]),table([['a','ok']]),options());assert.equal(r.ok,false);assert.equal(r.issues[0].code,code);}
 assert.equal(compareTables(table([['a','ok','x'.repeat(32768)]],['ID','Value','Unused']),table([['a','ok']]),options()).ok,true);
});
test('XLSX reports round-trip zeros, literal formulas, XML, carriage returns and escape-like text in both locales',async()=>{
 const texts=['=1+1','@SUM(A1)','_x0041_','<tag> & "quote"','line1\r\nline2',' +001 '];
 const r=compareTables(table(texts.map((text,i)=>[String(i).padStart(4,'0'),text])),table(texts.map((text,i)=>[String(i).padStart(4,'0'),text+'!'])),options());assert.equal(r.ok,true);
 const book=XLSX.read(await (await exportComparison(r,'en')).arrayBuffer(),{type:'array',cellStyles:true});assert.deepEqual(book.SheetNames,['Summary','Columns','Comparison']);
 const rows=XLSX.utils.sheet_to_json(book.Sheets.Comparison,{header:1,raw:true});assert.equal(rows.length,7);assert.deepEqual(rows.slice(1).map(x=>x[1]),['0000','0001','0002','0003','0004','0005']);assert.deepEqual(rows.slice(1).map(x=>x[5]),texts.map(text=>text.replace(/\r\n/g,'\n'))); const {unzipSync,strFromU8}=await import('fflate'); const xml=strFromU8(unzipSync(new Uint8Array(await (await exportComparison(r,'en')).arrayBuffer()))['xl/worksheets/sheet3.xml']); assert.ok(xml.includes('line1&#13;\nline2')); // SheetJS normalizes CRLF on read; report XML preserves the CR entity.assert.equal(book.Sheets.Comparison.F2.t,'s');assert.equal(book.Sheets.Comparison.F2.f,undefined);assert.equal(rows[1][0],'Changed');assert.equal(rows[1][3],'2');
 const zh=XLSX.read(await (await exportComparison(r,'zh-CN')).arrayBuffer(),{type:'array'});assert.equal(zh.Sheets.Comparison.A2.v,'修改');
});
test('service never exports a stale result after a failed load or sheet selection',async()=>{
 const service=createCompareService();for(const side of ['before','after']) {await service.load({side,file:new File(['ID,Value\na,1'],side+'.csv'),encoding:'utf-8-sig'});await service.select({side,sheet:'CSV',headerRow:1});}
 assert.equal((await service.run(options())).ok,true);assert.equal((await service.page({filter:'all',query:'',page:1})).total,1);
 await assert.rejects(()=>service.select({side:'after',sheet:'Missing',headerRow:1}));await assert.rejects(()=>service.export({locale:'en'}),e=>e.code==='compare.noResult');await assert.rejects(()=>service.run(options()),e=>e.code==='compare.needFiles');
 await service.select({side:'after',sheet:'CSV',headerRow:1});await service.run(options());await assert.rejects(()=>service.load({side:'before',file:new File(['bad'],'bad.txt'),encoding:'utf-8-sig'}),e=>e.code==='compare.fileType');await assert.rejects(()=>service.export({locale:'en'}),e=>e.code==='compare.noResult');await assert.rejects(()=>service.run(options()),e=>e.code==='compare.needFiles');
});

test('native spreadsheet timestamps on the same date retain time-of-day differences',async()=>{
 const book=XLSX.utils.book_new();
 for(const [name,time]of [['Before',0.25],['After',0.5]]) {const sheet=XLSX.utils.aoa_to_sheet([['ID','Timestamp'],['001',46322+time]]);sheet.B2.z='yyyy-mm-dd hh:mm:ss';XLSX.utils.book_append_sheet(book,sheet,name);}
 const service=createCompareService();const source=new File([XLSX.write(book,{type:'array',bookType:'xlsx'})],'timestamps.xlsx');
 for(const [side,sheet]of [['before','Before'],['after','After']]) {await service.load({side,file:source,encoding:'utf-8-sig'});await service.select({side,sheet,headerRow:1});}
 assert.equal((await service.run(options())).summary.counts.changed,1);const r=await service.page({filter:'all',query:'',page:1});assert.deepEqual(r.rows[0].before,['2026-10-27T06:00:00.000Z']);assert.deepEqual(r.rows[0].after,['2026-10-27T12:00:00.000Z']);
});
