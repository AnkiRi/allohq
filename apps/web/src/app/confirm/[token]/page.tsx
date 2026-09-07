import { redeemConsentConfirmation, deliverIncentive } from "@allohq/forms-and-popups";
import { prisma } from "@allohq/database";

export const dynamic="force-dynamic";
export default async function ConfirmPage({params}:{params:Promise<{token:string}>}){
  const {token}=await params; const result=/^[A-Za-z0-9_-]{40,60}$/.test(token)?await redeemConsentConfirmation(token):null;
  let code:string|null=null; let label:string|null=null;
  if(result?.submissionId){const submission=await prisma.formSubmission.findUnique({where:{id:result.submissionId},include:{form:true,customer:{select:{id:true}}}});const config=submission?.form.incentiveConfig as any;if(submission?.customer&&config&&submission.incentiveEligible===true){try{const grant=await deliverIncentive(result.storeId,config,{formId:submission.formId,customerId:submission.customer.id});code=grant?.code??null;label=grant?.label??null;if(code)await prisma.formSubmission.update({where:{id:submission.id},data:{incentiveCode:code,incentiveIssuedAt:new Date()}})}catch{label="Your subscription is confirmed. Your reward is still being prepared.";}}}
  return <main className="grid min-h-screen place-items-center px-5"><section className="max-w-md text-center"><h1 className="text-4xl font-semibold tracking-[-.03em]">{result?"You’re subscribed":"This link is no longer valid"}</h1><p className="mt-4 text-base text-black/65">{result?"Your email consent is confirmed. You can unsubscribe at any time.":"It may have expired or already been used."}</p>{result&&label&&<p className="mt-5 text-lg font-medium">{label}{code?<> · <strong>{code}</strong></>:null}</p>}</section></main>;
}
