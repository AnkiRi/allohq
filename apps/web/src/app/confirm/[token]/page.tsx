import { redeemConsentConfirmation } from "@allohq/forms-and-popups";

export const dynamic="force-dynamic";
export default async function ConfirmPage({params}:{params:Promise<{token:string}>}){
  const {token}=await params; const result=/^[A-Za-z0-9_-]{40,60}$/.test(token)?await redeemConsentConfirmation(token):null;
  return <main className="grid min-h-screen place-items-center px-5"><section className="max-w-md text-center"><h1 className="text-4xl font-semibold tracking-[-.03em]">{result?"You’re subscribed":"This link is no longer valid"}</h1><p className="mt-4 text-base text-black/65">{result?"Your email consent is confirmed. You can unsubscribe at any time.":"It may have expired or already been used."}</p></section></main>;
}
