import {spawn} from 'node:child_process';
import {test,expect,type Page} from '@playwright/test';
import * as XLSX from 'xlsx';
import {unzipSync,strFromU8} from 'fflate';
import {mkdirSync,writeFileSync} from 'node:fs';
import {seed} from './fixtures';
const artifact='../docs/verification/compare';
test.beforeAll(()=>mkdirSync(artifact,{recursive:true}));
async function open(page:Page) {
 await page.goto('/');await expect(page.getByRole('heading',{name:'Merge spreadsheets',exact:true})).toBeVisible();await page.getByRole('button',{name:'Compare versions',exact:true}).click();await expect(page.getByRole('heading',{name:'What changed between these files?',exact:true})).toBeVisible();
}
async function advanced(page:Page) {
 const panel=page.locator('.compare-advanced');if(!await panel.evaluate((el:HTMLDetailsElement)=>el.open))await panel.locator(':scope > summary').click();
}
async function importOptions(page:Page,side:'Before'|'After') {
 const panel=page.locator('.compare-source').nth(side==='Before'?0:1).locator('.compare-import-options');if(!await panel.evaluate((el:HTMLDetailsElement)=>el.open))await panel.locator(':scope > summary').click();
}
async function sample(page:Page) {
 await page.getByRole('button',{name:'Try sample inventory',exact:true}).click();await expect(page.getByText('Records: 3 · Blank rows skipped: 0',{exact:true})).toHaveCount(2);
 await expect(page.getByLabel('Match renamed field Stock',{exact:true})).toHaveValue('2');await expect(page.locator('.compare-review select')).toHaveCount(1);await page.getByRole('button',{name:'Show differences',exact:true}).click();await expect(page.getByRole('heading',{name:'Comparison results',exact:true})).toBeVisible();await expect(page.locator('.compare-record')).toHaveCount(3);
}
async function upload(page:Page,side:'Before'|'After',text:string,name=side.toLowerCase()+'.csv') {
 await page.getByLabel(side+' file',{exact:true}).setInputFiles({name,mimeType:'text/csv',buffer:Buffer.from(text)});
 await expect(page.getByRole('status').filter({hasText:'Working on your comparison…'})).toHaveCount(0);
}
async function downloadBytes(page:Page) {
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download comparison report',exact:true}).click();const download=await pending;const stream=await download.createReadStream();const chunks:Buffer[]=[];for await(const chunk of stream)chunks.push(Buffer.from(chunk));return {download,bytes:Buffer.concat(chunks)};
}

test('sample comparison and exported workbook are correct; merge data and comparisons survive navigation',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await seed(page,3,'done',5);
 await page.getByRole('button',{name:'Compare versions',exact:true}).click();await sample(page);await expect(page.getByText("Temporary comparison",{exact:true})).toBeVisible();
 for(const status of ['added','removed','changed','unchanged'])await expect(page.getByTestId('compare-count-'+status).locator('strong')).toHaveText('1');
 const changed=page.locator('.compare-record').filter({has:page.locator('.compare-status.changed')});await expect(changed.getByText('0001',{exact:true}).first()).toBeVisible();await expect(changed.locator('.compare-cell-changed td')).toHaveText(['20','25']);
 const {download,bytes}=await downloadBytes(page);await download.saveAs(artifact+'/sample-report.xlsx');const book=XLSX.read(bytes,{type:'buffer'});expect(book.SheetNames).toEqual(['Summary','Columns','Comparison']);const rows=XLSX.utils.sheet_to_json(book.Sheets.Comparison,{header:1}) as string[][];expect(rows.slice(1).map(row=>[row[0],row[1],row[2]])).toEqual([['Changed','0001','0001'],['Unchanged','0002','0002'],['Removed','0003',''],['Added','','0004']]);
 await page.getByLabel('Show records',{exact:true}).selectOption('unchanged');await expect(page.locator('.compare-record')).toHaveCount(1);await expect(page.locator('.compare-record-title strong')).toHaveText('0002');
 await page.getByLabel('Search record ID',{exact:true}).fill('missing');await expect(page.getByText('No records match these filters.',{exact:true})).toBeVisible();await page.getByLabel('Search record ID',{exact:true}).fill('');
 await page.getByRole('button',{name:'Batch merge',exact:true}).click();await expect(page.getByRole('button',{name:'Download merged Excel',exact:true})).toBeVisible();await page.getByRole('button',{name:'Compare versions',exact:true}).click();await expect(page.getByRole('heading',{name:'Comparison results',exact:true})).toBeVisible();
 await page.getByLabel('Language / 语言').selectOption('zh-CN');await expect(page.getByRole('heading',{name:'对比结果',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'下载对比报告',exact:true})).toBeVisible();await page.getByLabel('Language / 语言').selectOption('en');expect(errors).toEqual([]);
});

