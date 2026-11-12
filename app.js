"use strict";
const cfg=window.LANDSCAPE_CONFIG||{};
const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
const screens=['welcome','experiment','break-screen','finished'];
const key='landscapePilotSessionV1';
const randId=()=>('P'+crypto.getRandomValues(new Uint32Array(2)).join('').slice(0,10));
const experimentVersion=cfg.experimentVersion||'pilot-v1.0';
const posLabels=['A','B','C'];
let state=null, trials=[], live=false, startedAt=0, readyAt=0, cancelTimer=0;
const show=id=>screens.forEach(x=>$('#'+x).hidden=(x!==id));
const persist=()=>{if(state)localStorage.setItem(key,JSON.stringify(state));};
const validId=s=>/^[a-zA-Z0-9_-]{3,32}$/.test(s);
const formatCSV = rows => { if(!rows.length) return '';const cols=Object.keys(rows[0]);return [cols.join(','),...rows.map(r=>cols.map(c=>'"'+String(r[c]??'').replaceAll('"','""')+'"').join(','))].join('\r\n');};
const saveBlob=(filename,text,type)=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
function exportJSON(){if(!state)return;saveBlob(`landscape_${state.participant}_${state.listId}.json`,JSON.stringify({schema:'landscape-pilot-v1',session:state,trial_data:state.responses},null,2),'application/json');}
function exportCSV(){if(!state)return;saveBlob(`landscape_${state.participant}_${state.listId}.csv`,formatCSV(state.responses),'text/csv;charset=utf-8');}
function updateResume(){let saved;try{saved=JSON.parse(localStorage.getItem(key)||'null');}catch{};$('#resume').hidden=!(saved&&saved.index<saved.trials.length);$('#resume-info').textContent=saved?`本机已有 ${saved.participant} 的记录，列表 ${saved.listId}，已完成 ${saved.index} / ${saved.trials.length} 题。`:'';}
function simpleHash(s){let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return (h>>>0);}
async function assign(participant){
 if(cfg.submitEndpoint){
   const endpoint=cfg.submitEndpoint.replace(/\/api\/submit\/?$/,'/api/start');
   if(endpoint!==cfg.submitEndpoint){
     const res=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({participant,experimentVersion})});
     if(!res.ok)throw Error('服务器列表分配失败：'+res.status);
     const assigned=await res.json();if(/^L(0[1-9]|1\d|20)$/.test(assigned.listId))return {listId:assigned.listId,sessionId:assigned.sessionId};
     throw Error('服务器返回了无效列表');
   }
 }
 // Local fallback deterministic hash. This does NOT guarantee global balanced assignment.
 return {listId:'L'+String(1+simpleHash(participant)%20).padStart(2,'0'),sessionId:crypto.randomUUID()};
}
const cache = new Map();
function getImage(p){if(!p)return '';return 'assets/'+p;}
function loadImg(p){return new Promise((res,rej)=>{let i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(Error(p));i.src=getImage(p);});}
const makePractice=()=>{ // six trials taken from list and tagged as practice; exclude from primary data.
 const mains=trials.filter(t=>t.trial_role==='main');
 const step=Math.max(1,Math.floor(mains.length/6));
 return Array.from({length:6},(_,i)=>({...mains[i*step],trial_role:'practice',trial_id:'practice_'+(i+1),block_id:'0'}));
};
function buildRecord(t,display,choice,rt,startISO){
 const stimKeys=['stimulus_A','stimulus_B','stimulus_C'];
 const imgs=['relative_path_A','relative_path_B','relative_path_C'];
 const ids=display.map(i=>t[stimKeys[i]]), paths=display.map(i=>t[imgs[i]]);
 const selected=ids[choice], bestPair=ids.filter((_,k)=>k!==choice).sort();
 return {experiment_version:experimentVersion,session_id:state.sessionId,participant_id:state.participant,
    list_id:state.listId,trial_id:t.trial_id,trial_role:t.trial_role,trial_type:t.trial_type,block_id:t.block_id,
    country_pattern:t.country_pattern,stimulus_A:ids[0],stimulus_B:ids[1],stimulus_C:ids[2],
    image_path_A:paths[0],image_path_B:paths[1],image_path_C:paths[2],odd_position:posLabels[choice],odd_image:selected,
    selected_pair_1:bestPair[0],selected_pair_2:bestPair[1],rt_ms:Math.round(rt),started_at:startISO,
    responded_at:new Date().toISOString(),repeat_of_main_seq:t.repeat_of_main_seq,main_sequence:t.main_sequence,
    viewport_width:innerWidth,viewport_height:innerHeight,screen_width:screen.width,screen_height:screen.height};
}
function makeOrder(t,idx){ // deterministic per-participant, randomizes positions on repeated trials
 const seed=simpleHash(state.sessionId+':'+idx);const a=[0,1,2];let x=seed;
 for(let i=2;i>0;i--){x=(Math.imul(x,1664525)+1013904223)>>>0;const j=x%(i+1);[a[i],a[j]]=[a[j],a[i]];}
 return a;
}
function hideChoices(h){$('#choices').hidden=h;$('#prompt').hidden=h;}
async function runTrial(){
 if(!state)return;
 if(state.index>=state.trials.length){finish();return;}
 const t=state.trials[state.index];
 const prev=state.trials[state.index-1];
 if(prev && prev.block_id!==t.block_id && t.block_id!=='0' && !state.breakAcknowledged?.includes(String(t.block_id))){showBreak(t.block_id);return;}
 show('experiment');live=false;$('#stage-label').textContent=t.trial_role==='practice'?'练习阶段':`正式实验 · 第 ${t.block_id} / 3 区块`;
 $('#progress-text').textContent=`${state.index+1} / ${state.trials.length}`;
 $('#bar-inner').style.width=((state.index/state.trials.length)*100)+'%';
 hideChoices(true);$('#fixation').hidden=false;
 const order=makeOrder(t,state.index);const paths=order.map(i=>t[['relative_path_A','relative_path_B','relative_path_C'][i]]);
 try{await Promise.all(paths.map(loadImg));}catch(e){alert('图片未成功加载：'+e.message+'。请检查网络或静态文件。');return;}
 $$('.choice').forEach((el,k)=>{const image=el.querySelector('img');image.src=getImage(paths[k]);image.alt='自然风景图片 '+posLabels[k];});
 const token=++cancelTimer;await new Promise(r=>setTimeout(r,400));if(token!==cancelTimer)return;
 $('#fixation').hidden=true;hideChoices(false);$('#choices').focus?.();readyAt=performance.now();startedAt=new Date().toISOString();live=true;
}
function respond(choice){if(!live||![0,1,2].includes(choice))return;const rt=performance.now()-readyAt;live=false;const t=state.trials[state.index];const order=makeOrder(t,state.index);
 state.responses.push(buildRecord(t,order,choice,rt,startedAt));state.index++;persist();runTrial();}
