(() => {
  const parse = value => String(value || '').split(/[\s,、]+/).filter(Boolean);
  let membersPromise;
  function members() {
    if (!membersPromise) membersPromise = fetchApiJson('listRuleMembers').then(result => {
      if (!result.ok || !Array.isArray(result.data)) throw new Error(result.message || '人員一覧を取得できませんでした。');
      return result.data;
    }).catch(error => {membersPromise = null; throw error;});
    return membersPromise;
  }
  document.addEventListener('DOMContentLoaded', () => {
    const backdrop = document.getElementById('editorBackdrop');
    const pickers = ['editPreferredMemberIds','editNgMemberIds'].map((id, index) => {
      const input = document.getElementById(id);
      input.hidden = true;
      const host = document.createElement('div');
      const search = document.createElement('input'); search.type='search'; search.placeholder='人員名で検索';
      search.setAttribute('aria-label', index ? 'NGの人員名で検索' : '指名の人員名で検索');
      const list = document.createElement('div');
      list.style.cssText='max-height:220px;overflow:auto;border:1px solid #dce4ef;border-radius:10px;padding:8px';
      host.append(search,list); input.after(host);
      let rows=[];
      function render() {
        const selected=parse(input.value);
        const aliases = row => [row.id,row.code].filter(Boolean).map(v=>v.toLowerCase());
        const known = new Set(rows.flatMap(aliases));
        const options = rows.map(row => ({...row,selected:selected.some(id=>aliases(row).includes(id.toLowerCase()))}));
        selected.filter(id=>!known.has(id.toLowerCase())).forEach(id=>options.push({id,code:'',name:'名簿未登録：'+id,selected:true,status:'unknown'}));
        list.replaceChildren();
        options.filter(row=>(row.status==='active'||row.selected)&&[row.name,row.code].join(' ').toLowerCase().includes(search.value.toLowerCase())).forEach(row=>{
          const label=document.createElement('label'); label.style.cssText='display:flex;align-items:center;gap:8px;padding:5px 0';
          const check=document.createElement('input'); check.type='checkbox'; check.checked=row.selected; check.style.width='auto';
          check.addEventListener('change',()=>{
            const rest=parse(input.value).filter(id=>!aliases(row).includes(id.toLowerCase()));
            input.value=[...rest,...(check.checked?[row.id]:[])].join(',');
          });
          label.append(check,document.createTextNode(`${row.name || '氏名未設定'}${row.code ? '（'+row.code+'）' : ''}${row.status==='active'?'':'・停止／旧登録'}`));
          list.append(label);
        });
        if (!list.children.length) list.textContent='該当する人員はいません。';
      }
      search.addEventListener('input',render);
      return async () => {
        search.value=''; list.textContent='人員一覧を読み込み中…'; search.disabled=true;
        try {rows=await members(); render();}
        catch(error) {
          list.textContent=error.message+' 既存の登録は保持しています。';
          const retry=document.createElement('button'); retry.type='button'; retry.textContent='人員一覧を再読み込み';
          retry.addEventListener('click',()=>refresh()); list.append(retry);
        } finally {search.disabled=false;}
      };
    });
    function refresh(){if (!backdrop.classList.contains('hidden')) pickers.forEach(load=>load());}
    new MutationObserver(refresh).observe(backdrop,{attributes:true,attributeFilter:['class']});
    refresh();
  });
})();
