import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@allohq/database";
import { canSendConsentConfirmation, captureSubmission, consentPreset, consentRequestEvidence, createConsentConfirmation, deliverIncentive, shouldSuppressKnownCustomerIncentive } from "@allohq/forms-and-popups";
import { sendTransactionalEmail } from "@allohq/messaging";

export async function POST(request:NextRequest,{params}:{params:Promise<{formId:string}>}){
  const {formId}=await params;
  const form=await prisma.form.findFirst({where:{id:formId,status:"active"},include:{store:{select:{storeName:true}}}});
  if(!form)return NextResponse.json({error:"Form unavailable"},{status:404});
  const input=await request.formData();
  const email=String(input.get("email")??"").trim().toLowerCase();
  if(!/^\S+@\S+\.\S+$/.test(email)||input.get("consent_email")===null)return NextResponse.json({error:"Email and consent are required"},{status:400});
  const fields=form.fields as any[]; const data:Record<string,unknown>={};
  for(const field of fields){const value=input.get(field.name);if(field.type==="checkbox")data[field.name]=value!==null;else if(typeof value==="string")data[field.name]=value.slice(0,500)}
  const styling=(form.styling??{}) as Record<string,unknown>;
  const market=typeof styling.market==="string"?styling.market:"global";
  const preset=consentPreset(market);
  const existing=await prisma.customer.findFirst({where:{storeId:form.storeId,email},select:{id:true,contactConsents:{where:{channel:"email"},select:{status:true},take:1}}});
  const isNewSubscriber=!existing||existing.contactConsents[0]?.status!=="opted_in";
  const result=await captureSubmission({formId,storeId:form.storeId,data,source:"hosted",consent:{email:true},pendingEmailConfirmation:preset.doubleOptInEmail,consentEvidence:{disclosureVersion:preset.version,market,capturedAt:new Date().toISOString(),hosted:true,...consentRequestEvidence({ip:request.headers.get("x-forwarded-for")??undefined,userAgent:request.headers.get("user-agent")??undefined,secret:process.env.WIDGET_VISITOR_TOKEN_SECRET})}});
  if(!result.customerId)return NextResponse.json({error:"Unable to create subscriber"},{status:400});
  const config=form.incentiveConfig as any;
  const recent=config?await prisma.order.findFirst({where:{customerId:result.customerId,status:{not:"cancelled"},createdAt:{gte:new Date(Date.now()-30*86_400_000)}},select:{id:true}}):null;
  const policy=config?shouldSuppressKnownCustomerIncentive({isNewSubscriber,hasRecentOrder:Boolean(recent),allowKnownCustomers:config.allowKnownCustomers}):null;
  if(config&&policy)await prisma.formSubmission.update({where:{id:result.submissionId},data:{incentiveEligible:policy.allowed,incentiveSuppressionReason:policy.reason}});
  if(!preset.doubleOptInEmail){
    if(config&&policy){
      if(policy.allowed){const reward=await deliverIncentive(form.storeId,config,{formId,customerId:result.customerId});if(reward?.code)await prisma.formSubmission.update({where:{id:result.submissionId},data:{incentiveCode:reward.code,incentiveIssuedAt:new Date()}});return NextResponse.json({message:"You are subscribed.",discountCode:reward?.code??null,incentiveLabel:reward?.label??null});}
    }
    return NextResponse.json({message:"You are subscribed."});
  }
  if(!(await canSendConsentConfirmation(result.customerId)))return NextResponse.json({error:"This address cannot receive a confirmation email."},{status:422});
  const token=await createConsentConfirmation(result.customerId,form.storeId,"email",result.submissionId);
  const origin=process.env.NEXT_PUBLIC_APP_URL??"https://agent.joonhq.com";
  const delivery=await sendTransactionalEmail({channel:"email",to:email,subject:`Confirm your subscription to ${form.store.storeName??"this store"}`,html:`<p>Confirm that you want to receive marketing email.</p><p><a href="${origin}/confirm/${token}">Confirm subscription</a></p><p>This link expires in 24 hours.</p>`,idempotencyKey:`consent-${result.customerId}-${token.slice(0,12)}`});
  if(delivery.status!=="sent")return NextResponse.json({error:"Confirmation could not be sent. Please try again later."},{status:503});
  return NextResponse.json({message:"Check your inbox to confirm your subscription."});
}
