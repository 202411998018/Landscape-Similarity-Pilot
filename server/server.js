'use strict';
// Zero-dependency optional collection server. Use persistent disk in deployment.
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const DATA_DIR=path.resolve(process.env.DATA_DIR||path.join(__dirname,'data'));
const ORIGIN=(process.env.ALLOWED_ORIGIN||'http://localhost:8000').replace(/\/$/,'');
const PORT=Number(process.env.PORT||3000);
const validParticipant=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{3,32}$/.test(x);
const validSession=x=>typeof x==='string'&&/^[a-f0-9-]{36}$/.test(x);
fs.mkdirSync(DATA_DIR,{recursive:true});
const allocationFile=path.join(DATA_DIR,'allocation.json');
let alloc={};try{alloc=JSON.parse(fs.readFileSync(allocationFile,'utf8'));}catch{}
const writeAtomic=(file,data)=>{const tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(data));fs.renameSync(tmp,file);};
function cors(req,res){const origin=req.headers.origin||'';if(origin===ORIGIN){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}res.setHeader('Cache-Control','no-store');}
function reply(req,res,status,obj){cors(req,res);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(obj));}
function readJson(req){return new Promise((resolve,reject)=>{let size=0;const chunks=[];req.on('data',b=>{size+=b.length;if(size>2500000){reject(Error('payload too large'));req.destroy();return;}chunks.push(b);});req.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch(e){reject(e);}});req.on('error',reject);});}
http.createServer(async(req,res)=>{
 if(req.method==='OPTIONS'){cors(req,res);res.writeHead(204,{'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'});res.end();return;}
 if(req.method!=='POST'||!['/api/start','/api/submit'].includes(req.url||'')){reply(req,res,404,{error:'not found'});return;}
 if(req.headers.origin&&req.headers.origin!==ORIGIN){reply(req,res,403,{error:'origin forbidden'});return;}
 let body;try{body=await readJson(req);}catch(e){reply(req,res,400,{error:'invalid request'});return;}
 if(req.url==='/api/start'){
  if(!validParticipant(body.participant)){reply(req,res,400,{error:'invalid anonymous participant'});return;}
  // Persist participant->list and session; one participant ID should not receive multiple lists.
  if(!alloc[body.participant]){
   const counts=Array.from({length:20},(_,i)=>({id:'L'+String(i+1).padStart(2,'0'),n:0}));
   for(const a of Object.values(alloc)){const c=counts.find(x=>x.id===a.listId);if(c)c.n++;}
   counts.sort((a,b)=>a.n-b.n||a.id.localeCompare(b.id));
   alloc[body.participant]={listId:counts[0].id,sessionId:crypto.randomUUID(),assignedAt:new Date().toISOString()};
   writeAtomic(allocationFile,alloc);
  }
  reply(req,res,200,alloc[body.participant]);return;
 }
 if(!validSession(body.session_id)||!validParticipant(body.participant_id)||!Array.isArray(body.records)||body.records.length>320){reply(req,res,400,{error:'invalid session or records'});return;}
 const match=alloc[body.participant_id];
 if(!match||match.sessionId!==body.session_id||match.listId!==body.list_id){reply(req,res,403,{error:'assignment mismatch'});return;}
 const filename=path.join(DATA_DIR,'session_'+body.session_id+'.json');
 const safe={session_id:body.session_id,participant_id:body.participant_id,list_id:body.list_id,
    experiment_version:body.experiment_version,completed:!!body.completed,
    updatedAt:new Date().toISOString(),records:body.records};
 writeAtomic(filename,safe);
 reply(req,res,200,{ok:true,count:safe.records.length});
}).listen(PORT,()=>console.log(`Landscape collector on port ${PORT}, allowed origin ${ORIGIN}, DATA_DIR ${DATA_DIR}`));
