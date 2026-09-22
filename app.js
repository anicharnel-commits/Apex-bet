import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

/*
 * Universal Store — client
 * SECURITY NOTE: the Supabase publishable key is intentionally public and is
 * protected by RLS. Provider/payment API secrets NEVER belong here.
 */
const SUPABASE_URL = "https://vavhzkyivesywinlcraq.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_VI28sBARj1eiRrvNgUd2og_6DfW6zbV";
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

let SHOP_ID = new URLSearchParams(location.search).get("shop") || window.UNIVERSAL_STORE_CONFIG?.shopId || localStorage.getItem("universal_shop_id") || "default";
const STORAGE_BUCKET = "boutique-images";
const $ = id => document.getElementById(id);
const money = n => new Intl.NumberFormat("fr-FR").format(Number(n || 0)) + " FCFA";
let products = [], selected = null, currentUser = null, ordersChannel = null, authMode = "login";

const HEROES = [
 {url:"assets/target/clean/hero_freefire.jpg",eyebrow:"FREE FIRE",title:"Recharge.",strong:"Achète. Joue plus.",text:"Diamants Free Fire, comptes et promotions dans une boutique rapide et pensée pour toi."},
 {url:"assets/target/clean/hero_accounts_clean.jpg",eyebrow:"COMPTES",title:"Trouve ton compte.",strong:"Joue autrement.",text:"Découvre les comptes disponibles dans ta boutique et choisis celui qui te correspond."},
 {url:"assets/target/clean/hero_promos_clean.jpg",eyebrow:"PROMOTIONS",title:"Profite des offres.",strong:"Paie moins.",text:"Retrouve les promotions et bonnes affaires publiées directement par ta boutique."},
 {url:"assets/target/clean/hero_orders_clean.jpg",eyebrow:"COMMANDES",title:"Suis tes achats.",strong:"En toute simplicité.",text:"Retrouve tes commandes et leur statut depuis ton espace client."}
];
function esc(v){return String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]))}
function msg(id,t,c){if($(id)) $(id).innerHTML=`<div class="message ${c}">${t}</div>`}

function renderProducts(){
 const active=products.filter(p=>p.active!==false);
 const packs=active.filter(p=>p.type==="diamond"),accounts=active.filter(p=>p.type==="account");
 const packImgs=["assets/target/pack100.jpg","assets/target/pack310.jpg","assets/target/pack520.jpg","assets/target/pack1060.jpg"];
 $("packs").innerHTML=packs.length?packs.map((p,i)=>`<article class="product-card"><div class="product-top" style="background-image:url('${packImgs[i%packImgs.length]}')">${p.bonus?`<span class="bonus">✦ ${esc(p.bonus)}</span>`:""}<span class="pack-label">${esc(p.bonus||p.name||"Diamants")}</span></div><div class="product-body"><h3>${esc(p.name||"Offre")}</h3><p>Recharge Free Fire</p><div class="price">${money(p.price)}</div><button class="primary-btn full" data-buy="${esc(p.id)}">Acheter</button></div></article>`).join(""):`<div class="empty">Aucune offre de diamants disponible.</div>`;
 $("accountsGrid").innerHTML=accounts.length?accounts.map((a,i)=>`<article class="account-card"><div class="account-img" style="background-image:url('${a.image?esc(a.image):["assets/target/pack310.jpg","assets/target/pack520.jpg","assets/target/pack100.jpg"][i%3]}')"></div><div class="account-body"><span class="tag">NIVEAU ${esc(a.level??"-")}</span><h3>${esc(a.name||"Compte Free Fire")}</h3><p>${esc(a.description||"")}</p><strong>${money(a.price)}</strong></div></article>`).join(""):`<div class="empty">Aucune annonce disponible pour le moment.</div>`;
 document.querySelectorAll("[data-buy]").forEach(b=>b.onclick=()=>openPayment(products.find(p=>p.id===b.dataset.buy)));
}

