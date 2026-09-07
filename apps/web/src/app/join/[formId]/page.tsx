import { notFound } from "next/navigation";
import { prisma } from "@allohq/database";
import { HostedSignupForm } from "./HostedSignupForm";

export const dynamic="force-dynamic";
export default async function HostedSignupPage({params}:{params:Promise<{formId:string}>}){
  const {formId}=await params;
  const form=await prisma.form.findFirst({where:{id:formId,status:"active"},include:{store:{select:{storeName:true,storeLogoUrl:true}}}});
  if(!form) notFound();
  const styling=(form.styling??{}) as any;
  return <main className="min-h-screen px-5 py-16" style={{background:styling.backgroundColor??"#fff",color:styling.textColor??"#171717"}}><section className="mx-auto max-w-md">
    {form.store.storeLogoUrl&&<img src={form.store.storeLogoUrl} alt="" className="mb-8 h-10 max-w-40 object-contain"/>}
    <p className="mb-2 text-sm opacity-70">{form.store.storeName}</p><h1 className="mb-8 text-4xl font-semibold tracking-[-.03em]">{form.name}</h1>
    <HostedSignupForm formId={form.id} fields={form.fields as any[]} buttonText={styling.buttonText??"Subscribe"}/>
  </section></main>;
}