function showBreak(nextBlock){state.breakAcknowledged ||= [];show('break-screen');$('#break-title').textContent=nextBlock==='1'?'练习完成':`区块 ${Number(nextBlock)-1} 完成`;
 $('#break-summary').textContent=`已完成 ${state.responses.length} 题。可以休息，准备好后继续。`;$('#next-block').onclick=()=>{state.breakAcknowledged.push(String(nextBlock));persist();runTrial();};
 if(cfg.submitEndpoint && !state.submittedBlocks?.includes(String(nextBlock))){ submitToServer(false,String(nextBlock)).catch(()=>{}); }
}
function finish(){show('finished');state.finishedAt ||= new Date().toISOString();persist();const mains=state.responses.filter(r=>r.trial_role==='main');
 const avg=mains.length?Math.round(mains.reduce((s,r)=>s+r.rt_ms,0)/mains.length):0;
 $('#finished-summary').textContent=`匿名编号 ${state.participant} · 列表 ${state.listId} · 主要试次 ${mains.length} · 平均反应时间 ${avg} ms`;
 $('#submit-server').hidden=!cfg.submitEndpoint;if(cfg.submitEndpoint)submitToServer(true,'final').catch(()=>{});
}
async function submitToServer(isFinal,phase){if(!cfg.submitEndpoint)throw Error('未配置服务器接口');$('#submit-status').textContent='正在向服务器提交…';
 const data={session_id:state.sessionId,participant_id:state.participant,list_id:state.listId,phase,experiment_version:experimentVersion,completed:isFinal,records:state.responses};
 const res=await fetch(cfg.submitEndpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
 if(!res.ok){$('#submit-status').textContent='提交未成功。请导出本地备份并联系研究者。';throw Error('HTTP '+res.status);}
 state.submittedBlocks ||= [];if(!state.submittedBlocks.includes(phase))state.submittedBlocks.push(phase);persist();$('#submit-status').textContent='数据已提交到研究服务器。';return res.json();}
async function start(){if(!$('#consent').checked){alert('请先确认知情同意。');return;}
 const participant=$('#participant').value.trim();if(!validId(participant)){alert('匿名编号应为3–32位字母、数字、下划线或连字符。');return;}
 const manual=$('#list-method').value==='manual';let allocation;
 try{allocation=manual?{listId:$('#list-manual').value,sessionId:crypto.randomUUID()}:await assign(participant);
 const response=await fetch(`lists/triplets_${allocation.listId}.json`,{cache:'no-store'});
 if(!response.ok)throw Error('试次表未找到');trials=await response.json();if(trials.length!==300)throw Error('试次数不为300');
 const practice=makePractice();
 state={participant,listId:allocation.listId,sessionId:allocation.sessionId,startedAt:new Date().toISOString(),
 trials:practice.concat(trials),index:0,responses:[],finishedAt:null,breakAcknowledged:[],submittedBlocks:[]};
 persist();runTrial();
 }catch(err){alert('启动失败：'+err.message);}
}
function resume(){try{state=JSON.parse(localStorage.getItem(key));trials=state.trials||[];if(!trials.length)throw Error('缺少列表');runTrial();}catch(e){alert('恢复失败：'+e.message);}}
function reset(){if(!confirm('确定清空本机未完成的实验记录？请先导出备份。'))return;localStorage.removeItem(key);state=null;updateResume();}
$('#participant').value=randId();for(let i=1;i<=20;i++){let opt=document.createElement('option');opt.value='L'+String(i).padStart(2,'0');opt.textContent=opt.value;$('#list-manual').append(opt);}
$('#list-method').onchange=()=>{$('#list-manual-wrap').hidden=$('#list-method').value!=='manual';};
$('#start').onclick=start;$('#resume').onclick=resume;$('#reset').onclick=reset;
$$('.choice').forEach((btn,i)=>btn.onclick=()=>respond(i));
document.addEventListener('keydown',e=>{if(e.repeat)return;if(e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement)return;
 const i={'1':0,'2':1,'3':2}[e.key];if(i!==undefined){e.preventDefault();respond(i);}});
$('#export-json').onclick=exportJSON;$('#export-csv').onclick=exportCSV;$('#export-during').onclick=exportJSON;$('#submit-server').onclick=()=>submitToServer(true,'final');
updateResume();
