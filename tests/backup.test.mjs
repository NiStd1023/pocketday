import test from 'node:test';
import assert from 'node:assert/strict';
import {demoBook,emptyBook} from '../docs/model.js';
import {bookInfo} from '../docs/ledger-store.js';
import {exportBook,importBook} from '../docs/book-backup.js';

const meta={name:'家庭, "A"',icon:'🏠',color:'#76b3a6'};
for (const format of ['json','csv']) {
  for (const book of [emptyBook(),demoBook(new Date(2026,10,19))]) {
    test(format+' round trip with '+book.records.length+' entries',()=>{
      const data=structuredClone(book);
      if (data.records.length) {
        Object.assign(data.records[0],{title:'=1+1,"拿鐵"\r\n第二行',invoice:"'AB-00123456",amount:12345,
          items:[{name:'\t@品項',amount:12145},{name:"'折扣",amount:200}]});
      }
      const encoded=exportBook(format,meta,data);
      assert.deepEqual(importBook(encoded,format==='csv'),{meta,data});
      if (format==='csv') {
        assert.ok(encoded.startsWith('\uFEFF'));
        assert.ok(encoded.includes('"帳本"'));
        if (data.records.length) assert.ok(encoded.includes('"\'=1+1,""拿鐵""'));
      }
    });
  }
}
test('original JSON backups restore without ledger metadata',()=>{
  const data=emptyBook();
  assert.deepEqual(importBook(JSON.stringify({app:'pocketday',version:1,book:data}),false),{meta:null,data});
});
test('CSV rejects a truncated backup before any write',()=>{
  assert.throws(()=>importBook(exportBook('csv',meta,emptyBook()).slice(0,-5),true));
  assert.throws(()=>importBook('Date,Amount\r\n2026-11-19,120',true));
});
test('names and custom icon validations',()=>{
  assert.equal(bookInfo({...meta,icon:'🧑‍🚀'}).icon,'🧑‍🚀');
  assert.equal(bookInfo({...meta,icon:'出差'}).icon,'出差');
  for (const invalid of [{name:'  '},{icon:'1234'},{color:'not-a-color'}]) assert.throws(()=>bookInfo({...meta,...invalid}));
});