async function loadCatalog(){
 try{
   let query = supabase.from("products").select("id,boutique_id,name,type,price,bonus,level,description,image,active,created_at").eq("active",true);
   if(SHOP_ID!=="default") query=query.eq("boutique_id",SHOP_ID);
   const {data,error}=await query.order("created_at",{ascending:false});
   if(error) throw error;
   products=(data||[]).map(p=>({id:p.id,boutiqueId:p.boutique_id,...p}));
   if(SHOP_ID==="default" && products[0]?.boutiqueId){ SHOP_ID=products[0].boutiqueId; localStorage.setItem("universal_shop_id",SHOP_ID); }
   renderProducts();
 }catch(e){
   console.error("Catalogue:",e);
   $("packs").innerHTML='<div class="empty">Impossible de charger les offres.</div>';
   $("accountsGrid").innerHTML='<div class="empty">Impossible de charger les annonces.</div>';
 }
}
async function startCatalog(){
 $("packs").innerHTML='<div class="empty">Chargement des offres…</div>';
 $("accountsGrid").innerHTML='<div class="empty">Chargement des annonces…</div>';
 await loadCatalog();
 // Public catalogue refresh; mutations remain controlled by the admin/RLS.
 supabase.channel("public-catalog").on("postgres_changes",{event:"*",schema:"public",table:"products"},()=>loadCatalog()).subscribe();
}
startCatalog();

function openPayment(p){
 if(!p)return;
 if(!currentUser)return openAuth("login","Connecte-toi pour commander.");
 if(!$('playerUid').value.trim())return alert("Entre d'abord ton ID Joueur Free Fire.");
 selected=p;
 $("selected").innerHTML=`<div class="selected"><b>${esc(p.name)}</b><span>${money(p.price)}</span></div>`;
 $("modal").classList.remove("hidden");
}
$("closeModal").onclick=()=>$('modal').classList.add("hidden");
$("saveUid").onclick=()=>{localStorage.setItem("universal_player_uid",$("playerUid").value.trim());msg("paymentMessage","ID joueur enregistré.","success")};
$("playerUid").value=localStorage.getItem("universal_player_uid")||"";

async function syncSession(){
 const {data:{session}}=await supabase.auth.getSession();
 currentUser=session?.user||null;
 await handleAuthState(currentUser);
}
async function handleAuthState(u){
 currentUser=u; syncDrawerUser();
 if(u){
   $("accountBtn").textContent="Mon compte"; $("ordersGuest").classList.add("hidden"); $("ordersUser").classList.remove("hidden"); $("userEmail").textContent=u.email||""; subscribeOrders();
 }else{
   $("accountBtn").textContent="Connexion"; $("ordersGuest").classList.remove("hidden"); $("ordersUser").classList.add("hidden");
   if(ordersChannel){await supabase.removeChannel(ordersChannel);ordersChannel=null;}
 }
}
supabase.auth.onAuthStateChange((_event,session)=>{handleAuthState(session?.user||null)});
syncSession();

async function subscribeOrders(){
 if(!currentUser)return;
 if(ordersChannel){await supabase.removeChannel(ordersChannel);ordersChannel=null;}
 const render=async()=>{
   let q=supabase.from("orders").select("id,status,product_name,amount,player_uid,payment_method,created_at,boutique_id").eq("user_id",currentUser.id).order("created_at",{ascending:false});
   if(SHOP_ID!=="default")q=q.eq("boutique_id",SHOP_ID);
   const {data,error}=await q;
   if(error){console.error(error);$("myOrders").innerHTML='<div class="message error">Impossible de charger tes commandes.</div>';return;}
   const rows=data||[];
   $("myOrders").innerHTML=rows.length?rows.map(o=>`<article class="order-card"><span class="status ${o.status==="completed"?"done":o.status==="rejected"?"rejected":"pending"}">${esc(o.status||"pending")}</span><h3>${esc(o.product_name||"Commande")}</h3><div class="order-meta">Commande : ${esc(o.id)} · ${money(o.amount)}</div><div class="order-meta">UID : ${esc(o.player_uid||"-")} · ${esc(o.payment_method||"-")}</div></article>`).join(""):`<div class="empty">Aucune commande pour le moment.</div>`;
 };
 await render();
 ordersChannel=supabase.channel(`orders-${currentUser.id}`).on("postgres_changes",{event:"*",schema:"public",table:"orders",filter:`user_id=eq.${currentUser.id}`},render).subscribe();
}

