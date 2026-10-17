import {config} from './config.js';
import {STORAGE_KEY,normalize,prepareImport,digest} from './migration.js';
import {render} from './render.js';
const $=id=>document.getElementById(id);
const sb=window.supabase.createClient(config.url,config.publishableKey);
const bucket=sb.storage.from('vehicle-images');
let vehicles=[],user=null,admin=false,approved=false,plan=[],editing=null,busy=false,epoch=0;
const status=message=>$('accessStatus').textContent=message;
function checked(result){if(result.error) throw Error(result.error.message); return result.data;}
function download(name,value,type='application/json') {const url=URL.createObjectURL(new Blob([value],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
async function action(fn){if(busy)return;busy=true;const buttons=[...document.querySelectorAll('button')].map(b=>[b,b.disabled]);buttons.forEach(([b])=>b.disabled=true);try{await fn();}catch(e){status('Fehler: '+e.message);}finally{busy=false;buttons.forEach(([b,disabled])=>{if(b.isConnected)b.disabled=disabled;});}}
function clear(){epoch++;vehicles=[];approved=false;admin=false;plan=[];editing=null;$('appPanel').hidden=true;$('adminPanel').hidden=true;$('migrationPanel').hidden=true;$('importPreview').replaceChildren();$('runImport').hidden=true;$('confirmImport').hidden=true;$('editModal').classList.remove('open');render([],false);}
async function load(){
  clear();const generation=epoch;
  const result=await sb.auth.getUser();user=result.data?.user;
  $('accessPanel').hidden=!!user;$('lockList').hidden=!user;$('refresh').hidden=!user;
  if(!user){status('Bitte anmelden. Lokale Daten können ohne Anmeldung gesichert werden.');return;}
  const membership=checked(await sb.from('vehicle_members').select('user_id').eq('user_id',user.id));
  if(generation!==epoch)return;
  approved=membership.length===1;
  if(!approved){status('Angemeldet. Die Admin-Freigabe steht noch aus.');return;}
  admin=checked(await sb.rpc('vehicle_is_admin'))===true;
  const rows=[];for(let offset=0;;offset+=500){const page=checked(await sb.from('vehicles').select('*').order('id').range(offset,offset+499));rows.push(...page);if(page.length<500)break;}
  const loaded=await Promise.all(rows.map(async row=>({...row.data,id:row.id,user_id:row.user_id,updated_at:row.updated_at,image:row.data.image_path ? checked(await bucket.createSignedUrl(row.data.image_path,300)).signedUrl : ''})));
  if(generation!==epoch)return;
  vehicles=loaded;render(vehicles,true);$('appPanel').hidden=false;$('adminPanel').hidden=!admin;$('migrationPanel').hidden=!admin;
  if(admin) await loadMembers();
  status('Gemeinsamer Bestand geladen: '+vehicles.length+' Fahrzeuge.');
}
async function loadMembers(){
  const members=checked(await sb.rpc('vehicle_list_users'));$('memberList').replaceChildren();
  for(const member of members){const line=document.createElement('p'),label=document.createElement('span'),button=document.createElement('button');
    label.textContent=member.email+' • '+(!member.confirmed?'E-Mail unbestätigt':member.approved?'freigegeben':'wartet auf Freigabe')+' ';
    button.textContent=member.approved?'Freigabe entziehen':'Freigeben';button.disabled=!member.confirmed||member.is_admin;
    button.addEventListener('click',()=>action(async()=>{if(!confirm(label.textContent+'\n'+button.textContent+'?'))return;checked(await sb.rpc('vehicle_set_approval',{target_id:member.id,allow_access:!member.approved}));await loadMembers();}));
    if(member.is_admin)button.hidden=true;line.append(label,button);$('memberList').append(line);
  }
}
$('accessForm').addEventListener('submit',e=>{e.preventDefault();action(async()=>{checked(await sb.auth.signInWithPassword({email:$('email').value.trim(),password:$('accessPassword').value}));$('accessForm').reset();await load();});});
$('register').onclick=()=>action(async()=>{if(!$('accessForm').reportValidity())return;checked(await sb.auth.signUp({email:$('email').value.trim(),password:$('accessPassword').value,options:{emailRedirectTo:location.origin+location.pathname}}));$('accessForm').reset();status('Registrierung angefragt. Bitte Bestätigungs-E-Mail prüfen und danach Admin-Freigabe abwarten.');});
$('lockList').onclick=()=>action(async()=>{clear();user=null;checked(await sb.auth.signOut());await load();});
$('refresh').onclick=()=>action(load);
$('localBackup').onclick=()=>action(async()=>{const raw=localStorage.getItem(STORAGE_KEY);if(raw===null)throw Error('In diesem Browser sind keine Altdaten vorhanden. Bitte das bisher verwendete Gerät und dieselbe Website-Adresse öffnen.');download('narco-city-lokale-originaldaten.json',raw);status('Unveränderte lokale Originaldaten gesichert.');});
function fields(prefix='') {const key=name=>prefix?prefix+name[0].toUpperCase()+name.slice(1):name;return normalize({category:$(key('category')).value,type:$(key('type')).value,plate:$(key('plate')).value,info:$(key('info')).value,purchasePrice:$(key('purchasePrice')).value,image:''});}
async function upload(file,id){
  if(!file)return '';
  if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)||file.size>10*1024*1024)throw Error('Bitte PNG, JPEG, WebP oder GIF bis 10 MB auswählen.');
  const hash=await digest(await file.arrayBuffer());const path=id+'/'+hash;
  const result=await bucket.upload(path,file,{upsert:false,contentType:file.type});
  if(result.error){ // A deterministic retry may find the identical object already uploaded.
    const saved=checked(await bucket.download(path));if(await digest(await saved.arrayBuffer())!==hash)throw Error('Bild konnte nicht sicher gespeichert werden: '+result.error.message);
  }return path;
}
function dataOf(v){const {id,user_id,updated_at,image,...data}=v;return data;}
async function update(item,next){
  const rows=checked(await sb.from('vehicles').update({data:next}).eq('id',item.id).eq('updated_at',item.updated_at).select('id'));
  if(rows.length!==1)throw Error('Datensatz wurde inzwischen verändert oder die Freigabe wurde entzogen. Bitte aktualisieren.');
}
$('vehicleForm').onsubmit=e=>{e.preventDefault();action(async()=>{const data=fields(),id=crypto.randomUUID();data.image_path=await upload($('image').files[0],id);delete data.image;checked(await sb.from('vehicles').insert({id,user_id:user.id,data}).select('id').single());$('vehicleForm').reset();await load();});};
document.addEventListener('click',e=>{const button=e.target.closest('button[data-action]');if(!button||!approved)return;const item=vehicles.find(v=>v.id===button.closest('tr').dataset.id);if(!item)return;
  if(button.dataset.action==='edit') {editing=item;for(const field of ['category','type','plate','info','purchasePrice'])$('edit'+field[0].toUpperCase()+field.slice(1)).value=item[field]??'';$('editModal').classList.add('open');$('editModal').setAttribute('aria-hidden','false');}
  if(button.dataset.action==='image')button.closest('tr').querySelector('input[type=file]').click();
  if(button.dataset.action==='delete')action(async()=>{if(!confirm('Fahrzeug „'+item.type+'“ löschen? Vorher bei Bedarf eine Sicherung exportieren.'))return;const rows=checked(await sb.from('vehicles').delete().eq('id',item.id).eq('updated_at',item.updated_at).select('id'));if(rows.length!==1)throw Error('Konflikt: Bitte aktualisieren.');await load();});
});
const closeEdit=()=>{editing=null;$('editModal').classList.remove('open');$('editModal').setAttribute('aria-hidden','true');};
$('cancelEdit').onclick=closeEdit;document.addEventListener('keydown',e=>{if(e.key==='Escape')closeEdit();});
$('saveEdit').onclick=()=>action(async()=>{if(!editing)return;const next=fields('edit');delete next.image;await update(editing,{...dataOf(editing),...next});closeEdit();await load();});
document.addEventListener('change',e=>{if(!e.target.matches('.row-image-input')||!e.target.files[0])return;const item=vehicles.find(v=>v.id===e.target.closest('tr').dataset.id);action(async()=>{const image_path=await upload(e.target.files[0],item.id);await update(item,{...dataOf(item),image_path});await load();});});
async function preview(input){if(!admin)throw Error('Import ist nur für den Admin verfügbar.');await load();plan=await prepareImport(input,vehicles);const summary=document.createElement('p');summary.textContent=plan.length+' Fahrzeuge, '+plan.filter(p=>p.v.image).length+' eingebettete Bilder, '+plan.filter(p=>p.status==='Neu').length+' neue Fahrzeuge.';$('importPreview').replaceChildren(summary);for(const p of plan){const row=document.createElement('p');row.textContent=p.status+' • '+p.v.category+' • '+p.v.type+' • '+(p.v.plate||'ohne Kennzeichen');$('importPreview').append(row);}$('runImport').hidden=!plan.some(p=>p.status==='Neu');}
$('previewLocal').onclick=()=>action(async()=>{const raw=localStorage.getItem(STORAGE_KEY);if(!raw)throw Error('Keine lokalen Altdaten in diesem Browser.');await preview(JSON.parse(raw));});
$('importBackup').onclick=()=>$('backupFile').click();
$('backupFile').onchange=e=>action(async()=>{const file=e.target.files[0];try{if(!file)return;if(file.size>150*1024*1024)throw Error('Sicherung größer als 150 MB.');await preview(JSON.parse(await file.text()));}finally{e.target.value='';}});
$('runImport').onclick=()=>action(async()=>{
  const pending=plan.filter(p=>p.status==='Neu');if(!pending.length||!confirm(pending.length+' neue Fahrzeuge samt Bildern in den gemeinsamen Bestand übernehmen? Lokale Daten bleiben unverändert.'))return;
  const receipt=[];
  for(const p of pending){const id=p.key.slice(0,8)+'-'+p.key.slice(8,12)+'-4'+p.key.slice(13,16)+'-a'+p.key.slice(17,20)+'-'+p.key.slice(20,32);const data={...p.v,import_key:p.key};if(p.v.image){const blob=await (await fetch(p.v.image)).blob();data.image_path=await upload(blob,id);}delete data.image;
    const result=checked(await sb.rpc('vehicle_import_one',{import_id:p.key,vehicle_id:id,vehicle_data:data}));
    if(result==='imported'||result==='already_present') {const row=checked(await sb.from('vehicles').select('data').eq('id',id).single());if(row.data.import_key!==p.key||row.data.image_path!==data.image_path)throw Error('Import-Nachprüfung fehlgeschlagen. Lokale Originale bleiben erhalten.');}
    receipt.push({key:p.key,result});p.status=result==='plate_conflict'?'Kennzeichenkonflikt – übersprungen':result==='already_imported'?'Bereits verarbeitet (ggf. inzwischen gelöscht)':'Übernommen und geprüft';status(receipt.length+' / '+pending.length+' verarbeitet.');
  }
  download('narco-city-importprotokoll.json',JSON.stringify(receipt,null,2));await load();$('confirmImport').hidden=false;status('Import abgeschlossen. Bitte Fahrzeuge und Bilder kontrollieren, dann die Übernahme bestätigen. Lokale Daten sind erhalten.');
});
$('confirmImport').onclick=()=>action(async()=>{if(!confirm('Sind alle übernommenen Fahrzeuge und Bilder korrekt? Die lokalen Originaldaten bleiben auch nach Bestätigung erhalten.'))return;localStorage.setItem('narcoCityCloudMigrationConfirmed_v1',new Date().toISOString());$('confirmImport').hidden=true;status('Übernahme bestätigt. Lokale Originaldaten und alte Zugänge bleiben als Rückfallmöglichkeit erhalten.');});
$('exportBackup').onclick=()=>action(async()=>{const rows=[];for(const v of vehicles){const data=dataOf(v);let image='';if(data.image_path){const blob=checked(await bucket.download(data.image_path));image=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob);});}delete data.image_path;rows.push({...data,id:v.id,image});}download('narco-city-sicherung-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify({version:2,vehicles:rows},null,2));status('Sicherung einschließlich aller Bilder exportiert.');});
$('exportCsv').onclick=()=>{const safe=v=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"';download('narco-city-fahrzeuge.csv','\ufeff'+[['Bereich','Fahrzeugtyp','Kennzeichen','Kaufpreis','Informationen'],...vehicles.map(v=>[v.category,v.type,v.plate,v.purchasePrice,v.info])].map(r=>r.map(safe).join(';')).join('\r\n'),'text/csv;charset=utf-8');};
sb.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){clear();$('accessPanel').hidden=false;$('lockList').hidden=true;$('refresh').hidden=true;status('Abgemeldet.');}});
window.addEventListener('focus',()=>{if(!busy&&!editing&&!plan.length)action(load);});
setInterval(()=>{if(!busy&&user&&!editing&&!plan.length)action(load);},240000);
action(load);
