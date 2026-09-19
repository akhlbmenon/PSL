const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

let state;
let activeFixtureId = null;
let tickTimer = null;

const emptyState = () => ({
  version: 1,
  settings: { appName: 'PSL Arena', auctionTimerSeconds: 30, autoAuction: false, autoNextDelaySeconds: 10, meetingsPerPair: 1, points: { win: 3, draw: 1, loss: 0 } },
  auction: { active: false, currentPlayerId: null, endsAt: null, highestBid: null, queue: [], readyByTeam: {} },
  teams: [], players: [], bids: [], chat: [], tournaments: [], fixtures: [], knockout: [], updatedAt: new Date().toISOString()
});

function uid(prefix='id'){ return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`; }
function esc(v=''){ return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
function money(n){ return `${Number(n||0)} pts`; }
function teamById(id){ return state.teams.find(t=>t.id===id); }
function playerById(id){ return state.players.find(p=>p.id===id); }
function myTeam(){ return teamById($('#myTeam').value); }
function role(){ return $('#role').value; }

async function load(){
  try { const r = await fetch('/api/state'); state = r.ok ? await r.json() : emptyState(); }
  catch { state = emptyState(); }
  if(!state?.settings) state = emptyState();
  render(); startTicker();
  if(!state.chat.length) botSay('👋 Welcome to PSL Arena! I’ll host the auction, keep captains ready, announce bids and results, and help with tournament questions.');
}

async function save(){
  $('#saveState').textContent = '● Saving';
  try { await fetch('/api/state',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(state)}); $('#saveState').textContent='● Live'; }
  catch { $('#saveState').textContent='● Offline'; }
}

function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2200); }
function botSay(text, type='bot'){
  state.chat.push({id:uid('msg'),author:'PSL AI Host',role:type,text,at:new Date().toISOString()});
  if(state.chat.length>300) state.chat=state.chat.slice(-300);
  save(); renderChat();
}
function systemEvent(text){ botSay(text,'event'); }

function applyRole(){
  const r=role();
  $$('.admin-only').forEach(el=>el.classList.toggle('hidden-role',r!=='admin'));
  $$('.captain-only').forEach(el=>el.classList.toggle('hidden-role',r!=='captain'));
  $('#myTeam').disabled = r==='viewer';
}

function render(){
  const prevTeam=$('#myTeam').value;
  $('#myTeam').innerHTML='<option value="">Select team</option>'+state.teams.map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join('');
  if(state.teams.some(t=>t.id===prevTeam)) $('#myTeam').value=prevTeam;
  applyRole(); renderAuction(); renderTournament(); renderChat(); renderAdmin();
}

function renderAuction(){
  const a=state.auction, p=playerById(a.currentPlayerId), high=a.highestBid;
  $('#auctionTitle').textContent = a.active ? 'Bidding live' : (p ? 'Auction paused' : 'No player on the block');
  $('#currentPlayer').innerHTML = p ? `<div><b>${esc(p.name)}</b><span>Base ${money(p.basePrice)}${p.rating?` · Rating ${p.rating}`:''}</span></div>` : 'Add players, then start an auction.';
  $('#highestBid').innerHTML = high ? `🏆 ${esc(teamById(high.teamId)?.name||'Team')} leads at <b>${money(high.amount)}</b>` : 'No bids yet';
  $('#readyBtn').disabled = !!a.active;
  $('#bidBtn').disabled = !a.active;
  $('#bidAmount').disabled = !a.active;
  $('#startBidBtn').disabled = a.active || !state.players.some(x=>x.status==='available');
  $('#stopBidBtn').disabled = !a.active;

  const t=myTeam();
  if(t){ const ready=!!a.readyByTeam[t.id]; $('#readyBtn').textContent=ready?'Not Ready':'Ready'; $('#readyBtn').classList.toggle('ready',ready); }

  $('#readiness').innerHTML=state.teams.map(t=>`<span class="chip ${a.readyByTeam[t.id]?'ok':'warn'}">${a.readyByTeam[t.id]?'✅':'⏳'} ${esc(t.name)}</span>`).join('');
  $('#queueCount').textContent=a.queue.length;
  const q=a.queue.map(id=>playerById(id)).filter(Boolean);
  $('#queue').innerHTML=q.length?q.map((p,i)=>`<div class="list-row"><span>${i+1}. ${esc(p.name)}</span><b>${money(p.basePrice)}</b></div>`).join(''):'No players queued.';

  const available=state.players.filter(p=>p.status==='available');
  $('#availablePlayers').innerHTML=available.length?available.map(p=>`<div class="list-row"><span>${esc(p.name)}</span><b>${money(p.basePrice)}</b></div>`).join(''):'No players yet.';
  $('#auctionTeams').innerHTML=state.teams.length?state.teams.map(t=>`<div class="team-row"><div class="avatar">${t.image?`<img src="${esc(t.image)}" alt="">`:esc(t.name.slice(0,2).toUpperCase())}</div><div><b>${esc(t.name)}</b><span>${esc(t.captain||'No captain')} · ${money(t.budgetRemaining)} left · ${t.playerIds?.length||0} players</span></div></div>`).join(''):'No teams yet.';
  $('#bidHistory').innerHTML=state.bids.length?state.bids.slice(-12).reverse().map(b=>`<div class="list-row"><span>${esc(teamById(b.teamId)?.name||'Team')}</span><b>${money(b.amount)}</b></div>`).join(''):'No bids yet.';
}

function startTicker(){
  clearInterval(tickTimer);
  tickTimer=setInterval(()=>{
    if(!state.auction.active){ $('#timer').textContent='—'; return; }
    const left=Math.max(0,Math.ceil((new Date(state.auction.endsAt)-Date.now())/1000));
    $('#timer').textContent=`${left}s`;
    if(left<=0) finishAuction();
  },500);
}

function startAuction(force=false){
  if(state.auction.active) return;
  const notReady=state.teams.filter(t=>!state.auction.readyByTeam[t.id]);
  if(notReady.length && !force){
    $('#readyWarning').textContent=`${notReady.map(t=>t.name).join(', ')} ${notReady.length===1?'is':'are'} not ready. You can cancel or override and start anyway.`;
    $('#readyDialog').showModal();
    notReady.forEach(t=>systemEvent(`⏳ ${t.name}, please tap Ready before the next auction starts.`));
    return;
  }
  let p=playerById(state.auction.currentPlayerId);
  if(!p || p.status!=='available') p=state.players.find(x=>x.status==='available');
  if(!p){ toast('No available players'); return; }
  state.auction.currentPlayerId=p.id;
  state.auction.queue=state.players.filter(x=>x.status==='available'&&x.id!==p.id).map(x=>x.id);
  state.auction.active=true;
  state.auction.highestBid=null;
  state.auction.endsAt=new Date(Date.now()+Number(state.settings.auctionTimerSeconds||30)*1000).toISOString();
  state.bids=state.bids.filter(b=>b.playerId!==p.id);
  systemEvent(`🔨 BIDDING STARTED! ${p.name} is on the block at ${money(p.basePrice)}. Captains, place your bids!`);
  save(); renderAuction();
}

function placeBid(){
  if(!state.auction.active) return;
  const t=myTeam(); if(!t){ toast('Select your team first'); return; }
  const p=playerById(state.auction.currentPlayerId); if(!p) return;
  const amount=Number($('#bidAmount').value);
  const min=state.auction.highestBid ? Number(state.auction.highestBid.amount)+1 : Number(p.basePrice||1);
  if(!Number.isFinite(amount)||amount<min){ toast(`Minimum bid is ${min}`); return; }
  if(amount>Number(t.budgetRemaining||0)){ toast('Not enough team budget'); return; }
  const bid={id:uid('bid'),playerId:p.id,teamId:t.id,amount,at:new Date().toISOString()};
  state.bids.push(bid); state.auction.highestBid=bid;
  $('#bidAmount').value='';
  systemEvent(`💰 ${t.name} bids ${money(amount)} for ${p.name}!`);
  save(); renderAuction();
}

function finishAuction(){
  if(!state.auction.active) return;
  state.auction.active=false;
  const p=playerById(state.auction.currentPlayerId), high=state.auction.highestBid;
  if(p && high){
    const t=teamById(high.teamId);
    p.status='sold'; p.teamId=t.id; p.soldPrice=high.amount;
    t.budgetRemaining=Math.max(0,Number(t.budgetRemaining||0)-Number(high.amount));
    t.playerIds=t.playerIds||[]; if(!t.playerIds.includes(p.id)) t.playerIds.push(p.id);
    systemEvent(`🥳 Hurray! ${p.name} SOLD to ${t.name} for ${money(high.amount)}! 🎉 Squad and budget updated.`);
  } else if(p){
    p.status='unsold';
    systemEvent(`😮 No bids for ${p.name}. Marked UNSOLD for now.`);
  }
  state.auction.currentPlayerId=null; state.auction.highestBid=null; state.auction.endsAt=null;
  state.auction.readyByTeam={};
  save(); render();
  if(state.settings.autoAuction && state.players.some(x=>x.status==='available')){
    const delay=Number(state.settings.autoNextDelaySeconds||10);
    systemEvent(`🤖 Auto Auction is ON. Next player will be called in ${delay} seconds.`);
    setTimeout(()=>startAuction(true),delay*1000);
  }
}

function renderTournament(){
  const table=standings();
  $('#statTeams').textContent=state.teams.length;
  $('#statPlayed').textContent=state.fixtures.filter(f=>f.played).length;
  $('#statGoals').textContent=state.fixtures.filter(f=>f.played).reduce((a,f)=>a+Number(f.homeScore||0)+Number(f.awayScore||0),0);
  $('#statMatchday').textContent=Math.max(0,...state.fixtures.map(f=>Number(f.matchday||0)));
  $('#pointsBody').innerHTML=table.map((r,i)=>`<tr><td>${i+1}</td><td><span class="team-inline">${r.image?`<img src="${esc(r.image)}">`:''}${esc(r.name)}</span></td><td>${r.p}</td><td>${r.w}</td><td>${r.d}</td><td>${r.l}</td><td>${r.gf}</td><td>${r.ga}</td><td>${r.gd}</td><td><b>${r.pts}</b></td></tr>`).join('') || '<tr><td colspan="10">No teams yet.</td></tr>';

  const matchdays=[...new Set(state.fixtures.map(f=>f.matchday))].sort((a,b)=>a-b);
  const current=$('#matchdayFilter').value;
  $('#matchdayFilter').innerHTML='<option value="all">All matchdays</option>'+matchdays.map(m=>`<option value="${m}">Matchday ${m}</option>`).join('');
  if(current==='all'||matchdays.includes(Number(current))) $('#matchdayFilter').value=current;
  const filter=$('#matchdayFilter').value;
  const fixtures=state.fixtures.filter(f=>filter==='all'||String(f.matchday)===filter);
  $('#fixtures').innerHTML=fixtures.length?fixtures.map(f=>fixtureHtml(f)).join(''):'Generate fixtures to begin.';

  const scorers=scorerTable();
  $('#scorers').innerHTML=scorers.length?scorers.map((s,i)=>`<div class="rank-row"><b>${i+1}</b><span>${esc(s.name)}<small>${esc(s.team)}</small></span><strong>${s.goals}</strong></div>`).join(''):'No goals recorded.';
  const cs=cleanSheetTable();
  $('#cleanSheets').innerHTML=cs.length?cs.map((s,i)=>`<div class="rank-row"><b>${i+1}</b><span>${esc(s.name)}</span><strong>${s.cleanSheets}</strong></div>`).join(''):'No clean sheets recorded.';
  $('#knockout').innerHTML=state.knockout.length?state.knockout.map(k=>`<div class="fixture"><span>${esc(k.round)}</span><b>${esc(teamById(k.homeTeamId)?.name||'TBD')} vs ${esc(teamById(k.awayTeamId)?.name||'TBD')}</b></div>`).join(''):'No knockout phase yet.';
}

function fixtureHtml(f){
  const h=teamById(f.homeTeamId), a=teamById(f.awayTeamId);
  const score=f.played?`${f.homeScore} – ${f.awayScore}`:'vs';
  return `<button class="fixture ${f.played?'played':''}" data-fixture="${f.id}"><span>MD ${f.matchday}</span><b>${esc(h?.name||'Team')} <em>${score}</em> ${esc(a?.name||'Team')}</b><small>${f.played?'Completed':'Tap to update score'}</small></button>`;
}

function standings(){
  const pts=state.settings.points||{win:3,draw:1,loss:0};
  const rows=state.teams.map(t=>({id:t.id,name:t.name,image:t.image,p:0,w:0,d:0,l:0,gf:0,ga:0,gd:0,pts:0}));
  const by=Object.fromEntries(rows.map(r=>[r.id,r]));
  state.fixtures.filter(f=>f.played).forEach(f=>{
    const h=by[f.homeTeamId],a=by[f.awayTeamId]; if(!h||!a)return;
    const hs=Number(f.homeScore),as=Number(f.awayScore); h.p++;a.p++;h.gf+=hs;h.ga+=as;a.gf+=as;a.ga+=hs;
    if(hs>as){h.w++;a.l++;h.pts+=pts.win;a.pts+=pts.loss;} else if(hs<as){a.w++;h.l++;a.pts+=pts.win;h.pts+=pts.loss;} else {h.d++;a.d++;h.pts+=pts.draw;a.pts+=pts.draw;}
  });
  rows.forEach(r=>r.gd=r.gf-r.ga);
  return rows.sort((a,b)=>b.pts-a.pts||b.gd-a.gd||b.gf-a.gf||a.name.localeCompare(b.name));
}

function generateFixtures(){
  if(state.teams.length<2){toast('Add at least two teams');return;}
  const ids=state.teams.map(t=>t.id); if(ids.length%2) ids.push(null);
  const rounds=[]; const arr=[...ids];
  for(let r=0;r<arr.length-1;r++){
    const games=[];
    for(let i=0;i<arr.length/2;i++){ const x=arr[i],y=arr[arr.length-1-i]; if(x&&y) games.push([x,y]); }
    rounds.push(games); arr.splice(1,0,arr.pop());
  }
  const meetings=Math.max(1,Number(state.settings.meetingsPerPair||1));
  const fx=[]; let md=1;
  for(let cycle=0;cycle<meetings;cycle++) for(const round of rounds){
    for(const [x,y] of round){ const flip=cycle%2===1; fx.push({id:uid('fx'),matchday:md,homeTeamId:flip?y:x,awayTeamId:flip?x:y,played:false,homeScore:null,awayScore:null,scorers:[]}); }
    md++;
  }
  state.fixtures=fx; state.knockout=[];
  systemEvent(`📅 Fixtures generated! ${state.teams.length} teams, ${meetings} meeting${meetings>1?'s':''} per opponent, ${md-1} matchdays.`);
  save(); renderTournament();
}

function scorerTable(){
  const map={};
  state.fixtures.forEach(f=>(f.scorers||[]).forEach(s=>{ const key=`${s.name}|${s.teamId||''}`; map[key]??={name:s.name,team:teamById(s.teamId)?.name||'',goals:0}; map[key].goals++; }));
  return Object.values(map).sort((a,b)=>b.goals-a.goals||a.name.localeCompare(b.name));
}
function cleanSheetTable(){
  const map=Object.fromEntries(state.teams.map(t=>[t.id,{name:t.name,cleanSheets:0}]));
  state.fixtures.filter(f=>f.played).forEach(f=>{ if(Number(f.awayScore)===0&&map[f.homeTeamId])map[f.homeTeamId].cleanSheets++; if(Number(f.homeScore)===0&&map[f.awayTeamId])map[f.awayTeamId].cleanSheets++; });
  return Object.values(map).filter(x=>x.cleanSheets).sort((a,b)=>b.cleanSheets-a.cleanSheets||a.name.localeCompare(b.name));
}

function generateKO(){
  const table=standings();
  let n=table.length>=8?8:table.length>=4?4:table.length>=2?2:0;
  if(!n){toast('Need at least 2 teams');return;}
  const q=table.slice(0,n); const round=n===8?'Quarter-final':n===4?'Semi-final':'Final';
  state.knockout=[];
  for(let i=0;i<n/2;i++) state.knockout.push({id:uid('ko'),round,homeTeamId:q[i].id,awayTeamId:q[n-1-i].id});
  systemEvent(`🏆 Knockout phase added from the league table: ${round} pairings are ready!`);
  save(); renderTournament();
}

function openScore(id){
  if(role()!=='admin'){toast('Only admins can update scores');return;}
  const f=state.fixtures.find(x=>x.id===id); if(!f)return; activeFixtureId=id;
  $('#scoreMatch').textContent=`${teamById(f.homeTeamId)?.name} vs ${teamById(f.awayTeamId)?.name}`;
  $('#homeScore').value=f.played?f.homeScore:0; $('#awayScore').value=f.played?f.awayScore:0;
  $('#goalScorers').value=(f.scorers||[]).map(s=>`${s.name}, ${teamById(s.teamId)?.name||''}`).join('\n');
  $('#scoreDialog').showModal();
}
function saveScore(){
  const f=state.fixtures.find(x=>x.id===activeFixtureId); if(!f)return;
  f.homeScore=Math.max(0,Number($('#homeScore').value||0)); f.awayScore=Math.max(0,Number($('#awayScore').value||0)); f.played=true;
  const h=teamById(f.homeTeamId),a=teamById(f.awayTeamId);
  f.scorers=$('#goalScorers').value.split('\n').map(x=>x.trim()).filter(Boolean).map(line=>{
    const [name,teamText='']=line.split(',').map(x=>x.trim());
    const team=state.teams.find(t=>t.name.toLowerCase()===teamText.toLowerCase()) || (teamText.toLowerCase()===h?.name.toLowerCase()?h:teamText.toLowerCase()===a?.name.toLowerCase()?a:null);
    return {name,teamId:team?.id||null};
  });
  $('#scoreDialog').close();
  systemEvent(`🎮 FULL TIME: ${h.name} ${f.homeScore}–${f.awayScore} ${a.name}. Table and stats updated!`);
  save(); renderTournament();
}

function importAuctionTeams(){
  if(!state.teams.length){toast('No auction teams to import');return;}
  systemEvent(`🎮 ${state.teams.length} auction teams are now ready in the tournament organizer.`); toast('Auction teams are already linked to Tournament'); renderTournament();
}

function parseCSV(text){
  const lines=text.split(/\r?\n/).filter(x=>x.trim()); if(!lines.length)return [];
  const parse=line=>{const out=[];let cur='',q=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(q&&line[i+1]==='"'){cur+='"';i++;}else q=!q;}else if(c===','&&!q){out.push(cur.trim());cur='';}else cur+=c;}out.push(cur.trim());return out;};
  const headers=parse(lines[0]).map(x=>x.toLowerCase());
  return lines.slice(1).map(line=>Object.fromEntries(parse(line).map((v,i)=>[headers[i],v])));
}
function importCSV(text){
  const rows=parseCSV(text); let teams=0,players=0;
  rows.forEach(r=>{
    const type=(r.type||((r.captain||r.budget)?'team':'player')).toLowerCase();
    if(type==='team'&&r.name){ const budget=Number(r.budget||200); state.teams.push({id:uid('team'),name:r.name,captain:r.captain||'',image:r.image||'',budget,budgetRemaining:budget,playerIds:[]});teams++; }
    if(type==='player'&&r.name){ state.players.push({id:uid('player'),name:r.name,basePrice:Number(r.baseprice||r.base_price||1),rating:Number(r.rating||0)||null,status:'available',teamId:null});players++; }
  });
  systemEvent(`📥 CSV import complete: ${teams} team${teams!==1?'s':''} and ${players} player${players!==1?'s':''} added.`); save(); render();
}

function renderChat(){
  const box=$('#chatMessages');
  box.innerHTML=state.chat.length?state.chat.slice(-100).map(m=>`<div class="message ${m.role==='bot'||m.role==='event'?'bot':''}"><div><b>${esc(m.author)}</b><small>${new Date(m.at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</small></div><p>${esc(m.text)}</p></div>`).join(''):'<div class="empty">No messages yet.</div>';
  box.scrollTop=box.scrollHeight;
  const presets=['🔨 Auction starts in a moment. Captains, please get ready!','⏳ Please mark Ready before the next player is called.','📢 Final call for bids!','🎮 Today’s fixtures are ready. Check your matchday schedule.','🏆 Points table has been updated.'];
  $('#quickTexts').innerHTML=presets.map(x=>`<button type="button" data-preset="${esc(x)}">${esc(x)}</button>`).join('');
}

async function askAI(message){
  const user=role()==='admin'?'Admin':role()==='captain'?(myTeam()?.captain||myTeam()?.name||'Captain'):'Viewer';
  state.chat.push({id:uid('msg'),author:user,role:'user',text:message,at:new Date().toISOString()}); await save(); renderChat();
  const context={auction:state.auction,teams:state.teams.map(t=>({name:t.name,captain:t.captain,budgetRemaining:t.budgetRemaining,players:t.playerIds?.length||0,ready:!!state.auction.readyByTeam[t.id]})),currentPlayer:playerById(state.auction.currentPlayerId)?.name||null,standings:standings().slice(0,12),fixtures:state.fixtures.slice(-20)};
  try{ const r=await fetch('/api/ai',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message,context})}); const d=await r.json(); botSay(d.reply||'🤖 I could not answer that right now.'); }
  catch{ botSay('🤖 I’m having trouble answering right now. Auction event announcements will still continue.'); }
}

function renderAdmin(){
  $('#timerSetting').value=state.settings.auctionTimerSeconds||30; $('#autoAuction').checked=!!state.settings.autoAuction; $('#autoDelay').value=state.settings.autoNextDelaySeconds||10; $('#meetings').value=state.settings.meetingsPerPair||1;
}

function addTeam(){
  const name=$('#teamName').value.trim(); if(!name){toast('Team name required');return;}
  const budget=Math.max(0,Number($('#teamBudget').value||200));
  state.teams.push({id:uid('team'),name,captain:$('#captainName').value.trim(),image:$('#teamImage').value.trim(),budget,budgetRemaining:budget,playerIds:[]});
  $('#teamName').value='';$('#captainName').value='';$('#teamImage').value='';
  systemEvent(`🆕 ${name} joined PSL Arena!`); save(); render();
}
function addPlayer(){
  const name=$('#playerName').value.trim(); if(!name){toast('Player name required');return;}
  const p={id:uid('player'),name,basePrice:Math.max(1,Number($('#playerBase').value||1)),rating:Number($('#playerRating').value||0)||null,status:'available',teamId:null};
  state.players.push(p); state.auction.queue.push(p.id); $('#playerName').value='';$('#playerRating').value='';
  systemEvent(`👤 ${name} registered for the auction at base ${money(p.basePrice)}.`); save(); render();
}

async function resetAll(){
  if(!confirm('This permanently clears ALL PSL Arena data. Continue?')) return;
  if(!confirm('Final confirmation: teams, players, bids, chat, fixtures and results will all be erased.')) return;
  state=emptyState(); await fetch('/api/state',{method:'DELETE'}); render(); botSay('🧹 PSL Arena has been reset. All demo/live data is cleared and the arena is ready for a fresh setup.'); toast('All data cleared');
}

function copyMatchday(){
  const f=$('#matchdayFilter').value; const list=state.fixtures.filter(x=>f==='all'||String(x.matchday)===f); if(!list.length){toast('No fixtures to share');return;}
  const title=f==='all'?'PSL Arena Fixtures':`PSL Arena · Matchday ${f}`;
  const text=[`🎮 ${title}`, ...list.map(x=>`${teamById(x.homeTeamId)?.name} ${x.played?`${x.homeScore}–${x.awayScore}`:'vs'} ${teamById(x.awayTeamId)?.name}`)].join('\n');
  navigator.clipboard?.writeText(text).then(()=>toast('Fixture text copied')).catch(()=>prompt('Copy fixtures:',text));
}

$$('.tab').forEach(b=>b.addEventListener('click',()=>{ $$('.tab').forEach(x=>x.classList.remove('active')); $$('.panel').forEach(x=>x.classList.remove('active')); b.classList.add('active'); $('#'+b.dataset.tab).classList.add('active'); }));
$('#role').addEventListener('change',()=>{applyRole();renderAuction();});
$('#myTeam').addEventListener('change',renderAuction);
$('#readyBtn').addEventListener('click',()=>{ const t=myTeam();if(!t){toast('Select your team');return;} if(state.auction.active)return; state.auction.readyByTeam[t.id]=!state.auction.readyByTeam[t.id]; systemEvent(`${state.auction.readyByTeam[t.id]?'✅':'⏳'} ${t.name} is ${state.auction.readyByTeam[t.id]?'READY':'NOT READY'}.`); save();renderAuction(); });
$('#bidBtn').addEventListener('click',placeBid); $('#bidAmount').addEventListener('keydown',e=>{if(e.key==='Enter')placeBid();});
$('#startBidBtn').addEventListener('click',()=>startAuction(false)); $('#stopBidBtn').addEventListener('click',finishAuction);
$('#cancelStart').addEventListener('click',()=>$('#readyDialog').close()); $('#overrideStart').addEventListener('click',()=>{$('#readyDialog').close();startAuction(true);});
$('#addTeam').addEventListener('click',addTeam); $('#addPlayer').addEventListener('click',addPlayer);
$('#saveSettings').addEventListener('click',()=>{state.settings.auctionTimerSeconds=Math.max(5,Number($('#timerSetting').value||30));state.settings.autoAuction=$('#autoAuction').checked;state.settings.autoNextDelaySeconds=Math.max(1,Number($('#autoDelay').value||10));state.settings.meetingsPerPair=Math.max(1,Number($('#meetings').value||1));save();toast('Settings saved');});
$('#resetAll').addEventListener('click',resetAll); $('#generateFixtures').addEventListener('click',generateFixtures); $('#generateKO').addEventListener('click',generateKO); $('#importAuctionTeams').addEventListener('click',importAuctionTeams);
$('#csvInput').addEventListener('change',async e=>{const f=e.target.files?.[0];if(f)importCSV(await f.text());e.target.value='';});
$('#matchdayFilter').addEventListener('change',renderTournament); $('#shareMatchday').addEventListener('click',copyMatchday);
$('#fixtures').addEventListener('click',e=>{const b=e.target.closest('[data-fixture]');if(b)openScore(b.dataset.fixture);});
$('#scoreCancel').addEventListener('click',()=>$('#scoreDialog').close()); $('#scoreSave').addEventListener('click',saveScore);
$('#quickTexts').addEventListener('click',e=>{const b=e.target.closest('[data-preset]');if(b){state.chat.push({id:uid('msg'),author:'Admin',role:'user',text:b.dataset.preset,at:new Date().toISOString()});save();renderChat();}});
$('#chatForm').addEventListener('submit',e=>{e.preventDefault();const v=$('#chatInput').value.trim();if(!v)return;$('#chatInput').value='';askAI(v);});

load();