async function openAuth(mode="login",notice=""){
 authMode=mode;$("authTitle").textContent=mode==="login"?"Connexion":"Créer un compte";$("authSubmit").textContent=mode==="login"?"Se connecter":"Créer mon compte";$("toggleAuthMode").textContent=mode==="login"?"Créer un compte":"J'ai déjà un compte";$("authModal").classList.remove("hidden");if(notice)msg("authMessage",notice,"info");
}
$("accountBtn").onclick=()=>currentUser?document.querySelector("#orders").scrollIntoView({behavior:"smooth"}):openAuth();
$("ordersLogin").onclick=()=>openAuth();
$("closeAuth").onclick=()=>$('authModal').classList.add("hidden");
$("toggleAuthMode").onclick=()=>openAuth(authMode==="login"?"signup":"login");
$("authForm").onsubmit=async e=>{
 e.preventDefault(); const email=$("authEmail").value.trim(),password=$("authPassword").value;
 try{
   const r=authMode==="login"?await supabase.auth.signInWithPassword({email,password}):await supabase.auth.signUp({email,password});
   if(r.error)throw r.error;
   $("authModal").classList.add("hidden");e.target.reset();
   if(authMode==="signup"&&!r.data.session) alert("Compte créé. Vérifie ton email si la confirmation est activée.");
 }catch(err){msg("authMessage",friendlyAuthError(err),"error")}
};
$("logoutBtn").onclick=()=>supabase.auth.signOut();
function friendlyAuthError(e){const m=String(e?.message||"").toLowerCase();if(m.includes("invalid login credentials"))return"Email ou mot de passe incorrect.";if(m.includes("already registered"))return"Cet email possède déjà un compte.";if(m.includes("password"))return"Mot de passe invalide ou trop court.";if(m.includes("email"))return"Adresse email invalide.";return"Impossible de terminer la connexion."}

function setupHero(){
 const host=$("heroSlider"),slides=$("heroSlider")?.querySelector(".hero-slides"),dots=$("heroDots"); if(!host||!slides||!dots)return;
 let index=0;slides.innerHTML=HEROES.map((item,i)=>`<div class="hero-slide ${i===0?"active":""}" style="background-image:url('${item.url}')"></div>`).join("");dots.innerHTML=HEROES.map((_,i)=>`<button class="hero-dot ${i===0?"active":""}" data-hero="${i}" aria-label="Visuel ${i+1}"></button>`).join("");
 const applyMeta=()=>{const m=HEROES[index]||HEROES[0];const pill=host.querySelector(".pill"),title=host.querySelector("h1"),text=host.querySelector(".hero-copy p");if(pill)pill.textContent=m.eyebrow;if(title)title.innerHTML=`${m.title}<br><strong>${m.strong}</strong>`;if(text)text.textContent=m.text;host.className=host.className.replace(/hero-theme-\d+/g,"").trim();host.classList.add(`hero-theme-${index}`);host.classList.remove("hero-content-pop");void host.offsetWidth;host.classList.add("hero-content-pop")};
 const go=i=>{index=(i+HEROES.length)%HEROES.length;slides.querySelectorAll(".hero-slide").forEach((x,n)=>x.classList.toggle("active",n===index));dots.querySelectorAll("[data-hero]").forEach((x,n)=>x.classList.toggle("active",n===index));applyMeta()};
 applyMeta();$("heroNext").onclick=()=>go(index+1);$("heroPrev").onclick=()=>go(index-1);dots.querySelectorAll("[data-hero]").forEach(b=>b.onclick=()=>go(Number(b.dataset.hero)));setInterval(()=>go(index+1),6500);
}
setupHero();
function closeDrawer(){$("sideDrawer")?.classList.remove("open");$("drawerBackdrop")?.classList.add("hidden");$("sideDrawer")?.setAttribute("aria-hidden","true")}
function openDrawer(){$("sideDrawer")?.classList.add("open");$("drawerBackdrop")?.classList.remove("hidden");$("sideDrawer")?.setAttribute("aria-hidden","false")}
$("menuBtn").onclick=openDrawer;$("closeDrawer").onclick=closeDrawer;$("drawerBackdrop").onclick=closeDrawer;document.querySelectorAll(".drawer-nav a").forEach(a=>a.onclick=closeDrawer);const drawerAccount=$("drawerAccount");if(drawerAccount)drawerAccount.onclick=()=>{closeDrawer();currentUser?document.querySelector("#orders").scrollIntoView({behavior:"smooth"}):openAuth()};
function syncDrawerUser(){if(!$("drawerUserName"))return;if(currentUser){$("drawerUserName").textContent=currentUser.email||"Mon compte";$("drawerUserSub").textContent="Compte client connecté";$("drawerAccount").innerHTML="Ouvrir mon espace <span>→</span>"}else{$("drawerUserName").textContent="Visiteur";$("drawerUserSub").textContent="Connecte-toi pour suivre tes commandes";$("drawerAccount").innerHTML="Connexion / Mon compte <span>→</span>"}}

