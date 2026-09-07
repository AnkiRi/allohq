"use client";
import { useState } from "react";

export function HostedSignupForm({ formId, fields, buttonText }: { formId:string; fields:any[]; buttonText:string }) {
  const [message,setMessage]=useState("");
  return <form className="space-y-4" onSubmit={async(e)=>{e.preventDefault();const form=e.currentTarget;const response=await fetch(`/api/public/forms/${formId}/submit`,{method:"POST",body:new FormData(form)});const body=await response.json();setMessage(response.ok?body.message:body.error)}}>
    {fields.map((field)=><label key={field.name} className={field.type==="checkbox"?"flex gap-3 text-sm leading-5":"block text-sm font-medium"}>{field.type==="checkbox"?<><input name={field.name} type="checkbox" required={field.required}/><span>{field.label}</span></>:<>{field.label}<input className="mt-2 w-full rounded-lg border border-black/20 px-4 py-3 text-base" name={field.name} type={field.type==="phone"?"tel":field.type} placeholder={field.placeholder} required={field.required}/></>}</label>)}
    <button className="w-full rounded-lg bg-black px-5 py-3 font-semibold text-white">{buttonText}</button>
    {message&&<p role="status" className="text-sm">{message}</p>}
  </form>;
}
