import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { deadlineText } from '../js/deadline.mjs';
function setup(admin=true) {
  const values=new Map();
  const context=vm.createContext({normalizeText:v=>String(v??'').trim(),isValidYearMonth:v=>/^\d{4}-(0[1-9]|1[0-2])$/.test(v),
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>values.get(k),setProperty:(k,v)=>values.set(k,v)})},
    requirePmoActiveUser_:()=>({success:true}),requirePmoAdminUser_:()=>({success:admin}),
    Utilities:{formatDate:d=>new Date(d.getTime()+9*3600000).toISOString().slice(0,19)+'+09:00'}});
  vm.runInContext(readFileSync(new URL('../backend/pmo-apps-script/deadline.js',import.meta.url),'utf8'),context);
  return context;
}
test('翌月分の締切は前月14日23:59、日本時間・年またぎに対応',()=>{
  const c=setup();
  assert.equal(c.pmoDeadline_('2026-10').deadlineAt,'2026-09-14T23:59:00+09:00');
  assert.equal(c.pmoDeadline_('2027-01').deadlineAt,'2026-12-14T23:59:00+09:00');
  assert.throws(()=>c.pmoDeadline_('2026-13'));
});
test('管理者だけ締切変更でき、同月の競合と不正日時を拒否',()=>{
  const c=setup(), body={targetYearMonth:'2026-10',expectedDeadlineAt:c.pmoDeadline_('2026-10').deadlineAt,deadlineAt:'2026-09-16T12:30:00+09:00'};
  assert.equal(setup(false).updatePmoDeadlineSecure(body).success,false);
  assert.equal(c.updatePmoDeadlineSecure(body).deadlineAt,body.deadlineAt);
  assert.throws(()=>c.updatePmoDeadlineSecure(body),/他の操作/);
  assert.equal(c.pmoDeadline_('2026-11').deadlineAt,'2026-10-14T23:59:00+09:00');
  assert.throws(()=>c.updatePmoDeadlineSecure({...body,expectedDeadlineAt:body.deadlineAt,deadlineAt:'2026-02-30T12:30:00+09:00'}),/不正/);
});
test('締切前の秒数・締切経過と提出可能を表示',()=>{
  const deadline='2026-09-14T23:59:00+09:00', now=Date.parse(deadline);
  assert.match(deadlineText(deadline,now-1000),/00:00:01/);
  assert.match(deadlineText(deadline,now),/締切を過ぎ.*提出・修正は可能/);
  assert.match(deadlineText('invalid',now),/確認できません/);
});