test('blank/duplicate keys block results, normalization collisions are visible, and configuration edits invalidate export',async({page})=>{
 await open(page);await upload(page,'Before','ID,Value\na,1\na,2\n,3');await upload(page,'After','ID,Value\na,1');await expect(page.getByRole('heading',{name:'Resolve record problems first',exact:true})).toBeVisible();await expect(page.locator('.compare-blocked tbody tr')).toHaveCount(3);await expect(page.getByRole('button',{name:'Download comparison report',exact:true})).toHaveCount(0);await page.screenshot({path:artifact+'/blocked-1440.png',fullPage:true});
 await upload(page,'Before','ID,Value\n A,1\na ,2');await advanced(page);await page.getByLabel('Trim surrounding whitespace (including IDs)',{exact:true}).check();await page.getByLabel('Ignore letter case (including IDs)',{exact:true}).check();await page.getByRole('button',{name:'Compare files',exact:true}).click();await expect(page.locator('.compare-blocked tbody tr')).toHaveCount(2);
 await upload(page,'Before','ID,Value\na,1');await expect(page.getByText('No differences in the selected fields.',{exact:true})).toBeVisible();await advanced(page);await page.getByLabel('Trim surrounding whitespace (including IDs)',{exact:true}).uncheck();await expect(page.getByRole('button',{name:'Download comparison report',exact:true})).toHaveCount(0);
});