/*
 * Sensitive order creation happens server-side.
 * The browser sends only the user's session token and order data.
 * The server re-reads the product price from Supabase, validates ownership,
 * and later triggers the configured provider. No provider key is sent here.
 */
$("submitOrder").onclick=async()=>{
 const uid=$("playerUid").value.trim(),ref=$("paymentReference").value.trim(),method=$("paymentMethod").value,file=$("receipt").files[0];
 if(!currentUser)return openAuth("login","Connecte-toi avant d'envoyer une commande.");
 if(!uid||!ref||!selected)return msg("paymentMessage","Complète les informations de paiement.","error");
 try{
   if(file&&file.size>8*1024*1024)throw new Error("Reçu trop volumineux (8 Mo max).");
   let receiptPath="";
   if(file){
     const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
     const path=`receipts/${SHOP_ID}/${currentUser.id}/${crypto.randomUUID()}-${safe}`;
     const up=await supabase.storage.from(STORAGE_BUCKET).upload(path,file,{upsert:false,contentType:file.type||"application/octet-stream"});
     if(up.error)throw up.error; receiptPath=path;
   }
   const {data:{session}}=await supabase.auth.getSession();
   const r=await fetch("/api/orders",{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${session.access_token}`},body:JSON.stringify({boutiqueId:SHOP_ID,productId:selected.id,playerUid:uid,paymentMethod:method,paymentReference:ref,receiptPath})});
   const body=await r.json(); if(!r.ok||!body.success)throw new Error(body.error||"Impossible de créer la commande.");
   msg("paymentMessage","Commande créée : "+body.orderId,"success");setTimeout(()=>{$("modal").classList.add("hidden");location.hash="orders"},900);
 }catch(e){console.error(e);msg("paymentMessage",e.message||"Impossible de créer la commande.","error")}
};
const cartBtn=$("cartBtn");if(cartBtn)cartBtn.onclick=()=>{if(currentUser)document.querySelector("#orders").scrollIntoView({behavior:"smooth"});else openAuth("login","Connecte-toi pour accéder à ton panier.")};
const drawerCart=$("drawerCart");if(drawerCart)drawerCart.onclick=()=>{closeDrawer();document.querySelector("#recharges")?.scrollIntoView({behavior:"smooth"})};
const drawerSettings=$("drawerSettings");if(drawerSettings)drawerSettings.onclick=()=>{closeDrawer();alert("Les paramètres seront disponibles dans ton espace client.")};
const drawerLogout=$("drawerLogout");if(drawerLogout)drawerLogout.onclick=async()=>{closeDrawer();if(currentUser)await supabase.auth.signOut();else openAuth()};
