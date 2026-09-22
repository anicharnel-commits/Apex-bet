import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function json(body, status=200){
  return new Response(JSON.stringify(body), {status, headers:{'content-type':'application/json','cache-control':'no-store'}});
}
function clean(value, max=500){return String(value ?? '').trim().slice(0,max)}

export default async function handler(req){
  if(req.method !== 'POST') return json({success:false,error:'Method not allowed'},405);
  if(!supabaseUrl || !serviceKey) return json({success:false,error:'Backend non configuré'},503);
  try{
    const auth = req.headers.get('authorization') || '';
    if(!auth.startsWith('Bearer ')) return json({success:false,error:'Authentification requise'},401);
    const token = auth.slice(7);
    const admin = createClient(supabaseUrl, serviceKey, {auth:{persistSession:false,autoRefreshToken:false}});
    const {data:{user},error:userError} = await admin.auth.getUser(token);
    if(userError || !user) return json({success:false,error:'Session invalide'},401);

    const body = await req.json();
    const boutiqueId=clean(body.boutiqueId,100);
    const productId=clean(body.productId,100);
    const playerUid=clean(body.playerUid,30).replace(/[^0-9]/g,'');
    const paymentMethod=clean(body.paymentMethod,50);
    const paymentReference=clean(body.paymentReference,150);
    const receiptPath=clean(body.receiptPath,500);
    if(!boutiqueId || !productId || !playerUid || !paymentMethod || !paymentReference) return json({success:false,error:'Données de commande incomplètes'},400);
    if(playerUid.length < 5 || playerUid.length > 20) return json({success:false,error:'Player ID invalide'},400);

    const {data:product,error:productError}=await admin.from('products').select('id,boutique_id,name,price,type,active').eq('id',productId).eq('boutique_id',boutiqueId).single();
    if(productError || !product || product.active===false) return json({success:false,error:'Produit indisponible'},400);
    if(product.type!=='diamond') return json({success:false,error:'Produit de recharge invalide'},400);

    if(receiptPath && !receiptPath.startsWith(`receipts/${boutiqueId}/${user.id}/`)) return json({success:false,error:'Reçu invalide'},400);

    const {data:existing}=await admin.from('orders').select('id,status').eq('user_id',user.id).eq('product_id',product.id).eq('payment_reference',paymentReference).limit(1);
    if(existing?.length) return json({success:true,orderId:existing[0].id,duplicate:true,status:existing[0].status});

    const {data:order,error:orderError}=await admin.from('orders').insert({
      boutique_id:boutiqueId,user_id:user.id,type:'diamonds',product_id:product.id,
      product_name:product.name,player_uid:playerUid,amount:Number(product.price),
      payment_method:paymentMethod,payment_reference:paymentReference,receipt_path:receiptPath||null,
      status:'pending'
    }).select('id,status').single();
    if(orderError) throw orderError;

    // Provider fulfillment is deliberately NOT implemented here until the owner
    // supplies an authorized provider API. Provider credentials will be read only
    // from Vercel environment variables, never from client code.
    return json({success:true,orderId:order.id,status:order.status});
  }catch(err){
    console.error('order_create_error',err);
    return json({success:false,error:'Erreur interne lors de la création de la commande'},500);
  }
}
