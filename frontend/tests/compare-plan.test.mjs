import test from 'node:test';
import assert from 'node:assert/strict';
import {planComparison} from '../src/compare-plan.ts';
import {compareTables} from '../src/compare.ts';
const table=(headers,values)=>({file:'example.csv',sheet:'Data',headerRow:1,headers,blankRows:0,rows:values.map((values,i)=>({row:i+2,values,missing:[]}))});
const matching={trim:false,ignoreCase:false};
test('one shared named identifier with matching fields is ready without manual configuration',()=>{
 const before=table(['SKU','Value'],[['001','old'],['002','same']]),after=table(['Value','SKU'],[['same','002'],['new','001']]);
 const plan=planComparison(before,after,matching);assert.equal(plan.reason,'ready');assert.equal(plan.keyBefore,0);assert.deepEqual(plan.options,{key:{before:0,after:1},columns:[{before:1,after:0}],...matching});assert.equal(compareTables(before,after,plan.options).summary.counts.changed,1);
});
test('a renamed field receives a focused proposal but still requires confirmation',()=>{
 const plan=planComparison(table(['SKU','Product','Stock'],[['001','Notebook','20']]),table(['Product','SKU','Quantity','Updated by'],[['Notebook','001','25','Alex']]),matching);
 assert.equal(plan.reason,'fields');assert.equal(plan.keyBefore,0);assert.deepEqual(plan.reviewFields,[2]);assert.deepEqual(plan.mappings[2],{before:2,after:2,enabled:true});
});
test('multiple plausible IDs and unique descriptive values never silently choose an identifier',()=>{
 const multi=table(['Order ID','Customer ID','Value'],[['O1','C1','1']]);assert.equal(planComparison(multi,multi,matching).reason,'key');assert.equal(planComparison(multi,multi,matching).keyBefore,null);
 const names=table(['Product','Value'],[['Notebook','1'],['Pen','2']]);assert.equal(planComparison(names,names,matching).keyBefore,null);
 const paid=table(['Paid','Value'],[['yes','1']]);assert.equal(planComparison(paid,paid,matching).keyBefore,null);
});
test('zero shared IDs requires confirmation, respecting explicit matching rules',()=>{
 const a=table(['ID','Value'],[[' A ','x']]),b=table(['ID','Value'],[['a','x']]);assert.equal(planComparison(a,b,matching).reason,'overlap');assert.equal(planComparison(a,b,{trim:true,ignoreCase:true}).reason,'ready');
 assert.equal(planComparison(table(['ID','Value'],[]),table(['ID','Value'],[]),matching).reason,'overlap');
});
test('duplicate or empty identifiers still reach the comparison engine blockers',()=>{
 const a=table(['ID','Value'],[['a','1'],['a','2'],['','3']]),b=table(['ID','Value'],[['a','1']]);const plan=planComparison(a,b,matching);assert.equal(plan.reason,'ready');const result=compareTables(a,b,plan.options);assert.equal(result.ok,false);assert.equal(result.issueCount,3);
});
test('ambiguous synonyms or competing fields do not receive automatic rename proposals',()=>{
 const a=table(['SKU','Stock'],[['001','1']]),b=table(['SKU','Qty','Quantity'],[['001','1','2']]);const plan=planComparison(a,b,matching);assert.equal(plan.reason,'fields');assert.equal(plan.mappings[1].after,null);
 const competing=planComparison(table(['SKU','Stock','Qty'],[['001','1','2']]),table(['SKU','Quantity'],[['001','1']]),matching);assert.equal(competing.mappings[1].after,null);assert.equal(competing.mappings[2].after,null);
});
test('extra After columns are excluded transparently, and limits do not auto-run invalid configurations',()=>{
 const plan=planComparison(table(['ID','Value'],[['1','a']]),table(['ID','Value','New'],[['1','a','b']]),matching);assert.equal(plan.reason,'ready');assert.equal(plan.options.columns.length,1);
 const headers=['ID',...Array.from({length:51},(_,i)=>'Field'+i)];const wide=table(headers,[headers.map((_,i)=>String(i))]);assert.equal(planComparison(wide,wide,matching).reason,'limit');
 const only=table(['ID'],[['1']]);assert.equal(planComparison(only,only,matching).reason,'limit');
});