test('CSV separator and shifted header controls recover preamble input; XLSX worksheet selection and missing formulas are handled',async({page})=>{
 await open(page);await upload(page,'Before','Inventory\nID;Value\n001;one');await importOptions(page,'Before');await page.getByLabel('Before / CSV separator',{exact:true}).selectOption(';');await expect(page.getByText('Settings changed. Read the sheet to continue.',{exact:true})).toBeVisible();await page.getByLabel('Before / Header row',{exact:true}).fill('2');await page.locator('.compare-source').first().getByRole('button',{name:'Read selected sheet',exact:true}).click();await expect(page.getByText('Records: 1 · Blank rows skipped: 0',{exact:true})).toBeVisible();
 const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Wrong'],['skip']]),'Ignore');const data=XLSX.utils.aoa_to_sheet([['ID','Value'],['001',null]]);data.B2={t:'n',f:'1+1'};data['!ref']='A1:B2';XLSX.utils.book_append_sheet(book,data,'Actual');
 await page.getByLabel('After file',{exact:true}).setInputFiles({name:'after.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:XLSX.write(book,{type:'buffer',bookType:'xlsx'})});await expect(page.getByLabel('After / Worksheet',{exact:true})).toBeVisible();await expect(page.getByRole('status').filter({hasText:'Working on your comparison…'})).toHaveCount(0);await page.getByLabel('After / Worksheet',{exact:true}).selectOption('Actual');await page.locator('.compare-source').nth(1).getByRole('button',{name:'Read selected sheet',exact:true}).click();await expect(page.locator('.compare-blocked tbody')).toContainText('A selected formula has no saved result. Recalculate and save the workbook in Excel.');
});

test('compare worker, sample and report work offline even when compare was never opened online',async({page,context},info)=>{
 test.skip(info.project.name==='webkit','WebKit offline simulation is covered separately by existing stopped-server suite.');const requests:string[]=[];page.on('request',r=>requests.push(r.url()));
 await page.goto('/');await expect(page.getByText('Ready for offline use',{exact:true})).toBeVisible();await page.waitForFunction(()=>!!navigator.serviceWorker.controller);await context.setOffline(true);await page.reload();await page.getByRole('button',{name:'Compare versions',exact:true}).click();await sample(page);const {bytes}=await downloadBytes(page);expect(XLSX.read(bytes,{type:'buffer'}).SheetNames).toContain('Comparison');expect(requests.every(url=>new URL(url).origin==='http://127.0.0.1:4178')).toBe(true);
 await context.setOffline(false);await page.reload();await page.getByRole('button',{name:'Compare versions',exact:true}).click();await expect(page.getByRole('heading',{name:'Comparison results',exact:true})).toHaveCount(0);
});

for(const width of [1440,412,320])test(`comparison layout and report at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:1000});await open(page);await sample(page);await page.getByLabel('Language / 语言').selectOption(width===320?'zh-CN':'en');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 for(const button of await page.locator('main .btn:visible').all()){const box=await button.boundingBox();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(width+1);}
 await page.screenshot({path:artifact+`/results-${width}.png`,fullPage:true});
});

test('20,000 records per side and 50 compared fields have correct counts and a complete streamed report',async({page},info)=>{
 test.skip(info.project.name!=='chromium');test.setTimeout(180000);
 const count=20000,fields=50;const headers=['ID',...Array.from({length:fields},(_,i)=>'Field '+i)];
 const row=(i:number,change=false)=>[String(i).padStart(7,'0'),...Array.from({length:fields},(_,j)=>change&&j===49?'updated':'value-'+j)].join(',');
 const before=[headers.join(','),...Array.from({length:count},(_,i)=>row(i))].join('\n');const after=[headers.join(','),...Array.from({length:count},(_,i)=>row(count-i,i===1))].join('\n');
 await open(page);const start=Date.now();await upload(page,'Before',before);await upload(page,'After',after);await expect(page.getByRole('heading',{name:'Comparison results',exact:true})).toBeVisible();
 for(const [status,value]of Object.entries({added:'1',removed:'1',changed:'1',unchanged:'19,998'}))await expect(page.getByTestId('compare-count-'+status).locator('strong')).toHaveText(value);
 const compareMs=Date.now()-start;const exported=await downloadBytes(page);const xml=strFromU8(unzipSync(new Uint8Array(exported.bytes))['xl/worksheets/sheet3.xml']);expect((xml.match(/<row r=/g)||[]).length).toBe(20002);expect(xml).toContain('updated');
 writeFileSync(artifact+'/large-batch.json',JSON.stringify({recordsPerSide:count,comparedFields:fields,counts:{added:1,removed:1,changed:1,unchanged:19998},importAndCompareMilliseconds:compareMs,totalIncludingExportMilliseconds:Date.now()-start,reportBytes:exported.bytes.length,exportedDataRows:20001},null,2)+'\n');
});

test('explicit tab separator and header row recover a tab-delimited CSV with a preamble',async({page})=>{
 await open(page);await upload(page,'Before','Inventory\nID\tValue\n001\tone');
 await importOptions(page,'Before');await page.getByLabel('Before / CSV separator',{exact:true}).selectOption('\t');await expect(page.getByText('Settings changed. Read the sheet to continue.',{exact:true})).toBeVisible();await page.getByLabel('Before / Header row',{exact:true}).fill('2');await page.locator('.compare-source').first().getByRole('button',{name:'Read selected sheet',exact:true}).click();await expect(page.getByText('Records: 1 · Blank rows skipped: 0',{exact:true})).toBeVisible();
 await upload(page,'After','ID,Value\n001,two');await expect(page.getByTestId('compare-count-changed').locator('strong')).toHaveText('1');
});

test('WebKit compares and downloads offline with the preview server stopped',async({page},info)=>{
 test.skip(info.project.name!=='webkit');
 const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4183','--strictPort'],{stdio:['ignore','pipe','pipe']});
 try{
  await new Promise<void>((resolve,reject)=>{server.stdout.on('data',data=>{if(String(data).includes('4183'))resolve();});server.on('error',reject);server.on('exit',code=>{if(code)reject(new Error('comparison preview failed'));});});
  await page.goto('http://127.0.0.1:4183/');await expect(page.getByText('Ready for offline use',{exact:true})).toBeVisible();await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  const stopped=new Promise<void>(resolve=>server.once('exit',()=>resolve()));server.kill('SIGTERM');await stopped;
  const response=await page.reload({timeout:15000});expect(response!.headers()['content-security-policy']).toContain("connect-src 'none'");await page.getByRole('button',{name:'Compare versions',exact:true}).click();await sample(page);const {bytes}=await downloadBytes(page);expect(XLSX.read(bytes,{type:'buffer'}).SheetNames).toEqual(['Summary','Columns','Comparison']);await page.screenshot({path:artifact+'/offline-webkit.png',fullPage:true});
 }finally{server.kill('SIGTERM');}
});


test('matching files display differences immediately with every setup control collapsed',async({page})=>{
 await open(page);await upload(page,'Before','ID,Name,Quantity\n001,Notebook,20\n002,Pen,50');await upload(page,'After','Name,ID,Quantity,Updated by\nPen,002,50,Alex\nNotebook,001,25,Alex');
 await expect(page.getByRole('heading',{name:'Comparison results',exact:true})).toBeVisible();await expect(page.getByTestId('compare-count-changed').locator('strong')).toHaveText('1');await expect(page.getByTestId('compare-count-unchanged').locator('strong')).toHaveText('1');
 await expect(page.getByRole('button',{name:'Show differences',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Compare files',exact:true})).toBeHidden();await expect(page.getByLabel('Unique record ID',{exact:true})).toBeHidden();await expect(page.getByLabel('Before / Worksheet',{exact:true})).toBeHidden();
 await expect(page.locator('.compare-change-summary')).toContainText('Quantity20→25');await expect(page.locator('.compare-record details')).not.toHaveAttribute('open');await expect(page.getByText('Not compared — Before: None. After: Updated by.',{exact:true})).toBeVisible();
 await page.screenshot({path:artifact+'/automatic-1440.png',fullPage:true});
});
test('multiple identifiers require one explicit choice rather than an automatic guess',async({page})=>{
 await open(page);await upload(page,'Before','Order ID,Customer ID,Value\nO1,C1,old');await upload(page,'After','Order ID,Customer ID,Value\nO1,C1,new');await expect(page.getByLabel('Match records using',{exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Comparison results',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Show differences',exact:true})).toBeDisabled();await page.getByLabel('Match records using',{exact:true}).selectOption('0');await page.getByRole('button',{name:'Show differences',exact:true}).click();await expect(page.getByTestId('compare-count-changed').locator('strong')).toHaveText('1');
});
test('disjoint identifiers require confirmation and unknown fields require a mapping or explicit exclusion',async({page})=>{
 await open(page);await upload(page,'Before','ID,Value\nA,old');await upload(page,'After','ID,Value\nB,new');await expect(page.getByText('No IDs match between the files. Confirm the identifier before treating the records as entirely different.',{exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Comparison results',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Show differences',exact:true}).click();await expect(page.getByTestId('compare-count-added').locator('strong')).toHaveText('1');await expect(page.getByTestId('compare-count-removed').locator('strong')).toHaveText('1');
 await upload(page,'Before','ID,Name,Balance\nA,Alex,10');await upload(page,'After','ID,Name,Total,Tax\nA,Alex,20,1');await expect(page.getByLabel('Match renamed field Balance',{exact:true})).toHaveValue('');await expect(page.getByRole('button',{name:'Show differences',exact:true})).toBeDisabled();await page.getByLabel('Match renamed field Balance',{exact:true}).selectOption('2');await page.getByRole('button',{name:'Show differences',exact:true}).click();await expect(page.getByTestId('compare-count-changed').locator('strong')).toHaveText('1');
 await upload(page,'After','ID,Name,Total,Tax\nA,Alex,20,1');await expect(page.getByRole('button',{name:'Show differences',exact:true})).toBeDisabled();await page.getByLabel('Match renamed field Balance',{exact:true}).selectOption('skip');await page.getByRole('button',{name:'Show differences',exact:true}).click();await expect(page.getByTestId('compare-count-unchanged').locator('strong')).toHaveText('1');await expect(page.locator('.compare-excluded-note')).toContainText('Balance');
});

test('an over-wide file can be reduced to fifty fields without a stale warning',async({page})=>{
 const headers=['ID',...Array.from({length:51},(_,i)=>'Field '+i)],data=headers.join(',')+'\n001,'+Array(51).fill('value').join(',');
 await open(page);await upload(page,'Before',data);await upload(page,'After',data);await expect(page.locator('.compare-review').getByText('Select no more than 50 fields besides the ID.',{exact:true})).toBeVisible();await advanced(page);await page.getByLabel('Compare Field 50',{exact:true}).uncheck();await expect(page.getByText('Choose at least one field to compare besides the ID.',{exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Compare files',exact:true}).click();await expect(page.getByTestId('compare-count-unchanged').locator('strong')).toHaveText('1');
});
