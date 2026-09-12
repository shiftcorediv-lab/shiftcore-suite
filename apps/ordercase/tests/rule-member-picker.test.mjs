import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read = file => readFileSync(new URL(file, import.meta.url), 'utf8');

test('人員一覧は最小項目のみ・停止済み旧登録を保持・開発者を除外', () => {
  const values = [
    ['internal_user_id','employee_code','display_name','name','status','role','email'],
    ['U1','AN1','表示名','正式名','ACTIVE','staff','private@example.test'],
    ['U2','AN2','','停止者','inactive','staff','private@example.test'],
    ['U0','AN0','開発者','','active','Developer','secret@example.test']
  ];
  const context = vm.createContext({orderCaseRequiredConfig_:key=>{assert.equal(key,'ACCOUNT_SPREADSHEET_ID');return 'TEST';},
    SpreadsheetApp:{openById:id=>{assert.equal(id,'TEST');return {getSheetByName:()=>({getDataRange:()=>({getValues:()=>values.map(row=>[...row])})})};}}});
  vm.runInContext(read('../backend/ordercase-apps-script/Service_RuleMembers.js'),context);
  assert.deepEqual(JSON.parse(JSON.stringify(context.listRuleMembers_())),[
    {id:'U1',code:'AN1',name:'表示名',status:'active'},
    {id:'U2',code:'AN2',name:'停止者',status:'inactive'}
  ]);
});

test('名簿読取も編集権限を検証し、認証失敗時に名簿へアクセスしない', () => {
  let calls=0;
  const context=vm.createContext({jsonResponse_:v=>v,getIdTokenFromBody_:v=>v.idToken,
    requireOrderCaseEditor_:token=>{if(token!=='test')throw new Error('権限なし');},
    listRuleMembers_:()=>{calls++;return [];}});
  vm.runInContext(read('../backend/ordercase-apps-script/Api_Get.js'),context);
  assert.equal(context.isOrderCaseReadAction_('listRuleMembers'),true);
  assert.equal(context.handleOrderCaseRead_({action:'listRuleMembers'}).ok,false);
  assert.equal(calls,0);
  assert.equal(context.handleOrderCaseRead_({action:'listRuleMembers',idToken:'test'}).ok,true);
  assert.equal(calls,1);
});

class Element {
  constructor(){this.children=[];this.listeners={};this.style={};this.value='';this.classList={contains:()=>false};}
  append(...children){this.children.push(...children);}
  after(element){this.afterElement=element;}
  replaceChildren(){this.children=[];this.textContent='';}
  setAttribute(){}
  addEventListener(type,fn){this.listeners[type]=fn;}
}
async function pickerHarness(fail=false) {
  const fields={editorBackdrop:new Element(),editPreferredMemberIds:new Element(),editNgMemberIds:new Element()};
  fields.editPreferredMemberIds.value='AN1,U9,LEGACY';
  let open,fetches=0;
  const context=vm.createContext({document:{getElementById:id=>fields[id],createElement:()=>new Element(),createTextNode:text=>({text}),addEventListener:(_type,fn)=>{open=fn;}},
    MutationObserver:class{observe(){}},fetchApiJson:async action=>{
      fetches++; assert.equal(action,'listRuleMembers');
      if(fail)throw new Error('通信失敗');
      return {ok:true,data:[{id:'U1',code:'AN1',name:'同名',status:'active'},
        {id:'U2',code:'AN2',name:'同名',status:'active'},
        {id:'U9',code:'AN9',name:'停止者',status:'inactive'},
        {id:'U8',code:'AN8',name:'停止未選択',status:'inactive'}]};}});
  vm.runInContext(read('../js/member-rule-picker.js'),context);open();
  await new Promise(resolve=>setImmediate(resolve));
  return {fields,fetches};
}
test('氏名一覧は同名を番号で区別し、旧コード・停止・不明の登録を失わない',async()=>{
  const {fields,fetches}=await pickerHarness();assert.equal(fetches,1);
  const field=fields.editPreferredMemberIds;
  const [search,list]=field.afterElement.children;
  assert.equal(field.hidden,true);assert.equal(list.children.length,4);
  assert.match(list.children[0].children[1].text,/同名（AN1）/);
  assert.equal(list.children[0].children[0].checked,true);
  assert.equal(list.children[1].children[0].checked,false);
  const second=list.children[1].children[0];second.checked=true;second.listeners.change();
  assert.equal(field.value,'AN1,U9,LEGACY,U2');
  const first=list.children[0].children[0];first.checked=false;first.listeners.change();
  assert.equal(field.value,'U9,LEGACY,U2');
  assert.equal(fields.editNgMemberIds.value,'');
  search.value='AN2';search.listeners.input();assert.equal(list.children.length,1);
  assert.equal(list.children[0].children[0].checked,true);
  search.value='該当なし';search.listeners.input();assert.equal(list.children.length,0);
});
test('一覧取得失敗でも元の指名・NGを消さず再試行を提示する',async()=>{
  const {fields}=await pickerHarness(true);
  assert.equal(fields.editPreferredMemberIds.value,'AN1,U9,LEGACY');
  const list=fields.editPreferredMemberIds.afterElement.children[1];
  assert.match(list.textContent,/既存の登録は保持/);
  assert.equal(list.children[0].textContent,'人員一覧を再読み込み');
});
