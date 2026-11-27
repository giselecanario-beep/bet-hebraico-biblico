"use strict";
// Mercado Pago authorized_payments defaults to 12 results; keep bounded, validate pages.
const PAGE_SIZE=12, MAX_PAGES=25;
async function listInvoices(mp,subscriptionId){
 const invoices=[],seen=new Set();
 for(let offset=0;offset<PAGE_SIZE*MAX_PAGES;offset+=PAGE_SIZE){
  const page=await mp("/authorized_payments/search?preapproval_id="+encodeURIComponent(subscriptionId)+"&limit="+PAGE_SIZE+"&offset="+offset);
  const p=page?.paging;
  if(!Array.isArray(page?.results)||p?.total==null||p?.offset==null||p?.limit==null||!Number.isSafeInteger(Number(p.total))||Number(p.total)<0||Number(p.offset)!==offset||Number(p.limit)!==PAGE_SIZE||page.results.length>PAGE_SIZE)throw Error("invalid-invoice-pagination");
  for(const row of page.results){
   if(row?.preapproval_id!==subscriptionId||!/^\d+$/.test(String(row.id))||seen.has(String(row.id)))throw Error("invalid-invoice-row");
   seen.add(String(row.id));invoices.push(row);
  }
  if(offset+page.results.length>=Number(p.total))return invoices;
  if(page.results.length!==PAGE_SIZE)throw Error("incomplete-invoice-pagination");
 }
 throw Error("invoice-search-limit");
}
module.exports={listInvoices,PAGE_SIZE};
