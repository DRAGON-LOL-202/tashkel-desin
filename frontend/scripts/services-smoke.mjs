// اختبار تكامل لطبقة src/services/* ضد خادم حقيقي (شغّله من مجلد frontend). يحتاج بدء backend + seed + ADMIN_PASSWORD وأن يكون http-smoke.mjs قد شُغّل قبله (ينشئ des1 ويعطّله في آخره؛ هذا السكربت يعيد تفعيله). قاعدة اختبار فقط.
const DPW=process.env.SMOKE_USER_PASSWORD; if(!DPW||DPW.length<8){console.error('حدّد SMOKE_USER_PASSWORD (8 أحرف على الأقل) و ADMIN_PASSWORD'); process.exit(2)}
import fs from 'fs';
import { createServer } from 'vite';
const store={}; globalThis.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>{delete store[k]}};
globalThis.window={location:{origin:'http://localhost:5173'},dispatchEvent:()=>true,addEventListener(){},removeEventListener(){}};
const vite=await createServer({configFile:false,root:process.cwd(),logLevel:'error',server:{middlewareMode:true,hmr:false,watch:null},appType:'custom',define:{'import.meta.env.VITE_API_URL':JSON.stringify(process.env.API_URL||'http://localhost:4000/api')}});
const L=p=>vite.ssrLoadModule(p);
const {authService}=await L('/src/services/authService.ts'); const {tasksService}=await L('/src/services/tasksService.ts');
const {usersService}=await L('/src/services/usersService.ts'); const {goalsService}=await L('/src/services/goalsService.ts');
const {feedbackService}=await L('/src/services/feedbackService.ts'); const {scheduleService}=await L('/src/services/scheduleService.ts');
const {ApiError}=await L('/src/lib/api.ts');
let p=0,f=0; const ok=(n,c,x='')=>{c?p++:f++; console.log(c?'PASS':'FAIL',n,c?'':x)};
const today=new Date().toISOString().slice(0,10);
try{
 const me=await authService.login('lol',(process.env.ADMIN_PASSWORD||'')); ok('login -> TeamMember',me.accessRole==='admin'&&me.username==='lol');
 ok('me()',(await authService.me()).id===me.id);
 const members=await usersService.list(); ok('users.list',members.length>=4&&members.every(m=>m.accessRole));
 let des=members.find(m=>m.username==='des1'); des=await usersService.setActive(des.id,true); ok('users.setActive (reactivate des1)',des.isActive===true);
 const t=await tasksService.create({title:'من الواجهة',date:today,assigneeId:des.id,target:4,current:0,priority:'high'}); ok('tasks.create',t.id&&t.assigneeId===des.id);
 const s=await tasksService.create({title:'فرعية',date:today,assigneeId:des.id,parentId:t.id,target:1,current:0}); ok('subtask',s.parentId===t.id);
 ok('setCurrent',(await tasksService.setCurrent(t.id,2)).current===2);
 ok('update',(await tasksService.update(t.id,{title:'معدلة',date:today,assigneeId:des.id,target:4,current:2})).title==='معدلة');
 ok('start',(await tasksService.start(s.id)).id===s.id); ok('stop',!!(await tasksService.stop(s.id,'سبب')));
 ok('comment',!!(await tasksService.addComment(t.id,'تعليق')));
 ok('reorder',(await tasksService.reorder([t.id,s.id]))===undefined);
 ok('move',(await tasksService.moveToMember(t.id,members.find(m=>m.username==='amr').id)).assigneeId!==des.id);
 ok('finish',(await tasksService.finish(s.id)).status==='completed');
 ok('moveUnfinished number',typeof (await tasksService.moveUnfinishedToNextDay(today))==='number');
 ok('list',(await tasksService.list()).length>=2);
 const g=await goalsService.create({title:'هدف واجهة',type:'monthly',target:10,current:3,startDate:today}); ok('goals.create',g.progress===30,JSON.stringify(g));
 ok('goals.update',(await goalsService.update(g.id,{current:10})).status==='completed'); await goalsService.remove(g.id); ok('goals.remove',!(await goalsService.list()).some(x=>x.id===g.id));
 const fb=await feedbackService.create({title:'ملاحظة',description:'د',type:'problem',date:today}); ok('feedback.create',fb.type==='problem'&&fb.status==='open');
 ok('toggleStatus',(await feedbackService.toggleStatus(fb)).status==='resolved');
 ok('removeMany',(await feedbackService.removeMany({type:'problem'}))>=1);
 const ev=await scheduleService.create({title:'موسم واجهة',startDate:'2026-11-01',endDate:'2026-11-05',color:'#27C6A3'}); ok('schedule.create',ev.color==='#27C6A3');
 ok('schedule.update',(await scheduleService.update(ev.id,{title:'x'})).title==='x'); await scheduleService.remove(ev.id); ok('schedule.remove',!(await scheduleService.list()).some(x=>x.id===ev.id));
 const nu=await usersService.create({name:'جديد',username:'newuser',email:'n@example.test',password:DPW,role:'designer'}); ok('users.create (role lowercase)',nu.accessRole==='designer',JSON.stringify(nu));
 ok('users.setActive',(await usersService.setActive(nu.id,false)).isActive===false); await usersService.remove(nu.id); ok('users.remove',!(await usersService.list()).some(m=>m.id===nu.id));
 await authService.logout(); ok('logout clears token',!authService.hasToken());
 await authService.login('des1',DPW);
 try{await usersService.list(); ok('designer users.list 403',false)}catch(e){ok('designer users.list 403',e instanceof ApiError&&e.status===403,String(e))}
 try{await goalsService.list(); ok('designer goals 403',false)}catch(e){ok('designer goals 403',e instanceof ApiError&&e.status===403)}
 ok('designer tasks list own',(await tasksService.list()).every(x=>x.assigneeId===des.id));
}catch(e){f++;console.log('EXCEPTION',e.message||e)}
console.log(`${p} passed, ${f} failed`); await vite.close(); process.exit(f?1:0);
