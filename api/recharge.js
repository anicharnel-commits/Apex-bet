import { createClient } from '@supabase/supabase-js';

/* Provider adapter boundary. Secrets are environment variables only. */
function json(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}})}
export default async function handler(req){
  if(req.method!=='POST')return json({success:false,error:'Method not allowed'},405);
  const provider=process.env.RECHARGE_PROVIDER;
  const providerKey=process.env.RECHARGE_API_KEY;
  const providerSecret=process.env.RECHARGE_API_SECRET;
  if(!provider||!providerKey) return json({success:false,error:'Fournisseur de recharge non configuré'},503);
  // Deliberately fail closed until the provider's official API contract is supplied.
  return json({success:false,error:'Connecteur fournisseur en attente de configuration sécurisée'},503);
}
