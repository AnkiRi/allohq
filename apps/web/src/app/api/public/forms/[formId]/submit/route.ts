import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@allohq/database";
import { captureSubmission, createConsentConfirmation } from "@allohq/forms-and-popups";
import { sendEmail } from "@allohq/messaging";

export async function POST(request:NextRequest,{params}:{params:Promise<{formId:string}>}){
  const {formId}=await params;
  const form=await prisma.form.findFirst({where:{id:formId,status:"active"},include:{store:{select:{storeName:true}}}});
  if(!form)return NextResponse.json({error:"Form unavailable"},{status:404});
  const input=await request.formData();
  const email=String(input.get("email")??"").trim().toLowerCase();
  if(!/^\S+@\S+\.\S+$/.test(email)||input.get("consent_email")===null)return NextResponse.json({error:"Email and consent are required"},{status:400});
  const fields=form.fields as any[]; const data:Record<string,unknown>={};
  for(const field of fields){const value=input.get(field.name);if(field.type==="checkbox")data[field.name]=value!==null;else if(typeof value==="string")data[field.name]=value.slice(0,500)}
  const result=await captureSubmission({formId,storeId:form.storeId,data,source:"hosted",consent:{email:true},consentEvidence:{disclosureVersion:(form.styling as any)?.consentVersion??"global-v1",market:(form.styling as any)?.market??"global",capturedAt:new Date().toISOString(),hosted:true}});
  if(!result.customerId)return NextResponse.json({error:"Unable to create subscriber"},{status:400});
  const token=await createConsentConfirmation(result.customerId,form.storeId,"email");
  const origin=process.env.NEXT_PUBLIC_APP_URL??"https://agent.joonhq.com";
  const delivery=await sendEmail({channel:"email",to:email,subject:`Confirm your subscription to ${form.store.storeName??"this store"}`,html:`<p>Confirm that you want to receive marketing email.</p><p><a href="${origin}/confirm/${token}">Confirm subscription</a></p><p>This link expires in 24 hours.</p>`,idempotencyKey:`consent-${result.customerId}-${token.slice(0,12)}`});
  if(delivery.status!=="sent")return NextResponse.json({error:"Confirmation could not be sent. Please try again later."},{status:503});
  return NextResponse.json({message:"Check your inbox to confirm your subscription."});
}
