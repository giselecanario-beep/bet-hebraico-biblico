"use strict";
const assert=require("node:assert/strict");
const {listInvoices,PAGE_SIZE}=require("./bet-invoice-pages");
const rows=Array.from({length:13},(_,i)=>({id:i+1,preapproval_id:"sub"}));
const page=(results,total=results.length,offset=0,limit=12)=>({results,paging:{total,offset,limit}});
(async()=>{
 assert.equal(PAGE_SIZE,12);
 assert.deepEqual(await listInvoices(async()=>page([]),"sub"),[]);
 const urls=[];
 assert.deepEqual(await listInvoices(async path=>{urls.push(path);return path.endsWith("offset=0")?page(rows.slice(0,12),13):page(rows.slice(12),13,12);},"sub"),rows);
 assert.deepEqual(urls,["/authorized_payments/search?preapproval_id=sub&limit=12&offset=0","/authorized_payments/search?preapproval_id=sub&limit=12&offset=12"]);
 for(const bad of [{},page([],1),page([],0,1),page([],0,0,20),page([{id:1,preapproval_id:"other"}]),page([rows[0],rows[0]])])await assert.rejects(()=>listInvoices(async()=>bad,"sub"));
 console.log("10 verificacoes de paginacao aprovadas");
})().catch(e=>{console.error(e);process.exitCode=1;});
